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
