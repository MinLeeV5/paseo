import { describe, expect, it } from "vitest";
import {
  buildCheckoutDiffFileEntries,
  compareCheckoutDiffPaths,
  filterCheckoutDiffFileEntriesForCollapsedGroups,
  getCheckoutDiffDirectory,
  groupCheckoutDiffFilesByDirectory,
  orderCheckoutDiffFiles,
} from "./diff-order";

function createFile(path: string, additions = 0, submodulePath?: string) {
  return {
    path,
    isNew: false,
    isDeleted: false,
    additions,
    deletions: 0,
    hunks: [],
    ...(submodulePath !== undefined ? { submodulePath } : null),
  };
}

interface FilePathOnly {
  path: string;
}

interface DirectoryGroupSummaryInput {
  directory: string;
  files: FilePathOnly[];
}

function filePath(file: FilePathOnly): string {
  return file.path;
}

function summarizeDirectoryGroup(group: DirectoryGroupSummaryInput) {
  return {
    directory: group.directory,
    paths: group.files.map(filePath),
  };
}

describe("checkout diff ordering", () => {
  it("compares paths deterministically", () => {
    expect(compareCheckoutDiffPaths("a.ts", "b.ts")).toBeLessThan(0);
    expect(compareCheckoutDiffPaths("b.ts", "a.ts")).toBeGreaterThan(0);
    expect(compareCheckoutDiffPaths("same.ts", "same.ts")).toBe(0);
  });

  it("sorts files by path", () => {
    const ordered = orderCheckoutDiffFiles([
      createFile("zeta.ts"),
      createFile("alpha.ts"),
      createFile("beta.ts"),
    ]);

    expect(ordered.map((file) => file.path)).toEqual(["alpha.ts", "beta.ts", "zeta.ts"]);
  });

  it("preserves relative order for equal paths", () => {
    const ordered = orderCheckoutDiffFiles([
      createFile("same.ts", 1),
      createFile("same.ts", 2),
      createFile("same.ts", 3),
    ]);

    expect(ordered.map((file) => file.additions)).toEqual([1, 2, 3]);
  });

  it("resolves the parent directory for root and nested paths", () => {
    expect(getCheckoutDiffDirectory("README.md")).toBe("");
    expect(getCheckoutDiffDirectory("packages/app/src/git/diff-pane.tsx")).toBe(
      "packages/app/src/git",
    );
    expect(getCheckoutDiffDirectory(" spaced/path.ts")).toBe(" spaced");
  });

  it("groups ordered files by parent directory", () => {
    const groups = groupCheckoutDiffFilesByDirectory([
      createFile("packages/server/src/index.ts"),
      createFile("README.md"),
      createFile("packages/app/src/git/diff-pane.tsx"),
      createFile("packages/app/src/git/diff-order.ts"),
      createFile("docs/testing.md"),
    ]);

    expect(groups.map(summarizeDirectoryGroup)).toEqual([
      { directory: "", paths: ["README.md"] },
      { directory: "docs", paths: ["docs/testing.md"] },
      {
        directory: "packages/app/src/git",
        paths: ["packages/app/src/git/diff-order.ts", "packages/app/src/git/diff-pane.tsx"],
      },
      { directory: "packages/server/src", paths: ["packages/server/src/index.ts"] },
    ]);
  });

  it("builds flat display entries without directory headers", () => {
    const entries = buildCheckoutDiffFileEntries(
      [createFile("zeta.ts"), createFile("alpha.ts")],
      "flat",
    );

    expect(
      entries.map((entry) =>
        entry.type === "file"
          ? {
              type: entry.type,
              path: entry.file.path,
              fileIndex: entry.fileIndex,
              groupKey: entry.groupKey,
            }
          : entry,
      ),
    ).toEqual([
      { type: "file", path: "alpha.ts", fileIndex: 0 },
      { type: "file", path: "zeta.ts", fileIndex: 1 },
    ]);
  });

  it("builds directory-grouped display entries with stable file indexes", () => {
    const entries = buildCheckoutDiffFileEntries(
      [
        createFile("packages/server/src/index.ts"),
        createFile("README.md"),
        createFile("packages/app/src/git/diff-order.ts"),
      ],
      "directory",
    );

    expect(
      entries.map((entry) =>
        entry.type === "file"
          ? {
              type: entry.type,
              path: entry.file.path,
              fileIndex: entry.fileIndex,
              groupKey: entry.groupKey,
            }
          : entry,
      ),
    ).toEqual([
      { type: "group", kind: "directory", key: "directory:", label: "" },
      { type: "file", path: "README.md", fileIndex: 0, groupKey: "directory:" },
      {
        type: "group",
        kind: "directory",
        key: "directory:packages/app/src/git",
        label: "packages/app/src/git",
      },
      {
        type: "file",
        path: "packages/app/src/git/diff-order.ts",
        fileIndex: 1,
        groupKey: "directory:packages/app/src/git",
      },
      {
        type: "group",
        kind: "directory",
        key: "directory:packages/server/src",
        label: "packages/server/src",
      },
      {
        type: "file",
        path: "packages/server/src/index.ts",
        fileIndex: 2,
        groupKey: "directory:packages/server/src",
      },
    ]);
  });

  it("builds submodule-grouped display entries with workspace root files first", () => {
    const entries = buildCheckoutDiffFileEntries(
      [
        createFile("modules/sub/zeta.ts", 0, "modules/sub"),
        createFile("packages/app/root.ts"),
        createFile("modules/sub/alpha.ts", 0, "modules/sub"),
        createFile("vendor/lib/index.ts", 0, "vendor/lib"),
      ],
      "submodule",
    );

    expect(
      entries.map((entry) =>
        entry.type === "file"
          ? {
              type: entry.type,
              path: entry.file.path,
              fileIndex: entry.fileIndex,
              groupKey: entry.groupKey,
            }
          : entry,
      ),
    ).toEqual([
      { type: "group", kind: "submodule", key: "submodule:", label: "" },
      { type: "file", path: "packages/app/root.ts", fileIndex: 0, groupKey: "submodule:" },
      {
        type: "group",
        kind: "submodule",
        key: "submodule:modules/sub",
        label: "modules/sub",
      },
      {
        type: "file",
        path: "modules/sub/alpha.ts",
        fileIndex: 1,
        groupKey: "submodule:modules/sub",
      },
      {
        type: "file",
        path: "modules/sub/zeta.ts",
        fileIndex: 2,
        groupKey: "submodule:modules/sub",
      },
      {
        type: "group",
        kind: "submodule",
        key: "submodule:vendor/lib",
        label: "vendor/lib",
      },
      {
        type: "file",
        path: "vendor/lib/index.ts",
        fileIndex: 3,
        groupKey: "submodule:vendor/lib",
      },
    ]);
  });

  it("filters file rows under collapsed groups while keeping group headers", () => {
    const entries = buildCheckoutDiffFileEntries(
      [
        createFile("packages/server/src/index.ts"),
        createFile("README.md"),
        createFile("packages/app/src/git/diff-order.ts"),
      ],
      "directory",
    );

    const visibleEntries = filterCheckoutDiffFileEntriesForCollapsedGroups(
      entries,
      new Set(["directory:packages/app/src/git"]),
    );

    expect(
      visibleEntries.map((entry) =>
        entry.type === "file"
          ? { type: entry.type, path: entry.file.path, groupKey: entry.groupKey }
          : entry,
      ),
    ).toEqual([
      { type: "group", kind: "directory", key: "directory:", label: "" },
      { type: "file", path: "README.md", groupKey: "directory:" },
      {
        type: "group",
        kind: "directory",
        key: "directory:packages/app/src/git",
        label: "packages/app/src/git",
      },
      {
        type: "group",
        kind: "directory",
        key: "directory:packages/server/src",
        label: "packages/server/src",
      },
      {
        type: "file",
        path: "packages/server/src/index.ts",
        groupKey: "directory:packages/server/src",
      },
    ]);
  });
});
