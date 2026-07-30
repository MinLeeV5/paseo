import { ChevronDown, ChevronUp, Search, X } from "lucide-react-native";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Text, TextInput, View } from "react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { CONVERSATION_SEARCH_NAVIGATE_EVENT } from "@/agent-stream/search-navigation";
import { Button } from "@/components/ui/button";
import { useKeyboardActionHandler } from "@/hooks/use-keyboard-action-handler";
import type { KeyboardActionDefinition } from "@/keyboard/keyboard-action-dispatcher";
import { installConversationSearchHighlightStyles } from "@/styles/install-conversation-search-highlight-styles";
import type { Theme } from "@/styles/theme";
import {
  getAdjacentConversationSearchIndex,
  type ConversationSearchDirection,
} from "./conversation-search-model";
import { ConversationSearchActiveContext } from "./conversation-search-context";

export interface ConversationSearchProps {
  agentId: string;
  isPaneFocused: boolean;
  children: ReactNode;
}

interface HighlightRegistry {
  delete(name: string): boolean;
  set(name: string, highlight: unknown): void;
}

type HighlightConstructor = new (...ranges: Range[]) => unknown;

const SEARCH_MATCH_HIGHLIGHT = "paseo-conversation-search-match";
const SEARCH_CURRENT_HIGHLIGHT = "paseo-conversation-search-current";
const SEARCH_SCROLL_SELECTOR = '[data-testid="agent-chat-scroll"]';

const ThemedSearch = withUnistyles(Search);
const ThemedSearchInput = withUnistyles(TextInput, (theme) => ({
  placeholderTextColor: theme.colors.foregroundMuted,
  selectionColor: theme.colors.accent,
}));
const foregroundMutedColorMapping = (theme: Theme) => ({ color: theme.colors.foregroundMuted });
const foregroundColorMapping = (theme: Theme) => ({ color: theme.colors.foreground });

function getHighlightApi(): {
  Highlight: HighlightConstructor;
  registry: HighlightRegistry;
} | null {
  const Highlight = (globalThis as unknown as { Highlight?: HighlightConstructor }).Highlight;
  const registry = (globalThis.CSS as typeof CSS & { highlights?: HighlightRegistry }).highlights;
  return Highlight && registry ? { Highlight, registry } : null;
}

function clearConversationSearchHighlights(): void {
  const api = getHighlightApi();
  api?.registry.delete(SEARCH_MATCH_HIGHLIGHT);
  api?.registry.delete(SEARCH_CURRENT_HIGHLIGHT);
}

