import { describe, expect, it } from "vitest";
import type { ParsedDiffFile } from "@/git/use-diff-query";
import { buildFileDiffOverview } from "./file-diff-overview";

function makeFile(lines: ParsedDiffFile["hunks"][number]["lines"]): ParsedDiffFile {
  return {
    path: "src/app.ts",
    isNew: false,
    isDeleted: false,
    additions: lines.filter((line) => line.type === "add").length,
    deletions: lines.filter((line) => line.type === "remove").length,
    status: "ok",
    hunks: [
      {
        oldStart: 10,
        oldCount: 6,
        newStart: 10,
        newCount: 6,
        lines,
      },
    ],
  };
}

const mixedFile = makeFile([
  { type: "header", content: "@@ -10,6 +10,6 @@" },
  { type: "context", content: "before" },
  { type: "remove", content: "old name" },
  { type: "add", content: "new name" },
  { type: "context", content: "middle" },
  { type: "add", content: "new option" },
  { type: "context", content: "after addition" },
  { type: "remove", content: "deleted setting" },
  { type: "context", content: "after deletion" },
]);

describe("buildFileDiffOverview", () => {
  it("maps unified modification, addition, and deletion blocks to rendered rows", () => {
    expect(buildFileDiffOverview({ file: mixedFile, layout: "unified" })).toEqual({
      markers: [
        { key: "modified:2", state: "modified", startRow: 2, rowCount: 2 },
        { key: "added:5", state: "added", startRow: 5, rowCount: 1 },
        { key: "deleted:7", state: "deleted", startRow: 7, rowCount: 1 },
      ],
      totalRows: 9,
    });
  });

  it("maps split modification pairs to one rendered row", () => {
    expect(buildFileDiffOverview({ file: mixedFile, layout: "split" })).toEqual({
      markers: [
        { key: "modified:2", state: "modified", startRow: 2, rowCount: 1 },
        { key: "added:4", state: "added", startRow: 4, rowCount: 1 },
        { key: "deleted:6", state: "deleted", startRow: 6, rowCount: 1 },
      ],
      totalRows: 8,
    });
  });

  it("keeps deleted-file rows visible in both layouts", () => {
    const deletedFile = {
      ...makeFile([
        { type: "header", content: "@@ -1,2 +0,0 @@" },
        { type: "remove", content: "first" },
        { type: "remove", content: "second" },
      ]),
      isDeleted: true,
    };

    const expected = {
      markers: [{ key: "deleted:1", state: "deleted", startRow: 1, rowCount: 2 }],
      totalRows: 3,
    };
    expect(buildFileDiffOverview({ file: deletedFile, layout: "unified" })).toEqual(expected);
    expect(buildFileDiffOverview({ file: deletedFile, layout: "split" })).toEqual(expected);
  });
});
