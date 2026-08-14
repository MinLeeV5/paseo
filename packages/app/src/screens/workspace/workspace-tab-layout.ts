export type WorkspaceTabCloseButtonPolicy = "all";

export interface WorkspaceTabLayoutInput {
  viewportWidth: number;
  tabLabelLengths: number[];
  metrics: {
    rowHorizontalInset: number;
    actionsReservedWidth: number;
    rowPaddingHorizontal: number;
    tabGap: number;
    minTabWidth: number;
    maxTabWidth: number;
    tabIconWidth: number;
    tabHorizontalPadding: number;
    estimatedCharWidth: number;
    closeButtonWidth: number;
  };
}

export interface WorkspaceTabLayoutItem {
  width: number;
  showLabel: boolean;
  labelCharCap: number;
}

export interface WorkspaceTabLayoutResult {
  items: WorkspaceTabLayoutItem[];
  closeButtonPolicy: WorkspaceTabCloseButtonPolicy;
  requiresHorizontalScrollFallback: boolean;
}

function clamp(value: number, min: number, max: number): number {
  if (value < min) {
    return min;
  }
  if (value > max) {
    return max;
  }
  return value;
}

export function computeWorkspaceTabLayout(
  input: WorkspaceTabLayoutInput,
): WorkspaceTabLayoutResult {
  const tabCount = input.tabLabelLengths.length;
  if (tabCount === 0) {
    return {
      items: [],
      closeButtonPolicy: "all",
      requiresHorizontalScrollFallback: false,
    };
  }

  const availableWidth = Math.max(
    0,
    input.viewportWidth - input.metrics.rowHorizontalInset * 2 - input.metrics.actionsReservedWidth,
  );
  const rowOverhead =
    input.metrics.rowPaddingHorizontal * 2 + Math.max(tabCount - 1, 0) * input.metrics.tabGap;
  const availableTabsWidth = Math.max(0, availableWidth - rowOverhead);
  const iconOnlyTabWidth =
    input.metrics.tabIconWidth +
    input.metrics.tabHorizontalPadding * 2 +
    input.metrics.closeButtonWidth;
  const readableTabWidth = Math.max(iconOnlyTabWidth, input.metrics.minTabWidth);
  const readableTotalTabsWidth = readableTabWidth * tabCount;
  const requiresHorizontalScrollFallback = availableTabsWidth < readableTotalTabsWidth;
  const resolvedWidth = requiresHorizontalScrollFallback
    ? readableTabWidth
    : clamp(availableTabsWidth / tabCount, readableTabWidth, input.metrics.maxTabWidth);
  const resolvedWidths = Array.from({ length: tabCount }, () => resolvedWidth);

  const roundedWidths = resolvedWidths.map((width) =>
    Math.round(clamp(width, iconOnlyTabWidth, input.metrics.maxTabWidth)),
  );

  return {
    items: roundedWidths.map((width) => {
      const rawCharCap = Math.floor((width - iconOnlyTabWidth) / input.metrics.estimatedCharWidth);
      const labelCharCap = Math.max(0, rawCharCap);
      return {
        width,
        showLabel: labelCharCap > 0,
        labelCharCap,
      };
    }),
    closeButtonPolicy: "all",
    requiresHorizontalScrollFallback,
  };
}

interface WorkspaceTabScrollOffsetInput {
  activeIndex: number;
  currentOffset: number;
  itemWidths: number[];
  viewportWidth: number;
}

interface WorkspaceTabWheelScrollOffsetInput {
  currentOffset: number;
  contentWidth: number;
  viewportWidth: number;
  deltaX: number;
  deltaY: number;
  deltaMode: number;
}

interface WorkspaceTabAutoRevealInput {
  previousSignature: string | null;
  activeTabId: string | null;
  activeIndex: number;
  currentOffset: number;
  itemWidths: number[];
  viewportWidth: number;
}

interface WorkspaceTabAutoRevealResult {
  signature: string;
  nextOffset: number;
}

const WHEEL_LINE_SIZE_PX = 16;

export function computeWorkspaceTabScrollOffset(input: WorkspaceTabScrollOffsetInput): number {
  const totalWidth = input.itemWidths.reduce((sum, width) => sum + width, 0);
  const maxOffset = Math.max(0, totalWidth - input.viewportWidth);
  const currentOffset = clamp(input.currentOffset, 0, maxOffset);
  const activeWidth = input.itemWidths[input.activeIndex];

  if (activeWidth === undefined || input.viewportWidth <= 0) {
    return currentOffset;
  }

  const activeStart = input.itemWidths
    .slice(0, input.activeIndex)
    .reduce((sum, width) => sum + width, 0);
  const activeEnd = activeStart + activeWidth;

  if (activeWidth >= input.viewportWidth || activeStart < currentOffset) {
    return clamp(activeStart, 0, maxOffset);
  }
  if (activeEnd > currentOffset + input.viewportWidth) {
    return clamp(activeEnd - input.viewportWidth, 0, maxOffset);
  }
  return currentOffset;
}

export function resolveWorkspaceTabAutoReveal(
  input: WorkspaceTabAutoRevealInput,
): WorkspaceTabAutoRevealResult {
  const signature = [
    input.activeTabId ?? "",
    input.activeIndex,
    input.viewportWidth,
    input.itemWidths.join(","),
  ].join("|");

  if (signature === input.previousSignature) {
    return { signature, nextOffset: input.currentOffset };
  }

  return {
    signature,
    nextOffset: computeWorkspaceTabScrollOffset({
      activeIndex: input.activeIndex,
      currentOffset: input.currentOffset,
      itemWidths: input.itemWidths,
      viewportWidth: input.viewportWidth,
    }),
  };
}

export function computeWorkspaceTabWheelScrollOffset(
  input: WorkspaceTabWheelScrollOffsetInput,
): number {
  const maxOffset = Math.max(0, input.contentWidth - input.viewportWidth);
  const currentOffset = clamp(input.currentOffset, 0, maxOffset);
  const dominantDelta =
    Math.abs(input.deltaX) > Math.abs(input.deltaY) ? input.deltaX : input.deltaY;
  let deltaScale = 1;
  if (input.deltaMode === 1) deltaScale = WHEEL_LINE_SIZE_PX;
  else if (input.deltaMode === 2) deltaScale = input.viewportWidth;

  return clamp(currentOffset + dominantDelta * deltaScale, 0, maxOffset);
}
