import { test, expect } from "./fixtures";
import { gotoAppShell } from "./helpers/app";
import { injectDesktopBridge, openDesktopAboutSettings } from "./helpers/desktop-updates";
import { getServerId } from "./helpers/server-id";

test.skip(process.env.E2E_DESKTOP_RUNTIME !== "1", "requires Metro's Electron platform overlay");

test("keeps the selected release channel label opaque over a custom background", async ({
  page,
}) => {
  await injectDesktopBridge(page, { serverId: getServerId() });
  await page.addInitScript(() => {
    localStorage.setItem(
      "@paseo:app-settings",
      JSON.stringify({
        theme: "dark",
        backgroundImagePath: "/fixtures/background.png",
        backgroundImageOpacity: 0.2,
      }),
    );
  });

  await gotoAppShell(page);
  await openDesktopAboutSettings(page);

  const selectedLabel = page
    .getByRole("button", { name: "Stable", exact: true })
    .getByText("Stable", { exact: true });

  await expect
    .poll(async () => {
      return await selectedLabel.evaluate((node) => {
        const style = getComputedStyle(node);
        return (
          style.getPropertyValue("--colors-surface0").trim() === "transparent" &&
          style.color !== "rgba(0, 0, 0, 0)"
        );
      });
    })
    .toBe(true);
});
