import type { SubscribeCheckoutDiffResponse } from "@getpaseo/protocol/messages";

type ParsedDiffFile = SubscribeCheckoutDiffResponse["payload"]["files"][number];

export interface CheckoutDiffDirectoryGroup {
  directory: string;
  files: ParsedDiffFile[];
}

export interface CheckoutDiffSubmoduleGroup {
  submodulePath: string;
  files: ParsedDiffFile[];
}

export type CheckoutDiffFileGroupKind = "directory" | "submodule";
export type CheckoutDiffFileGrouping = "flat" | CheckoutDiffFileGroupKind;

export type CheckoutDiffFileEntry =
  | { type: "group"; kind: CheckoutDiffFileGroupKind; key: string; label: string }
  | { type: "file"; file: ParsedDiffFile; fileIndex: number; groupKey?: string };

export function compareCheckoutDiffPaths(left: string, right: string): number {
  if (left === right) {
    return 0;
  }
  return left < right ? -1 : 1;
}

export function getCheckoutDiffDirectory(path: string): string {
  const separatorIndex = path.lastIndexOf("/");
  if (separatorIndex < 0) {
    return "";
  }
  return path.slice(0, separatorIndex);
}

function getCheckoutDiffSubmodulePath(file: ParsedDiffFile): string {
  return file.submodulePath ?? "";
}

function buildCheckoutDiffGroupKey(kind: CheckoutDiffFileGroupKind, label: string): string {
  return `${kind}:${label}`;
}

export function orderCheckoutDiffFiles(files: ParsedDiffFile[]): ParsedDiffFile[] {
  if (files.length < 2) {
    return files;
  }
  const ordered = [...files];
  ordered.sort((a, b) => compareCheckoutDiffPaths(a.path, b.path));
  return ordered;
}

export function groupCheckoutDiffFilesByDirectory(
  files: ParsedDiffFile[],
): CheckoutDiffDirectoryGroup[] {
  const groups: CheckoutDiffDirectoryGroup[] = [];
  for (const file of orderCheckoutDiffFiles(files)) {
    const directory = getCheckoutDiffDirectory(file.path);
    const previous = groups.at(-1);
    if (previous?.directory === directory) {
      previous.files.push(file);
    } else {
      groups.push({ directory, files: [file] });
    }
  }
  return groups;
}

export function groupCheckoutDiffFilesBySubmodule(
  files: ParsedDiffFile[],
): CheckoutDiffSubmoduleGroup[] {
  const filesBySubmodule = new Map<string, ParsedDiffFile[]>();
  for (const file of orderCheckoutDiffFiles(files)) {
    const submodulePath = getCheckoutDiffSubmodulePath(file);
    const groupFiles = filesBySubmodule.get(submodulePath);
    if (groupFiles) {
      groupFiles.push(file);
    } else {
      filesBySubmodule.set(submodulePath, [file]);
    }
  }

  return Array.from(filesBySubmodule.entries())
    .map(([submodulePath, groupFiles]) => ({ submodulePath, files: groupFiles }))
    .sort((left, right) => {
      if (left.submodulePath === right.submodulePath) {
        return 0;
      }
      if (left.submodulePath === "") {
        return -1;
      }
      if (right.submodulePath === "") {
        return 1;
      }
      return compareCheckoutDiffPaths(left.submodulePath, right.submodulePath);
    });
}

function buildGroupedCheckoutDiffFileEntries(
  groups: Array<{ label: string; files: ParsedDiffFile[] }>,
  kind: CheckoutDiffFileGroupKind,
): CheckoutDiffFileEntry[] {
  const entries: CheckoutDiffFileEntry[] = [];
  let fileIndex = 0;
  for (const group of groups) {
    const groupKey = buildCheckoutDiffGroupKey(kind, group.label);
    entries.push({ type: "group", kind, key: groupKey, label: group.label });
    for (const file of group.files) {
      entries.push({ type: "file", file, fileIndex, groupKey });
      fileIndex += 1;
    }
  }
  return entries;
}

export function buildCheckoutDiffFileEntries(
  files: ParsedDiffFile[],
  grouping: CheckoutDiffFileGrouping,
): CheckoutDiffFileEntry[] {
  if (grouping === "flat") {
    return orderCheckoutDiffFiles(files).map((file, fileIndex) => ({
      type: "file",
      file,
      fileIndex,
    }));
  }

  if (grouping === "directory") {
    return buildGroupedCheckoutDiffFileEntries(
      groupCheckoutDiffFilesByDirectory(files).map((group) => ({
        label: group.directory,
        files: group.files,
      })),
      "directory",
    );
  }

  return buildGroupedCheckoutDiffFileEntries(
    groupCheckoutDiffFilesBySubmodule(files).map((group) => ({
      label: group.submodulePath,
      files: group.files,
    })),
    "submodule",
  );
}

export function filterCheckoutDiffFileEntriesForCollapsedGroups(
  entries: CheckoutDiffFileEntry[],
  collapsedGroupKeys: ReadonlySet<string>,
): CheckoutDiffFileEntry[] {
  if (collapsedGroupKeys.size === 0) {
    return entries;
  }
  return entries.filter(
    (entry) => entry.type === "group" || !collapsedGroupKeys.has(entry.groupKey ?? ""),
  );
}
