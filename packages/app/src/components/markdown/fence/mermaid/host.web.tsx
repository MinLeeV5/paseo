import React, { useCallback, useMemo, useRef, useState } from "react";
import { View, type StyleProp, type TextStyle, type ViewStyle } from "react-native";
import { useTranslation } from "react-i18next";
import { Code, Maximize2, Scan, Workflow, ZoomIn, ZoomOut } from "lucide-react-native";
import { withUnistyles } from "react-native-unistyles";
import { HighlightedCodeBlock } from "@/components/highlighted-code-block";
import { useIsCompactFormFactor } from "@/constants/layout";
import type { Theme } from "@/styles/theme";
import type { MarkdownFenceRendererProps } from "../types";
import { DiagramControlButton, controlStyles } from "./controls";
import { MermaidIframeRuntime, type MermaidRenderedResult } from "./iframe-runtime";
import { useMermaidPanZoom } from "./pan-zoom";
import { useMermaidRenderModel } from "./use-render-model";
import { getDiagramBoxStyle } from "./presentation";
import { MermaidDiagramViewer } from "./viewer";

interface MermaidFenceHostImplProps extends MarkdownFenceRendererProps {
  colorScheme?: "light" | "dark";
}

// oxlint-disable-next-line complexity
function MermaidFenceHostImpl({
  code,
  phase,
  inheritedStyles,
  textStyle,
  colorScheme = "dark",
}: MermaidFenceHostImplProps) {
  const { t } = useTranslation();
  const { state, request, rendered, renderFailed } = useMermaidRenderModel({
    source: code,
    phase,
    colorScheme,
  });
  const [hasRuntimeContent, setHasRuntimeContent] = useState(false);
  const handleRendered = useCallback(
    (message: MermaidRenderedResult) => {
      setHasRuntimeContent(true);
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
  const canShowDiagram = visible !== null && hasRuntimeContent;
  const runtimeHeight = Math.max(visible?.height ?? 240, 1);

  const [showSource, setShowSource] = useState(false);
  const showSourcePress = useCallback(() => setShowSource(true), []);
  const showDiagramPress = useCallback(() => setShowSource(false), []);
  const [isViewerOpen, setIsViewerOpen] = useState(false);
  const openViewer = useCallback(() => setIsViewerOpen(true), []);
  const closeViewer = useCallback(() => setIsViewerOpen(false), []);

  const diagramVisible = canShowDiagram && !showSource;
  const panZoom = useMermaidPanZoom(diagramVisible);

  const controlsRegionRef = useRef<HTMLDivElement | null>(null);
  const setControlsRegionRef = useCallback((node: unknown) => {
    controlsRegionRef.current = node instanceof HTMLDivElement ? node : null;
  }, []);
  const hasFocusedControls = useCallback(() => {
    const region = controlsRegionRef.current;
    const active = document.activeElement;
    return Boolean(region && active instanceof Node && region.contains(active));
  }, []);
  const [isFocusWithin, setIsFocusWithin] = useState(false);
  const handleFocusWithin = useCallback(() => setIsFocusWithin(true), []);
  const handleBlurWithin = useCallback(() => {
    window.requestAnimationFrame(() => setIsFocusWithin(hasFocusedControls()));
  }, [hasFocusedControls]);

  const [isHovered, setIsHovered] = useState(false);
  const handlePointerEnter = useCallback(() => setIsHovered(true), []);
  const handlePointerLeave = useCallback(() => setIsHovered(false), []);
  const isCompact = useIsCompactFormFactor();
  const controlsVisible = isHovered || isCompact || isFocusWithin;

  const sourceView = useMemo(() => {
    const { marginTop, marginBottom, marginVertical, ...sourceTextStyle } = textStyle;
    const margins: ViewStyle = {
      marginTop: marginTop ?? marginVertical,
      marginBottom: marginBottom ?? marginVertical,
    };
    const text: TextStyle = sourceTextStyle;
    return {
      container: [margins, sourceContainerStyle],
      text,
    };
  }, [textStyle]);
  const diagramBoxStyle = getDiagramBoxStyle(textStyle);

  const sourceVisible = !canShowDiagram || showSource;
  let rootStyle: StyleProp<ViewStyle> = sourceContainerStyle;
  if (diagramVisible) {
    rootStyle = [diagramBoxStyle, containerStyle];
  } else if (showSource) {
    rootStyle = sourceView.container;
  }
  const sourceTextStyle = showSource ? sourceView.text : textStyle;

  const runtime = (
    <MermaidIframeRuntime
      request={request}
      height={runtimeHeight}
      onRendered={handleRendered}
      onRenderFailed={renderFailed}
    />
  );
  return (
    <View
      ref={setControlsRegionRef}
      style={rootStyle}
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
      onFocus={handleFocusWithin}
      onBlur={handleBlurWithin}
    >
      {sourceVisible ? (
        <HighlightedCodeBlock
          code={code}
          language="mermaid"
          inheritedStyles={inheritedStyles}
          textStyle={sourceTextStyle}
        />
      ) : null}
      <div
        ref={panZoom.viewportRef}
        role={diagramVisible ? "img" : undefined}
        aria-label={diagramVisible ? t("message.diagram.diagram") : undefined}
        aria-hidden={!diagramVisible}
        style={diagramVisible ? viewportDomStyle : measuringRuntimeStyle}
        onPointerDown={panZoom.onPointerDown}
        onPointerMove={panZoom.onPointerMove}
        onPointerUp={panZoom.onPointerUp}
        onPointerCancel={panZoom.onPointerCancel}
        onDoubleClick={panZoom.onDoubleClick}
      >
        <div ref={panZoom.setContentRef} style={contentDomStyle}>
          {runtime}
        </div>
      </div>
      {diagramVisible ? (
        <View style={controlStyles.cluster}>
          <DiagramControlButton
            icon={ZoomIn}
            label={t("message.diagram.zoomIn")}
            onPress={panZoom.zoomIn}
            visible={controlsVisible}
          />
          <DiagramControlButton
            icon={ZoomOut}
            label={t("message.diagram.zoomOut")}
            onPress={panZoom.zoomOut}
            visible={controlsVisible}
          />
          <DiagramControlButton
            icon={Scan}
            label={t("message.diagram.resetZoom")}
            onPress={panZoom.resetTransform}
            visible={controlsVisible}
          />
          <DiagramControlButton
            icon={Code}
            label={t("message.diagram.viewSource")}
            onPress={showSourcePress}
            visible={controlsVisible}
          />
          <DiagramControlButton
            icon={Maximize2}
            label={t("message.diagram.viewFullscreen")}
            onPress={openViewer}
            visible={controlsVisible}
          />
        </View>
      ) : null}
      {showSource && canShowDiagram ? (
        <View style={[controlStyles.cluster, controlStyles.clusterSourceOffset]}>
          <DiagramControlButton
            icon={Workflow}
            label={t("message.diagram.viewDiagram")}
            onPress={showDiagramPress}
            visible={controlsVisible}
            plain
          />
        </View>
      ) : null}
      {isViewerOpen && canShowDiagram && visible ? (
        <MermaidDiagramViewer
          code={visible.source}
          colorScheme={visible.colorScheme}
          onClose={closeViewer}
          inheritedStyles={inheritedStyles}
          textStyle={textStyle}
        />
      ) : null}
    </View>
  );
}

const sourceContainerStyle: ViewStyle = { position: "relative" };
const containerStyle: ViewStyle = { overflow: "hidden", position: "relative" };
const viewportDomStyle: React.CSSProperties = { cursor: "grab", userSelect: "none" };
const contentDomStyle: React.CSSProperties = { transformOrigin: "0 0" };
const measuringRuntimeStyle: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  opacity: 0,
  pointerEvents: "none",
  overflow: "hidden",
};
const mapColorScheme = (theme: Theme) => ({ colorScheme: theme.colorScheme });
const ThemedMermaidFenceHost = withUnistyles(MermaidFenceHostImpl);

export function MermaidFenceHost(props: MarkdownFenceRendererProps) {
  return <ThemedMermaidFenceHost {...props} uniProps={mapColorScheme} />;
}
