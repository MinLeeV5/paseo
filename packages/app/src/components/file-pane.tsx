import React, { useContext, useEffect, useMemo, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import type { FileReadResult } from "@getpaseo/client/internal/daemon-client";
import {
  ActivityIndicator,
  Image as RNImage,
  ScrollView as RNScrollView,
  Text,
  View,
} from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { useTranslation } from "react-i18next";
import { MarkdownRenderer } from "@/components/markdown/renderer";
import { useIsCompactFormFactor } from "@/constants/layout";
import { useSessionStore, type ExplorerFile } from "@/stores/session-store";
import { useWebScrollViewScrollbar } from "@/components/use-web-scrollbar";
import { useWebScrollbarStyle } from "@/hooks/use-web-scrollbar-style";
import { highlightCode, type HighlightToken } from "@getpaseo/highlight";
import { syntaxTokenStyleFor } from "@/styles/syntax-token-styles";
import { inlineUnistylesStyle } from "@/styles/unistyles-inline-style";
import { lineNumberGutterWidth } from "@/components/code-insets";
import { CODE_SURFACE_DATASET } from "@/styles/code-surface";
import { getFilePaneContentRenderMode } from "@/components/file-pane-render-mode";
import { MermaidDiagram } from "@/components/mermaid/diagram";
import { isWeb } from "@/constants/platform";
import type { AttachmentMetadata } from "@/attachments/types";
import { useAttachmentPreviewUrl } from "@/attachments/use-attachment-preview-url";
import { persistAttachmentFromBytes } from "@/attachments/service";
import { createPreviewAttachmentId, getFileNameFromPath } from "@/attachments/utils";
import { explorerFileFromReadResult } from "@/file-explorer/read-result";
import { resolveFilePreviewReadTarget } from "@/file-explorer/preview-target";
import { resolveWorkspaceFilePaths, type WorkspaceFileLocation } from "@/workspace/file-open";
import { MountedTabActiveContext } from "@/components/split-container";
import { useAppVisible } from "@/hooks/use-app-visible";
import { isFileQueryEnabled } from "@/components/file-pane-enabled";
import { useCheckoutDiffQuery, type ParsedDiffFile } from "@/git/use-diff-query";
import {
  buildWorkspaceFileDiffDecorations,
  type WorkspaceFileDeletedDiffRow,
  type WorkspaceFileDiffDecorations,
  type WorkspaceFileDiffLineState,
} from "@/workspace/file-diff-decorations";

interface CodeLineProps {
  tokens: HighlightToken[];
  lineNumber: number;
  gutterWidth: number;
  highlighted: boolean;
  diffState?: WorkspaceFileDiffLineState;
}

interface DeletedCodeLineProps {
  row: WorkspaceFileDeletedDiffRow;
  gutterWidth: number;
}

interface FilePreviewBodyProps {
  preview: ExplorerFile | null;
  isLoading: boolean;
  showDesktopWebScrollbar: boolean;
  isMobile: boolean;
  location: WorkspaceFileLocation;
  imagePreviewUri: string | null;
  diffDecorations: WorkspaceFileDiffDecorations | null;
}

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
  const diffContext = input.location.diffContext;
  const diffQuery = useCheckoutDiffQuery({
    serverId: input.serverId,
    cwd: diffContext?.cwd ?? input.normalizedWorkspaceRoot,
    mode: diffContext?.mode ?? "uncommitted",
    baseRef: diffContext?.baseRef,
    ignoreWhitespace: diffContext?.ignoreWhitespace,
    enabled: Boolean(diffContext && input.isActive && input.isAppVisible),
  });
  const diffFile = useMemo(
    () =>
      findDiffFileForLocation({
        files: diffQuery.files,
        path: input.normalizedFilePath,
        relativePath: resolvedFilePaths?.relativePath ?? null,
        absolutePath: resolvedFilePaths?.absolutePath ?? null,
      }),
    [diffQuery.files, input.normalizedFilePath, resolvedFilePaths],
  );
  return useMemo(() => (diffFile ? buildWorkspaceFileDiffDecorations(diffFile) : null), [diffFile]);
}

