import type { ParsedDiffFile } from "@/git/use-diff-query";
import { buildSplitDiffRows, buildUnifiedDiffLines } from "@/utils/diff-layout";
import type {
  WorkspaceFileDiffOverview,
  WorkspaceFileDiffOverviewMarker,
  WorkspaceFileDiffOverviewMarkerState,
} from "@/workspace/file-diff-decorations";

export function buildFileDiffOverview(input: {
  file: ParsedDiffFile;
  layout: "unified" | "split";
}): WorkspaceFileDiffOverview {
  return input.layout === "split"
    ? buildSplitOverview(input.file)
    : buildUnifiedOverview(input.file);
}

function buildUnifiedOverview(file: ParsedDiffFile): WorkspaceFileDiffOverview {
  const lines = buildUnifiedDiffLines(file);
  const markers: WorkspaceFileDiffOverviewMarker[] = [];
  let row = 0;

  while (row < lines.length) {
    const type = lines[row]?.line.type;
    if (type !== "add" && type !== "remove") {
      row += 1;
      continue;
    }

    const startRow = row;
    let hasAddition = false;
    let hasDeletion = false;
    while (row < lines.length) {
      const changeType = lines[row]?.line.type;
      if (changeType !== "add" && changeType !== "remove") {
        break;
      }
      hasAddition ||= changeType === "add";
      hasDeletion ||= changeType === "remove";
      row += 1;
    }
    addMarker(markers, changeState({ hasAddition, hasDeletion }), startRow, row - startRow);
  }

  return { markers, totalRows: lines.length };
}

function buildSplitOverview(file: ParsedDiffFile): WorkspaceFileDiffOverview {
  const rows = buildSplitDiffRows(file);
  const markers: WorkspaceFileDiffOverviewMarker[] = [];

  for (const [rowIndex, row] of rows.entries()) {
    if (row.kind === "header") {
      continue;
    }
    const hasAddition = row.right?.type === "add";
    const hasDeletion = row.left?.type === "remove";
    if (!hasAddition && !hasDeletion) {
      continue;
    }
    addMarker(markers, changeState({ hasAddition, hasDeletion }), rowIndex, 1);
  }

  return { markers, totalRows: rows.length };
}

function changeState(input: {
  hasAddition: boolean;
  hasDeletion: boolean;
}): WorkspaceFileDiffOverviewMarkerState {
  if (input.hasAddition && input.hasDeletion) {
    return "modified";
  }
  return input.hasAddition ? "added" : "deleted";
}

function addMarker(
  markers: WorkspaceFileDiffOverviewMarker[],
  state: WorkspaceFileDiffOverviewMarkerState,
  startRow: number,
  rowCount: number,
): void {
  const previous = markers.at(-1);
  if (previous?.state === state && previous.startRow + previous.rowCount === startRow) {
    previous.rowCount += rowCount;
    return;
  }
  markers.push({ key: `${state}:${startRow}`, state, startRow, rowCount });
}
