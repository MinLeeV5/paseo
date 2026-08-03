import { expect, test, type Page } from "../support/fixtures";
import { gotoAppShell } from "../support/helpers/app";
import { seedWorkspace } from "../support/helpers/seed-client";
import { getServerId } from "../support/helpers/server-id";

function workspaceRow(page: Page, workspaceId: string) {
  return page.getByTestId(`sidebar-workspace-row-${getServerId()}:${workspaceId}`).first();
}

function workspaceMenuItem(page: Page, workspaceId: string, action: string) {
  return page
    .getByTestId(`sidebar-workspace-menu-${action}-${getServerId()}:${workspaceId}`)
    .filter({ visible: true });
}

async function openWorkspaceContextMenu(page: Page, workspaceId: string): Promise<void> {
  const row = workspaceRow(page, workspaceId);
  await expect(row).toBeVisible({ timeout: 30_000 });
  await row.click({ button: "right" });
  await expect(
    page.getByTestId(`sidebar-workspace-context-menu-${getServerId()}:${workspaceId}`),
  ).toBeVisible({ timeout: 10_000 });
}

async function openWorkspaceMoreMenu(page: Page, workspaceId: string): Promise<void> {
  const row = workspaceRow(page, workspaceId);
  await expect(row).toBeVisible({ timeout: 30_000 });
  await row.hover();
  await page.getByTestId(`sidebar-workspace-kebab-${getServerId()}:${workspaceId}`).click();
  await expect(workspaceMenuItem(page, workspaceId, "copy-path")).toBeVisible({
    timeout: 10_000,
  });
}

async function readClipboard(page: Page): Promise<string> {
  return page.evaluate(() => navigator.clipboard.readText());
}

test("workspace right-click exposes the full more menu in project and status views", async ({
  context,
  page,
}) => {
  const workspace = await seedWorkspace({ repoPrefix: "sidebar-context-menu-" });

  try {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await gotoAppShell(page);

    await openWorkspaceMoreMenu(page, workspace.workspaceId);
    await page.keyboard.press("Escape");

    await openWorkspaceContextMenu(page, workspace.workspaceId);
    await expect(workspaceMenuItem(page, workspace.workspaceId, "copy-path")).toBeVisible();
    await expect(workspaceMenuItem(page, workspace.workspaceId, "copy-branch-name")).toBeVisible();
    await expect(workspaceMenuItem(page, workspace.workspaceId, "rename")).toBeVisible();
    await expect(workspaceMenuItem(page, workspace.workspaceId, "archive")).toBeVisible();

    await workspaceMenuItem(page, workspace.workspaceId, "copy-path").click();
    await expect.poll(() => readClipboard(page)).toBe(workspace.workspaceDirectory);

    await openWorkspaceContextMenu(page, workspace.workspaceId);
    await workspaceMenuItem(page, workspace.workspaceId, "copy-branch-name").click();
    await expect.poll(() => readClipboard(page)).toBe(workspace.workspaceName);

    await page.getByTestId("sidebar-display-preferences-menu").click();
    await page.getByTestId("sidebar-grouping-status").click();

    await openWorkspaceContextMenu(page, workspace.workspaceId);
    await workspaceMenuItem(page, workspace.workspaceId, "rename").click();
    await expect(
      page.getByTestId(
        `sidebar-workspace-rename-modal-${getServerId()}:${workspace.workspaceId}-input`,
      ),
    ).toBeVisible({ timeout: 10_000 });
  } finally {
    await workspace.cleanup();
  }
});
