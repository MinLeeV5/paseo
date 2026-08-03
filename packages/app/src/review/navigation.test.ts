import { describe, expect, it } from "vitest";
import type { ParsedDiffFile } from "@/git/use-diff-query";
import type { ReviewDraftComment } from "./state";
import { getAdjacentCircularIndex, sortReviewCommentsForDiff } from "./navigation";

function file(path: string): ParsedDiffFile {
  return {
    path,
    isNew: false,
    isDeleted: false,
    additions: 0,
    deletions: 0,
    status: "ok",
    hunks: [],
  };
}

function comment(id: string, filePath: string, lineNumber: number): ReviewDraftComment {
  return {
    id,
    filePath,
    side: "new",
    lineNumber,
    body: id,
    createdAt: "2026-08-03T00:00:00.000Z",
    updatedAt: "2026-08-03T00:00:00.000Z",
  };
}

describe("review navigation", () => {
  it("orders comments by visible file and line order", () => {
    const comments = [
      comment("b", "b.ts", 8),
      comment("a2", "a.ts", 20),
      comment("a1", "a.ts", 3),
      comment("stale", "missing.ts", 1),
    ];
    expect(sortReviewCommentsForDiff(comments, [file("a.ts"), file("b.ts")])).toEqual([
      comments[2],
      comments[1],
      comments[0],
    ]);
  });

  it("wraps previous and next navigation", () => {
    expect(getAdjacentCircularIndex({ currentIndex: -1, itemCount: 3, direction: "next" })).toBe(0);
    expect(getAdjacentCircularIndex({ currentIndex: 0, itemCount: 3, direction: "previous" })).toBe(
      2,
    );
    expect(getAdjacentCircularIndex({ currentIndex: 2, itemCount: 3, direction: "next" })).toBe(0);
  });
});
