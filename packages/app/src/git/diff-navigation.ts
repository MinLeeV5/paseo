import type { ParsedDiffFile } from "@getpaseo/protocol/messages";
import { buildNumberedDiffHunks } from "@/utils/diff-layout";

export interface DiffHunkNavigationTarget {
  fileIndex: number;
  filePath: string;
  hunkIndex: number;
  side: "old" | "new";
  lineNumber: number;
}

export interface SourceDiffHunkNavigationTarget {
  hunkIndex: number;
  lineNumber: number;
}

export function buildDiffHunkNavigationTargets(
  files: readonly ParsedDiffFile[],
): DiffHunkNavigationTarget[] {
  return files.flatMap((file, fileIndex) =>
    buildNumberedDiffHunks(file).flatMap((hunk) => {
      const firstChangedLine = hunk.lines.find(
        (line) =>
          (line.line.type === "add" || line.line.type === "remove") && line.unifiedCell !== null,
      );
      const targetCell =
        firstChangedLine?.unifiedCell ??
        hunk.lines.find((line) => line.unifiedCell !== null)?.unifiedCell ??
        null;
      return targetCell
        ? [
            {
              fileIndex,
              filePath: file.path,
              hunkIndex: hunk.hunkIndex,
              side: targetCell.side,
              lineNumber: targetCell.lineNumber,
            },
          ]
        : [];
    }),
  );
}

export function buildSourceDiffHunkNavigationTargets(
  file: ParsedDiffFile,
): SourceDiffHunkNavigationTarget[] {
  return file.hunks.flatMap((hunk, hunkIndex) => {
    let newLineNumber = hunk.newStart;
    let deletionAnchor: number | null = null;

    for (const line of hunk.lines) {
      if (line.type === "header") {
        continue;
      }
      if (line.type === "add") {
        return [{ hunkIndex, lineNumber: Math.max(1, newLineNumber) }];
      }
      if (line.type === "remove") {
        deletionAnchor ??= Math.max(1, newLineNumber);
        continue;
      }
      newLineNumber += 1;
    }

    return deletionAnchor
      ? [{ hunkIndex, lineNumber: deletionAnchor }]
      : [{ hunkIndex, lineNumber: Math.max(1, hunk.newStart) }];
  });
}
