import mermaid from "mermaid";
import React from "react";
import { type CSSProperties, useCallback, useEffect, useId, useMemo, useState } from "react";
import { Modal, Pressable, Text, View, type PressableStateCallbackType } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { Maximize2, X } from "lucide-react-native";
import { isWeb } from "@/constants/platform";
import { inlineUnistylesStyle } from "@/styles/unistyles-inline-style";
import { useMermaidThemePayload } from "./theme";

export interface MermaidDiagramProps {
  diagram: string;
}

interface MermaidRenderState {
  kind: "loading" | "rendered" | "failed";
  svg?: string;
  error?: string;
}

function normalizeMermaidRenderId(id: string): string {
  return `paseo-mermaid-${id.replace(/[^A-Za-z0-9_-]/g, "-")}`;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unable to render Mermaid diagram";
}

const svgHostStyle: CSSProperties = {
  width: "100%",
  overflowX: "auto",
};

const svgRootStyle: CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "center",
  width: "100%",
};

const previewSvgHostStyle: CSSProperties = {
  width: "100%",
  height: "100%",
  overflow: "auto",
};

const previewSvgRootStyle: CSSProperties = {
  minWidth: "100%",
  minHeight: "100%",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

function previewButtonStyle({ hovered, pressed }: PressableStateCallbackType) {
  return [styles.previewButton, (hovered || pressed) && styles.previewButtonActive];
}

export function MermaidDiagram({ diagram }: MermaidDiagramProps) {
  const { theme } = useUnistyles();
  const reactId = useId();
  const renderId = useMemo(() => normalizeMermaidRenderId(reactId), [reactId]);
  const themePayload = useMermaidThemePayload(theme);
  const [state, setState] = useState<MermaidRenderState>({ kind: "loading" });
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);

  const handleOpenPreview = useCallback(() => setIsPreviewOpen(true), []);
  const handleClosePreview = useCallback(() => setIsPreviewOpen(false), []);

  useEffect(() => {
    let cancelled = false;

    async function renderDiagram() {
      setState({ kind: "loading" });
      try {
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: "strict",
          theme: "base",
          themeVariables: themePayload.variables,
          flowchart: {
            htmlLabels: false,
          },
        });
        const result = await mermaid.render(renderId, diagram);
        if (!cancelled) {
          setState({ kind: "rendered", svg: result.svg });
        }
      } catch (error) {
        if (!cancelled) {
          setState({ kind: "failed", error: getErrorMessage(error) });
        }
      }
    }

    void renderDiagram();

    return () => {
      cancelled = true;
    };
  }, [diagram, renderId, themePayload]);

  useEffect(() => {
    if (!isWeb || !isPreviewOpen) {
      return;
    }
    function handleKeydown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        handleClosePreview();
      }
    }
    window.addEventListener("keydown", handleKeydown);
    return () => {
      window.removeEventListener("keydown", handleKeydown);
    };
  }, [handleClosePreview, isPreviewOpen]);

  const containerStyle = useMemo(
    () => [styles.container, inlineUnistylesStyle({ backgroundColor: themePayload.background })],
    [themePayload.background],
  );
  const svgMarkup = useMemo(() => ({ __html: state.svg ?? "" }), [state.svg]);

  if (state.kind === "failed") {
    return (
      <View style={containerStyle}>
        <Text selectable style={styles.errorText}>
          {state.error}
        </Text>
      </View>
    );
  }

  if (state.kind === "loading" || !state.svg) {
    return (
      <View style={containerStyle}>
        <Text style={styles.loadingText}>Rendering Mermaid diagram...</Text>
      </View>
    );
  }

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
      <div style={svgHostStyle}>
        {/* Mermaid sanitizes this SVG under securityLevel: "strict"; the browser keeps SVG semantics intact here. */}
        <div
          data-testid="mermaid-diagram-svg"
          style={svgRootStyle}
          dangerouslySetInnerHTML={svgMarkup}
        />
      </div>
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
                <div data-testid="mermaid-fullscreen-preview" style={previewSvgHostStyle}>
                  <div style={previewSvgRootStyle} dangerouslySetInnerHTML={svgMarkup} />
                </div>
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

const styles = StyleSheet.create((theme) => ({
  container: {
    width: "100%",
    minHeight: 160,
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
  loadingText: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
  errorText: {
    color: theme.colors.destructive,
    fontFamily: theme.fontFamily.mono,
    fontSize: theme.fontSize.code,
    lineHeight: Math.round(theme.fontSize.code * 1.45),
  },
}));
