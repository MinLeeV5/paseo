import type { WorkspaceFileDiffOverviewMarker } from "@/workspace/file-diff-decorations";

export function getFileDiffOverviewScrollOffset(input: {
  marker: WorkspaceFileDiffOverviewMarker;
  lineHeight: number;
  viewportHeight: number;
  contentTopInset: number;
}): number {
  const markerCenterRow = input.marker.startRow + input.marker.rowCount / 2;
  const markerCenterOffset = input.contentTopInset + markerCenterRow * input.lineHeight;
  return Math.max(0, markerCenterOffset - input.viewportHeight / 2);
}
