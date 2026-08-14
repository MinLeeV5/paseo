import type { HighlightToken } from "@getpaseo/highlight";

export type FileSearchDirection = "next" | "previous";
export type FileSearchTokenState = "match" | "current" | null;

export interface FileSearchMatch {
  index: number;
  from: number;
  to: number;
  lineNumber: number;
  fromColumn: number;
  toColumn: number;
}

export interface FileSearchTokenSegment extends HighlightToken {
  searchState: FileSearchTokenState;
}

export function findFileSearchMatches(content: string, query: string): FileSearchMatch[] {
  if (!query) {
    return [];
  }

  const matcher = new RegExp(escapeRegExp(query), "giu");
  const lines = content.split("\n");
  const matches: FileSearchMatch[] = [];
  let lineOffset = 0;

  for (const [lineIndex, line] of lines.entries()) {
    matcher.lastIndex = 0;
    let match = matcher.exec(line);
    while (match) {
      const from = lineOffset + match.index;
      matches.push({
        index: matches.length,
        from,
        to: from + match[0].length,
        lineNumber: lineIndex + 1,
        fromColumn: match.index,
        toColumn: match.index + match[0].length,
      });
      match = matcher.exec(line);
    }
    lineOffset += line.length + 1;
  }

  return matches;
}

export function getAdjacentFileSearchIndex(input: {
  currentIndex: number;
  matchCount: number;
  direction: FileSearchDirection;
}): number {
  if (input.matchCount <= 0) {
    return -1;
  }
  if (input.currentIndex < 0 || input.currentIndex >= input.matchCount) {
    return input.direction === "next" ? 0 : input.matchCount - 1;
  }
  const delta = input.direction === "next" ? 1 : -1;
  return (input.currentIndex + delta + input.matchCount) % input.matchCount;
}

export function splitFileSearchTokens<TToken extends { text: string }>(input: {
  tokens: readonly TToken[];
  matches: readonly FileSearchMatch[];
  currentMatchIndex: number;
}): Array<TToken & { searchState: FileSearchTokenState }> {
  const segments: Array<TToken & { searchState: FileSearchTokenState }> = [];
  let tokenStart = 0;

  for (const token of input.tokens) {
    const tokenEnd = tokenStart + token.text.length;
    const boundaries = new Set([tokenStart, tokenEnd]);
    for (const match of input.matches) {
      if (match.toColumn <= tokenStart || match.fromColumn >= tokenEnd) {
        continue;
      }
      boundaries.add(Math.max(tokenStart, match.fromColumn));
      boundaries.add(Math.min(tokenEnd, match.toColumn));
    }
    const sortedBoundaries = [...boundaries].sort((left, right) => left - right);
    for (let index = 0; index < sortedBoundaries.length - 1; index += 1) {
      const fromColumn = sortedBoundaries[index];
      const toColumn = sortedBoundaries[index + 1];
      const match = input.matches.find(
        (candidate) => candidate.fromColumn <= fromColumn && candidate.toColumn >= toColumn,
      );
      const searchState = getFileSearchTokenState(match, input.currentMatchIndex);
      segments.push({
        ...token,
        text: token.text.slice(fromColumn - tokenStart, toColumn - tokenStart),
        searchState,
      });
    }
    tokenStart = tokenEnd;
  }

  return segments;
}

function getFileSearchTokenState(
  match: FileSearchMatch | undefined,
  currentMatchIndex: number,
): FileSearchTokenState {
  if (!match) {
    return null;
  }
  return match.index === currentMatchIndex ? "current" : "match";
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
