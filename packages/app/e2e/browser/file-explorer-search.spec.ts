import { expect } from "@playwright/test";
import { test } from "../support/fixtures";
import { expectFileTabOpen, openFileExplorer } from "../support/helpers/file-explorer";
import { gotoWorkspace } from "../support/helpers/launcher";
import { seedWorkspace, type SeededWorkspace } from "../support/helpers/seed-client";

let workspace: SeededWorkspace;

test.beforeAll(async () => {
  workspace = await seedWorkspace({
    repoPrefix: "file-explorer-search-",
    repo: {
      files: [
        { path: "README.md", content: "# Search fixture\n" },
        { path: "src/nested/deep-search-target.ts", content: "export const target = true;\n" },
      ],
    },
  });
});

test.afterAll(async () => {
  await workspace?.cleanup();
});

test.describe("File explorer search", () => {
  test("finds and opens a file below an unexpanded directory", async ({ page }) => {
    await gotoWorkspace(page, workspace.workspaceId);
    await openFileExplorer(page);

    await expect(page.getByText("deep-search-target.ts", { exact: true })).toBeHidden();
    await page.getByTestId("files-search-toggle").click();
    await page.getByTestId("files-search-input").fill("deep-search");

    const result = page.getByTestId("file-search-results").getByText("deep-search-target.ts", {
      exact: true,
    });
    await expect(result).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("file-search-results")).toContainText("src/nested");

    await result.click();
    await expectFileTabOpen(page, "src/nested/deep-search-target.ts");
  });
});
