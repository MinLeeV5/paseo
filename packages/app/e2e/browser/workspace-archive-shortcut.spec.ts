import { existsSync } from "node:fs";
import type { Dialog, Page } from "@playwright/test";
import { expect, test } from "../support/fixtures";
import { gotoAppShell } from "../support/helpers/app";
import { seedWorkspace } from "../support/helpers/seed-client";
import { getServerId } from "../support/helpers/server-id";
import {
  expectWorkspaceAbsentFromSidebar,
  selectWorkspaceInSidebar,
} from "../support/helpers/sidebar";
import { waitForSidebarHydration } from "../support/helpers/workspace-ui";

async function pressArchiveShortcut(
  page: Page,
  modifier: "Meta" | "Control",
  answer: "accept" | "dismiss",
): Promise<Dialog> {
  let confirmation: Dialog | undefined;
  page.once("dialog", (dialog) => {
    confirmation = dialog;
    void (answer === "accept" ? dialog.accept() : dialog.dismiss());
  });
  await page.keyboard.press(`${modifier}+Shift+Backspace`);
  if (!confirmation) {
    throw new Error("Expected a workspace archive confirmation dialog, but none was shown.");
  }
  return confirmation;
}

test.describe("Workspace archive shortcut", () => {
  test("requires confirmation and preserves the local checkout after acceptance", async ({
    page,
  }) => {
    const workspace = await seedWorkspace({ repoPrefix: "archive-shortcut-" });

    try {
      await gotoAppShell(page);
      await waitForSidebarHydration(page);
      await selectWorkspaceInSidebar(page, workspace.workspaceId);

      const modifier = process.platform === "darwin" ? "Meta" : "Control";
      const dismissed = await pressArchiveShortcut(page, modifier, "dismiss");
      expect(dismissed.type()).toBe("confirm");
      expect(dismissed.message()).toContain(`Archive "${workspace.workspaceName}"?`);
      expect(dismissed.message()).toContain(
        "This archives the workspace and its agents, and closes its terminals.",
      );
      await expect(
        page.getByTestId(`sidebar-workspace-row-${getServerId()}:${workspace.workspaceId}`),
      ).toBeVisible();

      await pressArchiveShortcut(page, modifier, "accept");

      await expectWorkspaceAbsentFromSidebar(page, workspace.workspaceId);
      expect(existsSync(workspace.repoPath)).toBe(true);
    } finally {
      await workspace.cleanup();
    }
  });
});
