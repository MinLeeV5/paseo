import { Button } from "@/components/ui/button";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type RefObject,
} from "react";
import type { DaemonClient, FileReadResult } from "@getpaseo/client/internal/daemon-client";
import { Image as RNImage, ScrollView as RNScrollView, Text, View } from "react-native";
import { StyleSheet, UnistylesRuntime, withUnistyles } from "react-native-unistyles";
import { useTranslation } from "react-i18next";
import { useIsCompactFormFactor } from "@/constants/layout";
import { useSessionStore, type ExplorerFile } from "@/stores/session-store";
import { highlightCode, type HighlightToken } from "@getpaseo/highlight";
import { syntaxTokenStyleFor } from "@/styles/syntax-token-styles";
import { inlineUnistylesStyle } from "@/styles/unistyles-inline-style";
import { lineNumberGutterWidth } from "@/components/code-insets";
import { CODE_SURFACE_DATASET } from "@/styles/code-surface";
import {
  filePreviewRenderKind,
  getDefaultFilePaneMarkdownMode,
  getFilePaneContentRenderMode,
  isStandaloneMermaidFile,
} from "@/components/file-pane-render-mode";
import { MermaidDiagram } from "@/components/mermaid/diagram";
import type { AttachmentMetadata } from "@/attachments/types";
import { useAttachmentPreviewUrl } from "@/attachments/use-attachment-preview-url";
import { persistAttachmentFromBytes } from "@/attachments/service";
import { createPreviewAttachmentId, getFileNameFromPath } from "@/attachments/utils";
import { explorerFileFromReadResult } from "@/file-explorer/read-result";
import { resolveFilePreviewReadTarget } from "@/file-explorer/preview-target";
import {
  resolveWorkspaceFilePaths,
  type WorkspaceFileCheckoutDiffContext,
  type WorkspaceFileLocation,
  type WorkspaceFileSessionDiffContext,
} from "@/workspace/file-open";
import { useRetainedPanelActive } from "@/components/retained-panel";
import { useAppActivelyVisible } from "@/hooks/use-app-visible";
import { isFileQueryEnabled } from "@/components/file-pane-enabled";
import { useCheckoutDiffQuery, type ParsedDiffFile } from "@/git/use-diff-query";
import { useAgentSessionChangesQuery } from "@/git/use-agent-session-changes-query";
import {
  buildWorkspaceFileDiffDecorations,
  type WorkspaceFileDeletedDiffRow,
  type WorkspaceFileDiffDecorations,
  type WorkspaceFileDiffLineState,
} from "@/workspace/file-diff-decorations";
import { isWeb } from "@/constants/platform";
import { useAppSettings } from "@/hooks/use-settings";
import { useLiveFile } from "./live-file/hook";
import { FilePanelBar } from "./bar";
import { FileHtmlPreview } from "./html-preview";
import { FileEditorModel, getFileConflictCallout, type FileConflictCallout } from "./editor/model";
import { createFileObservationSource } from "./editor/observation-source";
import { FileEditorView } from "./editor/view";
import { FileSearchToolbar } from "./search-bar";
import type { FileConflictAlertState } from "./conflict-alert";
import type { LiveFileModel } from "./live-file/model";
import { confirmDialog } from "@/utils/confirm-dialog";
import { usePublishPanelInstanceAttributes } from "@/panels/panel-instance-attributes";
import type { Theme } from "@/styles/theme";
import { splitFileSearchTokens, type FileSearchMatch, type FileSearchTokenState } from "./search";
import { useFileSearch, type FileSearchController } from "./use-search";
import { MarkdownSearchPreview } from "./markdown-search-preview";

const ThemedLoadingSpinner = withUnistyles(LoadingSpinner);
const foregroundMutedColorMapping = (theme: Theme) => ({
  color: theme.colors.foregroundMuted,
});

interface CodeLineProps {
  tokens: HighlightToken[];
  lineNumber: number;
  gutterWidth: number;
  highlighted: boolean;
  diffState?: WorkspaceFileDiffLineState;
  searchMatches: FileSearchMatch[];
  currentSearchMatchIndex: number;
}

interface DeletedCodeLineProps {
  row: WorkspaceFileDeletedDiffRow;
  gutterWidth: number;
}

interface FilePreviewBodyProps {
  preview: ExplorerFile | null;
  mode?: "preview" | "source";
  isLoading: boolean;
  isMobile: boolean;
  location: WorkspaceFileLocation;
  navigationRevision: number;
  imagePreviewUri: string | null;
  diffDecorations: WorkspaceFileDiffDecorations | null;
  search?: FileSearchController;
}

type TextExplorerFile = ExplorerFile & { kind: "text" };
const EMPTY_FILE_SEARCH_MATCHES: FileSearchMatch[] = [];

