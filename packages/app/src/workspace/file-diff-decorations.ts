import type { ParsedDiffFile } from "@/git/use-diff-query";

export type WorkspaceFileDiffLineState = "added" | "modified";

export interface WorkspaceFileDeletedDiffRow {
  key: string;
  oldLineNumber: number;
  content: string;
}

export interface WorkspaceFileDiffDecorations {
  lineStatesByLineNumber: Map<number, WorkspaceFileDiffLineState>;
  deletedRowsBeforeLineNumber: Map<number, WorkspaceFileDeletedDiffRow[]>;
  deletedRowsAfterLastLine: WorkspaceFileDeletedDiffRow[];
}

export type WorkspaceFileDiffOverviewMarkerState = WorkspaceFileDiffLineState | "deleted";

export interface WorkspaceFileDiffOverviewMarker {
  key: string;
  state: WorkspaceFileDiffOverviewMarkerState;
  startRow: number;
  rowCount: number;
}

export interface WorkspaceFileDiffOverview {
  markers: WorkspaceFileDiffOverviewMarker[];
  totalRows: number;
}

interface PendingRemoval {
  key: string;
  oldLineNumber: number;
  content: string;
}

interface PendingAddition {
  newLineNumber: number;
}

export function buildWorkspaceFileDiffDecorations(
  file: ParsedDiffFile,
): WorkspaceFileDiffDecorations {
  const lineStatesByLineNumber = new Map<number, WorkspaceFileDiffLineState>();
  const deletedRowsBeforeLineNumber = new Map<number, WorkspaceFileDeletedDiffRow[]>();
  const deletedRowsAfterLastLine: WorkspaceFileDeletedDiffRow[] = [];

  function pushDeletedRow(anchorLineNumber: number, row: WorkspaceFileDeletedDiffRow): void {
    const rows = deletedRowsBeforeLineNumber.get(anchorLineNumber);
    if (rows) {
      rows.push(row);
      return;
    }
    deletedRowsBeforeLineNumber.set(anchorLineNumber, [row]);
  }

  function flushPending(input: {
    removals: PendingRemoval[];
    additions: PendingAddition[];
    anchorLineNumber: number;
    afterLastLine: boolean;
  }): void {
    const pairCount = Math.max(input.removals.length, input.additions.length);
    for (let index = 0; index < pairCount; index += 1) {
      const removal = input.removals[index] ?? null;
      const addition = input.additions[index] ?? null;
      if (removal && addition) {
        lineStatesByLineNumber.set(addition.newLineNumber, "modified");
        continue;
      }
      if (addition) {
        lineStatesByLineNumber.set(addition.newLineNumber, "added");
        continue;
      }
      if (!removal) {
        continue;
      }
      const row = {
        key: removal.key,
        oldLineNumber: removal.oldLineNumber,
        content: removal.content,
      };
      if (input.afterLastLine) {
        deletedRowsAfterLastLine.push(row);
      } else {
        pushDeletedRow(input.anchorLineNumber, row);
      }
    }
  }

  for (const [hunkIndex, hunk] of file.hunks.entries()) {
    let oldLineNumber = hunk.oldStart;
    let newLineNumber = hunk.newStart;
    let pendingRemovals: PendingRemoval[] = [];
    let pendingAdditions: PendingAddition[] = [];

    function flushBeforeNextLine(): void {
      flushPending({
        removals: pendingRemovals,
        additions: pendingAdditions,
        anchorLineNumber: newLineNumber,
        afterLastLine: false,
      });
      pendingRemovals = [];
      pendingAdditions = [];
    }

    for (const [lineIndex, line] of hunk.lines.entries()) {
      if (line.type === "header") {
        continue;
      }
      if (line.type === "remove") {
        pendingRemovals.push({
          key: `${file.path}:${hunkIndex}:${lineIndex}:deleted:${oldLineNumber}`,
          oldLineNumber,
          content: line.content,
        });
        oldLineNumber += 1;
        continue;
      }
      if (line.type === "add") {
        pendingAdditions.push({ newLineNumber });
        newLineNumber += 1;
        continue;
      }

      flushBeforeNextLine();
      oldLineNumber += 1;
      newLineNumber += 1;
    }

    flushPending({
      removals: pendingRemovals,
      additions: pendingAdditions,
      anchorLineNumber: newLineNumber,
      afterLastLine: true,
    });
  }

  return {
    lineStatesByLineNumber,
    deletedRowsBeforeLineNumber,
    deletedRowsAfterLastLine,
  };
}

export function buildWorkspaceFileDiffOverview(input: {
  decorations: WorkspaceFileDiffDecorations;
  lineCount: number;
}): WorkspaceFileDiffOverview {
  const markers: WorkspaceFileDiffOverviewMarker[] = [];
  const lineCount = Math.max(0, Math.floor(input.lineCount));
  let renderedRow = 0;

  function addMarker(state: WorkspaceFileDiffOverviewMarkerState): void {
    const previous = markers.at(-1);
    if (previous?.state === state && previous.startRow + previous.rowCount === renderedRow) {
      previous.rowCount += 1;
      return;
    }
    markers.push({
      key: `${state}:${renderedRow}`,
      state,
      startRow: renderedRow,
      rowCount: 1,
    });
  }

  function addDeletedRows(rows: WorkspaceFileDeletedDiffRow[]): void {
    for (const _row of rows) {
      addMarker("deleted");
      renderedRow += 1;
    }
  }

  for (let lineNumber = 1; lineNumber <= lineCount; lineNumber += 1) {
    addDeletedRows(input.decorations.deletedRowsBeforeLineNumber.get(lineNumber) ?? []);
    const lineState = input.decorations.lineStatesByLineNumber.get(lineNumber);
    if (lineState) {
      addMarker(lineState);
    }
    renderedRow += 1;
  }

  for (const [lineNumber, rows] of input.decorations.deletedRowsBeforeLineNumber) {
    if (lineNumber < 1 || lineNumber > lineCount) {
      addDeletedRows(rows);
    }
  }
  addDeletedRows(input.decorations.deletedRowsAfterLastLine);

  return { markers, totalRows: renderedRow };
}
