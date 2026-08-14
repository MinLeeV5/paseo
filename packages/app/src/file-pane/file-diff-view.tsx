import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ScrollView, Text, View, type LayoutChangeEvent, type TextStyle } from "react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { useTranslation } from "react-i18next";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { DiffFileBody } from "@/git/diff-pane";
import type { ParsedDiffFile } from "@/git/use-diff-query";
import type { Theme } from "@/styles/theme";
import type {
  WorkspaceFileDiffOverview,
  WorkspaceFileDiffOverviewMarker,
} from "@/workspace/file-diff-decorations";
import { FileDiffOverviewRuler } from "./diff-overview-ruler";
import {
  getFileDiffOverviewRowHeight,
  getFileDiffOverviewScrollOffset,
} from "./diff-overview-navigation";
import { buildFileDiffOverview } from "./file-diff-overview";
import { buildFullFileDiff } from "./full-file-diff";

const ThemedLoadingSpinner = withUnistyles(LoadingSpinner);
const foregroundMutedColorMapping = (theme: Theme) => ({
  color: theme.colors.foregroundMuted,
});
const EMPTY_DIFF_OVERVIEW: WorkspaceFileDiffOverview = { markers: [], totalRows: 0 };
const LOADING_INDICATOR_DELAY_MS = 250;

function useDelayedLoadingIndicator(active: boolean): boolean {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!active) {
      setVisible(false);
      return;
    }
    const timeout = setTimeout(() => setVisible(true), LOADING_INDICATOR_DELAY_MS);
    return () => clearTimeout(timeout);
  }, [active]);

  return visible;
}

export function FileDiffView({
  file,
  source,
  layout,
  codeFontSize,
  monoFontFamily,
}: {
  file: ParsedDiffFile;
  source: string | null;
  layout: "unified" | "split";
  codeFontSize: number;
  monoFontFamily: string;
}) {
  const { t } = useTranslation();
  const scrollRef = useRef<ScrollView>(null);
  const viewportHeightRef = useRef(0);
  const contentHeightRef = useRef(0);
  const hasScrolledToFirstChangeRef = useRef(false);
  const [viewportHeight, setViewportHeight] = useState(0);
  const [contentHeight, setContentHeight] = useState(0);
  const lineHeight = Math.round(codeFontSize * 1.5);
  const fullFile = useMemo(() => buildFullFileDiff({ file, source }), [file, source]);
  const overview = useMemo(
    () =>
      fullFile
        ? buildFileDiffOverview({ file: fullFile, layout, includeHunkHeaders: false })
        : EMPTY_DIFF_OVERVIEW,
    [fullFile, layout],
  );
  const firstChange = overview.markers[0] ?? null;
  const showLoadingIndicator = useDelayedLoadingIndicator(fullFile === null);
  const textMetricsStyle = useMemo<TextStyle>(() => {
    const trimmedMonoFontFamily = monoFontFamily.trim();
    return {
      fontSize: codeFontSize,
      lineHeight,
      ...(trimmedMonoFontFamily ? { fontFamily: trimmedMonoFontFamily } : null),
    };
  }, [codeFontSize, lineHeight, monoFontFamily]);
  const handleLayout = useCallback((event: LayoutChangeEvent) => {
    const nextHeight = event.nativeEvent.layout.height;
    viewportHeightRef.current = nextHeight;
    setViewportHeight((currentHeight) =>
      currentHeight === nextHeight ? currentHeight : nextHeight,
    );
  }, []);
  const handleContentSizeChange = useCallback((_width: number, height: number) => {
    contentHeightRef.current = height;
    setContentHeight((currentHeight) => (currentHeight === height ? currentHeight : height));
  }, []);

  useEffect(() => {
    if (
      hasScrolledToFirstChangeRef.current ||
      !firstChange ||
      viewportHeight <= 0 ||
      contentHeight <= 0
    ) {
      return;
    }

    const scrollView = scrollRef.current;
    if (!scrollView) {
      return;
    }
    const effectiveLineHeight = getFileDiffOverviewRowHeight({
      defaultRowHeight: lineHeight,
      contentHeight,
      totalRows: overview.totalRows,
      wrapLines: true,
    });
    scrollView.scrollTo({
      y: getFileDiffOverviewScrollOffset({
        marker: firstChange,
        lineHeight: effectiveLineHeight,
        viewportHeight,
        contentTopInset: 0,
      }),
      animated: false,
    });
    hasScrolledToFirstChangeRef.current = true;
  }, [contentHeight, firstChange, lineHeight, overview.totalRows, viewportHeight]);

  const handleMarkerPress = useCallback(
    (marker: WorkspaceFileDiffOverviewMarker) => {
      const effectiveLineHeight = getFileDiffOverviewRowHeight({
        defaultRowHeight: lineHeight,
        contentHeight: contentHeightRef.current,
        totalRows: overview.totalRows,
        wrapLines: true,
      });
      scrollRef.current?.scrollTo({
        y: getFileDiffOverviewScrollOffset({
          marker,
          lineHeight: effectiveLineHeight,
          viewportHeight: viewportHeightRef.current,
          contentTopInset: 0,
        }),
        animated: false,
      });
    },
    [lineHeight, overview.totalRows],
  );

  if (!fullFile) {
    return (
      <View style={styles.loadingContainer} testID="file-diff-loading">
        {showLoadingIndicator ? (
          <View
            style={styles.loadingState}
            accessibilityRole="progressbar"
            accessibilityLabel={t("panels.file.loading")}
          >
            <ThemedLoadingSpinner size="small" uniProps={foregroundMutedColorMapping} />
            <Text style={styles.loadingText}>{t("panels.file.loading")}</Text>
          </View>
        ) : null}
      </View>
    );
  }

  return (
    <View style={styles.container} testID={`file-diff-view-${layout}`}>
      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        showsVerticalScrollIndicator
        onLayout={handleLayout}
        onContentSizeChange={handleContentSizeChange}
        testID="file-diff-scroll"
      >
        <DiffFileBody
          file={fullFile}
          layout={layout}
          wrapLines
          showHunkHeaders={false}
          codeFontSize={codeFontSize}
          textMetricsStyle={textMetricsStyle}
          testID="file-diff-body"
        />
      </ScrollView>
      <FileDiffOverviewRuler overview={overview} onMarkerPress={handleMarkerPress} />
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  container: {
    flex: 1,
    minHeight: 0,
    position: "relative",
  },
  scroll: {
    flex: 1,
    minHeight: 0,
  },
  loadingContainer: {
    flex: 1,
    minHeight: 0,
  },
  loadingState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: theme.spacing[3],
    padding: theme.spacing[4],
  },
  loadingText: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
}));
