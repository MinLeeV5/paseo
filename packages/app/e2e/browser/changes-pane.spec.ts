import { readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { type Page } from "@playwright/test";
import { buildHostWorkspaceRoute, buildSettingsSectionRoute } from "../../src/utils/host-routes";
import { test, expect } from "../support/fixtures";
import { getServerId } from "../support/helpers/server-id";
import { connectSeedClient } from "../support/helpers/seed-client";
import { createTempGitRepo } from "../support/helpers/workspace";
import { waitForWorkspaceTabsVisible } from "../support/helpers/workspace-tabs";

interface DirtyWorkspace {
  id: string;
  repoPath: string;
}

interface WorkspaceFixtureOptions {
  includeDeletedFile?: boolean;
}

interface CleanupTask {
  run: () => Promise<void>;
}

const cleanupTasks: CleanupTask[] = [];
const APP_SETTINGS_KEY = "@paseo:app-settings";
const CHANGES_PREFERENCES_KEY = "@paseo:changes-preferences";

function hasHorizontalScrollRegion(element: HTMLElement): boolean {
  return Array.from(element.querySelectorAll<HTMLElement>("*")).some((descendant) => {
    const overflowX = window.getComputedStyle(descendant).overflowX;
    return overflowX === "auto" || overflowX === "scroll";
  });
}

const BEFORE = `import { useLayoutEffect, useMemo, useRef, useState } from "react";

interface UseMountedTabSetInput {
  activeTabId: string | null;
  allTabIds: string[];
  cap: number;
}

interface UseMountedTabSetResult {
  mountedTabIds: Set<string>;
}

function createInitialMountedTabIds(input: UseMountedTabSetInput): Set<string> {
  if (!input.activeTabId || !input.allTabIds.includes(input.activeTabId)) {
    return new Set<string>();
  }
  return new Set<string>([input.activeTabId]);
}

function setsEqual(left: Set<string>, right: Set<string>): boolean {
  if (left.size !== right.size) {
    return false;
  }
  for (const value of left) {
    if (!right.has(value)) {
      return false;
    }
  }
  return true;
}

export function useMountedTabSet(input: UseMountedTabSetInput): UseMountedTabSetResult {
  const { activeTabId, allTabIds, cap } = input;
  const allTabIdsKey = allTabIds.join("\\u0000");
  const availableTabIds = useMemo(() => {
    void allTabIdsKey;
    return new Set(allTabIds);
  }, [allTabIds, allTabIdsKey]);
  const [mountedTabIds, setMountedTabIds] = useState(() => createInitialMountedTabIds(input));
  const lruRef = useRef(activeTabId && allTabIds.includes(activeTabId) ? [activeTabId] : []);

  useLayoutEffect(() => {
    const nextLru = lruRef.current.filter((tabId) => availableTabIds.has(tabId));
    if (activeTabId && availableTabIds.has(activeTabId)) {
      const existingIndex = nextLru.indexOf(activeTabId);
      if (existingIndex >= 0) {
        nextLru.splice(existingIndex, 1);
      }
      nextLru.unshift(activeTabId);
    }
    if (nextLru.length > cap) {
      nextLru.length = cap;
    }

    lruRef.current = nextLru;
    setMountedTabIds((previousMountedTabIds) => {
      const nextMountedTabIds = new Set(nextLru);
      return setsEqual(previousMountedTabIds, nextMountedTabIds)
        ? previousMountedTabIds
        : nextMountedTabIds;
    });
  }, [activeTabId, availableTabIds, cap]);

  return { mountedTabIds };
}
`;

const AFTER = `import { useLayoutEffect, useMemo, useRef, useState } from "react";

interface UseMountedTabSetInput {
  activeTabId: string | null;
  allTabIds: string[];
  cap: number;
}

interface UseMountedTabSetResult {
  mountedTabIds: Set<string>;
}

interface DeriveRenderMountedTabIdsInput {
  activeTabId: string | null;
  availableTabIds: Set<string>;
  cap: number;
  mountedTabIds: Set<string>;
}

function createInitialMountedTabIds(input: UseMountedTabSetInput): Set<string> {
  if (!input.activeTabId || !input.allTabIds.includes(input.activeTabId)) {
    return new Set<string>();
  }
  return new Set<string>([input.activeTabId]);
}

function setsEqual(left: Set<string>, right: Set<string>): boolean {
  if (left.size !== right.size) {
    return false;
  }
  for (const value of left) {
    if (!right.has(value)) {
      return false;
    }
  }
  return true;
}

function deriveRenderMountedTabIds(input: DeriveRenderMountedTabIdsInput): Set<string> {
  const { activeTabId, availableTabIds, cap, mountedTabIds } = input;
  if (!activeTabId || !availableTabIds.has(activeTabId) || mountedTabIds.has(activeTabId)) {
    return mountedTabIds;
  }

  const next = new Set<string>([activeTabId]);
  const maxSize = Math.max(1, cap);
  for (const tabId of mountedTabIds) {
    if (next.size >= maxSize) {
      break;
    }
    if (availableTabIds.has(tabId)) {
      next.add(tabId);
    }
  }
  return next;
}

export function useMountedTabSet(input: UseMountedTabSetInput): UseMountedTabSetResult {
  const { activeTabId, allTabIds, cap } = input;
  const allTabIdsKey = allTabIds.join("\\u0000");
  const availableTabIds = useMemo(() => {
    void allTabIdsKey;
    return new Set(allTabIds);
  }, [allTabIds, allTabIdsKey]);
  const [mountedTabIds, setMountedTabIds] = useState(() => createInitialMountedTabIds(input));
  const lruRef = useRef(activeTabId && allTabIds.includes(activeTabId) ? [activeTabId] : []);
  const renderMountedTabIds = useMemo(
    () =>
      deriveRenderMountedTabIds({
        activeTabId,
        availableTabIds,
        cap,
        mountedTabIds,
      }),
    [activeTabId, availableTabIds, cap, mountedTabIds],
  );

  useLayoutEffect(() => {
    const nextLru = lruRef.current.filter((tabId) => availableTabIds.has(tabId));
    if (activeTabId && availableTabIds.has(activeTabId)) {
      const existingIndex = nextLru.indexOf(activeTabId);
      if (existingIndex >= 0) {
        nextLru.splice(existingIndex, 1);
      }
      nextLru.unshift(activeTabId);
    }
    if (nextLru.length > cap) {
      nextLru.length = cap;
    }

    lruRef.current = nextLru;
    setMountedTabIds((previousMountedTabIds) => {
      const nextMountedTabIds = new Set(nextLru);
      return setsEqual(previousMountedTabIds, nextMountedTabIds)
        ? previousMountedTabIds
        : nextMountedTabIds;
    });
  }, [activeTabId, availableTabIds, cap]);

  return { mountedTabIds: renderMountedTabIds };
}
`;

const HTML_SOURCE_SENTINEL = "Complete source context outside the diff";
const HTML_LONG_SOURCE_LINE = `    <div data-source-wrap="${"unbroken-source-token-".repeat(20)}"></div>`;
const HTML_CONTEXT_LINE_COUNT = 100;
const HTML_BEFORE = [
  "<!doctype html>",
  '<html lang="en">',
  "  <body>",
  "    <h1>Before preview</h1>",
  ...Array.from(
    { length: HTML_CONTEXT_LINE_COUNT },
    (_, index) => `    <p>Unchanged context ${index + 1}</p>`,
  ),
  "    <h2>Before closing section</h2>",
  `    <footer>${HTML_SOURCE_SENTINEL}</footer>`,
  HTML_LONG_SOURCE_LINE,
  "  </body>",
  "</html>",
  "",
].join("\n");
const HTML_AFTER = HTML_BEFORE.replace("Before preview", "After preview").replace(
  "Before closing section",
  "After closing section",
);
const MARKDOWN_BEFORE = [
  "# Before preview",
  "",
  "This document is rendered from a changed Markdown file.",
  "",
].join("\n");
const MARKDOWN_AFTER = MARKDOWN_BEFORE.replace("Before preview", "After preview");

test.afterEach(async () => {
  for (const task of cleanupTasks.splice(0)) {
    await task.run();
  }
});

test("changed files follow the Changes diff layout while the file menu opens source", async ({
  page,
}) => {
  const workspace = await createWorkspaceWithMountedTabDiff({ includeDeletedFile: true });
  await useUnwrappedDiffLines(page);
  await openWorkspaceChanges(page, workspace);

  await expect(page.getByTestId("diff-file-1")).toContainText("zz-deleted.ts");
  await expect(page.getByTestId("diff-file-1-view-source")).toHaveCount(0);
  await expect(page.getByTestId("diff-file-0-view-source")).toBeVisible();

  await observeIncompleteFileDiffMounts(
    page,
    'import { useLayoutEffect, useMemo, useRef, useState } from "react";',
  );
  await page.getByTestId("diff-file-0-file").click();
  const visibleDiffPane = page.getByTestId("workspace-file-pane").filter({ visible: true });
  await expect(visibleDiffPane.getByTestId("file-diff-view-unified")).toBeVisible();
  await expect(visibleDiffPane.getByTestId("file-source-preview-scroll")).toHaveCount(0);
  await expect(visibleDiffPane.getByTestId("file-diff-mode")).toHaveCount(0);
  await expect(visibleDiffPane.getByTestId("file-diff-body")).toContainText(
    'import { useLayoutEffect, useMemo, useRef, useState } from "react";',
  );
  await expect(visibleDiffPane.getByTestId("file-diff-body")).not.toContainText("@@");
  await expect.poll(() => readIncompleteFileDiffMount(page)).toBe(false);

  await page.getByTestId("changes-options-menu").click();
  await page.getByTestId("changes-layout").click();
  await page.getByTestId("changes-layout-split").click();
  await expect(visibleDiffPane.getByTestId("file-diff-view-split")).toBeVisible();
  await expect(visibleDiffPane.getByTestId("file-diff-view-unified")).toHaveCount(0);
  await expect(visibleDiffPane.getByTestId("file-diff-body")).not.toContainText("@@");

  await page.getByTestId("diff-file-0-view-source").click();
  const visibleReviewSourcePane = page.getByTestId("workspace-file-pane").filter({ visible: true });
  await expect(visibleReviewSourcePane.getByTestId("file-diff-view-split")).toBeVisible();

  await page.getByTestId("diff-file-0-actions").click();
  await page.getByTestId("diff-file-0-menu-open-file").click();
  const visibleSourcePane = page.getByTestId("workspace-file-pane").filter({ visible: true });
  await expect(visibleSourcePane.getByTestId("file-source-editor")).toBeVisible();
  await expect(visibleSourcePane.getByTestId(/^file-diff-view-/)).toHaveCount(0);
  await expect(visibleSourcePane.getByTestId("file-diff-mode")).toHaveCount(0);

  await expect(page.getByTestId("workspace-tab-file_src/use-mounted-tab-set.ts")).toBeVisible();

  await observeFileSurfaceTransitions(page);
  const sourceEditor = visibleSourcePane.getByTestId("file-source-editor").locator(".cm-content");
  await sourceEditor.click();
  await sourceEditor.press("Control+End");
  await sourceEditor.type("// saved without changing views\n");
  await expect(page.getByLabel("Editor status dirty")).toBeVisible();
  await sourceEditor.press("Control+s");
  await expect
    .poll(async () =>
      (
        await readFile(path.join(workspace.repoPath, "src/use-mounted-tab-set.ts"), "utf8")
      ).includes("// saved without changing views"),
    )
    .toBe(true);
  await expect(page.getByLabel("Editor status clean")).toBeVisible();
  await expect
    .poll(() => readFileSurfaceTransitions(page))
    .toEqual({
      diffWasVisible: false,
      editorWasUnmounted: false,
    });
});

test("changed HTML defaults to preview and keeps annotated source available", async ({ page }) => {
  const workspace = await createWorkspaceWithHtmlDiff();
  await useUnwrappedDiffLines(page);
  await openHtmlWorkspaceChanges(page, workspace);

  const explorerChanges = page.getByTestId("explorer-content-area");
  await explorerChanges.getByTestId("diff-file-0-file").click();

  const visibleDiffPane = page.getByTestId("workspace-file-pane").filter({ visible: true });
  await expect(visibleDiffPane.getByTestId("file-mode-preview")).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(visibleDiffPane.getByTestId("file-html-preview")).toBeVisible();
  await expect(
    page.frameLocator('[data-testid="file-html-preview"]').getByRole("heading", {
      name: "After preview",
    }),
  ).toBeVisible();
  await expect(visibleDiffPane.getByTestId("file-source-change-progress")).toHaveCount(0);

  await visibleDiffPane.getByTestId("file-mode-source").click();
  await expect(visibleDiffPane.getByTestId("file-diff-view-unified")).toBeVisible();
  await expect(visibleDiffPane.getByTestId("file-diff-mode")).toHaveCount(0);
  await expect(visibleDiffPane.getByTestId("file-html-preview")).toHaveCount(0);
  await expect(visibleDiffPane.getByTestId("file-diff-body")).toContainText(HTML_SOURCE_SENTINEL);
  await expect(visibleDiffPane.getByTestId("file-diff-body")).not.toContainText("@@");
  const diffScroll = visibleDiffPane.getByTestId("file-diff-scroll");
  await expect
    .poll(() => diffScroll.evaluate((element) => element.scrollWidth <= element.clientWidth + 1))
    .toBe(true);
  await expect.poll(() => diffScroll.evaluate(hasHorizontalScrollRegion)).toBe(false);

  await visibleDiffPane.getByTestId("file-mode-preview").click();
  await expect(visibleDiffPane.getByTestId("file-html-preview")).toBeVisible();
  await explorerChanges.getByTestId("diff-file-0-view-source").click();
  await expect(visibleDiffPane.getByTestId("file-diff-view-unified")).toBeVisible();

  await explorerChanges.getByTestId("diff-file-0-actions").click();
  await page.getByTestId("diff-file-0-menu-open-file").click();
  const visibleHtmlPane = page.getByTestId("workspace-file-pane").filter({ visible: true });
  await expect(visibleHtmlPane.getByTestId("file-mode-preview")).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(visibleHtmlPane.getByTestId("file-html-preview")).toBeVisible();
  await expect(
    page.frameLocator('[data-testid="file-html-preview"]').getByRole("heading", {
      name: "After preview",
    }),
  ).toBeVisible();

  await visibleHtmlPane.getByTestId("file-mode-source").click();
  await expect(visibleHtmlPane.getByTestId("file-source-editor")).toBeVisible();
});

test("changed Markdown defaults to preview and can reveal its changed source", async ({ page }) => {
  const workspace = await createWorkspaceWithMarkdownDiff();
  await useUnwrappedDiffLines(page);
  await openMarkdownWorkspaceChanges(page, workspace);

  const explorerChanges = page.getByTestId("explorer-content-area");
  await explorerChanges.getByTestId("diff-file-0-file").click();

  const visibleFilePane = page.getByTestId("workspace-file-pane").filter({ visible: true });
  await expect(visibleFilePane.getByTestId("file-mode-preview")).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(visibleFilePane.getByTestId("file-markdown-preview-scroll")).toContainText(
    "After preview",
  );
  await expect(visibleFilePane.getByTestId("file-source-change-progress")).toHaveCount(0);

  await visibleFilePane.getByTestId("file-mode-source").click();
  await expect(visibleFilePane.getByTestId("file-diff-view-unified")).toBeVisible();
  await expect(visibleFilePane.getByTestId("file-diff-body")).toContainText("# After preview");

  await visibleFilePane.getByTestId("file-mode-preview").click();
  await explorerChanges.getByTestId("diff-file-0-view-source").click();
  await expect(visibleFilePane.getByTestId("file-diff-view-unified")).toBeVisible();
});

test("Changes switches between inline and full-tab navigation", async ({ page }) => {
  const workspace = await createWorkspaceWithMountedTabDiff({ includeDeletedFile: true });
  await useUnwrappedDiffLines(page);
  await openWorkspaceChanges(page, workspace);

  const changesTabToggle = page.getByTestId("changes-open-tab");
  await expect(changesTabToggle).toHaveAccessibleName("Open Changes tab");
  await changesTabToggle.click();
  await expect(changesTabToggle).toHaveAccessibleName("Close Changes tab");

  const visiblePanel = page.getByTestId("working-diff-panel").filter({ visible: true });
  await expect(visiblePanel).toBeVisible();
  await expect(visiblePanel.getByText("use-mounted-tab-set.ts", { exact: true })).toBeVisible();
  await expect(visiblePanel).toContainText("zz-deleted.ts");
  await expect(visiblePanel.getByTestId("diff-file-0-body")).toBeVisible();
  await expect(page.getByTestId("workspace-file-pane")).toHaveCount(0);
  await visiblePanel.getByTestId("diff-file-0-toggle").click();
  await expect(visiblePanel.getByTestId("diff-file-0-body")).toHaveCount(0);
  await visiblePanel.getByTestId("diff-file-0-toggle").click();
  await expect(visiblePanel.getByTestId("diff-file-0-body")).toBeVisible();
  await expect(visiblePanel.getByTestId("working-diff-toggle-layout")).toHaveCount(0);
  await visiblePanel.getByTestId("working-diff-options-menu").click();
  await expect(page.getByTestId("working-diff-layout")).toContainText("Unified diff");
  await page.getByTestId("working-diff-layout").click();
  await page.getByTestId("working-diff-layout-split").click();
  await visiblePanel.getByTestId("working-diff-options-menu").click();
  await expect(page.getByTestId("working-diff-layout")).toContainText("Side-by-side diff");
  await expect(page.getByTestId("working-diff-toggle-whitespace")).toContainText("Hide whitespace");
  await expect(page.getByTestId("working-diff-toggle-wrap-lines")).toContainText("Wrap long lines");
  await expect(page.getByTestId("working-diff-refresh")).toContainText("Refresh");
  await page.getByTestId("working-diff-toggle-wrap-lines").click();
  await visiblePanel.getByTestId("working-diff-options-menu").click();
  await expect(page.getByTestId("working-diff-toggle-wrap-lines")).toContainText(
    "Scroll long lines",
  );
  await page.keyboard.press("Escape");
  await visiblePanel.getByTestId("working-diff-toggle-expand-all").click();
  await expect(visiblePanel.getByTestId(/^diff-file-\d+-body$/)).toHaveCount(0);
  await visiblePanel.getByTestId("working-diff-toggle-expand-all").click();
  await expect(visiblePanel.getByTestId("diff-file-0-body")).toBeVisible();

  await page.getByTestId("explorer-content-area").getByTestId("diff-file-0-toggle").click();
  await expect(
    page.getByTestId("explorer-content-area").getByTestId("diff-file-0-body"),
  ).toHaveCount(0);
  await expect(page.getByTestId(/^workspace-working-diff-close-/)).toHaveCount(1);

  await writeFile(path.join(workspace.repoPath, "src/use-mounted-tab-set.ts"), BEFORE);
  await expect(visiblePanel.getByText("use-mounted-tab-set.ts", { exact: true })).toHaveCount(0, {
    timeout: 30_000,
  });
  await expect(visiblePanel).toContainText("zz-deleted.ts");
  await writeFile(path.join(workspace.repoPath, "src/use-mounted-tab-set.ts"), AFTER);
  await expect(visiblePanel.getByText("use-mounted-tab-set.ts", { exact: true })).toBeVisible({
    timeout: 30_000,
  });

  await expect(page.getByTestId("explorer-content-area").getByTestId("diff-file-1")).toContainText(
    "zz-deleted.ts",
  );
  await page.getByTestId("explorer-content-area").getByTestId("diff-file-1-toggle").click();
  await expect(page.getByTestId(/^workspace-working-diff-close-/)).toHaveCount(1);
  await expect(visiblePanel.getByText("zz-deleted.ts", { exact: true })).toBeVisible();
  await expect(visiblePanel.getByText("Deleted", { exact: true })).toBeVisible();

  await changesTabToggle.click();
  await expect(page.getByTestId(/^workspace-working-diff-close-/)).toHaveCount(0);
  await expect(
    page.getByTestId("explorer-content-area").getByTestId("diff-file-0-body"),
  ).toBeVisible();
  await page.getByTestId("explorer-content-area").getByTestId("diff-file-0-toggle").click();
  await expect(
    page.getByTestId("explorer-content-area").getByTestId("diff-file-0-body"),
  ).toHaveCount(0);
});

test("changes diff switches between flat and tree file lists", async ({ page }) => {
  const workspace = await createWorkspaceWithMountedTabDiff();
  await useUnwrappedDiffLines(page);
  await openWorkspaceChanges(page, workspace);

  await expectFlatFileList(page);
  await expect(page.getByTestId("changes-toggle-layout")).toHaveCount(0);
  await expect(page.getByTestId("changes-grouping")).toHaveCount(0);
  await expect(page.getByTestId("changes-layout-unified")).toHaveCount(0);
  await expect(page.getByTestId("changes-layout-split")).toHaveCount(0);

  await page.getByTestId("changes-options-menu").click();
  await expect(page.getByTestId("changes-options-menu-content")).toBeVisible();
  await expect(page.getByTestId("changes-layout")).toContainText("Unified diff");
  await expect(page.getByTestId("changes-grouping")).toContainText("Flat file list");
  await expect(page.getByTestId("changes-toggle-whitespace")).toContainText("Hide whitespace");
  await expect(page.getByTestId("changes-toggle-wrap-lines")).toContainText("Wrap long lines");
  await expect(page.getByTestId("changes-refresh")).toContainText("Refresh");
  await page.getByTestId("changes-toggle-whitespace").click();
  await page.getByTestId("changes-options-menu").click();
  await expect(page.getByTestId("changes-toggle-whitespace")).toContainText("Show whitespace");
  await page.keyboard.press("Escape");

  await scrollToLowerUnwrappedDiffRows(page);
  await page.getByTestId("changes-options-menu").click();
  await page.getByTestId("changes-grouping").click();
  const rootMenuBounds = await page.getByTestId("changes-options-menu-content").boundingBox();
  const groupingMenuBounds = await page
    .getByTestId("changes-options-menu-content-changes-grouping-page")
    .boundingBox();
  if (!rootMenuBounds || !groupingMenuBounds) {
    throw new Error("Expected both diff option menu surfaces to be visible");
  }
  expect(
    groupingMenuBounds.x + groupingMenuBounds.width <= rootMenuBounds.x + 1 ||
      rootMenuBounds.x + rootMenuBounds.width <= groupingMenuBounds.x + 1,
  ).toBe(true);
  await page.getByTestId("changes-grouping-directory").click();
  await expect(page.getByTestId("diff-folder-src")).toBeVisible();
  await expect(page.getByTestId("diff-file-0")).toBeVisible();
  await page.getByTestId("diff-file-0-toggle").click({ button: "right" });
  await expect(page.getByText("Open file", { exact: true })).toBeVisible();
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: "Collapse all" }).click();
  await expect(page.getByTestId("diff-file-0-body")).toHaveCount(0);
  await page.getByRole("button", { name: "Expand all" }).click();
  await expect(page.getByTestId("diff-file-0-body")).toBeVisible();

  await page.getByTestId("diff-folder-src-toggle").click();
  await expect(page.getByTestId("diff-file-0")).toHaveCount(0);

  await page.getByTestId("changes-options-menu").click();
  await page.getByTestId("changes-grouping").click();
  await page.getByTestId("changes-grouping-flat").click();
  await expectFlatFileList(page);
});

