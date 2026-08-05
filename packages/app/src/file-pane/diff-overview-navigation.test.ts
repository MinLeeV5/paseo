import { describe, expect, it } from "vitest";
import { getFileDiffOverviewScrollOffset } from "./diff-overview-navigation";

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
