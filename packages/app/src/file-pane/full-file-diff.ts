import { highlightCode } from "@getpaseo/highlight";
import type { DiffLine, ParsedDiffFile } from "@/git/use-diff-query";

/**
 * Expands compact git hunks into one continuous, headerless diff stream.
 * The current workspace file supplies every unchanged line outside the hunks;
 * removals from the patch reconstruct the corresponding old-file side.
 */
export function buildFullFileDiff(input: {
  file: ParsedDiffFile;
  source: string | null;
}): ParsedDiffFile | null {
  if (input.file.status === "binary" || input.file.status === "too_large") {
    return input.file;
  }
  if (input.source === null && !input.file.isDeleted) {
    return null;
  }

  const sourceLines = input.source === null ? null : input.source.split("\n");
  const highlightedLines =
    input.source === null ? null : highlightCode(input.source, input.file.path);
  const lines: DiffLine[] = [];
  let newLineNumber = 1;

  const pushCurrentLine = (type: "add" | "context", fallback?: DiffLine) => {
    const sourceIndex = newLineNumber - 1;
    const content = sourceLines?.[sourceIndex] ?? fallback?.content ?? "";
    const tokens = highlightedLines?.[sourceIndex] ?? fallback?.tokens;
    lines.push({ type, content, ...(tokens ? { tokens } : {}) });
    newLineNumber += 1;
  };

  for (const hunk of input.file.hunks) {
    if (sourceLines) {
      const hunkStart = Math.max(1, hunk.newStart);
      const contextEnd = Math.min(hunkStart - 1, sourceLines.length);
      for (let lineNumber = newLineNumber; lineNumber <= contextEnd; lineNumber += 1) {
        pushCurrentLine("context");
      }
    }

    for (const line of hunk.lines) {
      if (line.type === "header") {
        continue;
      }
      if (line.type === "remove") {
        lines.push(line);
        continue;
      }
      pushCurrentLine(line.type, line);
    }
  }

  if (sourceLines) {
    const remainingLineCount = Math.max(0, sourceLines.length - newLineNumber + 1);
    for (let index = 0; index < remainingLineCount; index += 1) {
      pushCurrentLine("context");
    }
  }

  if (lines.length === 0) {
    return { ...input.file, hunks: [] };
  }

  const oldCount = lines.reduce((count, line) => count + (line.type === "add" ? 0 : 1), 0);
  const newCount = lines.reduce((count, line) => count + (line.type === "remove" ? 0 : 1), 0);

  return {
    ...input.file,
    hunks: [
      {
        oldStart: oldCount === 0 ? 0 : 1,
        oldCount,
        newStart: newCount === 0 ? 0 : 1,
        newCount,
        lines,
      },
    ],
  };
}
