import { describe, expect, it } from "vitest";
import type { ParsedDiffFile } from "@/git/use-diff-query";
import { findFileSearchMatches } from "@/file-pane/search";
import {
  buildDiffSearchDocument,
  getDiffSearchMatchLineKey,
  getDiffSearchRowIndex,
  groupDiffSearchMatchesByLine,
} from "./diff-search";

const file: ParsedDiffFile = {
  path: "example.ts",
  isNew: false,
  isDeleted: false,
  additions: 2,
  deletions: 1,
  status: "ok",
  hunks: [
    {
      oldStart: 4,
      oldCount: 2,
      newStart: 4,
      newCount: 3,
      lines: [
        { type: "header", content: "@@ -4,2 +4,3 @@" },
        { type: "context", content: "const stable = true;" },
        { type: "remove", content: "const target = 'before';" },
        { type: "add", content: "const target = 'after';" },
        { type: "add", content: "useTarget(target);" },
      ],
    },
  ],
};

describe("buildDiffSearchDocument", () => {
  it("indexes rendered code lines without hunk headers", () => {
    const document = buildDiffSearchDocument(file);

    expect(document.content).toBe(
      [
        "const stable = true;",
        "const target = 'before';",
        "const target = 'after';",
        "useTarget(target);",
      ].join("\n"),
    );
    expect(document.lines.map((line) => line.key)).toEqual(["0:1", "0:2", "0:3", "0:4"]);
  });

  it("maps matches back to their diff lines", () => {
    const document = buildDiffSearchDocument(file);
    const matches = findFileSearchMatches(document.content, "target");
    const matchesByLine = groupDiffSearchMatchesByLine(document, matches);

    expect(matchesByLine.get("0:2")).toHaveLength(1);
    expect(matchesByLine.get("0:3")).toHaveLength(1);
    expect(matchesByLine.get("0:4")).toHaveLength(2);
    expect(getDiffSearchMatchLineKey(document, matches[1] ?? null)).toBe("0:3");
  });

  it("resolves the same source line in unified and split layouts", () => {
    expect(getDiffSearchRowIndex(file, "unified", "0:3")).toBe(3);
    expect(getDiffSearchRowIndex(file, "split", "0:3")).toBe(2);
  });
});
