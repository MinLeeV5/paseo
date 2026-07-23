import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Modal,
  Pressable,
  Text,
  View,
  type PressableStateCallbackType,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { WebView, type WebViewMessageEvent } from "react-native-webview";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { Maximize2, X } from "lucide-react-native";
import { inlineUnistylesStyle } from "@/styles/unistyles-inline-style";
import { mermaidWebViewHtml } from "@/components/mermaid/webview/mermaid-webview-html";
import type { Theme } from "@/styles/theme";
import { normalizeMermaidSource } from "./source";
import { type MermaidThemePayload, useMermaidThemePayload } from "./theme";

export interface MermaidDiagramProps {
  diagram: string;
}

interface MermaidDiagramContentProps extends MermaidDiagramProps {
  theme: Theme;
}

const mermaidThemeMapping = (theme: Theme) => ({ theme });

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

function previewButtonStyle({ hovered, pressed }: PressableStateCallbackType) {
  return [styles.previewButton, (hovered || pressed) && styles.previewButtonActive];
}

interface MermaidWebViewSurfaceProps {
  diagram: string;
  themePayload: MermaidThemePayload;
  style: StyleProp<ViewStyle>;
  scrollEnabled: boolean;
  onHeightChange?: (height: number) => void;
}

function MermaidWebViewSurface({
  diagram,
  themePayload,
  style,
  scrollEnabled,
  onHeightChange,
}: MermaidWebViewSurfaceProps) {
  const webViewRef = useRef<WebView>(null);
  const requestIdRef = useRef(0);
  const [bridgeReady, setBridgeReady] = useState(false);
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

  const handleMessage = useCallback(
    (event: WebViewMessageEvent) => {
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
        onHeightChange?.(clampWebViewHeight(message.height));
        setError(null);
        return;
      }
      setError(message.message);
    },
    [onHeightChange],
  );

  const handleLoadStart = useCallback(() => {
    setBridgeReady(false);
  }, []);

  const handleLoadEnd = useCallback(() => {
    setBridgeReady(true);
  }, []);

  return (
    <>
      <WebView
        ref={webViewRef}
        source={WEBVIEW_SOURCE}
        originWhitelist={WEBVIEW_ORIGIN_WHITELIST}
        javaScriptEnabled
        domStorageEnabled={false}
        scrollEnabled={scrollEnabled}
        bounces={false}
        showsVerticalScrollIndicator={false}
        showsHorizontalScrollIndicator={false}
        setSupportMultipleWindows={false}
        automaticallyAdjustContentInsets={false}
        style={style}
        onMessage={handleMessage}
        onLoadStart={handleLoadStart}
        onLoadEnd={handleLoadEnd}
      />
      {error ? (
        <Text selectable style={styles.errorText}>
          {error}
        </Text>
      ) : null}
    </>
  );
}

function MermaidDiagramContent({ diagram, theme }: MermaidDiagramContentProps) {
  const source = useMemo(() => normalizeMermaidSource(diagram), [diagram]);
  const themePayload = useMermaidThemePayload(theme);
  const [height, setHeight] = useState(MIN_WEBVIEW_HEIGHT);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);

  const handleOpenPreview = useCallback(() => setIsPreviewOpen(true), []);
  const handleClosePreview = useCallback(() => setIsPreviewOpen(false), []);

  const containerStyle = useMemo(
    () => [styles.container, inlineUnistylesStyle({ backgroundColor: themePayload.background })],
    [themePayload.background],
  );
  const webViewStyle = useMemo(() => [styles.webView, inlineUnistylesStyle({ height })], [height]);

  return (
    <View style={containerStyle}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Open Mermaid diagram fullscreen"
        hitSlop={8}
        onPress={handleOpenPreview}
        style={previewButtonStyle}
      >
        <Maximize2 size={theme.iconSize.sm} color={theme.colors.foregroundMuted} />
      </Pressable>
      <MermaidWebViewSurface
        diagram={source}
        themePayload={themePayload}
        style={webViewStyle}
        scrollEnabled={false}
        onHeightChange={setHeight}
      />
      {isPreviewOpen ? (
        <Modal
          transparent
          animationType="fade"
          statusBarTranslucent
          visible
          onRequestClose={handleClosePreview}
        >
          <View style={styles.previewRoot}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Dismiss Mermaid diagram fullscreen"
              onPress={handleClosePreview}
              style={styles.previewBackdrop}
            />
            <View style={styles.previewContentLayer}>
              <View style={styles.previewDiagramArea}>
                <MermaidWebViewSurface
                  diagram={source}
                  themePayload={themePayload}
                  style={styles.previewWebView}
                  scrollEnabled
                />
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close Mermaid diagram fullscreen"
                hitSlop={8}
                onPress={handleClosePreview}
                style={styles.previewCloseButton}
              >
                <X size={16} color={theme.colors.foregroundMuted} />
              </Pressable>
            </View>
          </View>
        </Modal>
      ) : null}
    </View>
  );
}

const ThemedMermaidDiagram = withUnistyles(MermaidDiagramContent);

export function MermaidDiagram({ diagram }: MermaidDiagramProps) {
  return <ThemedMermaidDiagram diagram={diagram} uniProps={mermaidThemeMapping} />;
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
    position: "relative",
  },
  previewButton: {
    position: "absolute",
    top: theme.spacing[2],
    right: theme.spacing[2],
    width: 28,
    height: 28,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.surface2,
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.border,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1,
  },
  previewButtonActive: {
    backgroundColor: theme.colors.surface3,
  },
  webView: {
    width: "100%",
    backgroundColor: "transparent",
  },
  previewRoot: {
    flex: 1,
  },
  previewBackdrop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.9)",
  },
  previewContentLayer: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    pointerEvents: "box-none",
  },
  previewDiagramArea: {
    flex: 1,
    padding: theme.spacing[4],
    pointerEvents: "box-none",
  },
  previewWebView: {
    flex: 1,
    width: "100%",
    backgroundColor: "transparent",
  },
  previewCloseButton: {
    position: "absolute",
    top: theme.spacing[3],
    right: theme.spacing[3],
    width: 32,
    height: 32,
    borderRadius: theme.borderRadius.full,
    backgroundColor: theme.colors.surface2,
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.border,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1,
  },
  errorText: {
    color: theme.colors.destructive,
    fontFamily: theme.fontFamily.mono,
    fontSize: theme.fontSize.code,
    lineHeight: Math.round(theme.fontSize.code * 1.45),
    marginTop: theme.spacing[2],
  },
}));
