import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Text, View } from "react-native";
import { WebView, type WebViewMessageEvent } from "react-native-webview";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { inlineUnistylesStyle } from "@/styles/unistyles-inline-style";
import { mermaidWebViewHtml } from "@/components/mermaid/webview/mermaid-webview-html";
import { createMermaidThemePayload } from "./theme";

export interface MermaidDiagramProps {
  diagram: string;
}

interface MermaidRenderedMessage {
  type: "rendered";
  requestId: number;
  height: number;
}

interface MermaidRenderFailedMessage {
  type: "renderFailed";
  requestId: number;
  message: string;
}

interface MermaidBridgeReadyMessage {
  type: "bridgeReady";
}

type MermaidWebViewMessage =
  | MermaidRenderedMessage
  | MermaidRenderFailedMessage
  | MermaidBridgeReadyMessage;

const WEBVIEW_SOURCE = { html: mermaidWebViewHtml };
const WEBVIEW_ORIGIN_WHITELIST = ["*"];
const MIN_WEBVIEW_HEIGHT = 160;
const MAX_WEBVIEW_HEIGHT = 1600;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseMermaidWebViewMessage(data: string): MermaidWebViewMessage | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(data);
  } catch {
    return null;
  }

  if (!isRecord(parsed) || typeof parsed.type !== "string") {
    return null;
  }

  if (parsed.type === "bridgeReady") {
    return { type: "bridgeReady" };
  }

  if (
    parsed.type === "rendered" &&
    typeof parsed.requestId === "number" &&
    typeof parsed.height === "number"
  ) {
    return {
      type: "rendered",
      requestId: parsed.requestId,
      height: parsed.height,
    };
  }

  if (
    parsed.type === "renderFailed" &&
    typeof parsed.requestId === "number" &&
    typeof parsed.message === "string"
  ) {
    return {
      type: "renderFailed",
      requestId: parsed.requestId,
      message: parsed.message,
    };
  }

  return null;
}

function clampWebViewHeight(height: number): number {
  if (!Number.isFinite(height)) {
    return MIN_WEBVIEW_HEIGHT;
  }
  return Math.min(MAX_WEBVIEW_HEIGHT, Math.max(MIN_WEBVIEW_HEIGHT, Math.ceil(height)));
}

export function MermaidDiagram({ diagram }: MermaidDiagramProps) {
  const { theme } = useUnistyles();
  const themePayload = useMemo(() => createMermaidThemePayload(theme), [theme]);
  const webViewRef = useRef<WebView>(null);
  const requestIdRef = useRef(0);
  const [bridgeReady, setBridgeReady] = useState(false);
  const [height, setHeight] = useState(MIN_WEBVIEW_HEIGHT);
  const [error, setError] = useState<string | null>(null);

  const postRenderRequest = useCallback(() => {
    const nextRequestId = requestIdRef.current + 1;
    requestIdRef.current = nextRequestId;
    setError(null);
    webViewRef.current?.postMessage(
      JSON.stringify({
        type: "render",
        requestId: nextRequestId,
        diagram,
        theme: themePayload,
      }),
    );
  }, [diagram, themePayload]);

  useEffect(() => {
    if (bridgeReady) {
      postRenderRequest();
    }
  }, [bridgeReady, postRenderRequest]);

  const handleMessage = useCallback((event: WebViewMessageEvent) => {
    const message = parseMermaidWebViewMessage(event.nativeEvent.data);
    if (!message) {
      return;
    }
    if (message.type === "bridgeReady") {
      setBridgeReady(true);
      return;
    }
    if (message.requestId !== requestIdRef.current) {
      return;
    }
    if (message.type === "rendered") {
      setHeight(clampWebViewHeight(message.height));
      setError(null);
      return;
    }
    setError(message.message);
  }, []);

  const handleLoadStart = useCallback(() => {
    setBridgeReady(false);
  }, []);

  const handleLoadEnd = useCallback(() => {
    setBridgeReady(true);
  }, []);

  const containerStyle = useMemo(
    () => [styles.container, inlineUnistylesStyle({ backgroundColor: themePayload.background })],
    [themePayload.background],
  );
  const webViewStyle = useMemo(() => [styles.webView, inlineUnistylesStyle({ height })], [height]);

  return (
    <View style={containerStyle}>
      <WebView
        ref={webViewRef}
        source={WEBVIEW_SOURCE}
        originWhitelist={WEBVIEW_ORIGIN_WHITELIST}
        javaScriptEnabled
        domStorageEnabled={false}
        scrollEnabled={false}
        bounces={false}
        showsVerticalScrollIndicator={false}
        showsHorizontalScrollIndicator={false}
        setSupportMultipleWindows={false}
        automaticallyAdjustContentInsets={false}
        style={webViewStyle}
        onMessage={handleMessage}
        onLoadStart={handleLoadStart}
        onLoadEnd={handleLoadEnd}
      />
      {error ? (
        <Text selectable style={styles.errorText}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  container: {
    width: "100%",
    minHeight: MIN_WEBVIEW_HEIGHT,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing[3],
    marginVertical: theme.spacing[3],
    overflow: "hidden",
  },
  webView: {
    width: "100%",
    backgroundColor: "transparent",
  },
  errorText: {
    color: theme.colors.destructive,
    fontFamily: theme.fontFamily.mono,
    fontSize: theme.fontSize.code,
    lineHeight: Math.round(theme.fontSize.code * 1.45),
    marginTop: theme.spacing[2],
  },
}));