test("changes diff applies code size changes to gutter and code typography", async ({ page }) => {
  const workspace = await createWorkspaceWithMountedTabDiff();
  await useCodeFont(page, 12);
  await useUnwrappedDiffLines(page);
  await openWorkspaceChanges(page, workspace);

  await changeCodeFontSizeFromSettings(page, 18);
  await returnToWorkspaceChanges(page);
  await expectStoredCodeFontSize(page, 18);
  await scrollToLowerUnwrappedDiffRows(page);

  await expectDiffCodeFontSize(page, 18);
  await expectVisibleDiffRowsShareTypography(page);
});

test("navigates change hunks and searches inside annotated source", async ({ page }) => {
  const workspace = await createWorkspaceWithMountedTabDiff();
  await useUnwrappedDiffLines(page);
  await openWorkspaceChanges(page, workspace);

  await expect(page.getByLabel("Added line").first()).toBeVisible();
  await expect(page.getByTestId("changes-previous-hunk")).toHaveCount(1);
  await expect(page.getByTestId("changes-next-hunk")).toHaveCount(1);
  await expect(page.getByTestId("changes-previous-file")).toHaveCount(0);
  await expect(page.getByTestId("changes-next-file")).toHaveCount(0);
  const progress = page.getByTestId("changes-hunk-progress");
  await expect(progress).toHaveText(/^0\/\d+$/);
  await page.getByTestId("changes-next-hunk").click();
  await expect(progress).toHaveText(/^1\/\d+$/);
  const firstChangeRow = page
    .getByTestId(/^diff-code-row-/)
    .filter({ hasText: "interface DeriveRenderMountedTabIdsInput" });
  await expect(firstChangeRow).toBeVisible();

  await page.getByTestId("diff-file-0-file").click();
  const visibleDiffPane = page.getByTestId("workspace-file-pane").filter({ visible: true });
  await visibleDiffPane.getByTestId("file-search-open").click();
  await visibleDiffPane.getByTestId("file-search-input").fill("maxSize");
  await expect(visibleDiffPane.getByTestId("file-search-result-count")).toHaveText("1 of 2");
  await expect(
    visibleDiffPane
      .getByTestId(/^file-source-line-/)
      .filter({ hasText: "const maxSize = Math.max(1, cap);" }),
  ).toBeVisible();
  await visibleDiffPane.getByTestId("file-search-next").click();
  await expect(visibleDiffPane.getByTestId("file-search-result-count")).toHaveText("2 of 2");
});

