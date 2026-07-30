import { useCallback, useMemo, useReducer } from "react";
import { useKeyboardActionHandler } from "@/hooks/use-keyboard-action-handler";
import type { KeyboardActionDefinition } from "@/keyboard/keyboard-action-dispatcher";
import {
  findFileSearchMatches,
  getAdjacentFileSearchIndex,
  type FileSearchDirection,
  type FileSearchMatch,
} from "./search";

interface FileSearchState {
  isOpen: boolean;
  query: string;
  currentIndex: number;
  navigationRevision: number;
  focusRevision: number;
}

type FileSearchAction =
  | { type: "open" }
  | { type: "close" }
  | { type: "query"; query: string }
  | {
      type: "navigate";
      direction: FileSearchDirection;
      currentIndex: number;
      matchCount: number;
    };

export interface FileSearchController {
  isOpen: boolean;
  query: string;
  matches: FileSearchMatch[];
  currentIndex: number;
  currentMatch: FileSearchMatch | null;
  navigationRevision: number;
  focusRevision: number;
  open(): void;
  close(): void;
  setQuery(query: string): void;
  navigate(direction: FileSearchDirection): void;
}

const INITIAL_STATE: FileSearchState = {
  isOpen: false,
  query: "",
  currentIndex: -1,
  navigationRevision: 0,
  focusRevision: 0,
};

const FILE_SEARCH_ACTIONS = ["workspace.find", "agent.interrupt"] as const;

export function useFileSearch(input: {
  content: string;
  enabled: boolean;
  isPaneFocused: boolean;
  handlerId: string;
}): FileSearchController {
  const [state, dispatch] = useReducer(fileSearchReducer, INITIAL_STATE);
  const matches = useMemo(
    () => (state.isOpen && input.enabled ? findFileSearchMatches(input.content, state.query) : []),
    [input.content, input.enabled, state.isOpen, state.query],
  );
  const currentIndex = resolveCurrentFileSearchIndex(state.currentIndex, matches.length);
  const currentMatch = currentIndex >= 0 ? matches[currentIndex] : null;

  const open = useCallback(() => dispatch({ type: "open" }), []);
  const close = useCallback(() => dispatch({ type: "close" }), []);
  const setQuery = useCallback((query: string) => dispatch({ type: "query", query }), []);
  const navigate = useCallback(
    (direction: FileSearchDirection) => {
      dispatch({ type: "navigate", direction, currentIndex, matchCount: matches.length });
    },
    [currentIndex, matches.length],
  );
  const handleKeyboardAction = useCallback(
    (action: KeyboardActionDefinition) => {
      if (action.id === "workspace.find") {
        open();
        return true;
      }
      if (action.id === "agent.interrupt" && state.isOpen) {
        close();
        return true;
      }
      return false;
    },
    [close, open, state.isOpen],
  );

  useKeyboardActionHandler({
    handlerId: input.handlerId,
    actions: FILE_SEARCH_ACTIONS,
    enabled: input.enabled && input.isPaneFocused,
    priority: 300,
    isActive: () => input.isPaneFocused,
    handle: handleKeyboardAction,
  });

  return {
    isOpen: state.isOpen,
    query: state.query,
    matches,
    currentIndex,
    currentMatch,
    navigationRevision: state.navigationRevision,
    focusRevision: state.focusRevision,
    open,
    close,
    setQuery,
    navigate,
  };
}

function fileSearchReducer(state: FileSearchState, action: FileSearchAction): FileSearchState {
  switch (action.type) {
    case "open":
      return {
        ...state,
        isOpen: true,
        navigationRevision: state.navigationRevision + 1,
        focusRevision: state.focusRevision + 1,
      };
    case "close":
      return { ...state, isOpen: false };
    case "query":
      return {
        ...state,
        query: action.query,
        currentIndex: action.query ? 0 : -1,
        navigationRevision: state.navigationRevision + 1,
      };
    case "navigate":
      return {
        ...state,
        currentIndex: getAdjacentFileSearchIndex(action),
        navigationRevision: state.navigationRevision + 1,
      };
  }
}

function resolveCurrentFileSearchIndex(currentIndex: number, matchCount: number): number {
  if (matchCount === 0) {
    return -1;
  }
  return Math.min(Math.max(currentIndex, 0), matchCount - 1);
}
