import { useCallback, useMemo, useRef } from "react";
import { ScrollView, View, type LayoutChangeEvent, type TextStyle } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { DiffFileBody } from "@/git/diff-pane";
import type { ParsedDiffFile } from "@/git/use-diff-query";
import type { WorkspaceFileDiffOverviewMarker } from "@/workspace/file-diff-decorations";
import { FileDiffOverviewRuler } from "./diff-overview-ruler";
import {
  getFileDiffOverviewRowHeight,
  getFileDiffOverviewScrollOffset,
} from "./diff-overview-navigation";
import { buildFileDiffOverview } from "./file-diff-overview";

export function FileDiffView({
  file,
  layout,
  wrapLines,
  codeFontSize,
  monoFontFamily,
  onExpandContext,
}: {
  file: ParsedDiffFile;
  layout: "unified" | "split";
  wrapLines: boolean;
  codeFontSize: number;
  monoFontFamily: string;
  onExpandContext: () => void;
}) {
  const scrollRef = useRef<ScrollView>(null);
  const viewportHeightRef = useRef(0);
  const contentHeightRef = useRef(0);
  const lineHeight = Math.round(codeFontSize * 1.5);
  const overview = useMemo(() => buildFileDiffOverview({ file, layout }), [file, layout]);
  const textMetricsStyle = useMemo<TextStyle>(() => {
    const trimmedMonoFontFamily = monoFontFamily.trim();
    return {
      fontSize: codeFontSize,
      lineHeight,
      ...(trimmedMonoFontFamily ? { fontFamily: trimmedMonoFontFamily } : null),
    };
  }, [codeFontSize, lineHeight, monoFontFamily]);
  const handleLayout = useCallback((event: LayoutChangeEvent) => {
    viewportHeightRef.current = event.nativeEvent.layout.height;
  }, []);
  const handleContentSizeChange = useCallback((_width: number, height: number) => {
    contentHeightRef.current = height;
  }, []);
  const handleMarkerPress = useCallback(
    (marker: WorkspaceFileDiffOverviewMarker) => {
      const effectiveLineHeight = getFileDiffOverviewRowHeight({
        defaultRowHeight: lineHeight,
        contentHeight: contentHeightRef.current,
        totalRows: overview.totalRows,
        wrapLines,
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
    [lineHeight, overview.totalRows, wrapLines],
  );

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
          file={file}
          layout={layout}
          wrapLines={wrapLines}
          codeFontSize={codeFontSize}
          textMetricsStyle={textMetricsStyle}
          onExpandContext={onExpandContext}
          testID="file-diff-body"
        />
      </ScrollView>
      <FileDiffOverviewRuler overview={overview} onMarkerPress={handleMarkerPress} />
    </View>
  );
}

const styles = StyleSheet.create(() => ({
  container: {
    flex: 1,
    minHeight: 0,
    position: "relative",
  },
  scroll: {
    flex: 1,
    minHeight: 0,
  },
}));