const CodeLine = React.memo(function CodeLine({
  tokens,
  lineNumber,
  gutterWidth,
  highlighted,
  diffState,
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
  const keyedTokens = useMemo(
    () => tokens.map((token, index) => ({ key: `${index}-${token.text}`, token })),
    [tokens],
  );
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
  token: HighlightToken;
}

function CodeLineToken({ token }: CodeLineTokenProps) {
  return <Text style={syntaxTokenStyleFor(token.style)}>{token.text}</Text>;
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

function FilePreviewBody({
  preview,
  isLoading,
  showDesktopWebScrollbar,
  isMobile,
  location,
  imagePreviewUri,
  diffDecorations,
}: FilePreviewBodyProps) {
  const { theme } = useUnistyles();
  const { t } = useTranslation();
  const filePath = location.path;
  const textRenderMode =
    preview?.kind === "text"
      ? getFilePaneContentRenderMode({
          filePath,
          hasLineSelection: Boolean(location.lineStart),
          hasDiffContext: Boolean(location.diffContext),
        })
      : "code";

  const previewScrollRef = useRef<RNScrollView>(null);
  const webScrollbarStyle = useWebScrollbarStyle();
  const scrollbar = useWebScrollViewScrollbar(previewScrollRef, {
    enabled: showDesktopWebScrollbar,
  });

  const highlightedLines = useMemo(() => {
    if (!preview || preview.kind !== "text" || textRenderMode !== "code") {
      return null;
    }

    return highlightCode(preview.content ?? "", filePath);
  }, [textRenderMode, preview, filePath]);

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
  }, [lineHeight, lineSelection]);

  if (isLoading && !preview) {
    return (
      <View style={styles.centerState}>
        <ActivityIndicator size="small" />
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
          onLayout={scrollbar.onLayout}
          onScroll={scrollbar.onScroll}
          onContentSizeChange={scrollbar.onContentSizeChange}
          scrollEventThrottle={16}
          showsVerticalScrollIndicator={!showDesktopWebScrollbar}
        >
          <View style={styles.previewCodeScrollContent} dataSet={CODE_SURFACE_DATASET}>
            {deletedFallbackRows.map((row) => (
              <DeletedCodeLine key={`deleted-${row.key}`} row={row} gutterWidth={gutterWidth} />
            ))}
          </View>
        </RNScrollView>
        {scrollbar.overlay}
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
    if (textRenderMode === "markdown") {
      return (
        <View style={styles.previewScrollContainer}>
          <RNScrollView
            ref={previewScrollRef}
            style={styles.previewContent}
            contentContainerStyle={styles.previewMarkdownScrollContent}
            onLayout={scrollbar.onLayout}
            onScroll={scrollbar.onScroll}
            onContentSizeChange={scrollbar.onContentSizeChange}
            scrollEventThrottle={16}
            showsVerticalScrollIndicator={!showDesktopWebScrollbar}
          >
            <MarkdownRenderer text={preview.content ?? ""} />
          </RNScrollView>
          {scrollbar.overlay}
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
            onLayout={scrollbar.onLayout}
            onScroll={scrollbar.onScroll}
            onContentSizeChange={scrollbar.onContentSizeChange}
            scrollEventThrottle={16}
            showsVerticalScrollIndicator={!showDesktopWebScrollbar}
          >
            <MermaidDiagram diagram={preview.content ?? ""} />
          </RNScrollView>
          {scrollbar.overlay}
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
          onLayout={scrollbar.onLayout}
          onScroll={scrollbar.onScroll}
          onContentSizeChange={scrollbar.onContentSizeChange}
          scrollEventThrottle={16}
          showsVerticalScrollIndicator={!showDesktopWebScrollbar}
        >
          {isMobile ? (
            <View style={styles.previewCodeScrollContent}>{codeLines}</View>
          ) : (
            <RNScrollView
              horizontal
              nestedScrollEnabled
              showsHorizontalScrollIndicator
              style={webScrollbarStyle}
              contentContainerStyle={styles.previewCodeScrollContent}
            >
              {codeLines}
            </RNScrollView>
          )}
        </RNScrollView>
        {scrollbar.overlay}
      </View>
    );
  }

  if (preview.kind === "image") {
    if (!imagePreviewUri) {
      return (
        <View style={styles.centerState}>
          <ActivityIndicator size="small" />
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
          onLayout={scrollbar.onLayout}
          onScroll={scrollbar.onScroll}
          onContentSizeChange={scrollbar.onContentSizeChange}
          scrollEventThrottle={16}
          showsVerticalScrollIndicator={!showDesktopWebScrollbar}
        >
          <RNImage
            source={imageSource ?? undefined}
            style={styles.previewImage}
            resizeMode="contain"
          />
        </RNScrollView>
        {scrollbar.overlay}
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
}: {
  serverId: string;
  workspaceRoot: string;
  location: WorkspaceFileLocation;
}) {
  const { t } = useTranslation();
  const isMobile = useIsCompactFormFactor();
  const showDesktopWebScrollbar = isWeb && !isMobile;

  const client = useSessionStore((state) => state.sessions[serverId]?.client ?? null);
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
  // covers tab switches, `isAppVisible` the whole-app background/foreground; the
  // gate itself lives in isFileQueryEnabled.
  const isActive = useContext(MountedTabActiveContext);
  const isAppVisible = useAppVisible();
  const fileQueryEnabled = isFileQueryEnabled({
    hasReadTarget: Boolean(client && readTarget),
    isTabActive: isActive,
    isAppVisible,
  });

  const query = useQuery({
    queryKey: ["workspaceFile", serverId, readTarget?.cwd ?? null, readTarget?.path ?? null],
    enabled: fileQueryEnabled,
    queryFn: async () => {
      if (!client || !readTarget) {
        return {
          file: null as ExplorerFile | null,
          error: t("workspace.terminal.hostDisconnected"),
        };
      }
      try {
        const file = await client.readFile(readTarget.cwd, readTarget.path);
        const preview = await createFilePanePreview(file);
        return {
          file: preview.file,
          imageAttachment: preview.imageAttachment,
          error: null,
        };
      } catch (error) {
        return {
          file: null,
          imageAttachment: null,
          error: error instanceof Error ? error.message : t("panels.file.failedToLoad"),
        };
      }
    },
    staleTime: 5_000,
    refetchOnMount: true,
  });
  const diffDecorations = useWorkspaceFileDiffDecorations({
    serverId,
    normalizedWorkspaceRoot,
    normalizedFilePath,
    location,
    isActive,
    isAppVisible,
  });
  const imagePreviewUri = useAttachmentPreviewUrl(query.data?.imageAttachment ?? null);
  const hasDeletedDiffFallback = collectDeletedRowsForFallback(diffDecorations).length > 0;

  return (
    <View style={styles.container} testID="workspace-file-pane">
      {query.data?.error && !hasDeletedDiffFallback ? (
        <View style={styles.centerState}>
          <Text style={styles.errorText}>{query.data.error}</Text>
        </View>
      ) : null}

      <FilePreviewBody
        preview={query.data?.file ?? null}
        isLoading={query.isFetching}
        showDesktopWebScrollbar={showDesktopWebScrollbar}
        isMobile={isMobile}
        location={location}
        imagePreviewUri={imagePreviewUri}
        diffDecorations={diffDecorations}
      />
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  container: {
    flex: 1,
    minHeight: 0,
    backgroundColor: theme.colors.surface0,
  },
  centerState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
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
