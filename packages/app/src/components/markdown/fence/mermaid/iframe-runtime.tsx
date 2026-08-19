import { useCallback, useEffect, useMemo, useRef } from "react";
import type React from "react";
import type { MermaidRenderRequest } from "./render-model";
import { mermaidRuntimeHtml } from "./runtime/html.gen";
import { parseMermaidRuntimeMessage, type MermaidRuntimeRenderMessage } from "./runtime/messages";
import { MermaidRuntimeRequestDriver } from "./runtime/request-driver";

export interface MermaidRenderedResult {
  revision: number;
  source: string;
  colorScheme: "light" | "dark";
  height: number;
  width: number;
}

interface MermaidIframeRuntimeProps {
  request: MermaidRenderRequest | null;
  width?: number | string;
  height: number;
  onRendered: (message: MermaidRenderedResult) => void;
  onRenderFailed: (revision: number) => void;
}

export function MermaidIframeRuntime({
  request,
  width = "100%",
  height,
  onRendered,
  onRenderFailed,
}: MermaidIframeRuntimeProps) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const driverRef = useRef<MermaidRuntimeRequestDriver | null>(null);
  driverRef.current ??= new MermaidRuntimeRequestDriver();
  const iframeStyle = useMemo<React.CSSProperties>(
    () => ({
      display: "block",
      width,
      height,
      border: 0,
      pointerEvents: "none",
      background: "transparent",
    }),
    [height, width],
  );

  const sendRequest = useCallback((current: MermaidRenderRequest | null) => {
    const target = iframeRef.current?.contentWindow;
    if (!current || !target) {
      return;
    }
    const message: MermaidRuntimeRenderMessage = {
      type: "render",
      revision: current.revision,
      source: current.source,
      colorScheme: current.colorScheme,
      interactive: false,
    };
    target.postMessage(message, "*");
  }, []);

  useEffect(() => {
    sendRequest(driverRef.current?.update(request) ?? null);
  }, [request, sendRequest]);

  useEffect(() => {
    function receiveMessage(event: MessageEvent): void {
      if (event.source !== iframeRef.current?.contentWindow) {
        return;
      }
      const message = parseMermaidRuntimeMessage(event.data);
      if (!message) {
        return;
      }
      if (message.type === "bridgeReady") {
        sendRequest(driverRef.current?.ready() ?? null);
        return;
      }
      if (message.type === "renderError") {
        onRenderFailed(message.revision);
        sendRequest(driverRef.current?.settled(message.revision, false) ?? null);
        return;
      }
      onRendered(message);
      sendRequest(driverRef.current?.settled(message.revision, true) ?? null);
    }
    window.addEventListener("message", receiveMessage);
    return () => window.removeEventListener("message", receiveMessage);
  }, [onRenderFailed, onRendered, sendRequest]);

  return (
    <iframe
      ref={iframeRef}
      title=""
      aria-hidden
      sandbox="allow-scripts"
      srcDoc={mermaidRuntimeHtml}
      tabIndex={-1}
      style={iframeStyle}
    />
  );
}