async function useCodeFont(page: Page, codeFontSize: number): Promise<void> {
  await page.addInitScript(
    ({ settingsKey, fontSize }) => {
      if (localStorage.getItem(settingsKey)) {
        return;
      }
      localStorage.setItem(
        settingsKey,
        JSON.stringify({
          theme: "dark",
          sendBehavior: "interrupt",
          serviceUrlBehavior: "ask",
          terminalScrollbackLines: 10_000,
          uiFontFamily: "",
          monoFontFamily: "",
          uiFontSize: 16,
          codeFontSize: fontSize,
          syntaxTheme: "one",
        }),
      );
    },
    { settingsKey: APP_SETTINGS_KEY, fontSize: codeFontSize },
  );
}

async function useUnwrappedDiffLines(page: Page): Promise<void> {
  await page.addInitScript(
    ({ preferencesKey }) => {
      localStorage.setItem(
        preferencesKey,
        JSON.stringify({
          layout: "unified",
          viewMode: "flat",
          wrapLines: false,
          hideWhitespace: false,
        }),
      );
    },
    { preferencesKey: CHANGES_PREFERENCES_KEY },
  );
}

async function observeFileSurfaceTransitions(page: Page): Promise<void> {
  await page.locator("html").evaluate((root) => {
    root.dataset.fileDiffWasVisible = "false";
    root.dataset.fileEditorWasUnmounted = "false";
    const isVisible = (element: Element) => element.getClientRects().length > 0;
    const recordsDiffControls = (node: Node) =>
      node instanceof Element &&
      (node.matches('[data-testid="file-diff-mode"]') ||
        node.querySelector('[data-testid="file-diff-mode"]') !== null);
    const recordsSourceEditor = (node: Node) =>
      node instanceof Element &&
      (node.matches('[data-testid="file-source-editor"]') ||
        node.querySelector('[data-testid="file-source-editor"]') !== null);
    const observe = (records: MutationRecord[]) => {
      if (records.some((record) => Array.from(record.addedNodes).some(recordsDiffControls))) {
        root.dataset.fileDiffWasVisible = "true";
      }
      if (records.some((record) => Array.from(record.removedNodes).some(recordsSourceEditor))) {
        root.dataset.fileEditorWasUnmounted = "true";
      }
      const diffControls = Array.from(
        root.ownerDocument.querySelectorAll('[data-testid="file-diff-mode"]'),
      );
      if (diffControls.some(isVisible)) {
        root.dataset.fileDiffWasVisible = "true";
      }
      const sourceEditors = Array.from(
        root.ownerDocument.querySelectorAll('[data-testid="file-source-editor"]'),
      );
      if (!sourceEditors.some(isVisible)) {
        root.dataset.fileEditorWasUnmounted = "true";
      }
    };
    new MutationObserver(observe).observe(root, { childList: true, subtree: true });
  });
}

