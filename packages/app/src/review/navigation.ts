import type { ParsedDiffFile } from "@/git/use-diff-query";
import type { ReviewDraftComment } from "./state";

export function sortReviewCommentsForDiff(
  comments: readonly ReviewDraftComment[],
  files: readonly ParsedDiffFile[],
): ReviewDraftComment[] {
  const fileOrder = new Map(files.map((file, index) => [file.path, index]));
  return comments
    .filter((comment) => fileOrder.has(comment.filePath))
    .sort((left, right) => {
      const fileDifference =
        (fileOrder.get(left.filePath) ?? Number.MAX_SAFE_INTEGER) -
        (fileOrder.get(right.filePath) ?? Number.MAX_SAFE_INTEGER);
      if (fileDifference !== 0) return fileDifference;
      if (left.lineNumber !== right.lineNumber) return left.lineNumber - right.lineNumber;
      if (left.side !== right.side) return left.side === "old" ? -1 : 1;
      return left.createdAt.localeCompare(right.createdAt);
    });
}

export function getAdjacentCircularIndex(input: {
  currentIndex: number;
  itemCount: number;
  direction: "previous" | "next";
}): number | null {
  if (input.itemCount <= 0) return null;
  if (input.currentIndex < 0 || input.currentIndex >= input.itemCount) {
    return input.direction === "next" ? 0 : input.itemCount - 1;
  }
  const delta = input.direction === "next" ? 1 : -1;
  return (input.currentIndex + delta + input.itemCount) % input.itemCount;
}
