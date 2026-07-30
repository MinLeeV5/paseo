import { useCallback, useEffect, useState } from "react";
import type { WorkspaceFileSearchResponse } from "@getpaseo/protocol/messages";
import { useTranslation } from "react-i18next";
import {
  FlatList,
  type ListRenderItemInfo,
  Pressable,
  type PressableStateCallbackType,
  type StyleProp,
  Text,
  TextInput,
  View,
  type ViewStyle,
} from "react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { Search, X } from "lucide-react-native";
import { MaterialFileIcon } from "@/components/material-file-icon";
import { WORKSPACE_FILE_ROW_VERTICAL_PADDING } from "@/components/tree-primitives";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { WORKSPACE_SECONDARY_HEADER_HEIGHT } from "@/constants/layout";
import { useFetchQuery } from "@/data/query";
import { useHostFeature } from "@/runtime/host-features";
import { useSessionStore } from "@/stores/session-store";
import type { Theme } from "@/styles/theme";

type WorkspaceFileSearchEntry = WorkspaceFileSearchResponse["payload"]["entries"][number];

const ThemedLoadingSpinner = withUnistyles(LoadingSpinner);
const ThemedSearchInput = withUnistyles(TextInput, (theme) => ({
  placeholderTextColor: theme.colors.foregroundMuted,
  selectionColor: theme.colors.accent,
}));
const foregroundMutedColorMapping = (theme: Theme) => ({
  color: theme.colors.foregroundMuted,
});

export function useWorkspaceFileSearch({
  serverId,
  workspaceRoot,
  showHiddenFiles,
}: {
  serverId: string;
  workspaceRoot: string;
  showHiddenFiles: boolean;
}) {
  const { t } = useTranslation();
  const client = useSessionStore((state) => state.sessions[serverId]?.client ?? null);
  const supportsFileSearch = useHostFeature(serverId, "workspaceFileSearch");
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");
  const normalizedSearchQuery = searchQuery.trim();

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearchQuery(normalizedSearchQuery), 200);
    return () => clearTimeout(timer);
  }, [normalizedSearchQuery]);

  const search = useFetchQuery({
    queryKey: [
      "workspaceFileSearch",
      serverId,
      workspaceRoot,
      debouncedSearchQuery,
      showHiddenFiles,
    ],
    queryFn: async () => {
      if (!client) {
        throw new Error(t("workspace.terminal.hostDisconnected"));
      }
      const payload = await client.searchWorkspaceFiles({
        cwd: workspaceRoot,
        query: debouncedSearchQuery,
        includeHidden: showHiddenFiles,
      });
      if (payload.error) {
        throw new Error(payload.error);
      }
      return payload.entries;
    },
    enabled:
      isSearchOpen && supportsFileSearch && Boolean(client) && debouncedSearchQuery.length > 0,
    retry: false,
    dataShape: "list",
    staleTimeMs: 5_000,
  });

  const toggleSearch = useCallback(() => {
    if (isSearchOpen) {
      setSearchQuery("");
      setDebouncedSearchQuery("");
    }
    setIsSearchOpen(!isSearchOpen);
  }, [isSearchOpen]);
  const clearSearch = useCallback(() => setSearchQuery(""), []);
  const refetchSearch = search.refetch;
  const retrySearch = useCallback(() => void refetchSearch(), [refetchSearch]);

  return {
    isSearchOpen,
    searchQuery,
    normalizedSearchQuery,
    debouncedSearchQuery,
    setSearchQuery,
    toggleSearch,
    clearSearch,
    retrySearch,
    supportsFileSearch,
    isDisconnected: !client,
    entries: search.data ?? [],
    isFetching: search.isFetching,
    error: search.error,
  };
}

export interface WorkspaceFileSearchPanelProps {
  fileSearch: ReturnType<typeof useWorkspaceFileSearch>;
  iconSize: number;
  iconColor: string;
  selectedEntryPath: string | null;
  onOpenFile: (path: string) => void;
  iconButtonStyle: (state: PressableStateCallbackType) => StyleProp<ViewStyle>;
}

export function WorkspaceFileSearchPanel({
  fileSearch,
  iconSize,
  iconColor,
  selectedEntryPath,
  onOpenFile,
  iconButtonStyle,
}: WorkspaceFileSearchPanelProps) {
  const { t } = useTranslation();
  const showResults = !fileSearch.supportsFileSearch || fileSearch.normalizedSearchQuery.length > 0;

  return (
    <>
      <View style={styles.searchField}>
        <Search size={iconSize} color={iconColor} />
        <ThemedSearchInput
          autoFocus
          value={fileSearch.searchQuery}
          onChangeText={fileSearch.setSearchQuery}
          placeholder={t("workspace.fileExplorer.search.placeholder")}
          accessibilityLabel={t("workspace.fileExplorer.search.placeholder")}
          autoCapitalize="none"
          autoCorrect={false}
          style={styles.searchInput}
          testID="files-search-input"
        />
        {fileSearch.searchQuery.length > 0 ? (
          <Pressable
            onPress={fileSearch.clearSearch}
            hitSlop={8}
            style={iconButtonStyle}
            accessibilityRole="button"
            accessibilityLabel={t("workspace.fileExplorer.search.clear")}
            testID="files-search-clear"
          >
            <X size={iconSize} color={iconColor} />
          </Pressable>
        ) : null}
      </View>
      {showResults ? (
        <FileSearchResults
          entries={fileSearch.entries}
          selectedEntryPath={selectedEntryPath}
          supportsFileSearch={fileSearch.supportsFileSearch}
          isDisconnected={fileSearch.isDisconnected}
          isLoading={
            fileSearch.normalizedSearchQuery !== fileSearch.debouncedSearchQuery ||
            fileSearch.isFetching
          }
          error={fileSearch.error}
          onOpenFile={onOpenFile}
          onRetry={fileSearch.retrySearch}
        />
      ) : (
        <View style={styles.centerState} testID="files-search-state">
          <Text style={styles.emptyText}>{t("workspace.fileExplorer.search.hint")}</Text>
        </View>
      )}
    </>
  );
}