async function observeIncompleteFileDiffMounts(
  page: Page,
  requiredFullSource: string,
): Promise<void> {
  await page.locator("html").evaluate((root, requiredSource) => {
    root.dataset.incompleteFileDiffMounted = "false";
    let checkScheduled = false;
    const checkAfterPaint = () => {
      if (checkScheduled) {
        return;
      }
      checkScheduled = true;
      requestAnimationFrame(() => {
        checkScheduled = false;
        const visibleBodies = Array.from(
          root.ownerDocument.querySelectorAll<HTMLElement>('[data-testid="file-diff-body"]'),
        ).filter((element) => element.getClientRects().length > 0);
        if (visibleBodies.some((element) => !element.textContent?.includes(requiredSource))) {
          root.dataset.incompleteFileDiffMounted = "true";
        }
      });
    };
    new MutationObserver(checkAfterPaint).observe(root, { childList: true, subtree: true });
    checkAfterPaint();
  }, requiredFullSource);
}

async function readIncompleteFileDiffMount(page: Page): Promise<boolean> {
  return page.locator("html").evaluate(
    (root) =>
      new Promise<boolean>((resolve) => {
        requestAnimationFrame(() => {
          resolve(root.dataset.incompleteFileDiffMounted === "true");
        });
      }),
  );
}

