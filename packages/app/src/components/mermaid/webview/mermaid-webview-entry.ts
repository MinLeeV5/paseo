import mermaid from "mermaid";

interface MermaidThemePayload {
  background: string;
  variables: Record<string, string>;
}

interface MermaidRenderRequest {
  type: "render";
  requestId: number;
  diagram: string;
  theme: MermaidThemePayload;
}

declare global {
  interface Window {
    ReactNativeWebView?: {
      postMessage?: (message: string) => void;
    };
  }
}

function sendToNative(message: unknown): void {
  window.ReactNativeWebView?.postMessage?.(JSON.stringify(message));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseRenderRequest(data: unknown): MermaidRenderRequest | null {
  if (typeof data !== "string") {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(data);
  } catch {
    return null;
  }

  if (
    !isRecord(parsed) ||
    parsed.type !== "render" ||
    typeof parsed.requestId !== "number" ||
    typeof parsed.diagram !== "string" ||
    !isRecord(parsed.theme) ||
    typeof parsed.theme.background !== "string" ||
    !isRecord(parsed.theme.variables)
  ) {
    return null;
  }

  const variables: Record<string, string> = {};
  for (const [key, value] of Object.entries(parsed.theme.variables)) {
    if (typeof value === "string") {
      variables[key] = value;
    }
  }

  return {
    type: "render",
    requestId: parsed.requestId,
    diagram: parsed.diagram,
    theme: {
      background: parsed.theme.background,
      variables,
    },
  };
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unable to render Mermaid diagram";
}

function installStyles(): void {
  const style = document.createElement("style");
  style.textContent = `
html,
body,
#mermaid-root {
  width: 100%;
  min-height: 100%;
  margin: 0;
  padding: 0;
  overflow: hidden;
  background: transparent;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}

#mermaid-root {
  box-sizing: border-box;
  display: flex;
  align-items: flex-start;
  justify-content: center;
}

#mermaid-root svg {
  max-width: 100%;
  height: auto !important;
}

.mermaid-error {
  box-sizing: border-box;
  width: 100%;
  white-space: pre-wrap;
  font: 13px/1.45 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
}
`;
  document.head.appendChild(style);
}

function measureHeight(root: HTMLElement): number {
  const rootRect = root.getBoundingClientRect();
  return Math.max(
    rootRect.height,
    document.body.scrollHeight,
    document.documentElement.scrollHeight,
  );
}

function reportRendered(requestId: number, root: HTMLElement): void {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      sendToNative({
        type: "rendered",
        requestId,
        height: measureHeight(root),
      });
    });
  });
}

async function renderMermaid(root: HTMLElement, request: MermaidRenderRequest): Promise<void> {
  document.documentElement.style.backgroundColor = request.theme.background;
  document.body.style.backgroundColor = request.theme.background;
  root.style.backgroundColor = request.theme.background;
  root.innerHTML = "";

  try {
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: "strict",
      theme: "base",
      themeVariables: request.theme.variables,
      flowchart: {
        htmlLabels: false,
      },
    });
    const result = await mermaid.render(
      `paseo-mermaid-native-${request.requestId}`,
      request.diagram,
    );
    root.innerHTML = result.svg;
    reportRendered(request.requestId, root);
  } catch (error) {
    const message = getErrorMessage(error);
    const errorNode = document.createElement("div");
    errorNode.className = "mermaid-error";
    errorNode.style.color = request.theme.variables.errorTextColor ?? "#b04138";
    errorNode.textContent = message;
    root.replaceChildren(errorNode);
    sendToNative({
      type: "renderFailed",
      requestId: request.requestId,
      message,
    });
    reportRendered(request.requestId, root);
  }
}

function listenForRenderRequests(root: HTMLElement): void {
  const handleMessage = (event: Event) => {
    if (!(event instanceof MessageEvent)) {
      return;
    }
    const request = parseRenderRequest(event.data);
    if (!request) {
      return;
    }
    void renderMermaid(root, request);
  };

  window.addEventListener("message", handleMessage);
  document.addEventListener("message", handleMessage);
}

installStyles();
const root = document.createElement("div");
root.id = "mermaid-root";
document.body.appendChild(root);
listenForRenderRequests(root);
sendToNative({ type: "bridgeReady" });
