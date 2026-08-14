import { describe, expect, it } from "vitest";
import type { ParsedDiffFile } from "@/git/use-diff-query";
import {
  buildDiffHunkNavigationTargets,
  buildSourceDiffHunkNavigationTargets,
} from "./diff-navigation";

function makeFile(path: string, hunks: ParsedDiffFile["hunks"]): ParsedDiffFile {
  return {
    path,
    isNew: false,
    isDeleted: false,
    additions: 1,
    deletions: 1,
    status: "ok",
    hunks,
  };
}

describe("buildDiffHunkNavigationTargets", () => {
  it("builds ordered, cross-file targets using the first changed line in each hunk", () => {
    const targets = buildDiffHunkNavigationTargets([
      makeFile("first.ts", [
        {
          oldStart: 10,
          oldCount: 2,
          newStart: 10,
          newCount: 2,
          lines: [
            { type: "header", content: "@@ -10,2 +10,2 @@" },
            { type: "context", content: "stable" },
            { type: "remove", content: "before" },
            { type: "add", content: "after" },
          ],
        },
        {
          oldStart: 40,
          oldCount: 0,
          newStart: 40,
          newCount: 1,
          lines: [
            { type: "header", content: "@@ -40,0 +40,1 @@" },
            { type: "add", content: "inserted" },
          ],
        },
      ]),
      makeFile("second.ts", [
        {
          oldStart: 7,
          oldCount: 1,
          newStart: 7,
          newCount: 0,
          lines: [
            { type: "header", content: "@@ -7,1 +7,0 @@" },
            { type: "remove", content: "deleted" },
          ],
        },
      ]),
    ]);

    expect(targets).toEqual([
      { fileIndex: 0, filePath: "first.ts", hunkIndex: 0, side: "old", lineNumber: 11 },
      { fileIndex: 0, filePath: "first.ts", hunkIndex: 1, side: "new", lineNumber: 40 },
      { fileIndex: 1, filePath: "second.ts", hunkIndex: 0, side: "old", lineNumber: 7 },
    ]);
  });

  it("maps each hunk to a current-source line, including deletion-only hunks", () => {
    const file = makeFile("source.ts", [
      {
        oldStart: 10,
        oldCount: 2,
        newStart: 10,
        newCount: 2,
        lines: [
          { type: "header", content: "@@ -10,2 +10,2 @@" },
          { type: "remove", content: "before" },
          { type: "add", content: "after" },
          { type: "context", content: "stable" },
        ],
      },
      {
        oldStart: 30,
        oldCount: 1,
        newStart: 30,
        newCount: 0,
        lines: [
          { type: "header", content: "@@ -30,1 +30,0 @@" },
          { type: "remove", content: "deleted" },
        ],
      },
    ]);

    expect(buildSourceDiffHunkNavigationTargets(file)).toEqual([
      { hunkIndex: 0, lineNumber: 10 },
      { hunkIndex: 1, lineNumber: 30 },
    ]);
  });
});