async function readFileSurfaceTransitions(page: Page): Promise<{
  diffWasVisible: boolean;
  editorWasUnmounted: boolean;
}> {
  return page.locator("html").evaluate((root) => ({
    diffWasVisible: root.dataset.fileDiffWasVisible === "true",
    editorWasUnmounted: root.dataset.fileEditorWasUnmounted === "true",
  }));
}

async function expectFlatFileList(page: Page): Promise<void> {
  await expect(page.locator('[data-testid^="diff-folder-"]')).toHaveCount(0);
  await expect(page.getByTestId("diff-file-0")).toContainText("use-mounted-tab-set.ts");
  await expect(page.getByTestId("diff-file-0")).toContainText("src");
}

async function expectDiffCodeFontSize(page: Page, fontSize: number): Promise<void> {
  await expect
    .poll(async () => {
      return page
        .getByTestId("diff-code-text-1")
        .evaluate((text) => Number.parseFloat(getComputedStyle(text).fontSize));
    })
    .toBe(fontSize);
}

async function expectVisibleDiffRowsShareTypography(page: Page): Promise<void> {
  const geometry = await readVisibleDiffRowGeometry(page);
  expect(geometry.mismatchedTypography, JSON.stringify(geometry, null, 2)).toEqual([]);
}

async function readVisibleDiffRowGeometry(page: Page): Promise<{
  mismatchedTypography: { index: number; gutterLineHeight: number; codeLineHeight: number }[];
  rows: {
    index: number;
    gutterTop: number;
    codeTop: number;
    gutterLineHeight: number;
    codeLineHeight: number;
  }[];
}> {
  return page.locator("body").evaluate(({ ownerDocument }) => {
    const root = ownerDocument.querySelector('[data-testid="diff-file-0-body"]');
    if (!root) {
      throw new Error("Expanded diff body is not mounted");
    }

    const readRows = (prefix: string, textPrefix: string) =>
      Array.from(root.querySelectorAll<HTMLElement>(`[data-testid^="${prefix}"]`)).map((row) => {
        const testId = row.getAttribute("data-testid") ?? "";
        const index = Number(testId.slice(prefix.length));
        const rect = row.getBoundingClientRect();
        const text = root.querySelector<HTMLElement>(`[data-testid="${textPrefix}${index}"]`);
        const lineHeight = text ? Number.parseFloat(getComputedStyle(text).lineHeight) : 0;
        return { index, top: rect.top, height: rect.height, lineHeight };
      });

    const gutters = new Map(
      readRows("diff-gutter-row-", "diff-gutter-text-").map((row) => [row.index, row]),
    );
    const codes = readRows("diff-code-row-", "diff-code-text-");
    const rows = codes
      .map((code) => {
        const gutter = gutters.get(code.index);
        if (!gutter) {
          throw new Error(`Missing gutter row ${code.index}`);
        }
        return {
          index: code.index,
          gutterTop: gutter.top,
          codeTop: code.top,
          gutterLineHeight: gutter.lineHeight,
          codeLineHeight: code.lineHeight,
        };
      })
      .filter((row) => row.gutterTop >= 0 && row.codeTop >= 0);

    return {
      mismatchedTypography: rows
        .filter((row) => Math.abs(row.gutterLineHeight - row.codeLineHeight) > 0.5)
        .map((row) => ({
          index: row.index,
          gutterLineHeight: row.gutterLineHeight,
          codeLineHeight: row.codeLineHeight,
        })),
      rows,
    };
  });
}