interface FileSearchResultsProps {
  entries: WorkspaceFileSearchEntry[];
  selectedEntryPath: string | null;
  supportsFileSearch: boolean;
  isDisconnected: boolean;
  isLoading: boolean;
  error: Error | null;
  onOpenFile: (path: string) => void;
  onRetry: () => void;
}

function FileSearchResults({
  entries,
  selectedEntryPath,
  supportsFileSearch,
  isDisconnected,
  isLoading,
  error,
  onOpenFile,
  onRetry,
}: FileSearchResultsProps) {
  const { t } = useTranslation();
  const renderSearchResult = useCallback(
    (info: ListRenderItemInfo<WorkspaceFileSearchEntry>) => (
      <FileSearchResultRow
        entry={info.item}
        index={info.index}
        isSelected={selectedEntryPath === info.item.path}
        onOpenFile={onOpenFile}
      />
    ),
    [onOpenFile, selectedEntryPath],
  );

  if (!supportsFileSearch) {
    return <SearchState message={t("workspace.fileExplorer.search.updateHost")} />;
  }
  if (isDisconnected) {
    return <SearchState message={t("workspace.terminal.hostDisconnected")} error />;
  }
  if (isLoading) {
    return <SearchState message={t("workspace.fileExplorer.search.searching")} loading />;
  }
  if (error) {
    return <SearchState message={error.message} error onRetry={onRetry} />;
  }
  if (entries.length === 0) {
    return <SearchState message={t("workspace.fileExplorer.search.noResults")} />;
  }

  return (
    <FlatList
      style={styles.list}
      data={entries}
      renderItem={renderSearchResult}
      keyExtractor={fileSearchEntryKeyExtractor}
      testID="file-search-results"
      contentContainerStyle={styles.entriesContent}
      showsVerticalScrollIndicator
      keyboardShouldPersistTaps="handled"
    />
  );
}

function SearchState({
  message,
  error = false,
  loading = false,
  onRetry,
}: {
  message: string;
  error?: boolean;
  loading?: boolean;
  onRetry?: () => void;
}) {
  const { t } = useTranslation();
  return (
    <View style={styles.centerState} testID="files-search-state">
      {loading ? (
        <ThemedLoadingSpinner size="small" uniProps={foregroundMutedColorMapping} />
      ) : null}
      <Text style={error ? styles.errorText : styles.emptyText}>{message}</Text>
      {onRetry ? (
        <Pressable style={styles.retryButton} onPress={onRetry} testID="files-search-retry">
          <Text style={styles.retryButtonText}>{t("workspace.fileExplorer.actions.retry")}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function fileSearchEntryKeyExtractor(entry: WorkspaceFileSearchEntry): string {
  return entry.path;
}

function FileSearchResultRow({
  entry,
  index,
  isSelected,
  onOpenFile,
}: {
  entry: WorkspaceFileSearchEntry;
  index: number;
  isSelected: boolean;
  onOpenFile: (path: string) => void;
}) {
  const handlePress = useCallback(() => onOpenFile(entry.path), [entry.path, onOpenFile]);
  const rowStyle = useCallback(
    ({ hovered, pressed }: PressableStateCallbackType & { hovered?: boolean }) => [
      styles.resultRow,
      (Boolean(hovered) || pressed || isSelected) && styles.resultRowActive,
    ],
    [isSelected],
  );
  const parentPath = entry.path.includes("/")
    ? entry.path.slice(0, entry.path.lastIndexOf("/"))
    : ".";

  return (
    <Pressable onPress={handlePress} style={rowStyle} testID={`file-search-result-${index}`}>
      <MaterialFileIcon fileName={entry.name} size={16} />
      <View style={styles.resultText}>
        <Text style={styles.resultName} numberOfLines={1}>
          {entry.name}
        </Text>
        <Text style={styles.resultPath} numberOfLines={1} ellipsizeMode="middle">
          {parentPath}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create((theme) => ({
  searchField: {
    minHeight: WORKSPACE_SECONDARY_HEADER_HEIGHT,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
    paddingHorizontal: theme.spacing[3],
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceSidebar,
  },
  searchInput: {
    flex: 1,
    minWidth: 0,
    paddingVertical: theme.spacing[2],
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
  },
  list: {
    flex: 1,
    minHeight: 0,
  },
  entriesContent: {
    paddingTop: theme.spacing[2],
    paddingBottom: theme.spacing[4],
  },
  centerState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: theme.spacing[2],
    padding: theme.spacing[4],
  },
  emptyText: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.base,
    textAlign: "center",
  },
  errorText: {
    color: theme.colors.destructive,
    fontSize: theme.fontSize.base,
    textAlign: "center",
  },
  retryButton: {
    borderRadius: theme.borderRadius.full,
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.border,
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[1],
  },
  retryButtonText: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.semibold,
  },
  resultRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
    paddingHorizontal: theme.spacing[3],
    paddingVertical: WORKSPACE_FILE_ROW_VERTICAL_PADDING,
  },
  resultRowActive: {
    backgroundColor: theme.colors.surfaceSidebarHover,
  },
  resultText: {
    flex: 1,
    minWidth: 0,
  },
  resultName: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
  },
  resultPath: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
  },
}));
