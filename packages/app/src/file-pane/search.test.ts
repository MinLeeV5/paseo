import { describe, expect, it } from "vitest";
import { findFileSearchMatches, getAdjacentFileSearchIndex, splitFileSearchTokens } from "./search";

describe("findFileSearchMatches", () => {
  it("finds case-insensitive matches with source positions", () => {
    expect(findFileSearchMatches("const target = 1;\nTARGET(target);", "target")).toEqual([
      { index: 0, from: 6, to: 12, lineNumber: 1, fromColumn: 6, toColumn: 12 },
      { index: 1, from: 18, to: 24, lineNumber: 2, fromColumn: 0, toColumn: 6 },
      { index: 2, from: 25, to: 31, lineNumber: 2, fromColumn: 7, toColumn: 13 },
    ]);
  });

  it("returns no matches for an empty query", () => {
    expect(findFileSearchMatches("content", "")).toEqual([]);
  });
});

describe("getAdjacentFileSearchIndex", () => {
  it("wraps in both directions", () => {
    expect(getAdjacentFileSearchIndex({ currentIndex: 2, matchCount: 3, direction: "next" })).toBe(
      0,
    );
    expect(
      getAdjacentFileSearchIndex({ currentIndex: 0, matchCount: 3, direction: "previous" }),
    ).toBe(2);
  });
});

describe("splitFileSearchTokens", () => {
  it("preserves syntax styles while marking all and current matches", () => {
    const matches = findFileSearchMatches("const target = target", "target");

    expect(
      splitFileSearchTokens({
        tokens: [
          { text: "const ", style: "keyword" },
          { text: "target", style: "variable" },
          { text: " = target", style: null },
        ],
        matches,
        currentMatchIndex: 1,
      }),
    ).toEqual([
      { text: "const ", style: "keyword", searchState: null },
      { text: "target", style: "variable", searchState: "match" },
      { text: " = ", style: null, searchState: null },
      { text: "target", style: null, searchState: "current" },
    ]);
  });
});
