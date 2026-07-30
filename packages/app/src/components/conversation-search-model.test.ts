import { describe, expect, it } from "vitest";
import { getAdjacentConversationSearchIndex } from "./conversation-search-model";

describe("getAdjacentConversationSearchIndex", () => {
  it("returns no selection when there are no matches", () => {
    expect(
      getAdjacentConversationSearchIndex({ currentIndex: 0, matchCount: 0, direction: "next" }),
    ).toBe(-1);
  });

  it("starts at the edge that matches the navigation direction", () => {
    expect(
      getAdjacentConversationSearchIndex({ currentIndex: -1, matchCount: 3, direction: "next" }),
    ).toBe(0);
    expect(
      getAdjacentConversationSearchIndex({
        currentIndex: -1,
        matchCount: 3,
        direction: "previous",
      }),
    ).toBe(2);
  });

  it("wraps in both directions", () => {
    expect(
      getAdjacentConversationSearchIndex({ currentIndex: 2, matchCount: 3, direction: "next" }),
    ).toBe(0);
    expect(
      getAdjacentConversationSearchIndex({ currentIndex: 0, matchCount: 3, direction: "previous" }),
    ).toBe(2);
  });
});