async function createWorkspaceWithMountedTabDiff(
  options: WorkspaceFixtureOptions = {},
): Promise<DirtyWorkspace> {
  const files = [{ path: "src/use-mounted-tab-set.ts", content: BEFORE }];
  if (options.includeDeletedFile) {
    files.push({ path: "src/zz-deleted.ts", content: "export const deleted = true;\n" });
  }
  const repo = await createTempGitRepo("changes-pane-", { files });
  const client = await connectSeedClient();
  cleanupTasks.push({
    run: async () => {
      await client.close().catch(() => undefined);
      await repo.cleanup().catch(() => undefined);
    },
  });

  await writeFile(path.join(repo.path, "src/use-mounted-tab-set.ts"), AFTER);
  if (options.includeDeletedFile) {
    await unlink(path.join(repo.path, "src/zz-deleted.ts"));
  }
  const createdWorkspace = await client.createWorkspace({
    source: { kind: "directory", path: repo.path },
  });
  if (!createdWorkspace.workspace) {
    throw new Error(createdWorkspace.error ?? `Failed to create workspace ${repo.path}`);
  }
  return { id: createdWorkspace.workspace.id, repoPath: repo.path };
}

async function createWorkspaceWithHtmlDiff(): Promise<DirtyWorkspace> {
  const repo = await createTempGitRepo("changes-pane-html-", {
    files: [{ path: "preview.html", content: HTML_BEFORE }],
  });
  const client = await connectSeedClient();
  cleanupTasks.push({
    run: async () => {
      await client.close().catch(() => undefined);
      await repo.cleanup().catch(() => undefined);
    },
  });

  await writeFile(path.join(repo.path, "preview.html"), HTML_AFTER);
  const createdWorkspace = await client.createWorkspace({
    source: { kind: "directory", path: repo.path },
  });
  if (!createdWorkspace.workspace) {
    throw new Error(createdWorkspace.error ?? `Failed to create workspace ${repo.path}`);
  }
  return { id: createdWorkspace.workspace.id, repoPath: repo.path };
}

