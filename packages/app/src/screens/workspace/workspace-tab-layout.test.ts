import { describe, expect, it } from "vitest";
import {
  computeWorkspaceTabLayout,
  computeWorkspaceTabScrollOffset,
  computeWorkspaceTabWheelScrollOffset,
  resolveWorkspaceTabAutoReveal,
} from "@/screens/workspace/workspace-tab-layout";

const metrics = {
  rowHorizontalInset: 0,
  actionsReservedWidth: 120,
  rowPaddingHorizontal: 8,
  tabGap: 4,
  minTabWidth: 120,
  maxTabWidth: 200,
  tabIconWidth: 14,
  tabHorizontalPadding: 12,
  estimatedCharWidth: 7,
  closeButtonWidth: 22,
};

describe("computeWorkspaceTabLayout", () => {
  it("caps equal-width tabs at the ideal width when there is extra horizontal space", () => {
    const result = computeWorkspaceTabLayout({
      viewportWidth: 1200,
      tabLabelLengths: [8, 10, 7],
      metrics,
    });

    expect(result.closeButtonPolicy).toBe("all");
    expect(result.requiresHorizontalScrollFallback).toBe(false);
    expect(result.items).toHaveLength(3);
    expect(result.items.every((item) => item.showLabel)).toBe(true);
    expect(result.items.map((item) => item.width)).toEqual([200, 200, 200]);
  });

  it("shrinks equal-width tabs proportionally to fit the pane", () => {
    const result = computeWorkspaceTabLayout({
      viewportWidth: 520,
      tabLabelLengths: [24, 12, 8],
      metrics,
    });

    expect(result.closeButtonPolicy).toBe("all");
    expect(result.requiresHorizontalScrollFallback).toBe(false);
    expect(result.items.map((item) => item.width)).toEqual([125, 125, 125]);
    expect(result.items.every((item) => item.showLabel)).toBe(true);
  });

  it("uses the split width for evenly sized tabs when space is available", () => {
    const result = computeWorkspaceTabLayout({
      viewportWidth: 743,
      tabLabelLengths: [8, 8, 8, 8],
      metrics: {
        ...metrics,
        actionsReservedWidth: 44,
        rowPaddingHorizontal: 0,
        tabGap: 0,
      },
    });

    expect(result.closeButtonPolicy).toBe("all");
    expect(result.requiresHorizontalScrollFallback).toBe(false);
    expect(result.items.map((item) => item.width)).toEqual([175, 175, 175, 175]);
  });

  it("keeps tabs readable and enables horizontal scrolling when they no longer fit", () => {
    const result = computeWorkspaceTabLayout({
      viewportWidth: 388,
      tabLabelLengths: [14, 14, 14, 14],
      metrics,
    });

    expect(result.closeButtonPolicy).toBe("all");
    expect(result.requiresHorizontalScrollFallback).toBe(true);
    expect(result.items.map((item) => item.width)).toEqual([120, 120, 120, 120]);
    expect(result.items.every((item) => item.showLabel)).toBe(true);
  });

  it("preserves readable tab widths in a narrow pane", () => {
    const result = computeWorkspaceTabLayout({
      viewportWidth: 300,
      tabLabelLengths: [14, 14, 14, 14],
      metrics,
    });

    expect(result.closeButtonPolicy).toBe("all");
    expect(result.requiresHorizontalScrollFallback).toBe(true);
    expect(result.items.map((item) => item.width)).toEqual([120, 120, 120, 120]);
    expect(result.items.every((item) => item.showLabel)).toBe(true);
  });

  it("returns empty layout details when there are no tabs", () => {
    const result = computeWorkspaceTabLayout({
      viewportWidth: 1200,
      tabLabelLengths: [],
      metrics,
    });

    expect(result.closeButtonPolicy).toBe("all");
    expect(result.requiresHorizontalScrollFallback).toBe(false);
    expect(result.items).toEqual([]);
  });
});

