import { describe, expect, it } from "vitest";
import type { ParsedDiffFile } from "@/git/use-diff-query";
import { buildSplitDiffRows, buildUnifiedDiffLines } from "@/utils/diff-layout";
import { buildFullFileDiff } from "./full-file-diff";

const source = [
  "line 1",
  "line 2",
  "new line 3",
  "line 4",
  "line 5 outside every hunk",
  "line 6 outside every hunk",
  "line 7",
  "new line 8",
  "line 9",
  "line 10",
].join("\n");

const compactFile: ParsedDiffFile = {
  path: "example.ts",
  isNew: false,
  isDeleted: false,
  additions: 2,
  deletions: 2,
  status: "ok",
  hunks: [
    {
      oldStart: 2,
      oldCount: 3,
      newStart: 2,
      newCount: 3,
      lines: [
        { type: "header", content: "@@ -2,3 +2,3 @@" },
        { type: "context", content: "line 2" },
        { type: "remove", content: "old line 3" },
        { type: "add", content: "new line 3" },
        { type: "context", content: "line 4" },
      ],
    },
    {
      oldStart: 7,
      oldCount: 3,
      newStart: 7,
      newCount: 3,
      lines: [
        { type: "header", content: "@@ -7,3 +7,3 @@" },
        { type: "context", content: "line 7" },
        { type: "remove", content: "old line 8" },
        { type: "add", content: "new line 8" },
        { type: "context", content: "line 9" },
      ],
    },
  ],
};

function requireFullFile(file: ParsedDiffFile | null): ParsedDiffFile {
  if (!file) {
    throw new Error("Expected the full-file diff to be ready");
  }
  return file;
}

describe("buildFullFileDiff", () => {
  it("waits for the current source instead of returning compact hunk content", () => {
    expect(buildFullFileDiff({ file: compactFile, source: null })).toBeNull();
  });

  it("fills compact diff gaps with the complete current source and removes hunk headers", () => {
    const fullFile = requireFullFile(buildFullFileDiff({ file: compactFile, source }));
    const lines = buildUnifiedDiffLines(fullFile, { includeHunkHeaders: false });

    expect(fullFile.hunks).toHaveLength(1);
    expect(fullFile.hunks[0]).toMatchObject({
      oldStart: 1,
      oldCount: 10,
      newStart: 1,
      newCount: 10,
    });
    expect(lines.some(({ line }) => line.type === "header")).toBe(false);
    expect(lines.map(({ line }) => `${line.type}:${line.content}`)).toEqual([
      "context:line 1",
      "context:line 2",
      "remove:old line 3",
      "add:new line 3",
      "context:line 4",
      "context:line 5 outside every hunk",
      "context:line 6 outside every hunk",
      "context:line 7",
      "remove:old line 8",
      "add:new line 8",
      "context:line 9",
      "context:line 10",
    ]);
  });

  it("keeps the complete old and new files aligned in split view without hunk rows", () => {
    const fullFile = requireFullFile(buildFullFileDiff({ file: compactFile, source }));
    const rows = buildSplitDiffRows(fullFile, { includeHunkHeaders: false });

    expect(rows).toHaveLength(10);
    expect(rows.every((row) => row.kind === "pair")).toBe(true);
    expect(rows[4]).toMatchObject({
      kind: "pair",
      left: { type: "context", content: "line 5 outside every hunk", lineNumber: 5 },
      right: { type: "context", content: "line 5 outside every hunk", lineNumber: 5 },
    });
    expect(rows[7]).toMatchObject({
      kind: "pair",
      left: { type: "remove", content: "old line 8", lineNumber: 8 },
      right: { type: "add", content: "new line 8", lineNumber: 8 },
    });
  });

  it("uses the removed lines as the full source for deleted files", () => {
    const deletedFile: ParsedDiffFile = {
      path: "deleted.ts",
      isNew: false,
      isDeleted: true,
      additions: 0,
      deletions: 2,
      status: "ok",
      hunks: [
        {
          oldStart: 1,
          oldCount: 2,
          newStart: 0,
          newCount: 0,
          lines: [
            { type: "header", content: "@@ -1,2 +0,0 @@" },
            { type: "remove", content: "first removed line" },
            { type: "remove", content: "second removed line" },
          ],
        },
      ],
    };

    const fullFile = requireFullFile(buildFullFileDiff({ file: deletedFile, source: null }));

    expect(fullFile.hunks[0]).toMatchObject({ oldStart: 1, oldCount: 2, newStart: 0, newCount: 0 });
    expect(fullFile.hunks[0]?.lines).toEqual([
      { type: "remove", content: "first removed line" },
      { type: "remove", content: "second removed line" },
    ]);
  });
});
