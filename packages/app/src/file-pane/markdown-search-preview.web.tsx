import { useEffect, useRef } from "react";
import { MarkdownRenderer } from "@/components/markdown/renderer";
import type { FileSearchController } from "./use-search";

interface HighlightRegistry {
  delete(name: string): boolean;
  set(name: string, highlight: unknown): void;
}

type HighlightConstructor = new (...ranges: Range[]) => unknown;

interface MarkdownSearchHighlightNames {
  current: string;
  match: string;
}

let nextHighlightId = 1;

export function MarkdownSearchPreview({
  text,
  search,
}: {
  text: string;
  search?: FileSearchController;
}) {
  const isSearchOpen = search?.isOpen ?? false;
  const query = search?.query ?? "";
  const currentIndex = search?.currentIndex ?? -1;
  const navigationRevision = search?.navigationRevision ?? 0;
  const reportRenderedMatchCount = search?.reportRenderedMatchCount;
  const rootRef = useRef<HTMLDivElement>(null);
  const rangesRef = useRef<Range[]>([]);
  const currentIndexRef = useRef(currentIndex);
  currentIndexRef.current = currentIndex;
  const namesRef = useRef<MarkdownSearchHighlightNames | null>(null);
  if (!namesRef.current) {
    const id = nextHighlightId;
    nextHighlightId += 1;
    namesRef.current = {
      match: `paseo-file-markdown-search-match-${id}`,
      current: `paseo-file-markdown-search-current-${id}`,
    };
  }
  const names = namesRef.current;

  useEffect(() => installHighlightStyles(names), [names]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root || !isSearchOpen || !query || !reportRenderedMatchCount) {
      rangesRef.current = [];
      reportRenderedMatchCount?.(0);
      clearHighlights(names);
      return;
    }
    const activeRoot = root;
    const activeQuery = query;
    const reportMatchCount = reportRenderedMatchCount;

    let pendingFrame: number | null = null;
    function scan() {
      pendingFrame = null;
      const ranges = findSearchRanges(activeRoot, activeQuery);
      rangesRef.current = ranges;
      reportMatchCount(ranges.length);
      applyHighlights(names, ranges, currentIndexRef.current);
      scrollToRange(activeRoot, ranges[currentIndexRef.current]);
    }
    function scheduleScan() {
      if (pendingFrame !== null) {
        cancelAnimationFrame(pendingFrame);
      }
      pendingFrame = requestAnimationFrame(scan);
    }

    scheduleScan();
    const observer = new MutationObserver(scheduleScan);
    observer.observe(activeRoot, { characterData: true, childList: true, subtree: true });
    return () => {
      observer.disconnect();
      if (pendingFrame !== null) {
        cancelAnimationFrame(pendingFrame);
      }
      clearHighlights(names);
    };
  }, [isSearchOpen, names, query, reportRenderedMatchCount, text]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root || !isSearchOpen) {
      clearHighlights(names);
      return;
    }
    applyHighlights(names, rangesRef.current, currentIndex);
    scrollToRange(root, rangesRef.current[currentIndex]);
  }, [currentIndex, isSearchOpen, names, navigationRevision]);

  return (
    <div ref={rootRef} data-testid="file-markdown-preview">
      <MarkdownRenderer text={text} />
    </div>
  );
}

function getHighlightApi(): {
  Highlight: HighlightConstructor;
  registry: HighlightRegistry;
} | null {
  const Highlight = Reflect.get(globalThis, "Highlight");
  const css = Reflect.get(globalThis, "CSS");
  const registry = typeof css === "object" && css ? Reflect.get(css, "highlights") : null;
  if (!isHighlightConstructor(Highlight) || !isHighlightRegistry(registry)) {
    return null;
  }
  return { Highlight, registry };
}

function isHighlightConstructor(value: unknown): value is HighlightConstructor {
  return typeof value === "function";
}

function isHighlightRegistry(value: unknown): value is HighlightRegistry {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof Reflect.get(value, "delete") === "function" &&
    typeof Reflect.get(value, "set") === "function"
  );
}

function clearHighlights(names: MarkdownSearchHighlightNames): void {
  const api = getHighlightApi();
  api?.registry.delete(names.match);
  api?.registry.delete(names.current);
}

function applyHighlights(
  names: MarkdownSearchHighlightNames,
  ranges: Range[],
  currentIndex: number,
): void {
  const api = getHighlightApi();
  if (!api) {
    return;
  }

  api.registry.delete(names.match);
  api.registry.delete(names.current);
  const currentRange = ranges[currentIndex];
  const otherRanges = ranges.filter((_, index) => index !== currentIndex);
  if (otherRanges.length > 0) {
    api.registry.set(names.match, new api.Highlight(...otherRanges));
  }
  if (currentRange) {
    api.registry.set(names.current, new api.Highlight(currentRange));
  }
}

function findSearchRanges(root: HTMLElement, query: string): Range[] {
  const matcher = new RegExp(escapeRegExp(query), "giu");
  const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const ranges: Range[] = [];
  let node = walker.nextNode();

  while (node) {
    const text = node.textContent ?? "";
    const parent = node.parentElement;
    if (text && parent && !parent.closest("script, style, textarea, input, [aria-hidden='true']")) {
      matcher.lastIndex = 0;
      let match = matcher.exec(text);
      while (match) {
        const range = root.ownerDocument.createRange();
        range.setStart(node, match.index);
        range.setEnd(node, match.index + match[0].length);
        ranges.push(range);
        match = matcher.exec(text);
      }
    }
    node = walker.nextNode();
  }

  return ranges;
}

function scrollToRange(root: HTMLElement, range: Range | undefined): void {
  if (!range) {
    return;
  }
  const scrollContainer = root.closest<HTMLElement>('[data-testid="file-markdown-preview-scroll"]');
  if (!scrollContainer) {
    return;
  }
  const rangeRect = range.getBoundingClientRect();
  const scrollRect = scrollContainer.getBoundingClientRect();
  scrollContainer.scrollTop = Math.max(
    0,
    scrollContainer.scrollTop + rangeRect.top - scrollRect.top - scrollRect.height / 2,
  );
}

function installHighlightStyles(names: MarkdownSearchHighlightNames): () => void {
  const style = document.createElement("style");
  style.textContent = `
::highlight(${names.match}) {
  background-color: color-mix(in srgb, var(--colors-accent) 28%, transparent);
}

::highlight(${names.current}) {
  color: var(--colors-accentForeground);
  background-color: var(--colors-accent);
}
`;
  document.head.append(style);
  return () => {
    clearHighlights(names);
    style.remove();
  };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
