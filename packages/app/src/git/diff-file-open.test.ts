import { describe, expect, it } from "vitest";
import { createDiffFileOpenTarget, createDiffFilePreviewTarget } from "@/git/diff-file-open";

const diffContext = {
  cwd: "/repo",
  mode: "base" as const,
  baseRef: "main",
  ignoreWhitespace: true,
};

describe("changed file open targets", () => {
  it("keeps diff context for open and removes it for preview", () => {
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

    expect(
      createDiffFilePreviewTarget({
        filePath: "docs/README.md",
        workspaceRoot: "/repo",
      }),
    ).toEqual({
      kind: "file",
      request: {
        disposition: "main",
        location: {
          path: "docs/README.md",
        },
      },
    });
  });

  it("opens HTML previews as local file URLs in a browser tab", () => {
    expect(
      createDiffFilePreviewTarget({
        filePath: "site/index.html",
        workspaceRoot: "/repo",
      }),
    ).toEqual({
      kind: "browser",
      url: "file:///repo/site/index.html",
    });
  });
});