function trimNonEmpty(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

interface FileLineSelection {
  lineStart: number;
  lineEnd: number;
}

function formatFileSize({ size }: { size: number }): string {
  if (size < 1024) {
    return `${size} B`;
  }
  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

async function createFilePanePreview(file: FileReadResult | null): Promise<{
  file: ExplorerFile | null;
  imageAttachment: AttachmentMetadata | null;
}> {
  if (!file) {
    return { file: null, imageAttachment: null };
  }

  const explorerFile = explorerFileFromReadResult(file);
  if (file.kind !== "image") {
    return { file: explorerFile, imageAttachment: null };
  }

  const imageAttachment = await persistAttachmentFromBytes({
    id: createPreviewAttachmentId({
      mimeType: file.mime,
      path: file.path,
      size: file.size,
      modifiedAt: file.modifiedAt,
      contentLength: file.bytes.byteLength,
    }),
    bytes: file.bytes,
    mimeType: file.mime,
    fileName: getFileNameFromPath(file.path),
  });

  return {
    file: explorerFile,
    imageAttachment,
  };
}

function clampLineSelection(input: {
  lineStart?: number;
  lineEnd?: number;
  lineCount: number;
}): FileLineSelection | null {
  if (!input.lineStart || input.lineStart <= 0 || input.lineCount <= 0) {
    return null;
  }
  const lineStart = Math.min(Math.floor(input.lineStart), input.lineCount);
  const rawLineEnd =
    input.lineEnd && input.lineEnd >= input.lineStart ? input.lineEnd : input.lineStart;
  const lineEnd = Math.min(Math.floor(rawLineEnd), input.lineCount);
  return { lineStart, lineEnd: Math.max(lineStart, lineEnd) };
}

function normalizePreviewPath(value: string | null | undefined): string | null {
  const path = trimNonEmpty(value);
  return path ? path.replace(/\\/g, "/") : null;
}

function findDiffFileForLocation(input: {
  files: ParsedDiffFile[];
  path: string | null;
  relativePath: string | null;
  absolutePath: string | null;
}): ParsedDiffFile | null {
  const candidates = new Set<string>();
  for (const path of [input.path, input.relativePath, input.absolutePath]) {
    const normalized = normalizePreviewPath(path);
    if (normalized) {
      candidates.add(normalized);
    }
  }
  return input.files.find((file) => candidates.has(normalizePreviewPath(file.path) ?? "")) ?? null;
}

function getMaxDeletedLineNumber(decorations: WorkspaceFileDiffDecorations | null): number {
  if (!decorations) {
    return 0;
  }
  let maxLineNumber = 0;
  const inspectRows = (rows: WorkspaceFileDeletedDiffRow[]) => {
    for (const row of rows) {
      maxLineNumber = Math.max(maxLineNumber, row.oldLineNumber);
    }
  };
  for (const rows of decorations.deletedRowsBeforeLineNumber.values()) {
    inspectRows(rows);
  }
  inspectRows(decorations.deletedRowsAfterLastLine);
  return maxLineNumber;
}

function collectDeletedRowsForFallback(
  decorations: WorkspaceFileDiffDecorations | null,
): WorkspaceFileDeletedDiffRow[] {
  if (!decorations) {
    return [];
  }
  const rows: WorkspaceFileDeletedDiffRow[] = [];
  for (const beforeRows of decorations.deletedRowsBeforeLineNumber.values()) {
    rows.push(...beforeRows);
  }
  rows.push(...decorations.deletedRowsAfterLastLine);
  return rows;
}

function getDeletedRowsAfterRenderedLines(input: {
  decorations: WorkspaceFileDiffDecorations | null;
  lineCount: number;
}): WorkspaceFileDeletedDiffRow[] {
  if (!input.decorations) {
    return [];
  }
  const rows: WorkspaceFileDeletedDiffRow[] = [];
  for (const [lineNumber, beforeRows] of input.decorations.deletedRowsBeforeLineNumber) {
    if (lineNumber < 1 || lineNumber > input.lineCount) {
      rows.push(...beforeRows);
    }
  }
  rows.push(...input.decorations.deletedRowsAfterLastLine);
  return rows;
}

function useCheckoutWorkspaceFileDiffFiles(input: {
  serverId: string;
  workspaceRoot: string;
  diffContext: WorkspaceFileCheckoutDiffContext | null;
  isActive: boolean;
  isAppVisible: boolean;
}): ParsedDiffFile[] {
  return useCheckoutDiffQuery({
    serverId: input.serverId,
    cwd: input.diffContext?.cwd ?? input.workspaceRoot,
    mode: input.diffContext?.mode ?? "uncommitted",
    baseRef: input.diffContext?.baseRef,
    ignoreWhitespace: input.diffContext?.ignoreWhitespace,
    enabled: Boolean(input.diffContext && input.isActive && input.isAppVisible),
  }).files;
}

function useSessionWorkspaceFileDiffFiles(input: {
  serverId: string;
  diffContext: WorkspaceFileSessionDiffContext | null;
  isActive: boolean;
  isAppVisible: boolean;
}): ParsedDiffFile[] {
  return useAgentSessionChangesQuery({
    serverId: input.serverId,
    agentId: input.diffContext?.agentId ?? null,
    mode: "session",
    turnId: input.diffContext?.turnId ?? null,
    ignoreWhitespace: input.diffContext?.ignoreWhitespace,
    enabled: Boolean(input.diffContext && input.isActive && input.isAppVisible),
  }).files;
}

function useWorkspaceFileDiffFiles(input: {
  serverId: string;
  workspaceRoot: string;
  diffContext: WorkspaceFileLocation["diffContext"];
  isActive: boolean;
  isAppVisible: boolean;
}): ParsedDiffFile[] {
  const sessionDiffContext = input.diffContext?.source === "session" ? input.diffContext : null;
  const checkoutDiffContext =
    input.diffContext?.source !== "session" ? (input.diffContext ?? null) : null;
  const checkoutFiles = useCheckoutWorkspaceFileDiffFiles({
    ...input,
    diffContext: checkoutDiffContext,
  });
  const sessionFiles = useSessionWorkspaceFileDiffFiles({
    ...input,
    diffContext: sessionDiffContext,
  });
  return sessionDiffContext ? sessionFiles : checkoutFiles;
}

function useWorkspaceFileDiffDecorations(input: {
  serverId: string;
  normalizedWorkspaceRoot: string;
  normalizedFilePath: string | null;
  location: WorkspaceFileLocation;
  isActive: boolean;
  isAppVisible: boolean;
}): WorkspaceFileDiffDecorations | null {
  const resolvedFilePaths = useMemo(
    () =>
      input.normalizedFilePath
        ? resolveWorkspaceFilePaths({
            path: input.normalizedFilePath,
            workspaceRoot: input.normalizedWorkspaceRoot,
          })
        : null,
    [input.normalizedFilePath, input.normalizedWorkspaceRoot],
  );
  const diffFiles = useWorkspaceFileDiffFiles({
    serverId: input.serverId,
    workspaceRoot: input.normalizedWorkspaceRoot,
    diffContext: input.location.diffContext,
    isActive: input.isActive,
    isAppVisible: input.isAppVisible,
  });
  const diffFile = useMemo(
    () =>
      findDiffFileForLocation({
        files: diffFiles,
        path: input.normalizedFilePath,
        relativePath: resolvedFilePaths?.relativePath ?? null,
        absolutePath: resolvedFilePaths?.absolutePath ?? null,
      }),
    [diffFiles, input.normalizedFilePath, resolvedFilePaths],
  );
  return useMemo(() => (diffFile ? buildWorkspaceFileDiffDecorations(diffFile) : null), [diffFile]);
}

const CodeLine = React.memo(function CodeLine({
  tokens,
  lineNumber,
  gutterWidth,
  highlighted,
  diffState,
  searchMatches,
  currentSearchMatchIndex,
}: CodeLineProps) {
  const gutterStyle = useMemo(
    () => [codeLineStyles.gutter, inlineUnistylesStyle({ width: gutterWidth })],
    [gutterWidth],
  );
  const lineStyle = useMemo(
    () => [
      codeLineStyles.line,
      diffState === "added" && codeLineStyles.addedLine,
      diffState === "modified" && codeLineStyles.modifiedLine,
      highlighted && codeLineStyles.highlightedLine,
    ],
    [diffState, highlighted],
  );
  const keyedTokens = useMemo(() => {
    const segments = splitFileSearchTokens({
      tokens,
      matches: searchMatches,
      currentMatchIndex: currentSearchMatchIndex,
    });
    return segments.map((token, index) => ({ key: `${index}-${token.text}`, token }));
  }, [currentSearchMatchIndex, searchMatches, tokens]);
  return (
    <View style={lineStyle}>
      <View style={gutterStyle}>
        <Text numberOfLines={1} style={codeLineStyles.gutterText}>
          {String(lineNumber)}
        </Text>
      </View>
      <Text selectable style={codeLineStyles.lineText}>
        {keyedTokens.map(({ key, token }) => (
          <CodeLineToken key={key} token={token} />
        ))}
      </Text>
    </View>
  );
});

function DeletedCodeLine({ row, gutterWidth }: DeletedCodeLineProps) {
  const gutterStyle = useMemo(
    () => [codeLineStyles.gutter, inlineUnistylesStyle({ width: gutterWidth })],
    [gutterWidth],
  );
  const lineStyle = useMemo(() => [codeLineStyles.line, codeLineStyles.deletedLine], []);
  const gutterTextStyle = useMemo(
    () => [codeLineStyles.gutterText, codeLineStyles.deletedGutter],
    [],
  );
  const lineTextStyle = useMemo(
    () => [codeLineStyles.lineText, codeLineStyles.deletedLineText],
    [],
  );
  return (
    <View style={lineStyle}>
      <View style={gutterStyle}>
        <Text numberOfLines={1} style={gutterTextStyle}>
          {String(row.oldLineNumber)}
        </Text>
      </View>
      <Text selectable style={lineTextStyle}>
        {row.content || " "}
      </Text>
    </View>
  );
}

interface CodeLineTokenProps {
  token: HighlightToken & { searchState: FileSearchTokenState };
}

function CodeLineToken({ token }: CodeLineTokenProps) {
  return (
    <Text
      style={[
        syntaxTokenStyleFor(token.style),
        token.searchState === "match" && codeLineStyles.searchMatch,
        token.searchState === "current" && codeLineStyles.currentSearchMatch,
      ]}
    >
      {token.text}
    </Text>
  );
}

const codeLineStyles = StyleSheet.create((theme) => ({
  line: {
    flexDirection: "row",
  },
  highlightedLine: {
    backgroundColor: theme.colors.accentBorder,
  },
  addedLine: {
    backgroundColor: "rgba(46, 160, 67, 0.15)",
  },
  modifiedLine: {
    backgroundColor: "rgba(249, 115, 22, 0.16)",
  },
  searchMatch: {
    backgroundColor: theme.colors.accentBorder,
  },
  currentSearchMatch: {
    color: theme.colors.accentForeground,
    backgroundColor: theme.colors.accent,
  },
  deletedLine: {
    backgroundColor: "rgba(248, 81, 73, 0.1)",
  },
  gutter: {
    alignItems: "flex-end",
    paddingRight: theme.spacing[3],
    flexShrink: 0,
  },
  gutterText: {
    color: theme.colors.foreground,
    fontFamily: theme.fontFamily.mono,
    fontSize: theme.fontSize.code,
    lineHeight: theme.fontSize.code * 1.45,
    opacity: 0.4,
    userSelect: "none",
  },
  lineText: {
    fontFamily: theme.fontFamily.mono,
    fontSize: theme.fontSize.code,
    lineHeight: theme.fontSize.code * 1.45,
    flex: 1,
  },
  deletedGutter: {
    color: theme.colors.diffDeletion,
  },
  deletedLineText: {
    color: theme.colors.foreground,
  },
}));

function useFilePreviewSearch(input: {
  search?: FileSearchController;
  scrollRef: RefObject<RNScrollView | null>;
  lineHeight: number;
}): {
  matchesByLine: Map<number, FileSearchMatch[]>;
  currentMatchIndex: number;
} {
  const matches = input.search?.matches ?? EMPTY_FILE_SEARCH_MATCHES;
  const matchesByLine = useMemo(() => {
    const byLine = new Map<number, FileSearchMatch[]>();
    for (const match of matches) {
      const lineMatches = byLine.get(match.lineNumber);
      if (lineMatches) {
        lineMatches.push(match);
      } else {
        byLine.set(match.lineNumber, [match]);
      }
    }
    return byLine;
  }, [matches]);
  const activeLine = input.search?.isOpen ? (input.search.currentMatch?.lineNumber ?? null) : null;
  const navigationRevision = input.search?.navigationRevision ?? 0;

  useEffect(() => {
    if (!activeLine) {
      return;
    }
    const timeout = setTimeout(() => {
      input.scrollRef.current?.scrollTo({
        y: Math.max(0, (activeLine - 1) * input.lineHeight),
        animated: false,
      });
    }, 0);
    return () => clearTimeout(timeout);
  }, [activeLine, input.lineHeight, input.scrollRef, navigationRevision]);

  return {
    matchesByLine,
    currentMatchIndex: input.search?.currentIndex ?? -1,
  };
}

// oxlint-disable-next-line complexity
function FilePreviewBody({
  preview,
  mode,
  isLoading,
  isMobile,
  location,
  navigationRevision,
  imagePreviewUri,
  diffDecorations,
  search,
}: FilePreviewBodyProps) {
  const theme = UnistylesRuntime.getTheme();
  const { t } = useTranslation();
  const filePath = location.path;
  const textRenderMode =
    preview?.kind === "text"
      ? getFilePaneContentRenderMode({
          filePath,
          hasLineSelection: Boolean(location.lineStart),
          hasDiffContext: Boolean(location.diffContext),
          mode,
        })
      : "code";
  // A line target means the caller wants to land on that line, so fall back to
  // the highlighted source view even for renderable files.
  const renderKind =
    preview?.kind === "text" && !location.lineStart && mode !== "source"
      ? filePreviewRenderKind(filePath)
      : null;

  const previewScrollRef = useRef<RNScrollView>(null);

  const highlightedLines = useMemo(() => {
    if (!preview || preview.kind !== "text" || textRenderMode !== "code" || renderKind) {
      return null;
    }

    return highlightCode(preview.content ?? "", filePath);
  }, [filePath, preview, renderKind, textRenderMode]);

  const maxDeletedLineNumber = useMemo(
    () => getMaxDeletedLineNumber(diffDecorations),
    [diffDecorations],
  );
  const gutterWidth = useMemo(() => {
    const lineCount = Math.max(highlightedLines?.length ?? 0, maxDeletedLineNumber);
    if (lineCount <= 0) return 0;
    return lineNumberGutterWidth(lineCount, theme.fontSize.code);
  }, [highlightedLines, maxDeletedLineNumber, theme.fontSize.code]);
  const lineHeight = theme.fontSize.code * 1.45;
  const lineSelection = useMemo(() => {
    if (!highlightedLines) {
      return null;
    }
    return clampLineSelection({
      lineStart: location.lineStart,
      lineEnd: location.lineEnd,
      lineCount: highlightedLines.length,
    });
  }, [highlightedLines, location.lineEnd, location.lineStart]);

  const imageSource = useMemo(
    () => (imagePreviewUri ? { uri: imagePreviewUri } : null),
    [imagePreviewUri],
  );
  const deletedFallbackRows = useMemo(
    () => collectDeletedRowsForFallback(diffDecorations),
    [diffDecorations],
  );
  const { matchesByLine: searchMatchesByLine, currentMatchIndex: currentSearchMatchIndex } =
    useFilePreviewSearch({ search, scrollRef: previewScrollRef, lineHeight });

  useEffect(() => {
    if (!lineSelection) {
      return;
    }
    const timeout = setTimeout(() => {
      previewScrollRef.current?.scrollTo({
        y: Math.max(0, (lineSelection.lineStart - 1) * lineHeight),
        animated: false,
      });
    }, 0);
    return () => clearTimeout(timeout);
  }, [lineHeight, lineSelection, navigationRevision]);

  if (isLoading && !preview) {
    return (
      <View style={styles.centerState}>
        <ThemedLoadingSpinner size="small" uniProps={foregroundMutedColorMapping} />
        <Text style={styles.loadingText}>{t("panels.file.loading")}</Text>
      </View>
    );
  }

  if (!preview && deletedFallbackRows.length > 0) {
    return (
      <View style={styles.previewScrollContainer}>
        <RNScrollView
          ref={previewScrollRef}
          style={styles.previewContent}
          showsVerticalScrollIndicator
        >
          <View style={styles.previewCodeScrollContent} dataSet={CODE_SURFACE_DATASET}>
            {deletedFallbackRows.map((row) => (
              <DeletedCodeLine key={`deleted-${row.key}`} row={row} gutterWidth={gutterWidth} />
            ))}
          </View>
        </RNScrollView>
      </View>
    );
  }

  if (!preview) {
    return (
      <View style={styles.centerState}>
        <Text style={styles.emptyText}>{t("panels.file.noPreview")}</Text>
      </View>
    );
  }

  if (preview.kind === "text") {
    if (renderKind === "html") {
      // The HTML document owns its own scrolling, so no ScrollView wrapper here.
      return (
        <View style={styles.previewScrollContainer}>
          <FileHtmlPreview html={preview.content ?? ""} testID="file-html-preview" />
        </View>
      );
    }

    if (textRenderMode === "markdown") {
      return (
        <View style={styles.previewScrollContainer}>
          <RNScrollView
            ref={previewScrollRef}
            style={styles.previewContent}
            contentContainerStyle={styles.previewMarkdownScrollContent}
            showsVerticalScrollIndicator
            testID="file-markdown-preview-scroll"
          >
            <MarkdownSearchPreview text={preview.content ?? ""} search={search} />
          </RNScrollView>
        </View>
      );
    }

    if (textRenderMode === "mermaid") {
      return (
        <View style={styles.previewScrollContainer}>
          <RNScrollView
            ref={previewScrollRef}
            style={styles.previewContent}
            contentContainerStyle={styles.previewMarkdownScrollContent}
            showsVerticalScrollIndicator
          >
            <MermaidDiagram diagram={preview.content ?? ""} />
          </RNScrollView>
        </View>
      );
    }

    const lines = highlightedLines ?? [[{ text: preview.content ?? "", style: null }]];
    const keyedLines = lines.map((tokens, index) => ({
      key: `line-${index}`,
      tokens,
      lineNumber: index + 1,
    }));
    const deletedRowsAfterRenderedLines = getDeletedRowsAfterRenderedLines({
      decorations: diffDecorations,
      lineCount: keyedLines.length,
    });
    const codeLines = (
      <View dataSet={CODE_SURFACE_DATASET}>
        {keyedLines.map(({ key, tokens, lineNumber }) => (
          <React.Fragment key={key}>
            {(diffDecorations?.deletedRowsBeforeLineNumber.get(lineNumber) ?? []).map((row) => (
              <DeletedCodeLine
                key={`deleted-before-${row.key}`}
                row={row}
                gutterWidth={gutterWidth}
              />
            ))}
            <CodeLine
              tokens={tokens}
              lineNumber={lineNumber}
              gutterWidth={gutterWidth}
              highlighted={
                Boolean(lineSelection) &&
                lineNumber >= (lineSelection?.lineStart ?? 0) &&
                lineNumber <= (lineSelection?.lineEnd ?? 0)
              }
              diffState={diffDecorations?.lineStatesByLineNumber.get(lineNumber)}
              searchMatches={searchMatchesByLine.get(lineNumber) ?? EMPTY_FILE_SEARCH_MATCHES}
              currentSearchMatchIndex={currentSearchMatchIndex}
            />
          </React.Fragment>
        ))}
        {deletedRowsAfterRenderedLines.map((row) => (
          <DeletedCodeLine key={`deleted-after-${row.key}`} row={row} gutterWidth={gutterWidth} />
        ))}
      </View>
    );

    return (
      <View style={styles.previewScrollContainer}>
        <RNScrollView
          ref={previewScrollRef}
          style={styles.previewContent}
          showsVerticalScrollIndicator
        >
          {isMobile ? (
            <View style={styles.previewCodeScrollContent}>{codeLines}</View>
          ) : (
            <RNScrollView
              horizontal
              nestedScrollEnabled
              showsHorizontalScrollIndicator
              contentContainerStyle={styles.previewCodeScrollContent}
            >
              {codeLines}
            </RNScrollView>
          )}
        </RNScrollView>
      </View>
    );
  }

  if (preview.kind === "image") {
    if (!imagePreviewUri) {
      return (
        <View style={styles.centerState}>
          <ThemedLoadingSpinner size="small" uniProps={foregroundMutedColorMapping} />
          <Text style={styles.loadingText}>{t("panels.file.loading")}</Text>
        </View>
      );
    }

    return (
      <View style={styles.previewScrollContainer}>
        <RNScrollView
          ref={previewScrollRef}
          style={styles.previewContent}
          contentContainerStyle={styles.previewImageScrollContent}
          showsVerticalScrollIndicator
        >
          <RNImage
            source={imageSource ?? undefined}
            style={styles.previewImage}
            resizeMode="contain"
          />
        </RNScrollView>
      </View>
    );
  }

  return (
    <View style={styles.centerState}>
      <Text style={styles.emptyText}>{t("panels.file.binaryPreviewUnavailable")}</Text>
      <Text style={styles.binaryMetaText}>{formatFileSize({ size: preview.size })}</Text>
    </View>
  );
}

export function FilePane({
  serverId,
  workspaceRoot,
  location,
  navigationRevision,
  isPaneFocused,
  searchHandlerId,
}: {
  serverId: string;
  workspaceRoot: string;
  location: WorkspaceFileLocation;
  navigationRevision: number;
  isPaneFocused: boolean;
  searchHandlerId: string;
}) {
  const { t } = useTranslation();
  const isMobile = useIsCompactFormFactor();
  const isDiffView = Boolean(location.diffContext);
  const defaultPreviewMode = getDefaultFilePaneMarkdownMode(isDiffView);
  const [previewMode, setPreviewMode] = useState<"preview" | "source">(defaultPreviewMode);
  const [resolvedPreview, setResolvedPreview] = useState<{
    key: string | null;
    file: ExplorerFile | null;
    imageAttachment: AttachmentMetadata | null;
  }>({ key: null, file: null, imageAttachment: null });

  const client = useSessionStore((state) => state.sessions[serverId]?.client ?? null);
  // COMPAT(workspaceFileEditing): added in v0.2.0, remove after 2027-01-18 once daemon floor >= v0.2.0.
  const supportsEditing = useSessionStore(
    (state) => state.sessions[serverId]?.serverInfo?.features?.workspaceFileEditing === true,
  );
  const normalizedWorkspaceRoot = useMemo(() => workspaceRoot.trim(), [workspaceRoot]);
  const normalizedFilePath = useMemo(() => trimNonEmpty(location.path), [location.path]);
  const readTarget = useMemo(
    () =>
      normalizedFilePath
        ? resolveFilePreviewReadTarget({
            path: normalizedFilePath,
            workspaceRoot: normalizedWorkspaceRoot,
          })
        : null,
    [normalizedFilePath, normalizedWorkspaceRoot],
  );

  // Re-read the file when this pane becomes visible again (#445). `isActive`
  // covers tab switches; active app visibility covers backgrounding and returning
  // from another window after an external edit. The gate lives in isFileQueryEnabled.
  const isActive = useRetainedPanelActive();
  const isAppVisible = useAppActivelyVisible();
  const enabled = isFileQueryEnabled({
    hasReadTarget: Boolean(client && readTarget),
    isTabActive: isActive,
    isAppVisible,
  });
  const liveFile = useLiveFile({
    client,
    cwd: readTarget?.cwd ?? null,
    path: readTarget?.path ?? null,
    enabled,
    liveUpdates: supportsEditing,
  });
  const diffDecorations = useWorkspaceFileDiffDecorations({
    serverId,
    normalizedWorkspaceRoot,
    normalizedFilePath,
    location,
    isActive,
    isAppVisible,
  });

  useEffect(() => {
    if (!liveFile.file) return;
    let active = true;
    const key = readTarget ? `${readTarget.cwd}:${readTarget.path}` : null;
    void (async () => {
      const nextPreview = await createFilePanePreview(liveFile.file);
      if (active) setResolvedPreview({ key, ...nextPreview });
    })();
    return () => {
      active = false;
    };
  }, [liveFile.file, readTarget]);

  useEffect(() => setPreviewMode(defaultPreviewMode), [defaultPreviewMode, readTarget?.path]);

  const previewKey = readTarget ? `${readTarget.cwd}:${readTarget.path}` : null;
  const preview = resolvedPreview.key === previewKey ? resolvedPreview.file : null;
  const imagePreviewUri = useAttachmentPreviewUrl(
    resolvedPreview.key === previewKey ? resolvedPreview.imageAttachment : null,
  );
  const isRenderable = isRenderablePreview(preview, location.path);
  const editable = isEditableTextFile({
    preview,
    supportsEditing,
    isDiffView,
  });
  const canTogglePreviewMode = isRenderable && !location.lineStart;
  const lineCount =
    preview?.kind === "text" ? (preview.content ?? "").split("\n").length : undefined;
  const hasDeletedDiffFallback = collectDeletedRowsForFallback(diffDecorations).length > 0;
  const errorMessage = hasDeletedDiffFallback
    ? null
    : getFileErrorMessage(liveFile.error, t("panels.file.failedToLoad"));

  return (
    <FilePanePresentation
      serverId={serverId}
      client={client}
      readTarget={readTarget}
      preview={preview}
      liveFile={liveFile.model}
      onRetryRead={liveFile.refresh}
      retryingRead={liveFile.isRetrying}
      retryLabel={t("common.actions.retry")}
      filename={getFileNameFromPath(location.path) ?? location.path}
      previewMode={canTogglePreviewMode ? previewMode : undefined}
      onPreviewModeChange={canTogglePreviewMode ? setPreviewMode : undefined}
      lineCount={lineCount}
      editable={editable}
      disconnectedMessage={t("workspace.terminal.hostDisconnected")}
      errorMessage={errorMessage}
      isLoading={liveFile.isFetching}
      isMobile={isMobile}
      location={location}
      navigationRevision={navigationRevision}
      imagePreviewUri={imagePreviewUri}
      diffDecorations={diffDecorations}
      isPaneFocused={isPaneFocused}
      searchHandlerId={searchHandlerId}
    />
  );
}

function isRenderablePreview(preview: ExplorerFile | null, path: string): boolean {
  return (
    preview?.kind === "text" &&
    (filePreviewRenderKind(path) !== null || isStandaloneMermaidFile(path))
  );
}

function getFileErrorMessage(error: unknown, fallback: string): string | null {
  if (!error) return null;
  if (typeof error === "string") return error;
  return error instanceof Error ? error.message : fallback;
}

function isEditableTextFile(input: {
  preview: ExplorerFile | null;
  supportsEditing: boolean;
  isDiffView: boolean;
}): boolean {
  return Boolean(
    isWeb &&
    input.supportsEditing &&
    !input.isDiffView &&
    input.preview?.kind === "text" &&
    input.preview.size <= 1024 * 1024,
  );
}

function FilePanePresentation({
  serverId,
  client,
  readTarget,
  preview,
  liveFile,
  onRetryRead,
  retryingRead,
  retryLabel,
  filename,
  previewMode,
  onPreviewModeChange,
  lineCount,
  editable,
  disconnectedMessage,
  errorMessage,
  isLoading,
  isMobile,
  location,
  navigationRevision,
  imagePreviewUri,
  diffDecorations,
  isPaneFocused,
  searchHandlerId,
}: {
  serverId: string;
  client: DaemonClient | null;
  readTarget: { cwd: string; path: string } | null;
  preview: ExplorerFile | null;
  liveFile: LiveFileModel;
  onRetryRead: () => void;
  retryingRead: boolean;
  retryLabel: string;
  filename: string;
  previewMode?: "preview" | "source";
  onPreviewModeChange?: (mode: "preview" | "source") => void;
  lineCount?: number;
  editable: boolean;
  disconnectedMessage: string;
  errorMessage: string | null;
  isLoading: boolean;
  isMobile: boolean;
  location: WorkspaceFileLocation;
  navigationRevision: number;
  imagePreviewUri: string | null;
  diffDecorations: WorkspaceFileDiffDecorations | null;
  isPaneFocused: boolean;
  searchHandlerId: string;
}) {
  if (!client && readTarget) {
    return (
      <View style={styles.container} testID="workspace-file-pane">
        <View style={styles.centerState}>
          <Text style={styles.errorText}>{disconnectedMessage}</Text>
        </View>
      </View>
    );
  }

  if (editable && client && readTarget && preview?.kind === "text") {
    return (
      <EditableFilePane
        key={`${serverId}:${readTarget.cwd}:${readTarget.path}`}
        client={client}
        cwd={readTarget.cwd}
        path={readTarget.path}
        preview={preview as TextExplorerFile}
        liveFile={liveFile}
        onRetryRead={onRetryRead}
        retryingRead={retryingRead}
        filename={filename}
        mode={previewMode}
        onModeChange={onPreviewModeChange}
        isLoading={isLoading}
        isMobile={isMobile}
        location={location}
        navigationRevision={navigationRevision}
        isPaneFocused={isPaneFocused}
        searchHandlerId={searchHandlerId}
      />
    );
  }

  if (errorMessage) {
    return (
      <View style={styles.container} testID="workspace-file-pane">
        <View style={styles.centerState}>
          <Text style={styles.errorText}>{errorMessage}</Text>
          <Button variant="outline" size="sm" onPress={onRetryRead} loading={retryingRead}>
            {retryLabel}
          </Button>
        </View>
      </View>
    );
  }

  return (
    <ReadOnlyFilePane
      preview={preview}
      lineCount={lineCount}
      previewMode={previewMode}
      onPreviewModeChange={onPreviewModeChange}
      errorMessage={errorMessage}
      isLoading={isLoading}
      isMobile={isMobile}
      location={location}
      navigationRevision={navigationRevision}
      imagePreviewUri={imagePreviewUri}
      diffDecorations={diffDecorations}
      isPaneFocused={isPaneFocused}
      searchHandlerId={searchHandlerId}
    />
  );
}

function ReadOnlyFilePane({
  preview,
  lineCount,
  previewMode,
  onPreviewModeChange,
  errorMessage,
  isLoading,
  isMobile,
  location,
  navigationRevision,
  imagePreviewUri,
  diffDecorations,
  isPaneFocused,
  searchHandlerId,
}: {
  preview: ExplorerFile | null;
  lineCount?: number;
  previewMode?: "preview" | "source";
  onPreviewModeChange?: (mode: "preview" | "source") => void;
  errorMessage: string | null;
  isLoading: boolean;
  isMobile: boolean;
  location: WorkspaceFileLocation;
  navigationRevision: number;
  imagePreviewUri: string | null;
  diffDecorations: WorkspaceFileDiffDecorations | null;
  isPaneFocused: boolean;
  searchHandlerId: string;
}) {
  const textRenderMode = getSearchableTextRenderMode({ preview, location, mode: previewMode });
  const canSearch = textRenderMode !== null;
  const search = useFileSearch({
    content: preview?.kind === "text" ? (preview.content ?? "") : "",
    enabled: canSearch,
    isPaneFocused,
    handlerId: searchHandlerId,
    matchSource: textRenderMode === "markdown" ? "rendered" : "content",
  });

  return (
    <View style={styles.container} testID="workspace-file-pane">
      {preview ? (
        <FilePanelBar
          size={preview.size}
          lineCount={lineCount}
          mode={previewMode}
          onModeChange={onPreviewModeChange}
          search={canSearch ? search : undefined}
        />
      ) : null}
      <View style={styles.contentLayer}>
        {errorMessage ? (
          <View style={styles.centerState}>
            <Text style={styles.errorText}>{errorMessage}</Text>
          </View>
        ) : null}

        <FilePreviewBody
          preview={preview}
          isLoading={isLoading}
          isMobile={isMobile}
          location={location}
          navigationRevision={navigationRevision}
          imagePreviewUri={imagePreviewUri}
          diffDecorations={diffDecorations}
          mode={previewMode}
          search={canSearch ? search : undefined}
        />
        <FileSearchOverlay search={canSearch ? search : undefined} />
      </View>
    </View>
  );
}

function FileSearchOverlay({ search }: { search?: FileSearchController }) {
  if (!search?.isOpen) {
    return null;
  }
  return (
    <View style={styles.searchOverlay} pointerEvents="box-none">
      <FileSearchToolbar search={search} />
    </View>
  );
}

function getSearchableTextRenderMode(input: {
  preview: ExplorerFile | null;
  location: WorkspaceFileLocation;
  mode?: "preview" | "source";
}): "code" | "markdown" | null {
  if (input.preview?.kind !== "text") {
    return null;
  }
  const renderMode = getFilePaneContentRenderMode({
    filePath: input.location.path,
    hasLineSelection: Boolean(input.location.lineStart),
    hasDiffContext: Boolean(input.location.diffContext),
    mode: input.mode,
  });
  return renderMode === "mermaid" ? null : renderMode;
}

function EditableFilePane({
  client,
  cwd,
  path,
  preview,
  liveFile,
  onRetryRead,
  retryingRead,
  filename,
  mode,
  onModeChange,
  isLoading,
  isMobile,
  location,
  navigationRevision,
  isPaneFocused,
  searchHandlerId,
}: {
  client: DaemonClient;
  cwd: string;
  path: string;
  preview: TextExplorerFile;
  liveFile: LiveFileModel;
  onRetryRead: () => void;
  retryingRead: boolean;
  filename: string;
  mode?: "preview" | "source";
  onModeChange?: (mode: "preview" | "source") => void;
  isLoading: boolean;
  isMobile: boolean;
  location: WorkspaceFileLocation;
  navigationRevision: number;
  isPaneFocused: boolean;
  searchHandlerId: string;
}) {
  const { settings } = useAppSettings();
  const { t } = useTranslation();
  const [cursor, setCursor] = useState({ line: 1, column: 1 });
  const [vimMode, setVimMode] = useState<string | null>(settings.vimKeybindings ? "NORMAL" : null);
  const session = useMemo(
    () => ({
      write(input: { content: string; expectedModifiedAt: string; expectedRevision?: string }) {
        return client.writeFile({ cwd, path, ...input });
      },
    }),
    [client, cwd, path],
  );
  const [model] = useState(() => {
    return new FileEditorModel({
      file: {
        content: preview.content ?? "",
        hasBom: preview.hasBom,
        version: {
          status: "ready",
          cwd,
          path,
          size: preview.size,
          modifiedAt: preview.modifiedAt,
          revision: preview.revision,
        },
      },
      session,
    });
  });
  useEffect(() => {
    const source = createFileObservationSource(liveFile);
    model.connectFileObservations(source);
    return () => model.disconnectFileObservations();
  }, [liveFile, model]);
  const snapshot = useSyncExternalStore(model.subscribe, model.getSnapshot, model.getSnapshot);
  const suspendPendingSave = useCallback(() => model.suspendAutosave(), [model]);
  usePublishPanelInstanceAttributes({ modified: snapshot.modified, suspendPendingSave });
  const theme = UnistylesRuntime.getTheme();
  const visualTheme = useMemo(
    () => ({
      colorScheme: theme.colorScheme,
      background: theme.colors.surface0,
      foreground: theme.colors.foreground,
      cursor: theme.colors.terminal.cursor,
      foregroundMuted: theme.colors.foregroundMuted,
      border: theme.colors.border,
      selection: theme.colors.terminal.selectionBackground,
      searchMatchBackground: theme.colors.accentBorder,
      currentSearchMatchBackground: theme.colors.accent,
      currentSearchMatchForeground: theme.colors.accentForeground,
      monoFont: theme.fontFamily.mono,
      codeFontSize: theme.fontSize.code,
      syntax: theme.colors.syntax,
    }),
    [
      theme.colors.border,
      theme.colors.foreground,
      theme.colors.foregroundMuted,
      theme.colors.surface0,
      theme.colors.syntax,
      theme.colors.accent,
      theme.colors.accentBorder,
      theme.colors.accentForeground,
      theme.colors.terminal.cursor,
      theme.colors.terminal.selectionBackground,
      theme.colorScheme,
      theme.fontFamily.mono,
      theme.fontSize.code,
    ],
  );

  useEffect(() => () => model.dispose(), [model]);

  const handleReload = useCallback(() => {
    if (!snapshot.modified) {
      void model.reload();
      return;
    }
    void (async () => {
      const confirmed = await confirmDialog({
        title: t("panels.file.editor.reloadTitle"),
        message: t("panels.file.editor.reloadMessage"),
        confirmLabel: t("panels.file.editor.reload"),
        destructive: true,
      });
      if (confirmed) void model.reload();
    })();
  }, [model, snapshot.modified, t]);
  const handleOverwrite = useCallback(() => void model.overwrite(), [model]);
  const conflict = fileConflictAlertState({
    callout: getFileConflictCallout(snapshot),
    onOverwrite: handleOverwrite,
    onReload: handleReload,
    onRetry: onRetryRead,
    retrying: retryingRead,
  });
  const handleVimModeChange = useCallback((nextMode: string | null) => setVimMode(nextMode), []);
  const renderedPreview = useMemo<ExplorerFile>(
    () => ({
      ...preview,
      content: snapshot.content,
      size: snapshot.version.status === "ready" ? snapshot.version.size : preview.size,
      modifiedAt:
        snapshot.version.status === "ready" ? snapshot.version.modifiedAt : preview.modifiedAt,
    }),
    [preview, snapshot.content, snapshot.version],
  );
  const showSource = mode !== "preview";
  const search = useFileSearch({
    content: snapshot.content,
    enabled: true,
    isPaneFocused,
    handlerId: searchHandlerId,
    matchSource: showSource ? "content" : "rendered",
  });

  return (
    <View style={styles.container} testID="workspace-file-pane">
      <FilePanelBar
        size={
          snapshot.observedVersion.status === "ready" ? snapshot.observedVersion.size : preview.size
        }
        lineCount={snapshot.content.split("\n").length}
        editorStatus={snapshot.status}
        cursor={showSource ? cursor : undefined}
        vimMode={showSource ? vimMode : null}
        conflict={conflict}
        mode={mode}
        onModeChange={onModeChange}
        search={search}
      />
      <View style={styles.contentLayer}>
        {showSource ? (
          <FileEditorView
            model={model}
            filename={filename}
            location={location}
            navigationRevision={navigationRevision}
            vimEnabled={settings.vimKeybindings}
            theme={visualTheme}
            onCursorChange={setCursor}
            onVimModeChange={handleVimModeChange}
            search={search}
          />
        ) : (
          <FilePreviewBody
            preview={renderedPreview}
            isLoading={isLoading}
            isMobile={isMobile}
            location={location}
            navigationRevision={navigationRevision}
            imagePreviewUri={null}
            diffDecorations={null}
            mode={mode}
            search={search}
          />
        )}
        <FileSearchOverlay search={search} />
      </View>
    </View>
  );
}

function fileConflictAlertState(input: {
  callout: FileConflictCallout | null;
  onOverwrite(): void;
  onReload(): void;
  onRetry(): void;
  retrying: boolean;
}): FileConflictAlertState | undefined {
  if (!input.callout) return undefined;
  if (input.callout.kind === "deleted") return { kind: "deleted" };
  if (input.callout.kind === "checkFailed") {
    return { kind: "checkFailed", retrying: input.retrying, onRetry: input.onRetry };
  }
  return {
    kind: "changed",
    canOverwrite: input.callout.canOverwrite,
    onReload: input.onReload,
    onOverwrite: input.onOverwrite,
  };
}

const styles = StyleSheet.create((theme) => ({
  container: {
    flex: 1,
    minHeight: 0,
    backgroundColor: theme.colors.surface0,
  },
  contentLayer: {
    position: "relative",
    flex: 1,
    minHeight: 0,
  },
  searchOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "flex-end",
    padding: theme.spacing[3],
    zIndex: 2,
  },
  centerState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: theme.spacing[3],
    padding: theme.spacing[4],
  },
  loadingText: {
    marginTop: theme.spacing[2],
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
  errorText: {
    color: theme.colors.destructive,
    fontSize: theme.fontSize.sm,
    textAlign: "center",
  },
  emptyText: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
    textAlign: "center",
  },
  binaryMetaText: {
    marginTop: theme.spacing[2],
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
  previewScrollContainer: {
    flex: 1,
    minHeight: 0,
  },
  previewContent: {
    flex: 1,
    minHeight: 0,
  },
  previewCodeScrollContent: {
    padding: theme.spacing[4],
  },
  previewMarkdownScrollContent: {
    padding: theme.spacing[4],
  },
  previewImageScrollContent: {
    flexGrow: 1,
    padding: theme.spacing[4],
    alignItems: "center",
    justifyContent: "center",
  },
  previewImage: {
    width: "100%",
    height: 420,
  },
}));
