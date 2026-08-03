import { writeFile } from "node:fs/promises";
import path from "node:path";
import { expect, test } from "../support/fixtures";
import {
  expectFileTabOpen,
  openFileExplorer,
  openFileFromExplorer,
} from "../support/helpers/file-explorer";

async function readMarkdownSearchHighlights(page: import("@playwright/test").Page) {
  return page.evaluate(() => {
    const highlights = (
      CSS as typeof CSS & {
        highlights?: Map<string, { size: number }>;
      }
    ).highlights;
    const counts = { current: 0, other: 0 };
    for (const [name, highlight] of highlights ?? []) {
      if (name.startsWith("paseo-file-markdown-search-current-")) {
        counts.current += highlight.size;
      }
      if (name.startsWith("paseo-file-markdown-search-match-")) {
        counts.other += highlight.size;
      }
    }
    return counts;
  });
}

test("finds and navigates matches in an opened TSX file", async ({ page, withWorkspace }) => {
  const workspace = await withWorkspace({ prefix: "file-pane-search-" });
  const filename = "search-target.tsx";
  await writeFile(
    path.join(workspace.repoPath, filename),
    [
      "export const needle = 1;",
      "export const copy = needle;",
      "export const final = needle;",
    ].join("\n"),
    "utf8",
  );

  await workspace.navigateTo();
  await openFileExplorer(page);
  await openFileFromExplorer(page, filename);
  await expectFileTabOpen(page, filename);

  const editor = page.getByTestId("file-source-editor");
  const editorBoxBeforeSearch = await editor.boundingBox();
  expect(editorBoxBeforeSearch).not.toBeNull();
  await page.getByTestId("file-search-open").click();
  const input = page.getByTestId("file-search-input");
  await input.fill("needle");

  const editorBoxWithSearch = await editor.boundingBox();
  expect(editorBoxWithSearch).not.toBeNull();
  expect(editorBoxWithSearch).toEqual(editorBoxBeforeSearch);
  await expect(page.getByTestId("file-search-result-count")).toHaveText("1 of 3");
  await expect(editor.locator(".cm-searchMatch")).toHaveCount(3);
  await expect(editor.locator(".cm-line:has(.cm-searchMatch-selected)")).toContainText(
    "const needle = 1",
  );

  await page.getByTestId("file-search-next").click();
  await expect(page.getByTestId("file-search-result-count")).toHaveText("2 of 3");
  await expect(editor.locator(".cm-line:has(.cm-searchMatch-selected)")).toContainText(
    "const copy = needle",
  );

  await input.press("Enter");
  await expect(page.getByTestId("file-search-result-count")).toHaveText("3 of 3");
  await expect(input).toBeFocused();
  await input.press("Enter");
  await expect(page.getByTestId("file-search-result-count")).toHaveText("1 of 3");
  await expect(input).toBeFocused();
  await input.press("Shift+Enter");
  await expect(page.getByTestId("file-search-result-count")).toHaveText("3 of 3");
  await expect(input).toBeFocused();

  await page.getByTestId("file-search-close").click();
  await editor.locator(".cm-content").click();
  await page.keyboard.press("ControlOrMeta+f");
  await expect(page.getByTestId("file-search-input")).toBeFocused();
  await expect(page.getByTestId("conversation-search-toolbar")).toHaveCount(0);
  await page.getByTestId("file-search-input").press("Escape");
  await expect(page.getByTestId("file-search-toolbar")).toHaveCount(0);
});

test("searches the rendered text in a Markdown preview", async ({ page, withWorkspace }) => {
  const workspace = await withWorkspace({ prefix: "file-pane-markdown-search-" });
  const filename = "search-preview.md";
  await writeFile(
    path.join(workspace.repoPath, filename),
    [
      "# Preview needle",
      "",
      ...Array.from({ length: 40 }, (_, index) => `Paragraph ${index + 1}`),
      "",
      "The second PREVIEW NEEDLE is near the bottom.",
      "",
      "[Open docs](https://example.com/preview-needle)",
    ].join("\n"),
    "utf8",
  );

  await workspace.navigateTo();
  await openFileExplorer(page);
  await openFileFromExplorer(page, filename);
  await expectFileTabOpen(page, filename);
  await expect(page.getByTestId("file-mode-preview")).toHaveAttribute("aria-selected", "true");

  await page.getByTestId("file-search-open").click();
  const input = page.getByTestId("file-search-input");
  const resultCount = page.getByTestId("file-search-result-count");
  await input.fill("preview needle");

  await expect(resultCount).toHaveText("1 of 2");
  await expect.poll(() => readMarkdownSearchHighlights(page)).toEqual({ current: 1, other: 1 });

  const previewScroll = page.getByTestId("file-markdown-preview-scroll");
  const initialScrollTop = await previewScroll.evaluate((element) => element.scrollTop);
  await page.getByTestId("file-search-next").click();
  await expect(resultCount).toHaveText("2 of 2");
  await expect
    .poll(() => previewScroll.evaluate((element) => element.scrollTop))
    .toBeGreaterThan(initialScrollTop);

  await input.fill("https://example.com/preview-needle");
  await expect(resultCount).toHaveText("No matches");

  await page.getByTestId("file-mode-source").click();
  await expect(resultCount).toHaveText("1 of 1");
  await expect(page.getByTestId("file-source-editor").locator(".cm-searchMatch")).toHaveCount(1);
});
