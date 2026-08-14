import type { ParsedDiffFile } from "@getpaseo/protocol/messages";
import type { FileSearchMatch } from "@/file-pane/search";
import {
  buildNumberedDiffHunks,
  buildSplitDiffRows,
  buildUnifiedDiffLines,
} from "@/utils/diff-layout";

export interface DiffSearchDocumentLine {
  key: string;
  content: string;
}

export interface DiffSearchDocument {
  content: string;
  lines: DiffSearchDocumentLine[];
}

export interface DiffSearchRenderState {
  matchesByLine: ReadonlyMap<string, readonly FileSearchMatch[]>;
  currentMatchIndex: number;
}

export function buildDiffSearchLineKey(hunkIndex: number, lineIndex: number): string {
  return `${hunkIndex}:${lineIndex}`;
}

export function buildDiffSearchDocument(file: ParsedDiffFile): DiffSearchDocument {
  const lines = buildNumberedDiffHunks(file).flatMap((hunk) =>
    hunk.lines
      .filter((line) => line.line.type !== "header")
      .map((line) => ({
        key: buildDiffSearchLineKey(line.hunkIndex, line.lineIndex),
        content: line.line.content,
      })),
  );
  return {
    content: lines.map((line) => line.content).join("\n"),
    lines,
  };
}

export function groupDiffSearchMatchesByLine(
  document: DiffSearchDocument,
  matches: readonly FileSearchMatch[],
): ReadonlyMap<string, readonly FileSearchMatch[]> {
  const matchesByLine = new Map<string, FileSearchMatch[]>();
  for (const match of matches) {
    const line = document.lines[match.lineNumber - 1];
    if (!line) {
      continue;
    }
    const lineMatches = matchesByLine.get(line.key) ?? [];
    lineMatches.push(match);
    matchesByLine.set(line.key, lineMatches);
  }
  return matchesByLine;
}

export function getDiffSearchMatchLineKey(
  document: DiffSearchDocument,
  match: FileSearchMatch | null,
): string | null {
  if (!match) {
    return null;
  }
  return document.lines[match.lineNumber - 1]?.key ?? null;
}

export function getDiffSearchRowIndex(
  file: ParsedDiffFile,
  layout: "unified" | "split",
  lineKey: string,
): number {
  if (layout === "split") {
    return buildSplitDiffRows(file).findIndex(
      (row) =>
        row.kind === "pair" &&
        [row.left, row.right].some(
          (line) =>
            line?.reviewTarget &&
            buildDiffSearchLineKey(line.reviewTarget.hunkIndex, line.reviewTarget.lineIndex) ===
              lineKey,
        ),
    );
  }
  return buildUnifiedDiffLines(file).findIndex(
    (line) =>
      line.reviewTarget &&
      buildDiffSearchLineKey(line.reviewTarget.hunkIndex, line.reviewTarget.lineIndex) === lineKey,
  );
}
