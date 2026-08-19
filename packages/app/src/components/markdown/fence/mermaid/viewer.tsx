import { useCallback, useMemo, useState } from "react";
import type React from "react";
import { Modal, View, type TextStyle } from "react-native";
import { useTranslation } from "react-i18next";
import { withUnistyles } from "react-native-unistyles";
import { Code, Scan, Workflow, X, ZoomIn, ZoomOut } from "lucide-react-native";
import { HighlightedCodeBlock } from "@/components/highlighted-code-block";
import type { Theme } from "@/styles/theme";
import { DiagramControlButton, controlStyles } from "./controls";
import { MermaidIframeRuntime, type MermaidRenderedResult } from "./iframe-runtime";
import { useMermaidPanZoom } from "./pan-zoom";
import { useMermaidRenderModel } from "./use-render-model";

interface MermaidDiagramViewerProps {
  code: string;
  colorScheme: "light" | "dark";
  onClose: () => void;
  inheritedStyles: TextStyle;
  textStyle: TextStyle;
}

interface MermaidDiagramViewerImplProps extends MermaidDiagramViewerProps {
  theme: Theme;
}

const viewportStyle: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  cursor: "grab",
  userSelect: "none",
  overflow: "hidden",
};

// The content element fills the viewport so its untransformed top-left lines
// up with the viewport's origin; the diagram is centered inside it with flex,
// keeping the pan/zoom transform math correct.
const contentStyle: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  transformOrigin: "0 0",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

function MermaidDiagramViewerImpl({
  code,
  colorScheme,
  onClose,
  inheritedStyles,
  textStyle,
  theme,
}: MermaidDiagramViewerImplProps) {
  const { t } = useTranslation();
  const [showSource, setShowSource] = useState(false);
  const toggleSource = useCallback(() => setShowSource((current) => !current), []);
  const { state, request, rendered, renderFailed } = useMermaidRenderModel({
    source: code,
    phase: "complete",
    colorScheme,
  });
  const handleRendered = useCallback(
    (message: MermaidRenderedResult) => {
      rendered({
        revision: message.revision,
        source: message.source,
        colorScheme: message.colorScheme,
        dimensions: { height: message.height, width: message.width },
      });
    },
    [rendered],
  );
  const visible = state.visible;
  const naturalWidth = visible?.width;
  const runtimeHeight = Math.max(visible?.height ?? 240, 1);
  const panZoom = useMermaidPanZoom(!showSource, true);

  const backdropStyle = useMemo<React.CSSProperties>(
    () => ({
      position: "absolute",
      inset: 0,
      backgroundColor: theme.colors.surface0,
      overflow: "hidden",
    }),
    [theme.colors.surface0],
  );
  const sourceOverlayStyle = useMemo<React.CSSProperties>(
    () => ({
      position: "absolute",
      inset: 0,
      backgroundColor: theme.colors.surface0,
      overflow: "auto",
      paddingTop: theme.spacing[12],
      paddingLeft: theme.spacing[4],
      paddingRight: theme.spacing[4],
      paddingBottom: theme.spacing[4],
    }),
    [theme.colors.surface0, theme.spacing],
  );

  return (
    <Modal transparent animationType="fade" statusBarTranslucent visible onRequestClose={onClose}>
      <div style={backdropStyle}>
        <div
          ref={panZoom.viewportRef}
          style={viewportStyle}
          onPointerDown={panZoom.onPointerDown}
          onPointerMove={panZoom.onPointerMove}
          onPointerUp={panZoom.onPointerUp}
          onPointerCancel={panZoom.onPointerCancel}
          onDoubleClick={panZoom.onDoubleClick}
        >
          <div ref={panZoom.setContentRef} style={contentStyle}>
            <MermaidIframeRuntime
              request={request}
              width={naturalWidth ?? "100%"}
              height={runtimeHeight}
              onRendered={handleRendered}
              onRenderFailed={renderFailed}
            />
          </div>
        </div>
        {showSource ? (
          <div style={sourceOverlayStyle}>
            <HighlightedCodeBlock
              code={code}
              language="mermaid"
              inheritedStyles={inheritedStyles}
              textStyle={textStyle}
            />
          </div>
        ) : null}
        <View style={controlStyles.cluster}>
          <DiagramControlButton
            icon={ZoomIn}
            label={t("message.diagram.zoomIn")}
            onPress={panZoom.zoomIn}
            visible
          />
          <DiagramControlButton
            icon={ZoomOut}
            label={t("message.diagram.zoomOut")}
            onPress={panZoom.zoomOut}
            visible
          />
          <DiagramControlButton
            icon={Scan}
            label={t("message.diagram.resetZoom")}
            onPress={panZoom.resetTransform}
            visible
          />
          <DiagramControlButton
            icon={showSource ? Workflow : Code}
            label={showSource ? t("message.diagram.viewDiagram") : t("message.diagram.viewSource")}
            onPress={toggleSource}
            visible
          />
          <DiagramControlButton
            icon={X}
            label={t("common.actions.close")}
            onPress={onClose}
            visible
          />
        </View>
      </div>
    </Modal>
  );
}

const mapTheme = (theme: Theme) => ({ theme });
const ThemedMermaidDiagramViewer = withUnistyles(MermaidDiagramViewerImpl);

export function MermaidDiagramViewer(props: MermaidDiagramViewerProps) {
  return <ThemedMermaidDiagramViewer {...props} uniProps={mapTheme} />;
}