function applyConversationSearchHighlights(ranges: Range[], currentIndex: number): void {
  const api = getHighlightApi();
  if (!api) return;

  api.registry.delete(SEARCH_MATCH_HIGHLIGHT);
  api.registry.delete(SEARCH_CURRENT_HIGHLIGHT);
  const currentRange = ranges[currentIndex];
  const otherRanges = ranges.filter((_, index) => index !== currentIndex);
  if (otherRanges.length > 0) {
    api.registry.set(SEARCH_MATCH_HIGHLIGHT, new api.Highlight(...otherRanges));
  }
  if (currentRange) {
    api.registry.set(SEARCH_CURRENT_HIGHLIGHT, new api.Highlight(currentRange));
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function findConversationSearchRanges(root: HTMLElement, query: string): Range[] {
  if (!query) return [];
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

function scrollToSearchRange(scope: HTMLElement, range: Range): void {
  const scrollContainer = scope.querySelector<HTMLElement>(SEARCH_SCROLL_SELECTOR);
  if (!scrollContainer) return;

  const rangeRect = range.getBoundingClientRect();
  const scrollRect = scrollContainer.getBoundingClientRect();
  scrollContainer.dispatchEvent(new Event(CONVERSATION_SEARCH_NAVIGATE_EVENT));
  scrollContainer.scrollTo({
    top: Math.max(
      0,
      scrollContainer.scrollTop + rangeRect.top - scrollRect.top - scrollRect.height / 2,
    ),
    behavior: "auto",
  });
}

export function ConversationSearch({ agentId, isPaneFocused, children }: ConversationSearchProps) {
  const { t } = useTranslation();
  const scopeRef = useRef<HTMLElement | null>(null);
  const inputRef = useRef<TextInput>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const isOpenRef = useRef(false);
  const shouldNavigateRef = useRef(false);
  const scannedQueryRef = useRef("");
  const [isOpen, setIsOpen] = useState(false);
  const [isInputFocused, setIsInputFocused] = useState(false);
  const [query, setQuery] = useState("");
  const [ranges, setRanges] = useState<Range[]>([]);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const normalizedQuery = query.trim();

  const focusAndSelectInput = useCallback(() => {
    requestAnimationFrame(() => {
      const input = inputRef.current as unknown as {
        focus?: () => void;
        select?: () => void;
      } | null;
      input?.focus?.();
      input?.select?.();
    });
  }, []);

  const openSearch = useCallback(() => {
    if (!isOpenRef.current) {
      previousFocusRef.current =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
      isOpenRef.current = true;
      setIsOpen(true);
    }
    focusAndSelectInput();
  }, [focusAndSelectInput]);

  const closeSearch = useCallback((restoreFocus = true) => {
    if (!isOpenRef.current) return;
    isOpenRef.current = false;
    setIsOpen(false);
    setIsInputFocused(false);
    clearConversationSearchHighlights();
    if (!restoreFocus) return;
    const previousFocus = previousFocusRef.current;
    requestAnimationFrame(() => {
      if (previousFocus?.isConnected) previousFocus.focus();
    });
  }, []);

  const handleKeyboardAction = useCallback(
    (action: KeyboardActionDefinition) => {
      if (action.id === "workspace.find") {
        openSearch();
        return true;
      }
      if (action.id === "agent.interrupt" && isOpenRef.current) {
        closeSearch();
        return true;
      }
      return false;
    },
    [closeSearch, openSearch],
  );

  useKeyboardActionHandler({
    handlerId: `conversation-search:${agentId}`,
    actions: ["workspace.find", "agent.interrupt"],
    enabled: isPaneFocused,
    priority: 300,
    isActive: () => isPaneFocused,
    handle: handleKeyboardAction,
  });

  useEffect(() => installConversationSearchHighlightStyles(), []);

  useEffect(() => {
    if (!isPaneFocused && isOpenRef.current) {
      closeSearch(false);
    }
  }, [closeSearch, isPaneFocused]);

  useEffect(() => {
    isOpenRef.current = false;
    setIsOpen(false);
    setQuery("");
    setRanges([]);
    setCurrentIndex(-1);
    scannedQueryRef.current = "";
    clearConversationSearchHighlights();
  }, [agentId]);

  useEffect(() => {
    if (!isOpen || !normalizedQuery) {
      setRanges([]);
      setCurrentIndex(-1);
      scannedQueryRef.current = normalizedQuery;
      clearConversationSearchHighlights();
      return;
    }

    const scope = scopeRef.current;
    const scrollContainer = scope?.querySelector<HTMLElement>(SEARCH_SCROLL_SELECTOR);
    if (!scope || !scrollContainer) return;

    let pendingFrame: number | null = null;
    const scan = () => {
      pendingFrame = null;
      const nextRanges = findConversationSearchRanges(scrollContainer, normalizedQuery);
      const isNewQuery = scannedQueryRef.current !== normalizedQuery;
      scannedQueryRef.current = normalizedQuery;
      setRanges(nextRanges);
      setCurrentIndex((index) => {
        if (nextRanges.length === 0) return -1;
        if (isNewQuery) {
          shouldNavigateRef.current = true;
          return 0;
        }
        return Math.min(Math.max(index, 0), nextRanges.length - 1);
      });
    };
    const scheduleScan = () => {
      if (pendingFrame !== null) cancelAnimationFrame(pendingFrame);
      pendingFrame = requestAnimationFrame(scan);
    };

    scheduleScan();
    const observer = new MutationObserver(scheduleScan);
    observer.observe(scrollContainer, { characterData: true, childList: true, subtree: true });
    return () => {
      observer.disconnect();
      if (pendingFrame !== null) cancelAnimationFrame(pendingFrame);
    };
  }, [isOpen, normalizedQuery]);

  useEffect(() => {
    if (!isOpen) {
      clearConversationSearchHighlights();
      return;
    }
    applyConversationSearchHighlights(ranges, currentIndex);
    if (!shouldNavigateRef.current) return;
    const currentRange = ranges[currentIndex];
    if (currentRange && scopeRef.current) {
      shouldNavigateRef.current = false;
      scrollToSearchRange(scopeRef.current, currentRange);
    }
  }, [currentIndex, isOpen, ranges]);

  useEffect(() => {
    if (!isOpen) return;
    const input = inputRef.current as unknown as HTMLInputElement | null;
    if (!input) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeSearch();
        return;
      }
      if (event.key !== "Enter") return;
      event.preventDefault();
      const direction: ConversationSearchDirection = event.shiftKey ? "previous" : "next";
      shouldNavigateRef.current = true;
      setCurrentIndex((index) =>
        getAdjacentConversationSearchIndex({
          currentIndex: index,
          matchCount: ranges.length,
          direction,
        }),
      );
    };
    input.addEventListener("keydown", handleKeyDown);
    return () => input.removeEventListener("keydown", handleKeyDown);
  }, [closeSearch, isOpen, ranges.length]);

  const navigate = useCallback(
    (direction: ConversationSearchDirection) => {
      shouldNavigateRef.current = true;
      setCurrentIndex((index) =>
        getAdjacentConversationSearchIndex({
          currentIndex: index,
          matchCount: ranges.length,
          direction,
        }),
      );
    },
    [ranges.length],
  );
  const handlePrevious = useCallback(() => navigate("previous"), [navigate]);
  const handleNext = useCallback(() => navigate("next"), [navigate]);
  const handleClose = useCallback(() => closeSearch(), [closeSearch]);
  const handleInputFocus = useCallback(() => setIsInputFocused(true), []);
  const handleInputBlur = useCallback(() => setIsInputFocused(false), []);
  const handleScopeRef = useCallback((node: View | null) => {
    scopeRef.current = node as unknown as HTMLElement | null;
  }, []);
  const resultLabel = useMemo(() => {
    if (!normalizedQuery || ranges.length === 0) return t("agentPanel.search.noMatches");
    return t("agentPanel.search.matchCount", {
      current: currentIndex + 1,
      total: ranges.length,
    });
  }, [currentIndex, normalizedQuery, ranges.length, t]);

  return (
    <ConversationSearchActiveContext.Provider value={isOpen}>
      <View ref={handleScopeRef} style={styles.root} testID="conversation-search-scope">
        <View style={styles.content}>{children}</View>
        {isOpen ? (
          <View style={styles.overlay} pointerEvents="box-none">
            <View style={styles.toolbar} testID="conversation-search-toolbar">
              <View style={styles.controls}>
                <View style={[styles.field, isInputFocused ? styles.fieldFocused : null]}>
                  <ThemedSearch
                    size={16}
                    uniProps={isInputFocused ? foregroundColorMapping : foregroundMutedColorMapping}
                    style={styles.searchIcon}
                  />
                  <ThemedSearchInput
                    ref={inputRef}
                    testID="conversation-search-input"
                    value={query}
                    onChangeText={setQuery}
                    onFocus={handleInputFocus}
                    onBlur={handleInputBlur}
                    accessibilityLabel={t("agentPanel.search.placeholder")}
                    placeholder={t("agentPanel.search.placeholder")}
                    autoCapitalize="none"
                    autoCorrect={false}
                    style={styles.input}
                  />
                  <Text
                    style={styles.resultCount}
                    accessibilityLiveRegion="polite"
                    testID="conversation-search-result-count"
                  >
                    {resultLabel}
                  </Text>
                </View>
                <Button
                  variant="ghost"
                  size="xs"
                  leftIcon={ChevronUp}
                  style={styles.iconButton}
                  disabled={ranges.length === 0}
                  accessibilityLabel={t("agentPanel.search.previous")}
                  onPress={handlePrevious}
                  testID="conversation-search-previous"
                />
                <Button
                  variant="ghost"
                  size="xs"
                  leftIcon={ChevronDown}
                  style={styles.iconButton}
                  disabled={ranges.length === 0}
                  accessibilityLabel={t("agentPanel.search.next")}
                  onPress={handleNext}
                  testID="conversation-search-next"
                />
                <Button
                  variant="ghost"
                  size="xs"
                  leftIcon={X}
                  style={styles.iconButton}
                  accessibilityLabel={t("agentPanel.search.close")}
                  onPress={handleClose}
                  testID="conversation-search-close"
                />
              </View>
            </View>
          </View>
        ) : null}
      </View>
    </ConversationSearchActiveContext.Provider>
  );
}

const styles = StyleSheet.create((theme) => ({
  root: {
    flex: 1,
    minHeight: 0,
    position: "relative",
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "flex-end",
    padding: theme.spacing[3],
    zIndex: 2,
  },
  toolbar: {
    width: "100%",
    maxWidth: 440,
    padding: theme.spacing[1],
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.lg,
    backgroundColor: theme.colors.surface0,
    ...theme.shadow.md,
  },
  controls: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
  },
  field: {
    flex: 1,
    minWidth: 0,
    height: 32,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
    paddingHorizontal: theme.spacing[2],
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.surface1,
  },
  fieldFocused: {
    backgroundColor: theme.colors.surface2,
  },
  searchIcon: {
    flexShrink: 0,
  },
  input: {
    flex: 1,
    minWidth: 0,
    height: "100%",
    paddingVertical: 0,
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    outlineWidth: 0,
    outlineColor: "transparent",
  },
  resultCount: {
    flexShrink: 0,
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
    fontVariant: ["tabular-nums"],
  },
  iconButton: {
    width: 28,
    paddingHorizontal: 0,
  },
  content: {
    flex: 1,
    minHeight: 0,
  },
}));
