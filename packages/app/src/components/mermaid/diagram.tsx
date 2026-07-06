import mermaid from "mermaid";
import { type CSSProperties, useEffect, useId, useMemo, useState } from "react";
import { Text, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
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

export function MermaidDiagram({ diagram }: MermaidDiagramProps) {
  const { theme } = useUnistyles();
  const reactId = useId();
  const renderId = useMemo(() => normalizeMermaidRenderId(reactId), [reactId]);
  const themePayload = useMermaidThemePayload(theme);
  const [state, setState] = useState<MermaidRenderState>({ kind: "loading" });

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
      <div style={svgHostStyle}>
        {/* Mermaid sanitizes this SVG under securityLevel: "strict"; the browser keeps SVG semantics intact here. */}
        <div
          data-testid="mermaid-diagram-svg"
          style={svgRootStyle}
          dangerouslySetInnerHTML={svgMarkup}
        />
      </div>
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
