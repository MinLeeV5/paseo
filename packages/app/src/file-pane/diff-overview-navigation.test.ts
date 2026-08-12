import { describe, expect, it } from "vitest";
import {
  getFileDiffOverviewRowHeight,
  getFileDiffOverviewScrollOffset,
  getFileSourceLineScrollOffset,
} from "./diff-overview-navigation";

describe("getFileDiffOverviewRowHeight", () => {
  it("uses the measured average row height when long lines wrap", () => {
    expect(
      getFileDiffOverviewRowHeight({
        defaultRowHeight: 20,
        contentHeight: 600,
        totalRows: 20,
        wrapLines: true,
      }),
    ).toBe(30);
  });

  it("keeps the configured row height before wrapped content is measured", () => {
    expect(
      getFileDiffOverviewRowHeight({
        defaultRowHeight: 20,
        contentHeight: 0,
        totalRows: 20,
        wrapLines: true,
      }),
    ).toBe(20);
  });
});

describe("getFileDiffOverviewScrollOffset", () => {
  it("centers the selected change marker in the source viewport", () => {
    expect(
      getFileDiffOverviewScrollOffset({
        marker: { key: "added:40", state: "added", startRow: 40, rowCount: 2 },
        lineHeight: 20,
        viewportHeight: 400,
        contentTopInset: 16,
      }),
    ).toBe(636);
  });

  it("clamps changes near the start of the file to the top", () => {
    expect(
      getFileDiffOverviewScrollOffset({
        marker: { key: "modified:1", state: "modified", startRow: 1, rowCount: 1 },
        lineHeight: 20,
        viewportHeight: 400,
        contentTopInset: 16,
      }),
    ).toBe(0);
  });
});

describe("getFileSourceLineScrollOffset", () => {
  it("centers the source line selected from a diff hunk", () => {
    expect(
      getFileSourceLineScrollOffset({
        lineNumber: 80,
        lineHeight: 20,
        viewportHeight: 400,
        contentTopInset: 16,
      }),
    ).toBe(1406);
  });

  it("clamps source lines near the start of the file to the top", () => {
    expect(
      getFileSourceLineScrollOffset({
        lineNumber: 3,
        lineHeight: 20,
        viewportHeight: 400,
        contentTopInset: 16,
      }),
    ).toBe(0);
  });
});
