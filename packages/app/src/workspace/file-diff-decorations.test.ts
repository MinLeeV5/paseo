import { describe, expect, it } from "vitest";
import type { ParsedDiffFile } from "@/git/use-diff-query";
import { buildWorkspaceFileDiffDecorations } from "./file-diff-decorations";

function makeFile(
  lines: ParsedDiffFile["hunks"][number]["lines"],
  options?: Partial<
    Pick<ParsedDiffFile["hunks"][number], "oldStart" | "oldCount" | "newStart" | "newCount">
  >,
): ParsedDiffFile {
  return makeFileWithHunks([
    {
      oldStart: options?.oldStart ?? 10,
      oldCount: options?.oldCount ?? 5,
      newStart: options?.newStart ?? 10,
      newCount: options?.newCount ?? 6,
      lines,
    },
  ]);
}

function makeFileWithHunks(hunks: ParsedDiffFile["hunks"]): ParsedDiffFile {
  const lines = hunks.flatMap((hunk) => hunk.lines);
  return {
    path: "src/app.ts",
    isNew: false,
    isDeleted: false,
    additions: lines.filter((line) => line.type === "add").length,
    deletions: lines.filter((line) => line.type === "remove").length,
    status: "ok",
    hunks,
  };
}

describe("buildWorkspaceFileDiffDecorations", () => {
  it("classifies modified, added, and deleted-only lines for a file pane", () => {
    const decorations = buildWorkspaceFileDiffDecorations(
      makeFile([
        { type: "header", content: "@@ -10,5 +10,6 @@" },
        { type: "context", content: "before" },
        { type: "remove", content: "old name" },
        { type: "add", content: "new name" },
        { type: "context", content: "middle" },
        { type: "add", content: "new option" },
        { type: "context", content: "after addition" },
        { type: "remove", content: "deleted setting" },
        { type: "context", content: "after deletion" },
      ]),
    );

    expect(Array.from(decorations.lineStatesByLineNumber.entries())).toEqual([
      [11, "modified"],
      [13, "added"],
    ]);
    expect(Array.from(decorations.deletedRowsBeforeLineNumber.entries())).toEqual([
      [
        15,
        [
          {
            key: "src/app.ts:0:7:deleted:14",
            oldLineNumber: 14,
            content: "deleted setting",
          },
        ],
      ],
    ]);
    expect(decorations.deletedRowsAfterLastLine).toEqual([]);
  });

  it("places trailing deleted-only lines after the rendered file content", () => {
    const decorations = buildWorkspaceFileDiffDecorations(
      makeFile(
        [
          { type: "header", content: "@@ -1,2 +1,1 @@" },
          { type: "context", content: "keep" },
          { type: "remove", content: "removed tail" },
        ],
        { oldStart: 1, oldCount: 2, newStart: 1, newCount: 1 },
      ),
    );

    expect(Array.from(decorations.lineStatesByLineNumber.entries())).toEqual([]);
    expect(Array.from(decorations.deletedRowsBeforeLineNumber.entries())).toEqual([]);
    expect(decorations.deletedRowsAfterLastLine).toEqual([
      {
        key: "src/app.ts:0:2:deleted:2",
        oldLineNumber: 2,
        content: "removed tail",
      },
    ]);
  });

  it("marks every line in a new file as added", () => {
    const decorations = buildWorkspaceFileDiffDecorations(
      makeFile(
        [
          { type: "header", content: "@@ -0,0 +1,2 @@" },
          { type: "add", content: "first" },
          { type: "add", content: "second" },
        ],
        { oldStart: 0, oldCount: 0, newStart: 1, newCount: 2 },
      ),
    );

    expect(Array.from(decorations.lineStatesByLineNumber.entries())).toEqual([
      [1, "added"],
      [2, "added"],
    ]);
    expect(Array.from(decorations.deletedRowsBeforeLineNumber.entries())).toEqual([]);
    expect(decorations.deletedRowsAfterLastLine).toEqual([]);
  });

  it("keeps fully deleted files as deleted fallback rows", () => {
    const decorations = buildWorkspaceFileDiffDecorations(
      makeFile(
        [
          { type: "header", content: "@@ -1,2 +0,0 @@" },
          { type: "remove", content: "first" },
          { type: "remove", content: "second" },
        ],
        { oldStart: 1, oldCount: 2, newStart: 0, newCount: 0 },
      ),
    );

    expect(Array.from(decorations.lineStatesByLineNumber.entries())).toEqual([]);
    expect(Array.from(decorations.deletedRowsBeforeLineNumber.entries())).toEqual([]);
    expect(decorations.deletedRowsAfterLastLine).toEqual([
      {
        key: "src/app.ts:0:1:deleted:1",
        oldLineNumber: 1,
        content: "first",
      },
      {
        key: "src/app.ts:0:2:deleted:2",
        oldLineNumber: 2,
        content: "second",
      },
    ]);
  });

  it("keeps line numbering independent across multiple hunks", () => {
    const decorations = buildWorkspaceFileDiffDecorations(
      makeFileWithHunks([
        {
          oldStart: 1,
          oldCount: 1,
          newStart: 1,
          newCount: 2,
          lines: [
            { type: "header", content: "@@ -1,1 +1,2 @@" },
            { type: "context", content: "first hunk" },
            { type: "add", content: "new in first hunk" },
          ],
        },
        {
          oldStart: 20,
          oldCount: 2,
          newStart: 21,
          newCount: 1,
          lines: [
            { type: "header", content: "@@ -20,2 +21,1 @@" },
            { type: "remove", content: "removed in second hunk" },
            { type: "context", content: "second hunk" },
          ],
        },
      ]),
    );

    expect(Array.from(decorations.lineStatesByLineNumber.entries())).toEqual([[2, "added"]]);
    expect(Array.from(decorations.deletedRowsBeforeLineNumber.entries())).toEqual([
      [
        21,
        [
          {
            key: "src/app.ts:1:1:deleted:20",
            oldLineNumber: 20,
            content: "removed in second hunk",
          },
        ],
      ],
    ]);
    expect(decorations.deletedRowsAfterLastLine).toEqual([]);
  });
});
