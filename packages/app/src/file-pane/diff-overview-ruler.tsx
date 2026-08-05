import { useCallback, useMemo, useState } from "react";
import {
  Pressable,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { useTranslation } from "react-i18next";
import { isWeb } from "@/constants/platform";
import { inlineUnistylesStyle } from "@/styles/unistyles-inline-style";
import type {
  WorkspaceFileDiffOverview,
  WorkspaceFileDiffOverviewMarker,
  WorkspaceFileDiffOverviewMarkerState,
} from "@/workspace/file-diff-decorations";

const MIN_MARKER_HEIGHT = 3;
const MARKER_HIT_SLOP = { top: 6, right: 0, bottom: 6, left: 0 } as const;

export function FileDiffOverviewRuler({
  overview,
  onMarkerPress,
}: {
  overview: WorkspaceFileDiffOverview | null;
  onMarkerPress: (marker: WorkspaceFileDiffOverviewMarker) => void;
}) {
  const [trackHeight, setTrackHeight] = useState(0);
  const { t } = useTranslation();
  const handleLayout = useCallback((event: LayoutChangeEvent) => {
    setTrackHeight(event.nativeEvent.layout.height);
  }, []);

  if (!overview || overview.markers.length === 0) {
    return null;
  }

  return (
    <View
      pointerEvents="box-none"
      accessible={false}
      style={styles.ruler}
      onLayout={handleLayout}
      testID="file-diff-overview-ruler"
    >
      {trackHeight > 0
        ? overview.markers.map((marker) => (
            <FileDiffOverviewMarker
              key={marker.key}
              marker={marker}
              totalRows={overview.totalRows}
              trackHeight={trackHeight}
              accessibilityLabel={t("workspace.git.diff.jumpToFileChange", {
                position: marker.startRow + 1,
              })}
              onPress={onMarkerPress}
            />
          ))
        : null}
    </View>
  );
}

function FileDiffOverviewMarker({
  marker,
  totalRows,
  trackHeight,
  accessibilityLabel,
  onPress,
}: {
  marker: WorkspaceFileDiffOverviewMarker;
  totalRows: number;
  trackHeight: number;
  accessibilityLabel: string;
  onPress: (marker: WorkspaceFileDiffOverviewMarker) => void;
}) {
  const markerHeight = Math.max(MIN_MARKER_HEIGHT, (marker.rowCount / totalRows) * trackHeight);
  const markerTop = Math.min(
    (marker.startRow / totalRows) * trackHeight,
    Math.max(0, trackHeight - markerHeight),
  );
  const hitTargetStyle = useMemo<StyleProp<ViewStyle>>(
    () => [styles.markerHitTarget, inlineUnistylesStyle({ top: markerTop, height: markerHeight })],
    [markerHeight, markerTop],
  );
  const markerStyle = useMemo<StyleProp<ViewStyle>>(
    () => [styles.marker, markerStateStyle(marker.state)],
    [marker.state],
  );
  const handlePress = useCallback(() => onPress(marker), [marker, onPress]);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      hitSlop={MARKER_HIT_SLOP}
      onPress={handlePress}
      style={hitTargetStyle}
      testID={`file-diff-overview-marker-${marker.state}-${marker.startRow}`}
    >
      <View pointerEvents="none" style={markerStyle} />
    </Pressable>
  );
}

function markerStateStyle(state: WorkspaceFileDiffOverviewMarkerState): ViewStyle {
  switch (state) {
    case "added":
      return styles.addedMarker;
    case "modified":
      return styles.modifiedMarker;
    case "deleted":
      return styles.deletedMarker;
  }
}

const styles = StyleSheet.create((theme) => ({
  ruler: {
    position: "absolute",
    top: theme.spacing[1],
    right: theme.spacing[1],
    bottom: theme.spacing[1],
    width: theme.spacing[3],
    zIndex: 1,
  },
  markerHitTarget: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "flex-end",
    ...(isWeb ? { cursor: "pointer" } : null),
  },
  marker: {
    width: theme.spacing[1],
    height: "100%",
    borderRadius: theme.borderRadius.sm,
  },
  addedMarker: {
    backgroundColor: theme.colors.diffAddition,
  },
  modifiedMarker: {
    backgroundColor: theme.colors.diffModification,
  },
  deletedMarker: {
    backgroundColor: theme.colors.diffDeletion,
  },
}));
