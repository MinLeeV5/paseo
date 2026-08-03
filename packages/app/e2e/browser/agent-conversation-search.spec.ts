import { expect, test } from "../support/fixtures";
import { expectComposerVisible } from "../support/helpers/composer";
import { openAgentRoute, seedMockAgentWorkspace } from "../support/helpers/mock-agent";

const SEARCH_KEYWORD = "search-needle-omega";

async function readConversationSearchHighlightCounts(page: import("@playwright/test").Page) {
  return page.evaluate(() => {
    const highlights = (
      CSS as typeof CSS & {
        highlights?: Map<string, { size: number }>;
      }
    ).highlights;
    return {
      current: highlights?.get("paseo-conversation-search-current")?.size ?? 0,
      other: highlights?.get("paseo-conversation-search-match")?.size ?? 0,
    };
  });
}

test.describe("Agent conversation search", () => {
  test("opens with Mod+F, searches case-insensitively, navigates, and closes with Escape", async ({
    page,
  }) => {
    const session = await seedMockAgentWorkspace({
      repoPrefix: "agent-conversation-search-",
      title: "Agent conversation search",
      initialPrompt: `First ${SEARCH_KEYWORD}, then ${SEARCH_KEYWORD.toUpperCase()}.`,
    });

    try {
      await session.client.waitForFinish(session.agentId, 30_000);
      await openAgentRoute(page, session);
      await expectComposerVisible(page);
      await expect(page.getByText(new RegExp(SEARCH_KEYWORD, "i")).first()).toBeVisible();

      const chatScroll = page.getByTestId("agent-chat-scroll");
      const chatBoxBeforeSearch = await chatScroll.boundingBox();
      expect(chatBoxBeforeSearch).not.toBeNull();
      await page.keyboard.press("ControlOrMeta+f");
      const input = page.getByTestId("conversation-search-input");
      await expect(input).toBeVisible();
      await expect(input).toBeFocused();
      const chatBoxWithSearch = await chatScroll.boundingBox();
      expect(chatBoxWithSearch).not.toBeNull();
      expect(chatBoxWithSearch).toEqual(chatBoxBeforeSearch);

      await input.fill(SEARCH_KEYWORD);
      const resultCount = page.getByTestId("conversation-search-result-count");
      await expect(resultCount).toHaveText("1 of 2");
      await expect
        .poll(() => readConversationSearchHighlightCounts(page))
        .toEqual({
          current: 1,
          other: 1,
        });

      await input.press("Enter");
      await expect(resultCount).toHaveText("2 of 2");
      await input.press("Shift+Enter");
      await expect(resultCount).toHaveText("1 of 2");

      await input.fill("keyword-that-is-not-present");
      await expect(resultCount).toHaveText("No matches");
      await expect(page.getByTestId("conversation-search-next")).toBeDisabled();

      await input.press("Escape");
      await expect(page.getByTestId("conversation-search-toolbar")).toHaveCount(0);
      await expect(page.getByRole("textbox", { name: "Message agent..." })).toBeFocused();
    } finally {
      await session.cleanup();
    }
  });
});
