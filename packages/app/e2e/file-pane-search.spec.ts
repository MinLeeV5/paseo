import { writeFile } from "node:fs/promises";
import path from "node:path";
import { expect, test } from "./fixtures";
import { expectFileTabOpen, openFileExplorer, openFileFromExplorer } from "./helpers/file-explorer";

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

  await page.getByTestId("file-search-close").click();
  await editor.locator(".cm-content").click();
  await page.keyboard.press("ControlOrMeta+f");
  await expect(page.getByTestId("file-search-input")).toBeFocused();
  await expect(page.getByTestId("conversation-search-toolbar")).toHaveCount(0);
  await page.getByTestId("file-search-input").press("Escape");
  await expect(page.getByTestId("file-search-toolbar")).toHaveCount(0);
});