async function createWorkspaceWithMarkdownDiff(): Promise<DirtyWorkspace> {
  const repo = await createTempGitRepo("changes-pane-markdown-", {
    files: [{ path: "README.md", content: MARKDOWN_BEFORE }],
  });
  const client = await connectSeedClient();
  cleanupTasks.push({
    run: async () => {
      await client.close().catch(() => undefined);
      await repo.cleanup().catch(() => undefined);
    },
  });

  await writeFile(path.join(repo.path, "README.md"), MARKDOWN_AFTER);
  const createdWorkspace = await client.createWorkspace({
    source: { kind: "directory", path: repo.path },
  });
  if (!createdWorkspace.workspace) {
    throw new Error(createdWorkspace.error ?? `Failed to create workspace ${repo.path}`);
  }
  return { id: createdWorkspace.workspace.id, repoPath: repo.path };
}

async function openWorkspaceChanges(page: Page, workspace: DirtyWorkspace): Promise<void> {
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto(buildHostWorkspaceRoute(getServerId(), workspace.id));
  await waitForWorkspaceTabsVisible(page);
  await page.getByRole("button", { name: "Open explorer" }).click();
  await openChangesInVisibleExplorer(page);
  await page.getByTestId("diff-file-0-toggle").click();
  await expectExpandedMountedTabDiff(page);
}

