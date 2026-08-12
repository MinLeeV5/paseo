import { describe, expect, it } from "vitest";
import { createChangedFileSourceTarget, createDiffFileOpenTarget } from "@/git/diff-file-open";

const diffContext = {
  cwd: "/repo",
  mode: "base" as const,
  baseRef: "main",
  ignoreWhitespace: true,
};

describe("changed file open targets", () => {
  it("opens the complete current file without diff context", () => {
    expect(createChangedFileSourceTarget("docs/README.md")).toEqual({
      kind: "file",
      request: {
        disposition: "main",
        location: { path: "docs/README.md" },
      },
    });
  });

  it("keeps checkout diff context when opening a changed file", () => {
    expect(
      createDiffFileOpenTarget({
        filePath: "docs/README.md",
        diffContext,
      }),
    ).toEqual({
      kind: "file",
      request: {
        disposition: "main",
        location: {
          path: "docs/README.md",
          diffContext,
        },
      },
    });
  });

  it("keeps session diff context when opening an agent-changed file", () => {
    expect(
      createDiffFileOpenTarget({
        filePath: "docs/README.md",
        diffContext: {
          source: "session",
          agentId: "agent-1",
          turnId: "turn-2",
          ignoreWhitespace: false,
        },
      }),
    ).toEqual({
      kind: "file",
      request: {
        disposition: "main",
        location: {
          path: "docs/README.md",
          diffContext: {
            source: "session",
            agentId: "agent-1",
            turnId: "turn-2",
            ignoreWhitespace: false,
          },
        },
      },
    });
  });
});