describe("computeWorkspaceTabScrollOffset", () => {
  it("scrolls right until the active tab is fully visible", () => {
    expect(
      computeWorkspaceTabScrollOffset({
        activeIndex: 3,
        currentOffset: 0,
        itemWidths: [120, 120, 120, 120],
        viewportWidth: 300,
      }),
    ).toBe(180);
  });

  it("scrolls left to reveal an active tab before the viewport", () => {
    expect(
      computeWorkspaceTabScrollOffset({
        activeIndex: 0,
        currentOffset: 180,
        itemWidths: [120, 120, 120, 120],
        viewportWidth: 300,
      }),
    ).toBe(0);
  });

  it("keeps the current position when the active tab is already visible", () => {
    expect(
      computeWorkspaceTabScrollOffset({
        activeIndex: 1,
        currentOffset: 50,
        itemWidths: [120, 120, 120, 120],
        viewportWidth: 300,
      }),
    ).toBe(50);
  });
});

describe("resolveWorkspaceTabAutoReveal", () => {
  it("reveals the active tab once, then preserves a manual scroll for the same layout", () => {
    const firstReveal = resolveWorkspaceTabAutoReveal({
      previousSignature: null,
      activeTabId: "tab-4",
      activeIndex: 3,
      currentOffset: 0,
      itemWidths: [120, 120, 120, 120],
      viewportWidth: 300,
    });

    expect(firstReveal.nextOffset).toBe(180);

    const afterManualScroll = resolveWorkspaceTabAutoReveal({
      previousSignature: firstReveal.signature,
      activeTabId: "tab-4",
      activeIndex: 3,
      currentOffset: 40,
      itemWidths: [120, 120, 120, 120],
      viewportWidth: 300,
    });

    expect(afterManualScroll.nextOffset).toBe(40);
    expect(afterManualScroll.signature).toBe(firstReveal.signature);
  });

  it("reveals the active tab again when selection changes", () => {
    const previous = resolveWorkspaceTabAutoReveal({
      previousSignature: null,
      activeTabId: "tab-4",
      activeIndex: 3,
      currentOffset: 0,
      itemWidths: [120, 120, 120, 120],
      viewportWidth: 300,
    });

    const next = resolveWorkspaceTabAutoReveal({
      previousSignature: previous.signature,
      activeTabId: "tab-1",
      activeIndex: 0,
      currentOffset: 180,
      itemWidths: [120, 120, 120, 120],
      viewportWidth: 300,
    });

    expect(next.nextOffset).toBe(0);
    expect(next.signature).not.toBe(previous.signature);
  });
});

describe("computeWorkspaceTabWheelScrollOffset", () => {
  it("maps a vertical mouse wheel to horizontal tab scrolling", () => {
    expect(
      computeWorkspaceTabWheelScrollOffset({
        currentOffset: 40,
        contentWidth: 600,
        viewportWidth: 300,
        deltaX: 0,
        deltaY: 120,
        deltaMode: 0,
      }),
    ).toBe(160);
  });

  it("keeps the dominant horizontal trackpad direction", () => {
    expect(
      computeWorkspaceTabWheelScrollOffset({
        currentOffset: 180,
        contentWidth: 600,
        viewportWidth: 300,
        deltaX: -80,
        deltaY: 20,
        deltaMode: 0,
      }),
    ).toBe(100);
  });

  it("stops at either edge so the caller can release the wheel event", () => {
    const common = {
      contentWidth: 600,
      viewportWidth: 300,
      deltaX: 0,
      deltaMode: 0,
    };

    expect(
      computeWorkspaceTabWheelScrollOffset({
        ...common,
        currentOffset: 0,
        deltaY: -120,
      }),
    ).toBe(0);
    expect(
      computeWorkspaceTabWheelScrollOffset({
        ...common,
        currentOffset: 300,
        deltaY: 120,
      }),
    ).toBe(300);
  });
});
