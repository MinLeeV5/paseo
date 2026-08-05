import type { WorkspaceFileDiffOverviewMarker } from "@/workspace/file-diff-decorations";

export function getFileDiffOverviewRowHeight(input: {
  defaultRowHeight: number;
  contentHeight: number;
  totalRows: number;
  wrapLines: boolean;
}): number {
  if (!input.wrapLines || input.contentHeight <= 0 || input.totalRows <= 0) {
    return input.defaultRowHeight;
  }
  return input.contentHeight / input.totalRows;
}

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