async function openHtmlWorkspaceChanges(page: Page, workspace: DirtyWorkspace): Promise<void> {
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto(buildHostWorkspaceRoute(getServerId(), workspace.id));
  await waitForWorkspaceTabsVisible(page);
  await page.getByRole("button", { name: "Open explorer" }).click();
  await expect(page.getByTestId("explorer-tab-changes")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("preview.html", { exact: true })).toBeVisible({ timeout: 30_000 });
}

async function openMarkdownWorkspaceChanges(page: Page, workspace: DirtyWorkspace): Promise<void> {
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto(buildHostWorkspaceRoute(getServerId(), workspace.id));
  await waitForWorkspaceTabsVisible(page);
  await page.getByRole("button", { name: "Open explorer" }).click();
  await expect(page.getByTestId("explorer-tab-changes")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("README.md", { exact: true })).toBeVisible({ timeout: 30_000 });
}

async function openChangesInVisibleExplorer(page: Page): Promise<void> {
  await expect(page.getByTestId("explorer-tab-changes")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("use-mounted-tab-set.ts")).toBeVisible({ timeout: 30_000 });
}

async function expectExpandedMountedTabDiff(page: Page): Promise<void> {
  await expect(page.getByTestId("diff-file-0-body")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("function createInitialMountedTabIds")).toBeVisible({
    timeout: 30_000,
  });
}

async function changeCodeFontSizeFromSettings(page: Page, codeFontSize: number): Promise<void> {
  await page.getByTestId("sidebar-settings").click();
  await expect(page).toHaveURL(new RegExp(`${buildSettingsSectionRoute("general")}|/settings$`));
  await page.getByRole("button", { name: "Appearance" }).click();
  await page.getByLabel("Code font size").fill(String(codeFontSize));
  await page.getByLabel("Code font size").press("Enter");
  await expect(page.getByLabel("Code font size")).toHaveValue(String(codeFontSize));
  await expectStoredCodeFontSize(page, codeFontSize);
}

async function expectStoredCodeFontSize(page: Page, codeFontSize: number): Promise<void> {
  await expect
    .poll(async () => {
      const raw = await page.evaluate(
        (settingsKey) => localStorage.getItem(settingsKey),
        APP_SETTINGS_KEY,
      );
      if (!raw) {
        return null;
      }
      return (JSON.parse(raw) as { codeFontSize?: number }).codeFontSize ?? null;
    })
    .toBe(codeFontSize);
}

async function returnToWorkspaceChanges(page: Page): Promise<void> {
  await page.getByTestId("settings-back-to-workspace").click();
  await waitForWorkspaceTabsVisible(page);
  await openChangesInVisibleExplorer(page);
  await expectExpandedMountedTabDiff(page);
}

async function scrollToLowerUnwrappedDiffRows(page: Page): Promise<void> {
  const lastRowIndex = await page.getByTestId("diff-file-0-body").evaluate((root) => {
    const rows = Array.from(root.querySelectorAll<HTMLElement>('[data-testid^="diff-code-row-"]'));
    if (rows.length === 0) {
      throw new Error("No unwrapped code rows are mounted");
    }
    return Math.max(
      ...rows.map((row) => Number((row.getAttribute("data-testid") ?? "").slice(14))),
    );
  });
  await page.getByTestId(`diff-code-row-${lastRowIndex}`).scrollIntoViewIfNeeded();
  await expect(page.getByTestId(`diff-code-row-${lastRowIndex}`)).toBeVisible();
}
