import { describe, expect, it } from "vitest";
import { selectWorkspaceFileDiffFiles } from "./workspace-file-diff-selection";

describe("selectWorkspaceFileDiffFiles", () => {
  it("ignores cached diff files for a plain source location", () => {
    expect(
      selectWorkspaceFileDiffFiles({
        diffContext: undefined,
        checkoutFiles: ["cached checkout diff"],
        sessionFiles: ["cached session diff"],
      }),
    ).toEqual([]);
  });

  it("selects the cache owned by an explicit diff location", () => {
    expect(
      selectWorkspaceFileDiffFiles({
        diffContext: {
          cwd: "/workspace",
          mode: "uncommitted",
          ignoreWhitespace: false,
        },
        checkoutFiles: ["checkout diff"],
        sessionFiles: ["session diff"],
      }),
    ).toEqual(["checkout diff"]);
    expect(
      selectWorkspaceFileDiffFiles({
        diffContext: {
          source: "session",
          agentId: "agent-1",
          ignoreWhitespace: false,
        },
        checkoutFiles: ["checkout diff"],
        sessionFiles: ["session diff"],
      }),
    ).toEqual(["session diff"]);
  });
});
