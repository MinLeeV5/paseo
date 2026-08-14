import {
  useState,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  memo,
  type ReactElement,
  type ReactNode,
} from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { DiffStat } from "@/components/diff-stat";
import {
  View,
  Text,
  Pressable,
  FlatList,
  type LayoutChangeEvent,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
  type PressableStateCallbackType,
  type GestureResponderEvent,
  type FlatListProps,
  type StyleProp,
  type ViewStyle,
  type TextStyle,
} from "react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { BORDER_WIDTH, ICON_SIZE, SPACING, type Theme } from "@/styles/theme";
import { useIsCompactFormFactor, WORKSPACE_SECONDARY_HEADER_HEIGHT } from "@/constants/layout";
import {
  AlignJustify,
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  ChevronDown,
  Columns2,
  ExternalLink,
  FileCode2,
  FolderTree,
  GitCompareArrows,
  GitFork,
  FileText,
  List,
  ListChevronsDownUp,
  ListChevronsUpDown,
  Maximize2,
  MessageSquareText,
  Pilcrow,
  RotateCw,
  WrapText,
} from "lucide-react-native";
import { useMutation } from "@tanstack/react-query";
import { type ParsedDiffFile, type DiffLine, type HighlightToken } from "@/git/use-diff-query";
import { useAgentSessionChangesQuery } from "@/git/use-agent-session-changes-query";
import { buildDiffFlatItems, sumHeightsBefore, type DiffFlatItem } from "@/git/diff-flat-items";
import type { CheckoutDiffFileGrouping } from "@/git/diff-order";
import { buildDiffTree, collectDirPaths, compressSingleChildChains } from "@/git/diff-tree";
import { DiffFolderRow } from "@/git/diff-folder-row";
import {
  TreeChevron,
  TreeIndentGuides,
  treeRowPaddingLeft,
  WORKSPACE_FILE_ROW_VERTICAL_PADDING,
} from "@/components/tree-primitives";
import { SvgXml } from "react-native-svg";
import { getRawFileIconSvg as getFileIconSvg } from "@/components/material-file-icons";
import { useCheckoutPrStatusQuery } from "@/git/use-pr-status-query";
import { CommitsSection } from "@/git/commits-section/commits-section";
import { useChangesPreferences } from "@/hooks/use-changes-preferences";
import { useAppSettings } from "@/hooks/use-settings";
import { DiffScroll } from "@/components/diff-scroll";
import { syntaxTokenStyleFor } from "@/styles/syntax-token-styles";
import { CODE_SURFACE_DATASET } from "@/styles/code-surface";
import { shouldAnchorHeaderBeforeCollapse } from "@/git/diff-scroll";
import {
  buildSplitDiffRows,
  buildUnifiedDiffLines,
  buildReviewableDiffTargetKey,
  type ReviewableDiffTarget,
  type SplitDiffDisplayLine,
  type SplitDiffRow,
} from "@/utils/diff-layout";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
  type MenuPageDefinition,
} from "@/components/ui/dropdown-menu";
import * as Clipboard from "expo-clipboard";
import {
  FILE_ACTIONS_MENU_WIDTH,
  FileActionsContextMenuContent,
  FileActionsMenu,
} from "@/components/file-actions-menu";
import { ContextMenu, ContextMenuTrigger } from "@/components/ui/context-menu";
import { useFileDownload } from "@/hooks/use-file-download";
import { useIsLocalDaemon } from "@/hooks/use-is-local-daemon";
import { buildAbsoluteExplorerPath } from "@/utils/explorer-paths";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { lineNumberGutterWidth } from "@/components/code-insets";
import { GitActionsSplitButton } from "@/git/actions-split-button";
import { BranchSwitcher } from "@/components/branch-switcher";
import { useGitActions } from "@/git/use-actions";
import { GIT_ACTION_ICONS } from "@/git/action-icons";
import { buildForgeSignInCommand, getForgePresentation, type Forge } from "@/git/forge";
import { parseGitRemoteLocation } from "@getpaseo/protocol/git-remote";
import type { AgentTurnChangesSummary, ForgeAuthState } from "@getpaseo/protocol/messages";
import { useCheckoutGitActionsStore } from "@/git/actions-store";
import { useToast } from "@/contexts/toast-context";
import { useSessionStore } from "@/stores/session-store";
import { confirmDialog } from "@/utils/confirm-dialog";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { inlineUnistylesStyle } from "@/styles/unistyles-inline-style";
import { usePanelStore } from "@/stores/panel-store";
import { collectAllTabs, useWorkspaceLayoutStore } from "@/stores/workspace-layout-store";
import { buildWorkspaceTabPersistenceKey } from "@/workspace-tabs/model";
import { buildWorkspaceExplorerStateKey } from "@/hooks/use-file-explorer-actions";
import {
  formatDiffContentText,
  formatDiffGutterText,
  hasVisibleDiffTokens,
} from "@/utils/diff-rendering";
import { isWeb, isNative } from "@/constants/platform";
import { useWorkspaceFileDragSource } from "@/attachments/use-workspace-file-drag-source";
import {
  createChangedFileSourceTarget,
  createDiffFileOpenTarget,
  createDiffFileSourceTarget,
} from "@/git/diff-file-open";
import {
  type ReviewDraftComment,
  getInlineReviewThreadState,
  getSplitInlineReviewThreadState,
  InlineReviewGutterCell,
  InlineReviewThread,
  isInlineReviewEditorForTarget,
  type InlineReviewActions,
} from "@/review";
import { getAdjacentCircularIndex, sortReviewCommentsForDiff } from "@/review/navigation";
import type { WorkspaceFileDiffContext, WorkspaceFileOpenRequest } from "@/workspace/file-open";
import { usePublishWorkingDiffAttachment, useWorkingDiff } from "@/git/use-working-diff";
import { resolvePreferredEditorTarget, usePreferredEditor } from "@/hooks/use-preferred-editor";
import { openDesktopTarget, useDesktopOpenTargets } from "@/workspace/desktop-open-targets";
import { planWorkspaceOpenTargets } from "@/workspace/open-target-planner";
import { openExternalUrl } from "@/utils/open-external-url";
import { DiffTooLargeState } from "@/git/diff-too-large-state";
import { buildDiffSearchLineKey, type DiffSearchRenderState } from "@/git/diff-search";
import {
  buildDiffHunkNavigationTargets,
  buildSourceDiffHunkNavigationTargets,
} from "@/git/diff-navigation";
import {
  splitFileSearchTokens,
  type FileSearchMatch,
  type FileSearchTokenState,
} from "@/file-pane/search";

export type { GitActionId, GitAction, GitActions } from "@/git/policy";

export function resolveDiffLayout(
  layout: "unified" | "split",
  canUseSplitLayout: boolean,
): "unified" | "split" {
  return canUseSplitLayout ? layout : "unified";
}

function fileHeaderFileTargetStyle({
  hovered,
  pressed,
}: PressableStateCallbackType & { hovered?: boolean }) {
  return [styles.fileHeaderFileTarget, (Boolean(hovered) || pressed) && styles.fileHeaderHovered];
}

function fileOpenButtonStyle({ pressed }: PressableStateCallbackType) {
  return [styles.fileOpenButton, pressed && styles.fileOpenButtonPressed];
}

interface HighlightedTextProps {
  tokens: HighlightToken[];
  textMetricsStyle: TextStyle;
  wrapLines?: boolean;
  searchMatches?: readonly FileSearchMatch[];
  currentSearchMatchIndex?: number;
  textStyle?: StyleProp<TextStyle>;
  testID?: string;
}

const EMPTY_DIFF_SEARCH_MATCHES: readonly FileSearchMatch[] = [];
const DIFF_CONTROL_HIT_SLOP = { top: 10, right: 10, bottom: 10, left: 10 } as const;

type WrappedWebTextStyle = TextStyle & {
  whiteSpace?: "pre" | "pre-wrap";
  overflowWrap?: "normal" | "anywhere";
};

function getWrappedTextStyle(wrapLines: boolean): WrappedWebTextStyle | undefined {
  if (isNative) {
    return undefined;
  }
  return wrapLines
    ? { whiteSpace: "pre-wrap", overflowWrap: "anywhere" }
    : { whiteSpace: "pre", overflowWrap: "normal" };
}

function getNumericLineHeight(textMetricsStyle: TextStyle): number | undefined {
  const { lineHeight } = textMetricsStyle;
  return typeof lineHeight === "number" && Number.isFinite(lineHeight) ? lineHeight : undefined;
}

function useDiffRowMetricsStyle(textMetricsStyle: TextStyle): StyleProp<ViewStyle> {
  const lineHeight = getNumericLineHeight(textMetricsStyle);
  return useMemo(
    () => (lineHeight !== undefined ? inlineUnistylesStyle({ minHeight: lineHeight }) : null),
    [lineHeight],
  );
}

function HighlightedToken({
  token,
}: {
  token: HighlightToken & { searchState: FileSearchTokenState };
}) {
  return (
    <Text
      style={[
        syntaxTokenStyleFor(token.style),
        token.searchState === "match" && styles.searchMatch,
        token.searchState === "current" && styles.currentSearchMatch,
      ]}
    >
      {token.text}
    </Text>
  );
}

function HighlightedText({
  tokens,
  textMetricsStyle,
  wrapLines = false,
  searchMatches = EMPTY_DIFF_SEARCH_MATCHES,
  currentSearchMatchIndex = -1,
  textStyle,
  testID,
}: HighlightedTextProps) {
  const containerStyle = useMemo(
    () => [
      styles.diffTextMetrics,
      textMetricsStyle,
      styles.diffLineText,
      getWrappedTextStyle(wrapLines),
      textStyle,
    ],
    [textMetricsStyle, textStyle, wrapLines],
  );

  const keyedTokens = useMemo(
    () =>
      (searchMatches.length > 0
        ? splitFileSearchTokens({
            tokens,
            matches: searchMatches,
            currentMatchIndex: currentSearchMatchIndex,
          })
        : tokens.map((token) => ({ ...token, searchState: null }))
      ).map((token, index) => ({
        key: `${index}-${token.text}`,
        token,
      })),
    [currentSearchMatchIndex, searchMatches, tokens],
  );

  return (
    <Text style={containerStyle} testID={testID}>
      {keyedTokens.map(({ key, token }) => (
        <HighlightedToken key={key} token={token} />
      ))}
    </Text>
  );
}

interface DiffFileSectionProps {
  file: ParsedDiffFile;
  workspaceFileDragScope?: { serverId: string; workspaceId: string };
  isExpanded: boolean;
  isSelected?: boolean;
  /** Tree indentation level (0 on the flat/mobile path). */
  depth?: number;
  /** Show the muted directory suffix (flat list); false inside the folder tree. */
  showDir?: boolean;
  /** Remove this grouping prefix from the muted directory suffix. */
  directoryPrefix?: string;
  interactive?: boolean;
  onToggle?: (path: string) => void;
  onSelect?: (path: string) => void;
  onFilePress?: (path: string) => void;
  onViewSource?: (file: ParsedDiffFile) => void;
  onOpenFile?: (file: ParsedDiffFile) => void;
  onOpenInPreferredTool?: (file: ParsedDiffFile) => void;
  preferredOpenToolLabel?: string;
  openingPreferredToolPath?: string | null;
  onAddToChat?: (path: string) => void;
  onCopyPath?: (path: string) => void;
  onCopyRelativePath?: (path: string) => void;
  onReveal?: (path: string) => void;
  revealTargetName?: string;
  onDownload?: (path: string) => void;
  isReviewed?: boolean;
  onToggleReviewed?: (file: ParsedDiffFile, reviewed: boolean) => void;
  onDuplicate?: (path: string) => void;
  onRevert?: (path: string, oldPath?: string) => void;
  onHeaderHeightChange?: (path: string, height: number) => void;
  testID?: string;
}

const EMPTY_COMMENTS: readonly ReviewDraftComment[] = [];

function useDiscardChangesAction({
  serverId,
  cwd,
  diffMode,
}: {
  serverId: string;
  cwd: string;
  diffMode: "uncommitted" | "base";
}): ((path: string, oldPath?: string) => void) | undefined {
  const { t } = useTranslation();
  const toast = useToast();
  const discardChanges = useCheckoutGitActionsStore((state) => state.discardChanges);
  // COMPAT(checkoutDiscardChanges): added in v0.3.0, remove gate after 2027-02-08.
  const discardSupported = useSessionStore(
    (s) => s.sessions[serverId]?.serverInfo?.features?.checkoutDiscardChanges === true,
  );
  const discardPath = useCallback(
    async (path: string, oldPath?: string) => {
      const confirmed = await confirmDialog({
        title: t("workspace.fileActions.confirmRevert.title"),
        message: t("workspace.fileActions.confirmRevert.message", { name: path }),
        confirmLabel: t("workspace.fileActions.confirmRevert.confirm"),
        cancelLabel: t("workspace.fileActions.confirmRevert.cancel"),
        destructive: true,
      });
      if (!confirmed) {
        return;
      }
      try {
        await discardChanges({
          serverId,
          cwd,
          paths: oldPath ? [path, oldPath] : [path],
        });
      } catch (cause) {
        toast.error(
          cause instanceof Error ? cause.message : t("workspace.fileActions.confirmRevert.failed"),
        );
      }
    },
    [cwd, discardChanges, serverId, t, toast],
  );
  const handleDiscardPath = useCallback(
    (path: string, oldPath?: string) => {
      void discardPath(path, oldPath);
    },
    [discardPath],
  );
  return discardSupported && diffMode === "uncommitted" ? handleDiscardPath : undefined;
}
const DIFF_LINE_HOVER_STYLE = isWeb ? ({ cursor: "auto" } as const) : null;

function LongPressableLine({
  reviewTarget,
  reviewActions,
  onHoverChange,
  hoverTargetKey,
  onHoverTargetChange,
  style,
  children,
}: {
  reviewTarget: ReviewableDiffTarget | null | undefined;
  reviewActions: InlineReviewActions | undefined;
  onHoverChange?: (hovered: boolean) => void;
  hoverTargetKey?: string | null;
  onHoverTargetChange?: (key: string | null) => void;
  style: StyleProp<ViewStyle>;
  children: ReactNode;
}) {
  const onStartComment = reviewActions?.onStartComment;
  const handlePress = useCallback(() => {
    const selection = isWeb ? window.getSelection() : null;
    if (selection && !selection.isCollapsed && selection.toString().length > 0) {
      return;
    }
    if (reviewTarget && onStartComment) {
      onStartComment(reviewTarget);
    }
  }, [reviewTarget, onStartComment]);

  const handleHoverIn = useCallback(() => {
    onHoverChange?.(true);
    if (hoverTargetKey) {
      onHoverTargetChange?.(hoverTargetKey);
    }
  }, [hoverTargetKey, onHoverChange, onHoverTargetChange]);
  const handleHoverOut = useCallback(() => {
    onHoverChange?.(false);
    if (hoverTargetKey) {
      onHoverTargetChange?.(null);
    }
  }, [hoverTargetKey, onHoverChange, onHoverTargetChange]);
  const hoverStyle = useMemo(() => [style, DIFF_LINE_HOVER_STYLE], [style]);

  if (isWeb && (onHoverChange || onHoverTargetChange)) {
    return (
      <Pressable onHoverIn={handleHoverIn} onHoverOut={handleHoverOut} style={hoverStyle}>
        {children}
      </Pressable>
    );
  }

  if (!isNative || !reviewTarget || !onStartComment) {
    return <View style={style}>{children}</View>;
  }
  return (
    <Pressable onPress={handlePress} style={style}>
      {children}
    </Pressable>
  );
}

function lineTypeBackground(type: DiffLine["type"] | undefined | null) {
  if (!type) return styles.emptySplitCell;
  if (type === "add") return styles.addLineContainer;
  if (type === "remove") return styles.removeLineContainer;
  if (type === "header") return styles.headerLineContainer;
  return styles.contextLineContainer;
}

function getDiffLineSearchMatches(
  search: DiffSearchRenderState | undefined,
  reviewTarget: ReviewableDiffTarget | null | undefined,
): readonly FileSearchMatch[] {
  if (!search || !reviewTarget) {
    return EMPTY_DIFF_SEARCH_MATCHES;
  }
  return (
    search.matchesByLine.get(
      buildDiffSearchLineKey(reviewTarget.hunkIndex, reviewTarget.lineIndex),
    ) ?? EMPTY_DIFF_SEARCH_MATCHES
  );
}

function DiffLineIndicator({
  type,
  textMetricsStyle,
}: {
  type: DiffLine["type"] | undefined | null;
  textMetricsStyle: TextStyle;
}) {
  const { t } = useTranslation();
  if (type !== "add" && type !== "remove") {
    return null;
  }
  const isAddition = type === "add";
  return (
    <Text
      accessible
      accessibilityLabel={t(
        isAddition ? "workspace.git.diff.addedLine" : "workspace.git.diff.deletedLine",
      )}
      style={[
        styles.diffTextMetrics,
        textMetricsStyle,
        styles.diffLineIndicator,
        isAddition ? styles.addLineIndicator : styles.removeLineIndicator,
      ]}
    >
      {isAddition ? "+" : "−"}
    </Text>
  );
}

function DiffGutterCell({
  lineNumber,
  type,
  gutterWidth,
  textMetricsStyle,
  reviewTarget,
  reviewActions,
  isLineHovered,
  style,
  textTestID,
  actionTestID,
}: {
  lineNumber: number | null;
  type: DiffLine["type"] | undefined | null;
  gutterWidth: number;
  textMetricsStyle: TextStyle;
  reviewTarget?: ReviewableDiffTarget | null;
  reviewActions?: InlineReviewActions;
  isLineHovered?: boolean;
  style?: StyleProp<ViewStyle>;
  textTestID?: string;
  actionTestID?: string;
}) {
  const lineHeight = getNumericLineHeight(textMetricsStyle);
  const rowMetricsStyle = useDiffRowMetricsStyle(textMetricsStyle);
  const containerStyle = useMemo(
    () => [
      styles.gutterCell,
      lineTypeBackground(type),
      rowMetricsStyle,
      inlineUnistylesStyle({ width: gutterWidth }),
      style,
    ],
    [type, rowMetricsStyle, gutterWidth, style],
  );
  const textStyle = useMemo(
    () => [
      styles.diffTextMetrics,
      textMetricsStyle,
      styles.lineNumberText,
      type === "add" && styles.addLineNumberText,
      type === "remove" && styles.removeLineNumberText,
    ],
    [textMetricsStyle, type],
  );
  const gutterContent = (
    <View style={styles.gutterContent}>
      <DiffLineIndicator type={type} textMetricsStyle={textMetricsStyle} />
      <Text numberOfLines={1} style={textStyle} testID={textTestID}>
        {formatDiffGutterText(lineNumber)}
      </Text>
    </View>
  );
  const comments = useMemo(
    () =>
      reviewTarget
        ? (reviewActions?.commentsByTarget.get(reviewTarget.key) ?? EMPTY_COMMENTS)
        : EMPTY_COMMENTS,
    [reviewTarget, reviewActions?.commentsByTarget],
  );
  const isEditorOpen = isInlineReviewEditorForTarget(reviewActions?.editor ?? null, reviewTarget);

  if (!reviewActions) {
    return <View style={containerStyle}>{gutterContent}</View>;
  }

  return (
    <InlineReviewGutterCell
      reviewTarget={reviewTarget}
      comments={comments}
      isEditorOpen={isEditorOpen}
      isLineHovered={isLineHovered}
      lineHeight={lineHeight}
      onStartComment={reviewActions.onStartComment}
      style={containerStyle}
      actionTestID={actionTestID}
    >
      {gutterContent}
    </InlineReviewGutterCell>
  );
}

function DiffTextLine({
  line,
  wrapLines,
  textMetricsStyle,
  searchMatches = EMPTY_DIFF_SEARCH_MATCHES,
  currentSearchMatchIndex = -1,
  reviewTarget,
  reviewActions,
  onHoverChange,
  hoverTargetKey,
  onHoverTargetChange,
  onExpandContext,
  contextSourceLineNumber,
  contextTestID,
  textTestID,
}: {
  line: DiffLine;
  wrapLines: boolean;
  textMetricsStyle: TextStyle;
  searchMatches?: readonly FileSearchMatch[];
  currentSearchMatchIndex?: number;
  reviewTarget?: ReviewableDiffTarget | null;
  reviewActions?: InlineReviewActions;
  onHoverChange?: (hovered: boolean) => void;
  hoverTargetKey?: string | null;
  onHoverTargetChange?: (key: string | null) => void;
  onExpandContext?: (sourceLineNumber: number) => void;
  contextSourceLineNumber?: number | null;
  contextTestID?: string;
  textTestID?: string;
}) {
  const visibleTokens = hasVisibleDiffTokens(line.tokens) ? line.tokens : null;
  const rowMetricsStyle = useDiffRowMetricsStyle(textMetricsStyle);

  const containerStyle = useMemo(
    () => [styles.textLineContainer, lineTypeBackground(line.type), rowMetricsStyle],
    [line.type, rowMetricsStyle],
  );
  const textStyle = useMemo(
    () => [
      styles.diffTextMetrics,
      textMetricsStyle,
      styles.diffLineText,
      getWrappedTextStyle(wrapLines),
      line.type === "add" && styles.addLineText,
      line.type === "remove" && styles.removeLineText,
      line.type === "header" && styles.headerLineText,
      line.type === "context" && styles.contextLineText,
    ],
    [line.type, textMetricsStyle, wrapLines],
  );
  let lineContent: ReactNode;
  if (line.type === "header") {
    lineContent = (
      <DiffContextExpander
        content={formatDiffContentText(line.content)}
        textStyle={textStyle}
        onPress={onExpandContext}
        sourceLineNumber={contextSourceLineNumber}
        testID={contextTestID}
      />
    );
  } else if (visibleTokens) {
    lineContent = (
      <HighlightedText
        tokens={visibleTokens}
        textMetricsStyle={textMetricsStyle}
        wrapLines={wrapLines}
        searchMatches={searchMatches}
        currentSearchMatchIndex={currentSearchMatchIndex}
        testID={textTestID}
      />
    );
  } else if (searchMatches.length > 0) {
    lineContent = (
      <HighlightedText
        tokens={[{ text: formatDiffContentText(line.content), style: null }]}
        textMetricsStyle={textMetricsStyle}
        wrapLines={wrapLines}
        searchMatches={searchMatches}
        currentSearchMatchIndex={currentSearchMatchIndex}
        textStyle={textStyle}
        testID={textTestID}
      />
    );
  } else {
    lineContent = (
      <Text style={textStyle} testID={textTestID}>
        {formatDiffContentText(line.content)}
      </Text>
    );
  }

  return (
    <LongPressableLine
      reviewTarget={reviewTarget}
      reviewActions={reviewActions}
      onHoverChange={onHoverChange}
      hoverTargetKey={hoverTargetKey}
      onHoverTargetChange={onHoverTargetChange}
      style={containerStyle}
    >
      {lineContent}
    </LongPressableLine>
  );
}

function DiffContextExpander({
  content,
  textStyle,
  onPress,
  sourceLineNumber,
  testID,
}: {
  content: string;
  textStyle: StyleProp<TextStyle>;
  onPress?: (sourceLineNumber: number) => void;
  sourceLineNumber?: number | null;
  testID?: string;
}) {
  const { t } = useTranslation();
  const handlePress = useCallback(() => {
    if (sourceLineNumber) {
      onPress?.(sourceLineNumber);
    }
  }, [onPress, sourceLineNumber]);
  if (!onPress || !sourceLineNumber) {
    return <Text style={textStyle}>{content}</Text>;
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t("workspace.git.diff.viewInSource")}
      hitSlop={DIFF_CONTROL_HIT_SLOP}
      onPress={handlePress}
      style={styles.diffContextExpander}
      testID={testID}
    >
      <Text style={textStyle}>{content}</Text>
      <Text style={styles.diffContextExpandLabel}>{t("workspace.git.diff.viewInSource")}</Text>
    </Pressable>
  );
}

function SplitTextLine({
  line,
  wrapLines,
  textMetricsStyle,
  searchMatches = EMPTY_DIFF_SEARCH_MATCHES,
  currentSearchMatchIndex = -1,
  reviewActions,
  onHoverChange,
  hoverTargetKey,
  onHoverTargetChange,
}: {
  line: SplitDiffDisplayLine | null;
  wrapLines: boolean;
  textMetricsStyle: TextStyle;
  searchMatches?: readonly FileSearchMatch[];
  currentSearchMatchIndex?: number;
  reviewActions?: InlineReviewActions;
  onHoverChange?: (hovered: boolean) => void;
  hoverTargetKey?: string | null;
  onHoverTargetChange?: (key: string | null) => void;
}) {
  const visibleTokens = line && hasVisibleDiffTokens(line.tokens) ? line.tokens : null;
  const rowMetricsStyle = useDiffRowMetricsStyle(textMetricsStyle);

  const containerStyle = useMemo(
    () => [styles.textLineContainer, lineTypeBackground(line?.type), rowMetricsStyle],
    [line?.type, rowMetricsStyle],
  );
  const textStyle = useMemo(
    () => [
      styles.diffTextMetrics,
      textMetricsStyle,
      styles.diffLineText,
      getWrappedTextStyle(wrapLines),
      line?.type === "add" && styles.addLineText,
      line?.type === "remove" && styles.removeLineText,
      line?.type === "context" && styles.contextLineText,
      !line && styles.emptySplitCellText,
    ],
    [line, textMetricsStyle, wrapLines],
  );

  return (
    <LongPressableLine
      reviewTarget={line?.reviewTarget}
      reviewActions={reviewActions}
      onHoverChange={onHoverChange}
      hoverTargetKey={hoverTargetKey}
      onHoverTargetChange={onHoverTargetChange}
      style={containerStyle}
    >
      {visibleTokens || (line && searchMatches.length > 0) ? (
        <HighlightedText
          tokens={visibleTokens ?? [{ text: formatDiffContentText(line?.content), style: null }]}
          textMetricsStyle={textMetricsStyle}
          wrapLines={wrapLines}
          searchMatches={searchMatches}
          currentSearchMatchIndex={currentSearchMatchIndex}
          textStyle={textStyle}
        />
      ) : (
        <Text style={textStyle}>{formatDiffContentText(line?.content)}</Text>
      )}
    </LongPressableLine>
  );
}

function DiffLineView({
  line,
  lineNumber,
  gutterWidth,
  wrapLines,
  textMetricsStyle,
  searchMatches = EMPTY_DIFF_SEARCH_MATCHES,
  currentSearchMatchIndex = -1,
  reviewTarget,
  reviewActions,
  onExpandContext,
  contextSourceLineNumber,
  contextTestID,
}: {
  line: DiffLine;
  lineNumber: number | null;
  gutterWidth: number;
  wrapLines: boolean;
  textMetricsStyle: TextStyle;
  searchMatches?: readonly FileSearchMatch[];
  currentSearchMatchIndex?: number;
  reviewTarget?: ReviewableDiffTarget | null;
  reviewActions?: InlineReviewActions;
  onExpandContext?: (sourceLineNumber: number) => void;
  contextSourceLineNumber?: number | null;
  contextTestID?: string;
}) {
  const [isLineHovered, setIsLineHovered] = useState(false);
  const visibleTokens = hasVisibleDiffTokens(line.tokens) ? line.tokens : null;
  const rowMetricsStyle = useDiffRowMetricsStyle(textMetricsStyle);

  const containerStyle = useMemo(
    () => [styles.diffLineContainer, lineTypeBackground(line.type), rowMetricsStyle],
    [line.type, rowMetricsStyle],
  );
  const textStyle = useMemo(
    () => [
      styles.diffTextMetrics,
      textMetricsStyle,
      styles.diffLineText,
      getWrappedTextStyle(wrapLines),
      line.type === "add" && styles.addLineText,
      line.type === "remove" && styles.removeLineText,
      line.type === "header" && styles.headerLineText,
      line.type === "context" && styles.contextLineText,
    ],
    [line.type, textMetricsStyle, wrapLines],
  );
  let lineContent: ReactNode;
  if (line.type === "header") {
    lineContent = (
      <DiffContextExpander
        content={formatDiffContentText(line.content)}
        textStyle={textStyle}
        onPress={onExpandContext}
        sourceLineNumber={contextSourceLineNumber}
        testID={contextTestID}
      />
    );
  } else if (visibleTokens) {
    lineContent = (
      <HighlightedText
        tokens={visibleTokens}
        textMetricsStyle={textMetricsStyle}
        wrapLines={wrapLines}
        searchMatches={searchMatches}
        currentSearchMatchIndex={currentSearchMatchIndex}
      />
    );
  } else if (searchMatches.length > 0) {
    lineContent = (
      <HighlightedText
        tokens={[{ text: formatDiffContentText(line.content), style: null }]}
        textMetricsStyle={textMetricsStyle}
        wrapLines={wrapLines}
        searchMatches={searchMatches}
        currentSearchMatchIndex={currentSearchMatchIndex}
        textStyle={textStyle}
      />
    );
  } else {
    lineContent = <Text style={textStyle}>{formatDiffContentText(line.content)}</Text>;
  }

  return (
    <LongPressableLine
      reviewTarget={reviewTarget}
      reviewActions={reviewActions}
      onHoverChange={setIsLineHovered}
      style={containerStyle}
    >
      <DiffGutterCell
        lineNumber={lineNumber}
        type={line.type}
        gutterWidth={gutterWidth}
        textMetricsStyle={textMetricsStyle}
        reviewTarget={reviewTarget}
        reviewActions={reviewActions}
        isLineHovered={isLineHovered}
        style={styles.lineNumberGutter}
      />
      {lineContent}
    </LongPressableLine>
  );
}

function SplitDiffLine({
  line,
  gutterWidth,
  wrapLines,
  textMetricsStyle,
  searchMatches = EMPTY_DIFF_SEARCH_MATCHES,
  currentSearchMatchIndex = -1,
  reviewActions,
}: {
  line: SplitDiffDisplayLine | null;
  gutterWidth: number;
  wrapLines: boolean;
  textMetricsStyle: TextStyle;
  searchMatches?: readonly FileSearchMatch[];
  currentSearchMatchIndex?: number;
  reviewActions?: InlineReviewActions;
}) {
  const [isLineHovered, setIsLineHovered] = useState(false);
  const visibleTokens = line && hasVisibleDiffTokens(line.tokens) ? line.tokens : null;
  const rowMetricsStyle = useDiffRowMetricsStyle(textMetricsStyle);

  const containerStyle = useMemo(
    () => [styles.diffLineContainer, lineTypeBackground(line?.type), rowMetricsStyle],
    [line?.type, rowMetricsStyle],
  );
  const textStyle = useMemo(
    () => [
      styles.diffTextMetrics,
      textMetricsStyle,
      styles.diffLineText,
      getWrappedTextStyle(wrapLines),
      line?.type === "add" && styles.addLineText,
      line?.type === "remove" && styles.removeLineText,
      line?.type === "context" && styles.contextLineText,
      !line && styles.emptySplitCellText,
    ],
    [line, textMetricsStyle, wrapLines],
  );

  return (
    <LongPressableLine
      reviewTarget={line?.reviewTarget}
      reviewActions={reviewActions}
      onHoverChange={setIsLineHovered}
      style={containerStyle}
    >
      <DiffGutterCell
        lineNumber={line?.lineNumber ?? null}
        type={line?.type}
        gutterWidth={gutterWidth}
        textMetricsStyle={textMetricsStyle}
        reviewTarget={line?.reviewTarget}
        reviewActions={reviewActions}
        isLineHovered={isLineHovered}
        style={styles.lineNumberGutter}
      />
      {visibleTokens || (line && searchMatches.length > 0) ? (
        <HighlightedText
          tokens={visibleTokens ?? [{ text: formatDiffContentText(line?.content), style: null }]}
          textMetricsStyle={textMetricsStyle}
          wrapLines={wrapLines}
          searchMatches={searchMatches}
          currentSearchMatchIndex={currentSearchMatchIndex}
          textStyle={textStyle}
        />
      ) : (
        <Text style={textStyle}>{formatDiffContentText(line?.content)}</Text>
      )}
    </LongPressableLine>
  );
}

function InlineReviewThreadContent({
  reviewTarget,
  reviewActions,
  reservedHeight,
  viewportWidth,
  pinToViewport,
}: {
  reviewTarget: ReviewableDiffTarget | null | undefined;
  reviewActions?: InlineReviewActions;
  reservedHeight?: number;
  viewportWidth?: number;
  pinToViewport?: boolean;
}) {
  const threadState = getInlineReviewThreadState({ reviewTarget, reviewActions });
  const height = reservedHeight ?? threadState?.height ?? 0;
  const placeholderStyle = useMemo<ViewStyle>(
    () => inlineUnistylesStyle({ minHeight: height }),
    [height],
  );
  if (height === 0) {
    return null;
  }
  if (!reviewTarget || !reviewActions || !threadState) {
    return <View style={placeholderStyle} />;
  }

  return (
    <InlineReviewThread
      reviewTarget={reviewTarget}
      reviewActions={reviewActions}
      height={height}
      viewportWidth={viewportWidth}
      pinToViewport={pinToViewport}
      testID={`review-thread-${reviewTarget.key}`}
    />
  );
}

function InlineReviewGutterSpacer({
  reviewTarget,
  reviewActions,
  gutterWidth,
  reservedHeight,
  style,
}: {
  reviewTarget: ReviewableDiffTarget | null | undefined;
  reviewActions?: InlineReviewActions;
  gutterWidth: number;
  reservedHeight?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const threadState = getInlineReviewThreadState({ reviewTarget, reviewActions });
  const height = reservedHeight ?? threadState?.height ?? 0;
  const spacerStyle = useMemo<StyleProp<ViewStyle>>(
    () => [
      styles.inlineReviewGutterSpacer,
      inlineUnistylesStyle({ width: gutterWidth, minHeight: height }),
      style,
    ],
    [gutterWidth, height, style],
  );
  if (height === 0) {
    return null;
  }

  return <View style={spacerStyle} />;
}

function InlineReviewRow({
  reviewTarget,
  reviewActions,
  gutterWidth,
  reservedHeight,
}: {
  reviewTarget: ReviewableDiffTarget | null | undefined;
  reviewActions?: InlineReviewActions;
  gutterWidth: number;
  reservedHeight?: number;
}) {
  const threadState = getInlineReviewThreadState({ reviewTarget, reviewActions });
  const height = reservedHeight ?? threadState?.height ?? 0;
  const gutterSpacerStyle = useMemo<StyleProp<ViewStyle>>(
    () => [styles.inlineReviewGutterSpacer, inlineUnistylesStyle({ width: gutterWidth })],
    [gutterWidth],
  );
  const placeholderStyle = useMemo<ViewStyle>(
    () => inlineUnistylesStyle({ minHeight: height }),
    [height],
  );
  if (height === 0) {
    return null;
  }

  return (
    <View style={styles.inlineReviewRow}>
      <View style={gutterSpacerStyle} />
      {reviewTarget && reviewActions && threadState ? (
        <InlineReviewThread
          reviewTarget={reviewTarget}
          reviewActions={reviewActions}
          height={height}
          testID={`review-thread-${reviewTarget.key}`}
        />
      ) : (
        <View style={placeholderStyle} />
      )}
    </View>
  );
}

function SplitDiffColumn({
  rows,
  side,
  gutterWidth,
  wrapLines,
  textMetricsStyle,
  search,
  reviewActions,
  onExpandContext,
  showDivider = false,
}: {
  rows: SplitDiffRow[];
  side: "left" | "right";
  gutterWidth: number;
  wrapLines: boolean;
  textMetricsStyle: TextStyle;
  search?: DiffSearchRenderState;
  reviewActions?: InlineReviewActions;
  onExpandContext?: (sourceLineNumber: number) => void;
  showDivider?: boolean;
}) {
  const [scrollWidth, setScrollWidth] = useState(0);
  const [hoveredReviewTargetKey, setHoveredReviewTargetKey] = useState<string | null>(null);

  const wrapCellStyle = useMemo(
    () => [styles.splitCell, showDivider && styles.splitCellWithDivider],
    [showDivider],
  );
  const rowCellStyle = useMemo(
    () => [styles.splitCell, showDivider && styles.splitCellWithDivider, styles.splitCellRow],
    [showDivider],
  );
  const linesContainerRowStyle = useMemo(
    () => [
      styles.linesContainer,
      scrollWidth > 0 && inlineUnistylesStyle({ minWidth: scrollWidth }),
    ],
    [scrollWidth],
  );
  const headerLineTextStyle = useMemo(
    () => [styles.diffTextMetrics, textMetricsStyle, styles.diffLineText, styles.headerLineText],
    [textMetricsStyle],
  );

  const keyedRows = useMemo(() => rows.map((row, i) => ({ key: `row-${i}`, row })), [rows]);

  if (wrapLines) {
    return (
      <View style={wrapCellStyle}>
        <View style={styles.linesContainer}>
          {keyedRows.map(({ key, row }) => {
            if (row.kind === "header") {
              return (
                <View key={key} style={styles.splitHeaderRow}>
                  <DiffContextExpander
                    content={row.content}
                    textStyle={headerLineTextStyle}
                    onPress={onExpandContext}
                    sourceLineNumber={row.sourceLineNumber}
                    testID={`diff-expand-context-${side}-${key}`}
                  />
                </View>
              );
            }
            const line = side === "left" ? row.left : row.right;
            const reviewRowState = getSplitInlineReviewThreadState({
              left: row.left?.reviewTarget,
              right: row.right?.reviewTarget,
              reviewActions,
            });
            return (
              <View key={key}>
                <SplitDiffLine
                  line={line}
                  gutterWidth={gutterWidth}
                  wrapLines={wrapLines}
                  textMetricsStyle={textMetricsStyle}
                  searchMatches={getDiffLineSearchMatches(search, line?.reviewTarget)}
                  currentSearchMatchIndex={search?.currentMatchIndex}
                  reviewActions={reviewActions}
                />
                <InlineReviewRow
                  reviewTarget={line?.reviewTarget}
                  reviewActions={reviewActions}
                  gutterWidth={gutterWidth}
                  reservedHeight={reviewRowState?.height}
                />
              </View>
            );
          })}
        </View>
      </View>
    );
  }

  return (
    <View style={rowCellStyle}>
      <View style={styles.gutterColumn}>
        {keyedRows.map(({ key, row }) => {
          if (row.kind === "header") {
            return (
              <DiffGutterCell
                key={key}
                lineNumber={null}
                type="header"
                gutterWidth={gutterWidth}
                textMetricsStyle={textMetricsStyle}
              />
            );
          }
          const line = side === "left" ? row.left : row.right;
          const reviewTargetKey = line?.reviewTarget?.key ?? null;
          const reviewRowState = getSplitInlineReviewThreadState({
            left: row.left?.reviewTarget,
            right: row.right?.reviewTarget,
            reviewActions,
          });
          return (
            <View key={key}>
              <DiffGutterCell
                lineNumber={line?.lineNumber ?? null}
                type={line?.type}
                gutterWidth={gutterWidth}
                textMetricsStyle={textMetricsStyle}
                reviewTarget={line?.reviewTarget}
                reviewActions={reviewActions}
                isLineHovered={
                  reviewTargetKey !== null && hoveredReviewTargetKey === reviewTargetKey
                }
              />
              <InlineReviewGutterSpacer
                reviewTarget={line?.reviewTarget}
                reviewActions={reviewActions}
                gutterWidth={gutterWidth}
                reservedHeight={reviewRowState?.height}
              />
            </View>
          );
        })}
      </View>
      <DiffScroll
        scrollViewWidth={scrollWidth}
        onScrollViewWidthChange={setScrollWidth}
        style={styles.splitColumnScroll}
        contentContainerStyle={styles.diffContentInner}
      >
        <View style={linesContainerRowStyle}>
          {keyedRows.map(({ key, row }) => {
            if (row.kind === "header") {
              return (
                <View key={key} style={styles.splitHeaderRow}>
                  <DiffContextExpander
                    content={row.content}
                    textStyle={headerLineTextStyle}
                    onPress={onExpandContext}
                    sourceLineNumber={row.sourceLineNumber}
                    testID={`diff-expand-context-${side}-${key}`}
                  />
                </View>
              );
            }
            const line = side === "left" ? row.left : row.right;
            const reviewTargetKey = line?.reviewTarget?.key ?? null;
            const reviewRowState = getSplitInlineReviewThreadState({
              left: row.left?.reviewTarget,
              right: row.right?.reviewTarget,
              reviewActions,
            });
            return (
              <View key={key}>
                <SplitTextLine
                  line={line}
                  wrapLines={false}
                  textMetricsStyle={textMetricsStyle}
                  searchMatches={getDiffLineSearchMatches(search, line?.reviewTarget)}
                  currentSearchMatchIndex={search?.currentMatchIndex}
                  reviewActions={reviewActions}
                  hoverTargetKey={reviewTargetKey}
                  onHoverTargetChange={setHoveredReviewTargetKey}
                />
                <InlineReviewThreadContent
                  reviewTarget={line?.reviewTarget}
                  reviewActions={reviewActions}
                  reservedHeight={reviewRowState?.height}
                  viewportWidth={scrollWidth}
                  pinToViewport
                />
              </View>
            );
          })}
        </View>
      </DiffScroll>
    </View>
  );
}

function DiffFileOpenButton({
  label,
  testID,
  onPress,
  icon,
  disabled = false,
  isPending = false,
}: {
  label: string;
  testID?: string;
  onPress: (event: GestureResponderEvent) => void;
  icon: "external" | "file" | "source";
  disabled?: boolean;
  isPending?: boolean;
}) {
  let content: ReactElement;
  if (isPending) {
    content = <ThemedLoadingSpinner size="small" uniProps={foregroundMutedIconColorMapping} />;
  } else if (icon === "external") {
    content = <ThemedExternalLink size={14} uniProps={foregroundMutedIconColorMapping} />;
  } else if (icon === "source") {
    content = <ThemedFileCode2 size={14} uniProps={foregroundMutedIconColorMapping} />;
  } else {
    content = <ThemedFileText size={14} uniProps={foregroundMutedIconColorMapping} />;
  }
  const accessibilityState = useMemo(() => ({ disabled }), [disabled]);
  const buttonStyle = useCallback(
    (state: PressableStateCallbackType) => [
      ...fileOpenButtonStyle(state),
      disabled && styles.fileOpenButtonDisabled,
    ],
    [disabled],
  );

  return (
    <Tooltip delayDuration={300}>
      <TooltipTrigger asChild>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={label}
          accessibilityState={accessibilityState}
          hitSlop={DIFF_CONTROL_HIT_SLOP}
          testID={testID}
          style={buttonStyle}
          onPress={onPress}
          disabled={disabled}
        >
          {content}
        </Pressable>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        <Text style={styles.tooltipText}>{label}</Text>
      </TooltipContent>
    </Tooltip>
  );
}

function DiffFileActionsContextMenuContent({
  file,
  onOpenFile,
  onAddToChat,
  onCopyPath,
  onCopyRelativePath,
  onReveal,
  revealTargetName,
  onDownload,
  onDuplicate,
  onRevert,
  testID,
}: Pick<
  DiffFileSectionProps,
  | "file"
  | "onOpenFile"
  | "onAddToChat"
  | "onCopyPath"
  | "onCopyRelativePath"
  | "onReveal"
  | "revealTargetName"
  | "onDownload"
  | "onDuplicate"
  | "onRevert"
  | "testID"
>) {
  const handleOpenFile = useCallback(() => onOpenFile?.(file), [file, onOpenFile]);
  const handleAddToChat = useCallback(() => onAddToChat?.(file.path), [file.path, onAddToChat]);
  const handleCopyPath = useCallback(() => onCopyPath?.(file.path), [file.path, onCopyPath]);
  const handleCopyRelativePath = useCallback(
    () => onCopyRelativePath?.(file.path),
    [file.path, onCopyRelativePath],
  );
  const handleReveal = useCallback(() => onReveal?.(file.path), [file.path, onReveal]);
  const handleDownload = useCallback(() => onDownload?.(file.path), [file.path, onDownload]);
  const handleDuplicate = useCallback(() => onDuplicate?.(file.path), [file.path, onDuplicate]);
  const handleRevert = useCallback(
    () => onRevert?.(file.path, file.oldPath),
    [file.oldPath, file.path, onRevert],
  );

  return (
    <FileActionsContextMenuContent
      fileKind="file"
      fileExists={!file.isDeleted}
      onOpenFile={onOpenFile ? handleOpenFile : undefined}
      onCopyPath={onCopyPath ? handleCopyPath : undefined}
      onCopyRelativePath={onCopyRelativePath ? handleCopyRelativePath : undefined}
      onReveal={onReveal ? handleReveal : undefined}
      revealTargetName={revealTargetName}
      onDownload={onDownload ? handleDownload : undefined}
      onAddToChat={onAddToChat ? handleAddToChat : undefined}
      onDuplicate={!file.isDeleted && onDuplicate ? handleDuplicate : undefined}
      onRevert={onRevert ? handleRevert : undefined}
      testIDPrefix={testID}
    />
  );
}

// The file header keeps expansion and file opening on separate press targets.
// oxlint-disable-next-line complexity
const DiffFileHeader = memo(function DiffFileHeader({
  file,
  workspaceFileDragScope,
  isExpanded,
  isSelected = false,
  depth = 0,
  showDir = true,
  directoryPrefix,
  interactive = true,
  onToggle,
  onSelect,
  onFilePress,
  onViewSource,
  onOpenFile,
  onOpenInPreferredTool,
  preferredOpenToolLabel,
  openingPreferredToolPath,
  onAddToChat,
  onCopyPath,
  onCopyRelativePath,
  onReveal,
  revealTargetName,
  onDownload,
  isReviewed = false,
  onToggleReviewed,
  onDuplicate,
  onRevert,
  onHeaderHeightChange,
  testID,
}: DiffFileSectionProps) {
  const { t } = useTranslation();
  const dragSourceRef = useWorkspaceFileDragSource({
    enabled: interactive,
    disabled: file.isDeleted,
    workspaceId: null,
    path: file.path,
    ...workspaceFileDragScope,
  });
  const [isActionsOpen, setIsActionsOpen] = useState(false);
  const reviewedAccessibilityState = useMemo(() => ({ checked: isReviewed }), [isReviewed]);
  const expandedAccessibilityState = useMemo(() => ({ expanded: isExpanded }), [isExpanded]);
  const triggerAccessibilityState = useMemo(
    () => ({ expanded: isExpanded, selected: isSelected }),
    [isExpanded, isSelected],
  );

  const toggleExpanded = useCallback(
    (event: GestureResponderEvent) => {
      if (!interactive) {
        return;
      }
      event.stopPropagation();
      onToggle?.(file.path);
    },
    [file.path, interactive, onToggle],
  );
  const handleSelect = useCallback(() => {
    onSelect?.(file.path);
  }, [file.path, onSelect]);
  const handleFilePress = useCallback(
    (event: GestureResponderEvent) => {
      event.stopPropagation();
      onFilePress?.(file.path);
    },
    [file.path, onFilePress],
  );
  const handleViewSourcePress = useCallback(
    (event: GestureResponderEvent) => {
      event.stopPropagation();
      onViewSource?.(file);
    },
    [file, onViewSource],
  );
  const handleOpenInPreferredTool = useCallback(
    (event: GestureResponderEvent) => {
      event.stopPropagation();
      onOpenInPreferredTool?.(file);
    },
    [file, onOpenInPreferredTool],
  );

  const handleOpenFileMenu = useCallback(() => {
    onOpenFile?.(file);
  }, [file, onOpenFile]);

  const handleAddToChat = useCallback(() => {
    onAddToChat?.(file.path);
  }, [file.path, onAddToChat]);

  const handleCopyPath = useCallback(() => {
    onCopyPath?.(file.path);
  }, [file.path, onCopyPath]);

  const handleDownload = useCallback(() => {
    onDownload?.(file.path);
  }, [file.path, onDownload]);
  const handleToggleReviewed = useCallback(
    (event: GestureResponderEvent) => {
      event.stopPropagation();
      onToggleReviewed?.(file, !isReviewed);
    },
    [file, isReviewed, onToggleReviewed],
  );

  const handleLayout = useCallback(
    (event: LayoutChangeEvent) => {
      onHeaderHeightChange?.(file.path, event.nativeEvent.layout.height);
    },
    [file.path, onHeaderHeightChange],
  );

  const containerStyle = useMemo(
    () => [styles.fileSectionHeaderContainer, isExpanded && styles.fileSectionHeaderExpanded],
    [isExpanded],
  );
  const headerStyle = useMemo(
    () => [
      styles.fileHeader,
      isSelected && styles.fileHeaderHovered,
      depth > 0 && inlineUnistylesStyle({ paddingLeft: treeRowPaddingLeft(depth) }),
    ],
    [depth, isSelected],
  );
  const headerTriggerStyle = useCallback(
    ({ hovered, pressed }: PressableStateCallbackType & { hovered?: boolean }) => [
      headerStyle,
      (Boolean(hovered) || pressed) && styles.fileHeaderHovered,
    ],
    [headerStyle],
  );
  const viewSourceLabel = t("workspace.git.diff.viewInSource");

  const fileName = file.path.split("/").pop() ?? file.path;
  const openInPreferredToolLabel = preferredOpenToolLabel
    ? t("workspace.git.openInEditor.openFileIn", {
        fileName,
        target: preferredOpenToolLabel,
      })
    : null;
  const isPreferredToolOpening = openingPreferredToolPath === file.path;
  const isPreferredToolOpenPending = typeof openingPreferredToolPath === "string";
  const displayDirectory = useMemo(() => {
    if (!showDir || !file.path.includes("/")) {
      return "";
    }
    const parentDirectory = file.path.slice(0, file.path.lastIndexOf("/"));
    if (!directoryPrefix) {
      return parentDirectory;
    }
    if (parentDirectory === directoryPrefix) {
      return "";
    }
    const nestedPrefix = `${directoryPrefix}/`;
    return parentDirectory.startsWith(nestedPrefix)
      ? parentDirectory.slice(nestedPrefix.length)
      : parentDirectory;
  }, [directoryPrefix, file.path, showDir]);
  const fileContent = (
    <View ref={dragSourceRef} style={styles.fileHeaderLeft}>
      <View style={styles.fileIcon}>
        <SvgXml xml={getFileIconSvg(fileName)} width={16} height={16} />
      </View>
      <Text style={styles.fileName} numberOfLines={1}>
        {fileName}
      </Text>
      {showDir ? (
        <Text style={styles.fileDir} numberOfLines={1}>
          {displayDirectory ? ` ${displayDirectory}` : ""}
        </Text>
      ) : (
        // Flex spacer in tree mode (no dir suffix) so the New/Deleted badge
        // stays right-aligned next to the diff stats, as in the flat list.
        <View style={styles.fileDirSpacer} />
      )}
      {file.isNew && (
        <View style={styles.newBadge}>
          <Text style={styles.newBadgeText}>{t("workspace.git.diff.newFile")}</Text>
        </View>
      )}
      {file.isDeleted && (
        <View style={styles.deletedBadge}>
          <Text style={styles.deletedBadgeText}>{t("workspace.git.diff.deletedFile")}</Text>
        </View>
      )}
    </View>
  );
  const fileTarget = onFilePress ? (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={fileName}
      // Android: prevent parent pan/scroll gestures from canceling the tap release.
      cancelable={false}
      onPress={handleFilePress}
      style={fileHeaderFileTargetStyle}
      testID={testID ? `${testID}-file` : undefined}
    >
      {fileContent}
    </Pressable>
  ) : (
    <View style={styles.fileHeaderFileTarget}>{fileContent}</View>
  );
  const headerContent = (
    <>
      {interactive ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={fileName}
          accessibilityState={expandedAccessibilityState}
          hitSlop={DIFF_CONTROL_HIT_SLOP}
          // Android: prevent parent pan/scroll gestures from canceling the tap release.
          cancelable={false}
          onPress={toggleExpanded}
          aria-selected={isSelected}
          testID={testID ? `${testID}-toggle` : undefined}
          style={styles.fileExpandButton}
        >
          <TreeChevron expanded={isExpanded} />
        </Pressable>
      ) : (
        <View style={styles.fileExpandButton}>
          <TreeChevron expanded={isExpanded} />
        </View>
      )}
      {fileTarget}
      <View style={styles.fileHeaderRight}>
        {onToggleReviewed ? (
          <Tooltip delayDuration={300}>
            <TooltipTrigger asChild>
              <Pressable
                accessibilityRole="checkbox"
                accessibilityState={reviewedAccessibilityState}
                accessibilityLabel={t(
                  isReviewed
                    ? "workspace.git.diff.markFileUnreviewed"
                    : "workspace.git.diff.markFileReviewed",
                )}
                hitSlop={DIFF_CONTROL_HIT_SLOP}
                style={fileOpenButtonStyle}
                onPress={handleToggleReviewed}
                testID={testID ? `${testID}-reviewed` : undefined}
              >
                <ThemedCheckCircle2
                  size={14}
                  uniProps={isReviewed ? successIconColorMapping : foregroundMutedIconColorMapping}
                />
              </Pressable>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              <Text style={styles.tooltipText}>
                {t(
                  isReviewed
                    ? "workspace.git.diff.markFileUnreviewed"
                    : "workspace.git.diff.markFileReviewed",
                )}
              </Text>
            </TooltipContent>
          </Tooltip>
        ) : null}
        {onOpenInPreferredTool && openInPreferredToolLabel ? (
          <DiffFileOpenButton
            label={openInPreferredToolLabel}
            testID={testID ? `${testID}-open-in-preferred-tool` : undefined}
            onPress={handleOpenInPreferredTool}
            icon="external"
            disabled={isPreferredToolOpenPending}
            isPending={isPreferredToolOpening}
          />
        ) : null}
        {onViewSource ? (
          <DiffFileOpenButton
            label={viewSourceLabel}
            testID={testID ? `${testID}-view-source` : undefined}
            onPress={handleViewSourcePress}
            icon="source"
          />
        ) : null}
        <DiffStat
          additions={file.additions}
          deletions={file.deletions}
          testID={testID ? `${testID}-stat` : undefined}
        />
        {interactive ? (
          <FileActionsMenu
            fileKind="file"
            fileExists={!file.isDeleted}
            onOpenFile={onOpenFile ? handleOpenFileMenu : undefined}
            onCopyPath={onCopyPath ? handleCopyPath : undefined}
            onDownload={onDownload ? handleDownload : undefined}
            onAddToChat={onAddToChat ? handleAddToChat : undefined}
            open={isActionsOpen}
            onOpenChange={setIsActionsOpen}
            accessibilityLabel={t("workspace.fileActions.moreActions")}
            testIDPrefix={testID}
          />
        ) : null}
      </View>
    </>
  );

  const trigger = interactive ? (
    <ContextMenuTrigger
      style={headerTriggerStyle}
      // Android: prevent parent pan/scroll gestures from canceling the tap release.
      cancelable={false}
      onPressIn={handleSelect}
      onLongPress={handleSelect}
      onContextMenu={handleSelect}
      accessibilityState={triggerAccessibilityState}
    >
      {headerContent}
    </ContextMenuTrigger>
  ) : (
    <View style={headerStyle}>{headerContent}</View>
  );

  return (
    <View style={containerStyle} onLayout={handleLayout} testID={testID}>
      <TreeIndentGuides depth={depth} />
      <ContextMenu>
        <Tooltip delayDuration={300} enabledOnDesktop enabledOnMobile={false}>
          <TooltipTrigger asChild>{trigger}</TooltipTrigger>
          <TooltipContent side="bottom" align="start" offset={6} maxWidth={520}>
            <Text style={styles.tooltipText}>{file.path}</Text>
          </TooltipContent>
        </Tooltip>
        {interactive ? (
          <DiffFileActionsContextMenuContent
            file={file}
            onOpenFile={onOpenFile}
            onAddToChat={onAddToChat}
            onCopyPath={onCopyPath}
            onCopyRelativePath={onCopyRelativePath}
            onReveal={onReveal}
            revealTargetName={revealTargetName}
            onDownload={onDownload}
            onDuplicate={onDuplicate}
            onRevert={onRevert}
            testID={testID}
          />
        ) : null}
      </ContextMenu>
    </View>
  );
});

export function DiffFileBody({
  file,
  search,
  layout,
  wrapLines,
  showHunkHeaders = true,
  codeFontSize,
  textMetricsStyle,
  reviewActions,
  onExpandContext,
  onBodyHeightChange,
  testID,
}: {
  file: ParsedDiffFile;
  search?: DiffSearchRenderState;
  layout: "unified" | "split";
  wrapLines: boolean;
  showHunkHeaders?: boolean;
  codeFontSize: number;
  textMetricsStyle: TextStyle;
  reviewActions?: InlineReviewActions;
  onExpandContext?: (sourceLineNumber: number) => void;
  onBodyHeightChange?: (file: ParsedDiffFile, height: number) => void;
  testID?: string;
}) {
  const [scrollViewWidth, setScrollViewWidth] = useState(0);
  const [bodyWidth, setBodyWidth] = useState(0);
  const [hoveredReviewTargetKey, setHoveredReviewTargetKey] = useState<string | null>(null);
  const { t } = useTranslation();

  const handleLayout = useCallback(
    (event: LayoutChangeEvent) => {
      setBodyWidth(event.nativeEvent.layout.width);
      onBodyHeightChange?.(file, event.nativeEvent.layout.height);
    },
    [file, onBodyHeightChange],
  );

  const availableWidth = bodyWidth > 0 ? bodyWidth : scrollViewWidth;
  const linesContainerRowStyle = useMemo(
    () => [
      styles.linesContainer,
      availableWidth > 0 && inlineUnistylesStyle({ minWidth: availableWidth }),
    ],
    [availableWidth],
  );

  return (
    <View
      style={[styles.fileSectionBodyContainer, styles.fileSectionBorder]}
      onLayout={handleLayout}
      testID={testID}
    >
      {(() => {
        if (file.status === "too_large" || file.status === "binary") {
          return (
            <View style={styles.statusMessageContainer}>
              <Text style={styles.statusMessageText}>
                {file.status === "binary"
                  ? t("workspace.git.diff.binaryFile")
                  : t("workspace.git.diff.tooLarge")}
              </Text>
            </View>
          );
        }

        let maxLineNo = 0;
        for (const hunk of file.hunks) {
          maxLineNo = Math.max(
            maxLineNo,
            hunk.oldStart + hunk.oldCount,
            hunk.newStart + hunk.newCount,
          );
        }
        const gutterWidth = lineNumberGutterWidth(maxLineNo, codeFontSize) + SPACING[2];

        if (layout === "split") {
          const rows = buildSplitDiffRows(file, { includeHunkHeaders: showHunkHeaders });
          return (
            <View style={[styles.diffContent, styles.splitRow]} dataSet={CODE_SURFACE_DATASET}>
              <SplitDiffColumn
                rows={rows}
                side="left"
                gutterWidth={gutterWidth}
                wrapLines={wrapLines}
                textMetricsStyle={textMetricsStyle}
                search={search}
                reviewActions={reviewActions}
                onExpandContext={onExpandContext}
              />
              <SplitDiffColumn
                rows={rows}
                side="right"
                gutterWidth={gutterWidth}
                wrapLines={wrapLines}
                textMetricsStyle={textMetricsStyle}
                search={search}
                reviewActions={reviewActions}
                onExpandContext={onExpandContext}
                showDivider
              />
            </View>
          );
        }

        const computedLines = buildUnifiedDiffLines(file, {
          includeHunkHeaders: showHunkHeaders,
        });

        if (wrapLines) {
          return (
            <View style={styles.diffContent} dataSet={CODE_SURFACE_DATASET}>
              <View style={styles.linesContainer}>
                {computedLines.map(
                  ({ line, lineNumber, sourceLineNumber, key, reviewTarget }, index) => (
                    <View key={key} testID={`diff-wrapped-row-${index}`}>
                      <DiffLineView
                        line={line}
                        lineNumber={lineNumber}
                        gutterWidth={gutterWidth}
                        wrapLines={wrapLines}
                        textMetricsStyle={textMetricsStyle}
                        searchMatches={getDiffLineSearchMatches(search, reviewTarget)}
                        currentSearchMatchIndex={search?.currentMatchIndex}
                        reviewTarget={reviewTarget}
                        reviewActions={reviewActions}
                        onExpandContext={onExpandContext}
                        contextSourceLineNumber={sourceLineNumber}
                        contextTestID={`diff-expand-context-${index}`}
                      />
                      <InlineReviewRow
                        reviewTarget={reviewTarget}
                        reviewActions={reviewActions}
                        gutterWidth={gutterWidth}
                      />
                    </View>
                  ),
                )}
              </View>
            </View>
          );
        }

        const textViewportWidth =
          scrollViewWidth > 0 ? scrollViewWidth : Math.max(0, bodyWidth - gutterWidth);
        return (
          <View style={[styles.diffContent, styles.diffContentRow]} dataSet={CODE_SURFACE_DATASET}>
            <View style={styles.gutterColumn}>
              {computedLines.map(({ line, lineNumber, key, reviewTarget }, index) => (
                <View key={key} testID={`diff-gutter-row-${index}`}>
                  <DiffGutterCell
                    lineNumber={lineNumber}
                    type={line.type}
                    gutterWidth={gutterWidth}
                    textMetricsStyle={textMetricsStyle}
                    reviewTarget={reviewTarget}
                    reviewActions={reviewActions}
                    isLineHovered={
                      reviewTarget?.key !== undefined && hoveredReviewTargetKey === reviewTarget.key
                    }
                    textTestID={`diff-gutter-text-${index}`}
                    actionTestID={`diff-gutter-action-${index}`}
                  />
                  <InlineReviewGutterSpacer
                    reviewTarget={reviewTarget}
                    reviewActions={reviewActions}
                    gutterWidth={gutterWidth}
                  />
                </View>
              ))}
            </View>
            <DiffScroll
              scrollViewWidth={scrollViewWidth}
              onScrollViewWidthChange={setScrollViewWidth}
              style={styles.splitColumnScroll}
              contentContainerStyle={styles.diffContentInner}
            >
              <View style={linesContainerRowStyle}>
                {computedLines.map(({ line, sourceLineNumber, key, reviewTarget }, index) => (
                  <View key={key} testID={`diff-code-row-${index}`}>
                    <DiffTextLine
                      line={line}
                      wrapLines={false}
                      textMetricsStyle={textMetricsStyle}
                      searchMatches={getDiffLineSearchMatches(search, reviewTarget)}
                      currentSearchMatchIndex={search?.currentMatchIndex}
                      reviewTarget={reviewTarget}
                      reviewActions={reviewActions}
                      hoverTargetKey={reviewTarget?.key ?? null}
                      onHoverTargetChange={setHoveredReviewTargetKey}
                      onExpandContext={onExpandContext}
                      contextSourceLineNumber={sourceLineNumber}
                      contextTestID={`diff-expand-context-${index}`}
                      textTestID={`diff-code-text-${index}`}
                    />
                    <InlineReviewThreadContent
                      reviewTarget={reviewTarget}
                      reviewActions={reviewActions}
                      viewportWidth={textViewportWidth}
                      pinToViewport
                    />
                  </View>
                ))}
              </View>
            </DiffScroll>
          </View>
        );
      })()}
    </View>
  );
}

interface GitDiffPaneProps {
  serverId: string;
  workspaceId?: string | null;
  cwd: string;
  enabled?: boolean;
  onOpenWorkspaceFile?: (request: WorkspaceFileOpenRequest) => void;
  onAddToChat?: (path: string) => void;
}

type ChangesSource = "checkout" | "session";

type PressableStyleFn = (
  state: PressableStateCallbackType & { hovered?: boolean; open?: boolean },
) => StyleProp<ViewStyle>;

const foregroundMutedIconColorMapping = (theme: Theme) => ({ color: theme.colors.foregroundMuted });
const successIconColorMapping = (theme: Theme) => ({ color: theme.colors.statusSuccess });

const ThemedLoadingSpinner = withUnistyles(LoadingSpinner);
const ThemedAlignJustify = withUnistyles(AlignJustify);
const ThemedColumns2 = withUnistyles(Columns2);
const ThemedFolderTree = withUnistyles(FolderTree);
const ThemedGitCompareArrows = withUnistyles(GitCompareArrows);
const ThemedGitFork = withUnistyles(GitFork);
const ThemedList = withUnistyles(List);
const ThemedPilcrow = withUnistyles(Pilcrow);
const ThemedWrapText = withUnistyles(WrapText);
const ThemedListChevronsDownUp = withUnistyles(ListChevronsDownUp);
const ThemedListChevronsUpDown = withUnistyles(ListChevronsUpDown);
const ThemedMaximize2 = withUnistyles(Maximize2);
const ThemedMessageSquareText = withUnistyles(MessageSquareText);
const ThemedArrowDown = withUnistyles(ArrowDown);
const ThemedArrowUp = withUnistyles(ArrowUp);
const ThemedCheckCircle2 = withUnistyles(CheckCircle2);
const ThemedChevronDown = withUnistyles(ChevronDown);
const ThemedFileCode2 = withUnistyles(FileCode2);
const ThemedFileText = withUnistyles(FileText);
const ThemedExternalLink = withUnistyles(ExternalLink);
const REVIEW_PREVIOUS_MENU_ICON = (
  <ThemedArrowUp size={14} uniProps={foregroundMutedIconColorMapping} />
);
const REVIEW_NEXT_MENU_ICON = (
  <ThemedArrowDown size={14} uniProps={foregroundMutedIconColorMapping} />
);
const REVIEW_COMMENT_MENU_ICON = (
  <ThemedMessageSquareText size={14} uniProps={foregroundMutedIconColorMapping} />
);
const DIFF_OPTIONS_WHITESPACE_ICON = (
  <ThemedPilcrow size={14} uniProps={foregroundMutedIconColorMapping} />
);
const DIFF_OPTIONS_WRAP_ICON = (
  <ThemedWrapText size={14} uniProps={foregroundMutedIconColorMapping} />
);
const DIFF_OPTIONS_UNIFIED_ICON = (
  <ThemedAlignJustify size={14} uniProps={foregroundMutedIconColorMapping} />
);
const DIFF_OPTIONS_SPLIT_ICON = (
  <ThemedColumns2 size={14} uniProps={foregroundMutedIconColorMapping} />
);
const DIFF_OPTIONS_FLAT_ICON = <ThemedList size={14} uniProps={foregroundMutedIconColorMapping} />;
const DIFF_OPTIONS_DIRECTORY_ICON = (
  <ThemedFolderTree size={14} uniProps={foregroundMutedIconColorMapping} />
);
const DIFF_OPTIONS_SUBMODULE_ICON = (
  <ThemedGitFork size={14} uniProps={foregroundMutedIconColorMapping} />
);

interface DiffLayoutToggleProps {
  layout: "unified" | "split";
  isMobile: boolean;
  testID?: string;
  toggleStyle?: PressableStyleFn;
  onToggle: () => void;
}

export function DiffLayoutToggle({
  layout,
  isMobile,
  testID = "changes-toggle-layout",
  toggleStyle,
  onToggle,
}: DiffLayoutToggleProps) {
  const defaultToggleStyle = useMemo(
    () => buildToggleButtonStyle(false, styles.expandAllButton),
    [],
  );
  const { t } = useTranslation();
  const label =
    layout === "unified"
      ? t("workspace.git.diff.switchToSplit")
      : t("workspace.git.diff.switchToUnified");
  return (
    <Tooltip delayDuration={300}>
      <TooltipTrigger asChild>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={label}
          hitSlop={DIFF_CONTROL_HIT_SLOP}
          testID={testID}
          onPress={onToggle}
          style={toggleStyle ?? defaultToggleStyle}
        >
          {layout === "unified" ? (
            <ThemedColumns2 size={isMobile ? 18 : 14} uniProps={foregroundMutedIconColorMapping} />
          ) : (
            <ThemedAlignJustify
              size={isMobile ? 18 : 14}
              uniProps={foregroundMutedIconColorMapping}
            />
          )}
        </Pressable>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        <Text style={styles.tooltipText}>{label}</Text>
      </TooltipContent>
    </Tooltip>
  );
}

interface ChangesTabToggleProps {
  isMobile: boolean;
  selected: boolean;
  onPress: () => void;
}

interface DiffModeMenuProps {
  diffMode: "uncommitted" | "base";
  committedDescription?: string;
  testIDPrefix?: string;
  onSelectUncommitted: () => void;
  onSelectBase: () => void;
}

export function DiffModeMenu({
  diffMode,
  committedDescription,
  testIDPrefix = "changes-diff",
  onSelectUncommitted,
  onSelectBase,
}: DiffModeMenuProps) {
  const { t } = useTranslation();
  const triggerStyle = useMemo(() => buildDiffModeTriggerStyle(), []);
  const uncommittedLabel = t("workspace.git.diff.uncommitted");
  const committedLabel = t("workspace.git.diff.committed");
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        testID={`${testIDPrefix}-status-trigger`}
        style={triggerStyle}
        accessibilityRole="button"
        accessibilityLabel={t("workspace.git.diff.diffMode")}
      >
        <Text style={styles.diffStatusText} numberOfLines={1}>
          {diffMode === "uncommitted" ? uncommittedLabel : committedLabel}
        </Text>
        <ThemedChevronDown size={12} uniProps={foregroundMutedIconColorMapping} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" width={260} testID={`${testIDPrefix}-status-menu`}>
        <DropdownMenuItem
          testID={`${testIDPrefix}-mode-uncommitted`}
          selected={diffMode === "uncommitted"}
          onSelect={onSelectUncommitted}
        >
          {uncommittedLabel}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          testID={`${testIDPrefix}-mode-committed`}
          selected={diffMode === "base"}
          description={committedDescription}
          onSelect={onSelectBase}
        >
          {committedLabel}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ChangesTabToggle({ isMobile, selected, onPress }: ChangesTabToggleProps) {
  const { t } = useTranslation();
  const buttonStyle = useMemo(
    () => buildToggleButtonStyle(selected, styles.expandAllButton),
    [selected],
  );
  const label = t(
    selected ? "workspace.git.diff.closeChangesTab" : "workspace.git.diff.openChangesTab",
  );
  if (isMobile) {
    return null;
  }
  return (
    <Tooltip delayDuration={300}>
      <TooltipTrigger asChild>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={label}
          hitSlop={DIFF_CONTROL_HIT_SLOP}
          testID="changes-open-tab"
          onPress={onPress}
          style={buttonStyle}
        >
          <ThemedMaximize2 size={14} uniProps={foregroundMutedIconColorMapping} />
        </Pressable>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        <Text style={styles.tooltipText}>{label}</Text>
      </TooltipContent>
    </Tooltip>
  );
}

interface DiffFilesToolbarProps {
  allFileDiffsExpanded: boolean;
  isMobile: boolean;
  testID?: string;
  expandAllToggleStyle?: PressableStyleFn;
  onToggleExpandAll: () => void;
}

export function DiffFilesToolbar({
  allFileDiffsExpanded,
  isMobile,
  testID,
  expandAllToggleStyle,
  onToggleExpandAll,
}: DiffFilesToolbarProps) {
  const defaultToggleStyle = useMemo(() => buildExpandAllButtonStyle(), []);
  const { t } = useTranslation();
  const expandAllLabel = allFileDiffsExpanded
    ? t("workspace.git.diff.collapseAll")
    : t("workspace.git.diff.expandAll");
  return (
    <View style={styles.diffStatusButtons}>
      <Tooltip delayDuration={300}>
        <TooltipTrigger asChild>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={expandAllLabel}
            hitSlop={DIFF_CONTROL_HIT_SLOP}
            testID={testID}
            style={expandAllToggleStyle ?? defaultToggleStyle}
            onPress={onToggleExpandAll}
          >
            {allFileDiffsExpanded ? (
              <ThemedListChevronsDownUp
                size={isMobile ? 18 : 14}
                uniProps={foregroundMutedIconColorMapping}
              />
            ) : (
              <ThemedListChevronsUpDown
                size={isMobile ? 18 : 14}
                uniProps={foregroundMutedIconColorMapping}
              />
            )}
          </Pressable>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          <Text style={styles.tooltipText}>{expandAllLabel}</Text>
        </TooltipContent>
      </Tooltip>
    </View>
  );
}

function DiffHunkNavigationControls({
  currentIndex,
  total,
  onPrevious,
  onNext,
}: {
  currentIndex: number;
  total: number;
  onPrevious: () => void;
  onNext: () => void;
}) {
  const { t } = useTranslation();
  const current = currentIndex >= 0 ? currentIndex + 1 : 0;
  const progressLabel = t("workspace.git.diff.changeProgress", { current, total });
  const buttonStyle = useMemo(
    () => buildToggleButtonStyle(false, styles.reviewNavigationButton),
    [],
  );
  return (
    <View style={styles.hunkNavigationControls}>
      <Tooltip delayDuration={300}>
        <TooltipTrigger asChild>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("workspace.git.diff.previousChange")}
            hitSlop={DIFF_CONTROL_HIT_SLOP}
            style={buttonStyle}
            onPress={onPrevious}
            testID="changes-previous-hunk"
          >
            <ThemedArrowUp size={13} uniProps={foregroundMutedIconColorMapping} />
          </Pressable>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          <Text style={styles.tooltipText}>{t("workspace.git.diff.previousChange")}</Text>
        </TooltipContent>
      </Tooltip>
      <Text
        accessibilityLabel={progressLabel}
        accessibilityLiveRegion="polite"
        style={styles.hunkProgressText}
        testID="changes-hunk-progress"
      >
        {current}/{total}
      </Text>
      <Tooltip delayDuration={300}>
        <TooltipTrigger asChild>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("workspace.git.diff.nextChange")}
            hitSlop={DIFF_CONTROL_HIT_SLOP}
            style={buttonStyle}
            onPress={onNext}
            testID="changes-next-hunk"
          >
            <ThemedArrowDown size={13} uniProps={foregroundMutedIconColorMapping} />
          </Pressable>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          <Text style={styles.tooltipText}>{t("workspace.git.diff.nextChange")}</Text>
        </TooltipContent>
      </Tooltip>
    </View>
  );
}

function ReviewCommentMenuItem({
  comment,
  index,
  selected,
  onSelectComment,
}: {
  comment: ReviewDraftComment;
  index: number;
  selected: boolean;
  onSelectComment: (comment: ReviewDraftComment, index: number) => void;
}) {
  const handleSelect = useCallback(
    () => onSelectComment(comment, index),
    [comment, index, onSelectComment],
  );
  return (
    <DropdownMenuItem
      description={`${comment.filePath}:${comment.lineNumber}`}
      selected={selected}
      leading={REVIEW_COMMENT_MENU_ICON}
      onSelect={handleSelect}
      testID={`changes-review-comment-${comment.id}`}
    >
      {comment.body}
    </DropdownMenuItem>
  );
}

function ReviewWorkflowControls({
  comments,
  activeCommentIndex,
  reviewedCount,
  totalFiles,
  isMobile,
  onPreviousFile,
  onNextFile,
  onSelectComment,
}: {
  comments: readonly ReviewDraftComment[];
  activeCommentIndex: number;
  reviewedCount: number;
  totalFiles: number;
  isMobile: boolean;
  onPreviousFile: () => void;
  onNextFile: () => void;
  onSelectComment: (comment: ReviewDraftComment, index: number) => void;
}) {
  const { t } = useTranslation();
  const summaryLabel = t("workspace.git.diff.reviewProgress", {
    reviewed: reviewedCount,
    total: totalFiles,
  });

  return (
    <View style={styles.reviewWorkflowControls}>
      <DropdownMenu>
        <DropdownMenuTrigger
          accessibilityRole="button"
          accessibilityLabel={summaryLabel}
          style={styles.reviewDraftCount}
          testID="changes-review-workflow"
        >
          <ThemedCheckCircle2
            size={isMobile ? 16 : 13}
            uniProps={
              reviewedCount === totalFiles
                ? successIconColorMapping
                : foregroundMutedIconColorMapping
            }
          />
          <Text style={styles.reviewDraftCountText}>
            {reviewedCount}/{totalFiles}
          </Text>
          {comments.length > 0 ? (
            <>
              <View style={styles.reviewSummaryDivider} />
              <ThemedMessageSquareText
                size={isMobile ? 16 : 13}
                uniProps={foregroundMutedIconColorMapping}
              />
              <Text style={styles.reviewDraftCountText}>{comments.length}</Text>
            </>
          ) : null}
          <ThemedChevronDown size={11} uniProps={foregroundMutedIconColorMapping} />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" width={320} maxHeight={380} scrollable>
          <DropdownMenuItem leading={REVIEW_PREVIOUS_MENU_ICON} onSelect={onPreviousFile}>
            {t("workspace.git.diff.previousChangedFile")}
          </DropdownMenuItem>
          <DropdownMenuItem leading={REVIEW_NEXT_MENU_ICON} onSelect={onNextFile}>
            {t("workspace.git.diff.nextChangedFile")}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {comments.length > 0 ? (
            comments.map((comment, index) => (
              <ReviewCommentMenuItem
                key={comment.id}
                comment={comment}
                index={index}
                selected={index === activeCommentIndex}
                onSelectComment={onSelectComment}
              />
            ))
          ) : (
            <DropdownMenuItem disabled muted>
              {t("workspace.git.diff.noReviewComments")}
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </View>
  );
}

function DiffLayoutOptionsPage({
  layout,
  testIDPrefix,
  unifiedLabel,
  splitLabel,
  onChange,
}: {
  layout: "unified" | "split";
  testIDPrefix: string;
  unifiedLabel: string;
  splitLabel: string;
  onChange: (layout: "unified" | "split") => void;
}) {
  const handleUnified = useCallback(() => onChange("unified"), [onChange]);
  const handleSplit = useCallback(() => onChange("split"), [onChange]);
  return (
    <>
      <DropdownMenuItem
        leading={DIFF_OPTIONS_UNIFIED_ICON}
        selected={layout === "unified"}
        testID={`${testIDPrefix}-layout-unified`}
        onSelect={handleUnified}
      >
        {unifiedLabel}
      </DropdownMenuItem>
      <DropdownMenuItem
        leading={DIFF_OPTIONS_SPLIT_ICON}
        selected={layout === "split"}
        testID={`${testIDPrefix}-layout-split`}
        onSelect={handleSplit}
      >
        {splitLabel}
      </DropdownMenuItem>
    </>
  );
}

function DiffFileGroupingOptionsPage({
  grouping,
  submoduleSupported,
  testIDPrefix,
  flatLabel,
  directoryLabel,
  submoduleLabel,
  onChange,
}: {
  grouping: CheckoutDiffFileGrouping;
  submoduleSupported: boolean;
  testIDPrefix: string;
  flatLabel: string;
  directoryLabel: string;
  submoduleLabel: string;
  onChange: (grouping: CheckoutDiffFileGrouping) => void;
}) {
  const { t } = useTranslation();
  const handleFlat = useCallback(() => onChange("flat"), [onChange]);
  const handleDirectory = useCallback(() => onChange("directory"), [onChange]);
  const handleSubmodule = useCallback(() => onChange("submodule"), [onChange]);
  return (
    <>
      <DropdownMenuItem
        leading={DIFF_OPTIONS_FLAT_ICON}
        selected={grouping === "flat"}
        testID={`${testIDPrefix}-grouping-flat`}
        onSelect={handleFlat}
      >
        {flatLabel}
      </DropdownMenuItem>
      <DropdownMenuItem
        leading={DIFF_OPTIONS_DIRECTORY_ICON}
        selected={grouping === "directory"}
        testID={`${testIDPrefix}-grouping-directory`}
        onSelect={handleDirectory}
      >
        {directoryLabel}
      </DropdownMenuItem>
      <DropdownMenuItem
        disabled={!submoduleSupported}
        selected={grouping === "submodule"}
        description={submoduleSupported ? undefined : t("message.actions.forkUnavailable")}
        leading={DIFF_OPTIONS_SUBMODULE_ICON}
        testID={`${testIDPrefix}-grouping-submodule`}
        onSelect={handleSubmodule}
      >
        {submoduleLabel}
      </DropdownMenuItem>
    </>
  );
}

function useDiffOptionsPages(input: {
  layout?: "unified" | "split";
  fileGrouping?: CheckoutDiffFileGrouping;
  submoduleGroupingSupported: boolean;
  testIDPrefix: string;
  layoutLabel: string;
  unifiedLabel: string;
  splitLabel: string;
  fileGroupingLabel: string;
  flatLabel: string;
  directoryLabel: string;
  submoduleLabel: string;
  onLayoutChange?: (layout: "unified" | "split") => void;
  onFileGroupingChange?: (grouping: CheckoutDiffFileGrouping) => void;
}): MenuPageDefinition[] {
  const layoutContent = useMemo(
    () =>
      input.layout !== undefined && input.onLayoutChange !== undefined ? (
        <DiffLayoutOptionsPage
          layout={input.layout}
          testIDPrefix={input.testIDPrefix}
          unifiedLabel={input.unifiedLabel}
          splitLabel={input.splitLabel}
          onChange={input.onLayoutChange}
        />
      ) : null,
    [input.layout, input.onLayoutChange, input.splitLabel, input.testIDPrefix, input.unifiedLabel],
  );
  const groupingContent = useMemo(
    () =>
      input.fileGrouping !== undefined && input.onFileGroupingChange !== undefined ? (
        <DiffFileGroupingOptionsPage
          grouping={input.fileGrouping}
          submoduleSupported={input.submoduleGroupingSupported}
          testIDPrefix={input.testIDPrefix}
          flatLabel={input.flatLabel}
          directoryLabel={input.directoryLabel}
          submoduleLabel={input.submoduleLabel}
          onChange={input.onFileGroupingChange}
        />
      ) : null,
    [
      input.directoryLabel,
      input.fileGrouping,
      input.flatLabel,
      input.onFileGroupingChange,
      input.submoduleGroupingSupported,
      input.submoduleLabel,
      input.testIDPrefix,
    ],
  );
  return useMemo(() => {
    const pages: MenuPageDefinition[] = [];
    if (layoutContent) {
      pages.push({
        id: `${input.testIDPrefix}-layout-page`,
        title: input.layoutLabel,
        content: layoutContent,
      });
    }
    if (groupingContent) {
      pages.push({
        id: `${input.testIDPrefix}-grouping-page`,
        title: input.fileGroupingLabel,
        content: groupingContent,
      });
    }
    return pages;
  }, [
    groupingContent,
    input.fileGroupingLabel,
    input.layoutLabel,
    input.testIDPrefix,
    layoutContent,
  ]);
}

function resolveDiffFileGroupingLabel(input: {
  grouping?: CheckoutDiffFileGrouping;
  flatLabel: string;
  directoryLabel: string;
  submoduleLabel: string;
}): string {
  if (input.grouping === "directory") {
    return input.directoryLabel;
  }
  if (input.grouping === "submodule") {
    return input.submoduleLabel;
  }
  return input.flatLabel;
}

function DiffRefreshMenuOption({
  brand,
  isRefreshing,
  supported,
  testIDPrefix,
  onRefresh,
}: {
  brand?: string;
  isRefreshing: boolean;
  supported: boolean;
  testIDPrefix: string;
  onRefresh?: () => void;
}) {
  const { t } = useTranslation();
  const refreshIcon = useMemo(
    () =>
      isRefreshing ? (
        <ThemedLoadingSpinner size={ICON_SIZE.sm} uniProps={foregroundMutedIconColorMapping} />
      ) : (
        <ThemedRotateCw size={ICON_SIZE.sm} uniProps={foregroundMutedIconColorMapping} />
      ),
    [isRefreshing],
  );
  if (!supported || !onRefresh) {
    return null;
  }
  let label = t("workspace.git.diff.refresh");
  if (isRefreshing) {
    label = t("workspace.git.diff.refreshing");
  } else if (brand) {
    label = t("workspace.git.diff.refreshState", { brand });
  }
  return (
    <>
      <DropdownMenuSeparator />
      <DropdownMenuItem
        leading={refreshIcon}
        disabled={isRefreshing}
        testID={`${testIDPrefix}-refresh`}
        onSelect={onRefresh}
      >
        {label}
      </DropdownMenuItem>
    </>
  );
}

interface DiffOptionsMenuProps {
  brand?: string;
  fileGrouping?: CheckoutDiffFileGrouping;
  hideWhitespace: boolean;
  isMobile: boolean;
  isRefreshing?: boolean;
  layout?: "unified" | "split";
  overflowToggleStyle?: PressableStyleFn;
  refreshSupported?: boolean;
  submoduleGroupingSupported?: boolean;
  testIDPrefix?: string;
  wrapLines: boolean;
  onFileGroupingChange?: (grouping: CheckoutDiffFileGrouping) => void;
  onLayoutChange?: (layout: "unified" | "split") => void;
  onRefresh?: () => void;
  onToggleHideWhitespace: () => void;
  onToggleWrapLines: () => void;
}

export function DiffOptionsMenu({
  brand,
  fileGrouping,
  hideWhitespace,
  isMobile,
  isRefreshing = false,
  layout,
  overflowToggleStyle,
  refreshSupported = false,
  submoduleGroupingSupported = false,
  testIDPrefix = "changes",
  wrapLines,
  onFileGroupingChange,
  onLayoutChange,
  onRefresh,
  onToggleHideWhitespace,
  onToggleWrapLines,
}: DiffOptionsMenuProps) {
  const { t } = useTranslation();
  const defaultToggleStyle = useMemo(() => buildOverflowButtonStyle(), []);
  const whitespaceLabel = hideWhitespace
    ? t("workspace.git.diff.showWhitespace")
    : t("workspace.git.diff.hideWhitespace");
  const wrapLinesLabel = wrapLines
    ? t("workspace.git.diff.scrollLongLines")
    : t("workspace.git.diff.wrapLongLines");
  const optionsLabel = t("workspace.git.diff.options");
  const layoutLabel = t("workspace.git.diff.view");
  const unifiedLabel = t("workspace.git.diff.unified");
  const splitLabel = t("workspace.git.diff.split");
  const fileGroupingLabel = t("workspace.git.diff.fileGrouping");
  const flatLabel = t("workspace.git.diff.flatFileList");
  const directoryLabel = t("workspace.git.diff.groupByDirectory");
  const submoduleLabel = t("workspace.git.diff.groupBySubmodule");
  const selectedGroupingLabel = resolveDiffFileGroupingLabel({
    grouping: fileGrouping,
    flatLabel,
    directoryLabel,
    submoduleLabel,
  });
  const hasLayoutOptions = layout !== undefined && onLayoutChange !== undefined;
  const hasGroupingOptions = fileGrouping !== undefined && onFileGroupingChange !== undefined;
  const pages = useDiffOptionsPages({
    layout,
    fileGrouping,
    submoduleGroupingSupported,
    testIDPrefix,
    layoutLabel,
    unifiedLabel,
    splitLabel,
    fileGroupingLabel,
    flatLabel,
    directoryLabel,
    submoduleLabel,
    onLayoutChange,
    onFileGroupingChange,
  });
  const hasDisplayPages = pages.length > 0;

  return (
    <DropdownMenu compactMode="sheet">
      <Tooltip delayDuration={300}>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger
            accessibilityRole="button"
            accessibilityLabel={optionsLabel}
            testID={`${testIDPrefix}-options-menu`}
            style={overflowToggleStyle ?? defaultToggleStyle}
          >
            <ThemedChevronDown
              size={isMobile ? 18 : 14}
              uniProps={foregroundMutedIconColorMapping}
            />
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          <Text style={styles.tooltipText}>{optionsLabel}</Text>
        </TooltipContent>
      </Tooltip>
      <DropdownMenuContent
        align="end"
        width={260}
        pages={pages}
        sheetTitle={optionsLabel}
        testID={`${testIDPrefix}-options-menu-content`}
      >
        {hasLayoutOptions ? (
          <DropdownMenuSubTrigger
            id={`${testIDPrefix}-layout-page`}
            value={layout === "split" ? splitLabel : unifiedLabel}
            testID={`${testIDPrefix}-layout`}
          >
            {layoutLabel}
          </DropdownMenuSubTrigger>
        ) : null}
        {hasGroupingOptions ? (
          <DropdownMenuSubTrigger
            id={`${testIDPrefix}-grouping-page`}
            value={selectedGroupingLabel}
            testID={`${testIDPrefix}-grouping`}
          >
            {fileGroupingLabel}
          </DropdownMenuSubTrigger>
        ) : null}
        {hasDisplayPages ? <DropdownMenuSeparator /> : null}
        <DropdownMenuItem
          leading={DIFF_OPTIONS_WHITESPACE_ICON}
          selected={hideWhitespace}
          testID={`${testIDPrefix}-toggle-whitespace`}
          onSelect={onToggleHideWhitespace}
        >
          {whitespaceLabel}
        </DropdownMenuItem>
        <DropdownMenuItem
          leading={DIFF_OPTIONS_WRAP_ICON}
          selected={wrapLines}
          testID={`${testIDPrefix}-toggle-wrap-lines`}
          onSelect={onToggleWrapLines}
        >
          {wrapLinesLabel}
        </DropdownMenuItem>
        <DiffRefreshMenuOption
          brand={brand}
          isRefreshing={isRefreshing}
          supported={refreshSupported}
          testIDPrefix={testIDPrefix}
          onRefresh={onRefresh}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const ThemedRotateCw = withUnistyles(RotateCw);

type DiffFlatItemLayoutGetter = NonNullable<FlatListProps<DiffFlatItem>["getItemLayout"]>;
const EMPTY_PATH_LIST: string[] = [];

interface DiffFileMetrics {
  contentLength: number;
  splitLineCount?: number;
  unifiedLineCount: number;
}

const diffFileMetricsCache = new WeakMap<ParsedDiffFile, DiffFileMetrics>();

function getDiffFileMetrics(file: ParsedDiffFile): DiffFileMetrics {
  const cached = diffFileMetricsCache.get(file);
  if (cached) {
    return cached;
  }
  let contentLength = 0;
  let unifiedLineCount = 0;
  for (const hunk of file.hunks) {
    unifiedLineCount += hunk.lines.length;
    for (const line of hunk.lines) {
      contentLength += line.content.length;
    }
  }
  const metrics = { contentLength, unifiedLineCount };
  diffFileMetricsCache.set(file, metrics);
  return metrics;
}

function getSplitDiffLineCount(file: ParsedDiffFile): number {
  const metrics = getDiffFileMetrics(file);
  if (metrics.splitLineCount === undefined) {
    metrics.splitLineCount = buildSplitDiffRows(file).length;
  }
  return metrics.splitLineCount;
}

function computeEmptyMessage(
  hideWhitespace: boolean,
  diffMode: "uncommitted" | "base",
  baseRefLabel: string,
  labels: {
    hiddenWhitespace: string;
    uncommitted: string;
    againstBase: (baseRefLabel: string) => string;
  },
): string {
  if (hideWhitespace) {
    return labels.hiddenWhitespace;
  }
  if (diffMode === "uncommitted") {
    return labels.uncommitted;
  }
  return labels.againstBase(baseRefLabel);
}

interface DiffBodyContentProps {
  isStatusLoading: boolean;
  statusErrorMessage: string | null;
  notGit: boolean;
  isDiffLoading: boolean;
  diffErrorMessage: string | null;
  diffTooLarge: boolean;
  hasChanges: boolean;
  emptyMessage: string;
  children: ReactElement;
  checkingRepositoryLabel: string;
  notRepositoryLabel: string;
}

function DiffBodyContent({
  isStatusLoading,
  statusErrorMessage,
  notGit,
  isDiffLoading,
  diffErrorMessage,
  diffTooLarge,
  hasChanges,
  emptyMessage,
  children,
  checkingRepositoryLabel,
  notRepositoryLabel,
}: DiffBodyContentProps) {
  if (isStatusLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ThemedLoadingSpinner size="large" uniProps={foregroundMutedIconColorMapping} />
        <Text style={styles.loadingText}>{checkingRepositoryLabel}</Text>
      </View>
    );
  }
  if (statusErrorMessage) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>{statusErrorMessage}</Text>
      </View>
    );
  }
  if (notGit) {
    return <DiffEmptyState label={notRepositoryLabel} testID="changes-not-git" />;
  }
  if (isDiffLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ThemedLoadingSpinner size="large" uniProps={foregroundMutedIconColorMapping} />
      </View>
    );
  }
  if (diffTooLarge) {
    return <DiffTooLargeState />;
  }
  if (diffErrorMessage) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>{diffErrorMessage}</Text>
      </View>
    );
  }
  if (!hasChanges) {
    return <DiffEmptyState label={emptyMessage} />;
  }
  return children;
}

function DiffEmptyState({ label, testID }: { label: string; testID?: string }) {
  return (
    <View style={styles.emptyContainer} testID={testID}>
      <View style={styles.emptyIconBadge}>
        <ThemedGitCompareArrows size={20} uniProps={foregroundMutedIconColorMapping} />
      </View>
      <Text style={styles.emptyText}>{label}</Text>
    </View>
  );
}

interface SharedDiffViewProps {
  files: ParsedDiffFile[];
  displayPreferences: {
    layout: "unified" | "split";
    wrapLines: boolean;
    codeFontSize: number;
    monoFontFamily: string;
  };
  mode:
    | {
        kind: "working_tree";
        fileGrouping: CheckoutDiffFileGrouping;
        expandedPaths: string[];
        persistedExpandedPaths?: string[];
        collapsedFolders: string[];
        collapsedGroupKeys: string[];
        reviewActions?: InlineReviewActions;
        reviewedPaths?: ReadonlySet<string>;
        onToggleReviewed?: (file: ParsedDiffFile, reviewed: boolean) => void;
        focusPath?: string;
        focusRequestId?: number;
        reviewFocusTarget?: {
          filePath: string;
          side: "old" | "new";
          lineNumber: number;
          requestId: number;
        };
        onViewSource?: (file: ParsedDiffFile) => void;
        onOpenFile?: (file: ParsedDiffFile) => void;
        onOpenInPreferredTool?: (file: ParsedDiffFile) => void;
        preferredOpenToolLabel?: string;
        openingPreferredToolPath?: string | null;
        onFilePress?: (path: string) => void;
        workspaceFileDragScope?: { serverId: string; workspaceId: string };
        onAddToChat?: (path: string) => void;
        onCopyPath?: (path: string) => void;
        onCopyRelativePath?: (path: string) => void;
        onReveal?: (path: string) => void;
        revealTargetName?: string;
        onDownload?: (path: string) => void;
        onDuplicate?: (path: string) => void;
        onRevert?: (path: string, oldPath?: string) => void;
        onExpandedPathsChange: (paths: string[]) => void;
        onCollapsedFoldersChange: (paths: string[]) => void;
        onCollapsedGroupKeysChange: (keys: string[]) => void;
      }
    | {
        kind: "working_tab";
        expandedPaths: string[] | null;
        reviewActions: InlineReviewActions;
        focusPath?: string;
        focusRequestId?: number;
        onViewSource?: (file: ParsedDiffFile) => void;
        onOpenFile?: (file: ParsedDiffFile) => void;
        onExpandedPathsChange: (paths: string[]) => void;
      }
    | {
        kind: "commit";
      };
}

function resolveExpandedPathsForToggle(
  mode: SharedDiffViewProps["mode"],
  visibleExpandedPaths: string[],
): string[] {
  return mode.kind === "working_tree"
    ? (mode.persistedExpandedPaths ?? visibleExpandedPaths)
    : visibleExpandedPaths;
}

// This component composes mode-specific state, review controls, and file actions.
// oxlint-disable-next-line complexity
export function SharedDiffView({ files, displayPreferences, mode }: SharedDiffViewProps) {
  const { t } = useTranslation();
  const { layout, wrapLines, codeFontSize, monoFontFamily } = displayPreferences;
  const diffBodyLineHeight = Math.round(codeFontSize * 1.5);
  const typographyKey = [monoFontFamily, codeFontSize, diffBodyLineHeight].join(":");
  const textMetricsStyle = useMemo<TextStyle>(() => {
    const trimmedMonoFontFamily = monoFontFamily.trim();
    return {
      fontSize: codeFontSize,
      lineHeight: diffBodyLineHeight,
      ...(trimmedMonoFontFamily ? { fontFamily: trimmedMonoFontFamily } : null),
    };
  }, [codeFontSize, diffBodyLineHeight, monoFontFamily]);
  const fileGrouping = mode.kind === "working_tree" ? mode.fileGrouping : "flat";
  const expandedPathsArray = useMemo(() => {
    if (mode.kind === "working_tree") {
      return mode.expandedPaths;
    }
    if (mode.kind === "working_tab" && mode.expandedPaths !== null) {
      return mode.expandedPaths;
    }
    return files.map((file) => file.path);
  }, [files, mode]);
  const expandedPaths = useMemo(() => new Set(expandedPathsArray), [expandedPathsArray]);
  const expandedPathsForToggleArray = resolveExpandedPathsForToggle(mode, expandedPathsArray);
  const expandedPathsForToggle = useMemo(
    () => new Set(expandedPathsForToggleArray),
    [expandedPathsForToggleArray],
  );
  const collapsedFoldersArray =
    mode.kind === "working_tree" ? mode.collapsedFolders : EMPTY_PATH_LIST;
  const collapsedFolders = useMemo(() => new Set(collapsedFoldersArray), [collapsedFoldersArray]);
  const collapsedGroupKeysArray =
    mode.kind === "working_tree" ? mode.collapsedGroupKeys : EMPTY_PATH_LIST;
  const collapsedGroupKeys = useMemo(
    () => new Set(collapsedGroupKeysArray),
    [collapsedGroupKeysArray],
  );
  const stickyHeaders = mode.kind !== "commit";
  const interactive = mode.kind !== "commit";
  const reviewActions = mode.kind === "commit" ? undefined : mode.reviewActions;
  const reviewedPaths = mode.kind === "working_tree" ? mode.reviewedPaths : undefined;
  const onToggleReviewed = mode.kind === "working_tree" ? mode.onToggleReviewed : undefined;
  const onFilePress = mode.kind === "working_tree" ? mode.onFilePress : undefined;
  const focusPath = mode.kind === "commit" ? undefined : mode.focusPath;
  const focusRequestId = mode.kind === "commit" ? undefined : mode.focusRequestId;
  const reviewFocusTarget = mode.kind === "working_tree" ? mode.reviewFocusTarget : undefined;
  const onViewSource = mode.kind === "commit" ? undefined : mode.onViewSource;
  const onOpenFile = mode.kind === "commit" ? undefined : mode.onOpenFile;
  const onOpenInPreferredTool =
    mode.kind === "working_tree" ? mode.onOpenInPreferredTool : undefined;
  const preferredOpenToolLabel =
    mode.kind === "working_tree" ? mode.preferredOpenToolLabel : undefined;
  const openingPreferredToolPath =
    mode.kind === "working_tree" ? mode.openingPreferredToolPath : undefined;
  const onAddToChat = mode.kind === "working_tree" ? mode.onAddToChat : undefined;
  const workspaceFileDragScope =
    mode.kind === "working_tree" ? mode.workspaceFileDragScope : undefined;
  const onCopyPath = mode.kind === "working_tree" ? mode.onCopyPath : undefined;
  const onCopyRelativePath = mode.kind === "working_tree" ? mode.onCopyRelativePath : undefined;
  const onReveal = mode.kind === "working_tree" ? mode.onReveal : undefined;
  const revealTargetName = mode.kind === "working_tree" ? mode.revealTargetName : undefined;
  const onDownload = mode.kind === "working_tree" ? mode.onDownload : undefined;
  const onDuplicate = mode.kind === "working_tree" ? mode.onDuplicate : undefined;
  const onRevert = mode.kind === "working_tree" ? mode.onRevert : undefined;
  // Keep selection independent from expansion so future keyboard actions (such as R to rename)
  // can target the current VCS file or folder without changing its open state.
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const handleSelectPath = useCallback((path: string) => setSelectedPath(path), []);
  const compressedTree = useMemo(() => compressSingleChildChains(buildDiffTree(files)), [files]);
  const allFolderPaths = useMemo(() => collectDirPaths(compressedTree), [compressedTree]);
  const allFolderPathSet = useMemo(() => new Set(allFolderPaths), [allFolderPaths]);
  useEffect(() => {
    if (
      selectedPath &&
      !allFolderPathSet.has(selectedPath) &&
      !files.some((file) => file.path === selectedPath)
    ) {
      setSelectedPath(null);
    }
  }, [allFolderPathSet, files, selectedPath]);
  const effectiveCollapsedFolders = useMemo(
    () => new Set(Array.from(collapsedFolders).filter((path) => allFolderPathSet.has(path))),
    [allFolderPathSet, collapsedFolders],
  );
  const diffListRef = useRef<FlatList<DiffFlatItem>>(null);
  const consumedFocusRequestRef = useRef<string | null>(null);
  const pendingFocusRequestRef = useRef<string | null>(null);
  const diffListScrollOffsetRef = useRef(0);
  const diffListViewportHeightRef = useRef(0);
  const headerHeightByPathRef = useRef<Record<string, number>>({});
  const bodyHeightByKeyRef = useRef<Record<string, number>>({});
  const folderRowHeightRef = useRef<number>(0);
  const defaultHeaderHeightRef = useRef<number>(44);
  const [heightVersion, setHeightVersion] = useState(0);
  const heightVersionFrameRef = useRef<number | null>(null);
  const scheduleHeightVersionUpdate = useCallback(() => {
    if (heightVersionFrameRef.current !== null) {
      return;
    }
    heightVersionFrameRef.current = requestAnimationFrame(() => {
      heightVersionFrameRef.current = null;
      setHeightVersion((version) => version + 1);
    });
  }, []);
  useEffect(
    () => () => {
      if (heightVersionFrameRef.current !== null) {
        cancelAnimationFrame(heightVersionFrameRef.current);
      }
    },
    [],
  );
  const diffBodyChromeHeight = BORDER_WIDTH[1] * 2;
  const statusBodyHeightEstimate = diffBodyChromeHeight + SPACING[4] * 2 + diffBodyLineHeight;

  const { flatItems, stickyHeaderIndices } = useMemo(() => {
    const { items, stickyHeaderIndices: stickyIndices } = buildDiffFlatItems({
      files,
      fileGrouping,
      tree: compressedTree,
      collapsedFolders: effectiveCollapsedFolders,
      collapsedGroupKeys,
      expandedPaths,
    });
    return {
      flatItems: items,
      stickyHeaderIndices: stickyHeaders ? stickyIndices : [],
    };
  }, [
    collapsedGroupKeys,
    compressedTree,
    effectiveCollapsedFolders,
    expandedPaths,
    fileGrouping,
    files,
    stickyHeaders,
  ]);

  const getBodyHeightKey = useCallback(
    (file: ParsedDiffFile): string => {
      if (file.status === "too_large" || file.status === "binary") {
        return `${layout}:${wrapLines ? "wrap" : "scroll"}:${typographyKey}:${file.path}:${file.status}`;
      }

      const metrics = getDiffFileMetrics(file);
      return [
        layout,
        wrapLines ? "wrap" : "scroll",
        typographyKey,
        file.path,
        file.status ?? "ok",
        file.additions,
        file.deletions,
        file.hunks.length,
        metrics.unifiedLineCount,
        metrics.contentLength,
      ].join(":");
    },
    [layout, typographyKey, wrapLines],
  );

  const estimateBodyHeight = useCallback(
    (file: ParsedDiffFile): number => {
      if (file.status === "too_large" || file.status === "binary") {
        return statusBodyHeightEstimate;
      }

      const lineCount =
        layout === "split"
          ? getSplitDiffLineCount(file)
          : getDiffFileMetrics(file).unifiedLineCount;
      return diffBodyChromeHeight + lineCount * diffBodyLineHeight;
    },
    [diffBodyChromeHeight, diffBodyLineHeight, layout, statusBodyHeightEstimate],
  );

  const getFlatItemHeight = useCallback(
    (item: DiffFlatItem): number => {
      if (item.type === "folder" || item.type === "group") {
        return folderRowHeightRef.current || defaultHeaderHeightRef.current;
      }
      if (item.type === "header") {
        return headerHeightByPathRef.current[item.file.path] ?? defaultHeaderHeightRef.current;
      }
      const bodyHeightKey = getBodyHeightKey(item.file);
      return bodyHeightByKeyRef.current[bodyHeightKey] ?? estimateBodyHeight(item.file);
    },
    [estimateBodyHeight, getBodyHeightKey],
  );

  const handleFolderRowHeightChange = useCallback(
    (height: number) => {
      if (!Number.isFinite(height) || height <= 0) {
        return;
      }
      const previousHeight = folderRowHeightRef.current;
      if (previousHeight > 0 && Math.abs(previousHeight - height) <= DIFF_HEIGHT_CHANGE_EPSILON) {
        return;
      }
      folderRowHeightRef.current = height;
      scheduleHeightVersionUpdate();
    },
    [scheduleHeightVersionUpdate],
  );

  const handleHeaderHeightChange = useCallback(
    (path: string, height: number) => {
      if (!Number.isFinite(height) || height <= 0) {
        return;
      }
      const previousHeight = headerHeightByPathRef.current[path];
      if (
        previousHeight !== undefined &&
        Math.abs(previousHeight - height) <= DIFF_HEIGHT_CHANGE_EPSILON
      ) {
        return;
      }
      headerHeightByPathRef.current[path] = height;
      defaultHeaderHeightRef.current = height;
      scheduleHeightVersionUpdate();
    },
    [scheduleHeightVersionUpdate],
  );

  const handleBodyHeightChange = useCallback(
    (file: ParsedDiffFile, height: number) => {
      if (!Number.isFinite(height) || height < 0) {
        return;
      }
      const heightKey = getBodyHeightKey(file);
      const previousHeight = bodyHeightByKeyRef.current[heightKey];
      if (
        previousHeight !== undefined &&
        Math.abs(previousHeight - height) <= DIFF_HEIGHT_CHANGE_EPSILON
      ) {
        return;
      }
      bodyHeightByKeyRef.current[heightKey] = height;
      scheduleHeightVersionUpdate();
    },
    [getBodyHeightKey, scheduleHeightVersionUpdate],
  );

  const handleDiffListScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    diffListScrollOffsetRef.current = event.nativeEvent.contentOffset.y;
  }, []);

  const handleDiffListLayout = useCallback((event: LayoutChangeEvent) => {
    const height = event.nativeEvent.layout.height;
    if (!Number.isFinite(height) || height <= 0) {
      return;
    }
    diffListViewportHeightRef.current = height;
  }, []);

  const computeItemOffset = useCallback(
    (predicate: (item: DiffFlatItem) => boolean): number | null => {
      const index = flatItems.findIndex(predicate);
      if (index < 0) {
        return null;
      }
      return sumHeightsBefore(flatItems, index, getFlatItemHeight);
    },
    [flatItems, getFlatItemHeight],
  );

  const computeHeaderOffset = useCallback(
    (path: string): number =>
      computeItemOffset((item) => item.type === "header" && item.file.path === path) ?? 0,
    [computeItemOffset],
  );

  const computeReviewTargetOffset = useCallback(
    (target: NonNullable<typeof reviewFocusTarget>): number => {
      const file = files.find((candidate) => candidate.path === target.filePath);
      if (!file) {
        return computeHeaderOffset(target.filePath);
      }
      const bodyOffset = computeItemOffset(
        (item) => item.type === "body" && item.file.path === target.filePath,
      );
      if (bodyOffset === null) {
        return computeHeaderOffset(target.filePath);
      }
      const targetKey = buildReviewableDiffTargetKey(target);
      const rowIndex =
        layout === "split"
          ? buildSplitDiffRows(file).findIndex(
              (row) =>
                row.kind === "pair" &&
                (row.left?.reviewTarget?.key === targetKey ||
                  row.right?.reviewTarget?.key === targetKey),
            )
          : buildUnifiedDiffLines(file).findIndex((line) => line.reviewTarget?.key === targetKey);
      if (rowIndex < 0) {
        return computeHeaderOffset(target.filePath);
      }
      const viewportInset = diffListViewportHeightRef.current * 0.28;
      return Math.max(
        computeHeaderOffset(target.filePath),
        bodyOffset + BORDER_WIDTH[1] + rowIndex * diffBodyLineHeight - viewportInset,
      );
    },
    [computeHeaderOffset, computeItemOffset, diffBodyLineHeight, files, layout],
  );

  useEffect(() => {
    if (!focusPath) {
      return;
    }
    const focusRequestKey = reviewFocusTarget
      ? `${reviewFocusTarget.requestId}:${focusPath}:${reviewFocusTarget.side}:${reviewFocusTarget.lineNumber}`
      : `${focusRequestId ?? "initial"}:${focusPath}`;
    if (
      consumedFocusRequestRef.current === focusRequestKey ||
      pendingFocusRequestRef.current === focusRequestKey
    ) {
      return;
    }
    const hasTarget = flatItems.some(
      (item) => item.type === "header" && item.file.path === focusPath,
    );
    if (!hasTarget) {
      return;
    }
    pendingFocusRequestRef.current = focusRequestKey;
    const frame = requestAnimationFrame(() => {
      diffListRef.current?.scrollToOffset({
        offset:
          reviewFocusTarget?.filePath === focusPath
            ? computeReviewTargetOffset(reviewFocusTarget)
            : computeHeaderOffset(focusPath),
        animated: false,
      });
      consumedFocusRequestRef.current = focusRequestKey;
      pendingFocusRequestRef.current = null;
    });
    return () => {
      cancelAnimationFrame(frame);
      if (pendingFocusRequestRef.current === focusRequestKey) {
        pendingFocusRequestRef.current = null;
      }
    };
  }, [
    computeHeaderOffset,
    computeReviewTargetOffset,
    flatItems,
    focusPath,
    focusRequestId,
    reviewFocusTarget,
  ]);

  const handleToggleExpanded = useCallback(
    (path: string) => {
      if (mode.kind === "commit") {
        return;
      }
      const isCurrentlyExpanded = expandedPaths.has(path);
      const nextExpanded = !isCurrentlyExpanded;
      const targetOffset = isCurrentlyExpanded ? computeHeaderOffset(path) : null;
      const headerHeight = headerHeightByPathRef.current[path] ?? defaultHeaderHeightRef.current;
      const shouldAnchor =
        isCurrentlyExpanded &&
        targetOffset !== null &&
        shouldAnchorHeaderBeforeCollapse({
          headerOffset: targetOffset,
          headerHeight,
          viewportOffset: diffListScrollOffsetRef.current,
          viewportHeight: diffListViewportHeightRef.current,
        });

      if (shouldAnchor && targetOffset !== null) {
        diffListRef.current?.scrollToOffset({
          offset: targetOffset,
          animated: false,
        });
      }

      mode.onExpandedPathsChange(
        nextExpanded
          ? [...expandedPathsForToggle, path]
          : Array.from(expandedPathsForToggle).filter((expandedPath) => expandedPath !== path),
      );
    },
    [computeHeaderOffset, expandedPaths, expandedPathsForToggle, mode],
  );

  const handleToggleFolder = useCallback(
    (dirPath: string) => {
      if (mode.kind !== "working_tree") {
        return;
      }
      const isCurrentlyCollapsed = effectiveCollapsedFolders.has(dirPath);
      if (!isCurrentlyCollapsed) {
        const targetOffset = computeItemOffset(
          (item) => item.type === "folder" && item.dirPath === dirPath,
        );
        const folderHeight = folderRowHeightRef.current || defaultHeaderHeightRef.current;
        if (
          targetOffset !== null &&
          shouldAnchorHeaderBeforeCollapse({
            headerOffset: targetOffset,
            headerHeight: folderHeight,
            viewportOffset: diffListScrollOffsetRef.current,
            viewportHeight: diffListViewportHeightRef.current,
          })
        ) {
          diffListRef.current?.scrollToOffset({ offset: targetOffset, animated: false });
        }
      }

      mode.onCollapsedFoldersChange(
        isCurrentlyCollapsed
          ? Array.from(effectiveCollapsedFolders).filter((path) => path !== dirPath)
          : [...effectiveCollapsedFolders, dirPath],
      );
    },
    [computeItemOffset, effectiveCollapsedFolders, mode],
  );

  const handleToggleGroup = useCallback(
    (groupKey: string) => {
      if (mode.kind !== "working_tree") {
        return;
      }
      const isCurrentlyCollapsed = collapsedGroupKeys.has(groupKey);
      if (!isCurrentlyCollapsed) {
        const targetOffset = computeItemOffset(
          (item) => item.type === "group" && item.key === groupKey,
        );
        const groupHeight = folderRowHeightRef.current || defaultHeaderHeightRef.current;
        if (
          targetOffset !== null &&
          shouldAnchorHeaderBeforeCollapse({
            headerOffset: targetOffset,
            headerHeight: groupHeight,
            viewportOffset: diffListScrollOffsetRef.current,
            viewportHeight: diffListViewportHeightRef.current,
          })
        ) {
          diffListRef.current?.scrollToOffset({ offset: targetOffset, animated: false });
        }
      }

      mode.onCollapsedGroupKeysChange(
        isCurrentlyCollapsed
          ? Array.from(collapsedGroupKeys).filter((key) => key !== groupKey)
          : [...collapsedGroupKeys, groupKey],
      );
    },
    [collapsedGroupKeys, computeItemOffset, mode],
  );

  const handleCollapseFolder = useCallback(
    (dirPath: string) => {
      if (mode.kind !== "working_tree") {
        return;
      }
      const targetOffset = computeItemOffset(
        (item) => item.type === "folder" && item.dirPath === dirPath,
      );
      const folderHeight = folderRowHeightRef.current || defaultHeaderHeightRef.current;
      if (
        targetOffset !== null &&
        shouldAnchorHeaderBeforeCollapse({
          headerOffset: targetOffset,
          headerHeight: folderHeight,
          viewportOffset: diffListScrollOffsetRef.current,
          viewportHeight: diffListViewportHeightRef.current,
        })
      ) {
        diffListRef.current?.scrollToOffset({ offset: targetOffset, animated: false });
      }

      const pathPrefix = `${dirPath}/`;
      mode.onCollapsedFoldersChange([
        ...new Set([
          ...effectiveCollapsedFolders,
          ...allFolderPaths.filter(
            (folderPath) => folderPath === dirPath || folderPath.startsWith(pathPrefix),
          ),
        ]),
      ]);
    },
    [allFolderPaths, computeItemOffset, effectiveCollapsedFolders, mode],
  );

  const renderFlatItem = useCallback(
    ({ item }: { item: DiffFlatItem }) => {
      if (item.type === "group") {
        return (
          <DiffFolderRow
            dirPath={item.key}
            displayName={item.label || t("workspace.git.diff.workspaceRoot")}
            depth={0}
            collapsed={item.collapsed}
            isSelected={selectedPath === item.key}
            additions={item.additions}
            deletions={item.deletions}
            onToggle={handleToggleGroup}
            onCollapse={handleToggleGroup}
            onSelect={handleSelectPath}
            onHeightChange={handleFolderRowHeightChange}
            testID={`diff-submodule-${item.label || "workspace"}`}
          />
        );
      }
      if (item.type === "folder") {
        return (
          <DiffFolderRow
            dirPath={item.dirPath}
            displayName={item.displayName}
            depth={item.depth}
            collapsed={item.collapsed}
            isSelected={selectedPath === item.dirPath}
            additions={item.additions}
            deletions={item.deletions}
            onToggle={handleToggleFolder}
            onCollapse={handleCollapseFolder}
            onSelect={handleSelectPath}
            onHeightChange={handleFolderRowHeightChange}
            onCopyPath={onCopyPath}
            onCopyRelativePath={onCopyRelativePath}
            onReveal={onReveal}
            revealTargetName={revealTargetName}
            onDuplicate={onDuplicate}
            onRevert={onRevert}
            testID={`diff-folder-${item.dirPath}`}
          />
        );
      }
      if (item.type === "header") {
        return (
          <DiffFileHeader
            file={item.file}
            workspaceFileDragScope={workspaceFileDragScope}
            isExpanded={item.isExpanded}
            isSelected={selectedPath === item.file.path}
            depth={item.depth}
            showDir={fileGrouping !== "directory"}
            directoryPrefix={fileGrouping === "submodule" ? item.file.submodulePath : undefined}
            interactive={interactive}
            onToggle={interactive ? handleToggleExpanded : undefined}
            onSelect={handleSelectPath}
            // Deleted paths have no current file to open. Keep their inline diff and
            // context actions available without creating a stale file-diff tab.
            onFilePress={item.file.isDeleted ? undefined : onFilePress}
            onViewSource={item.file.isDeleted ? undefined : onViewSource}
            onOpenFile={item.file.isDeleted ? undefined : onOpenFile}
            onOpenInPreferredTool={onOpenInPreferredTool}
            preferredOpenToolLabel={preferredOpenToolLabel}
            openingPreferredToolPath={openingPreferredToolPath}
            onAddToChat={onAddToChat}
            onCopyPath={onCopyPath}
            onCopyRelativePath={onCopyRelativePath}
            onReveal={onReveal}
            revealTargetName={revealTargetName}
            onDownload={onDownload}
            isReviewed={reviewedPaths?.has(item.file.path) ?? false}
            onToggleReviewed={onToggleReviewed}
            onDuplicate={onDuplicate}
            onRevert={onRevert}
            onHeaderHeightChange={handleHeaderHeightChange}
            testID={`diff-file-${item.fileIndex}`}
          />
        );
      }
      return (
        <DiffFileBody
          file={item.file}
          layout={layout}
          wrapLines={wrapLines}
          codeFontSize={codeFontSize}
          textMetricsStyle={textMetricsStyle}
          reviewActions={reviewActions}
          onBodyHeightChange={handleBodyHeightChange}
          testID={`diff-file-${item.fileIndex}-body`}
        />
      );
    },
    [
      codeFontSize,
      handleBodyHeightChange,
      handleFolderRowHeightChange,
      handleHeaderHeightChange,
      handleCollapseFolder,
      handleSelectPath,
      handleToggleExpanded,
      handleToggleFolder,
      handleToggleGroup,
      fileGrouping,
      interactive,
      layout,
      reviewActions,
      t,
      textMetricsStyle,
      wrapLines,
      workspaceFileDragScope,
      onFilePress,
      onViewSource,
      onOpenFile,
      onOpenInPreferredTool,
      preferredOpenToolLabel,
      openingPreferredToolPath,
      onAddToChat,
      onCopyPath,
      onCopyRelativePath,
      onReveal,
      revealTargetName,
      onDownload,
      onToggleReviewed,
      reviewedPaths,
      onDuplicate,
      onRevert,
      selectedPath,
    ],
  );

  const flatKeyExtractor = useCallback((item: DiffFlatItem) => {
    if (item.type === "folder") return `folder-${item.dirPath}`;
    if (item.type === "group") return `group-${item.key}`;
    return `${item.type}-${item.file.path}`;
  }, []);

  const getFlatItemLayout = useCallback<DiffFlatItemLayoutGetter>(
    (_data, index) => {
      const offset = sumHeightsBefore(flatItems, index, getFlatItemHeight);
      const item = flatItems[index];
      const length = item ? getFlatItemHeight(item) : 0;
      return { length, offset, index };
    },
    [flatItems, getFlatItemHeight],
  );

  const flatExtraData = useMemo(
    () => ({
      expandedPathsArray,
      collapsedFoldersArray,
      collapsedGroupKeysArray,
      fileGrouping,
      layout,
      typographyKey,
      heightVersion,
      wrapLines,
      reviewActions,
      reviewedPaths,
      workspaceFileDragScope,
      preferredOpenToolLabel,
      openingPreferredToolPath,
    }),
    [
      expandedPathsArray,
      collapsedFoldersArray,
      collapsedGroupKeysArray,
      fileGrouping,
      heightVersion,
      layout,
      reviewActions,
      reviewedPaths,
      typographyKey,
      workspaceFileDragScope,
      preferredOpenToolLabel,
      openingPreferredToolPath,
      wrapLines,
    ],
  );

  return (
    <FlatList
      ref={diffListRef}
      data={flatItems}
      renderItem={renderFlatItem}
      keyExtractor={flatKeyExtractor}
      getItemLayout={getFlatItemLayout}
      stickyHeaderIndices={stickyHeaderIndices}
      extraData={flatExtraData}
      style={styles.scrollView}
      contentContainerStyle={styles.contentContainer}
      testID="git-diff-scroll"
      onLayout={handleDiffListLayout}
      onScroll={handleDiffListScroll}
      scrollEventThrottle={16}
      showsVerticalScrollIndicator
      removeClippedSubviews={false}
      initialNumToRender={12}
      maxToRenderPerBatch={12}
      windowSize={10}
    />
  );
}

function computeBaseRefLabel(baseRef: string | undefined, fallbackLabel: string): string {
  if (!baseRef) return fallbackLabel;
  const trimmed = baseRef.replace(/^refs\/(heads|remotes)\//, "").trim();
  return trimmed.startsWith("origin/") ? trimmed.slice("origin/".length) : trimmed;
}

function computeCommittedDiffDescription(
  branchLabel: string,
  baseRefLabel: string,
): string | undefined {
  if (!branchLabel || !baseRefLabel) {
    return undefined;
  }
  return branchLabel === baseRefLabel ? undefined : `${branchLabel} -> ${baseRefLabel}`;
}

function computePrErrorMessage(
  githubFeaturesEnabled: boolean,
  prPayloadError: { message?: string } | null | undefined,
): string | null {
  if (!githubFeaturesEnabled) return null;
  return prPayloadError?.message ?? null;
}

// The precise setup step a workspace needs before its forge features work, or
// null when nothing is actionable (authenticated, or no forge remote at all).
type ForgeSetupAction = "install_cli" | "sign_in" | null;

// Drive the onboarding callout from the forge's auth state so the message names
// the exact next step (install the CLI vs sign in) for whichever forge backs the
// workspace — GitHub included. GitLab additionally requires the host to advertise
// GitLab support, matching the rest of the GitLab UI.
function computeForgeSetupAction(input: {
  forge: Forge;
  forgeProvidersSupported: boolean;
  authState: ForgeAuthState | undefined;
}): ForgeSetupAction {
  // A daemon without pluggable forge support can't operate any non-GitHub forge,
  // so don't offer a setup action for one it can't drive.
  if (input.forge !== "github" && !input.forgeProvidersSupported) {
    return null;
  }
  switch (input.authState) {
    case "cli_missing":
      return "install_cli";
    case "unauthenticated":
      return "sign_in";
    case "authenticated":
    case "no_remote":
    case "error":
      return null;
    default:
      return null;
  }
}

function parseForgeHost(url: string | null | undefined): string | null {
  return url ? (parseGitRemoteLocation(url)?.host ?? null) : null;
}

function buildForgeSetupMessage(input: {
  action: ForgeSetupAction;
  forge: Forge;
  host: string | null;
  t: TFunction;
}): string | null {
  if (!input.action) {
    return null;
  }
  const { brandLabel, signInCli } = getForgePresentation(input.forge);
  // A forge with no known CLI (an unknown/third-party forge rendered neutrally)
  // has no install/sign-in command to interpolate — show neutral guidance
  // rather than the GitLab-specific callout or a null command.
  if (signInCli === null) {
    return input.t("workspace.git.forgeSetup.generic", { brand: brandLabel });
  }
  if (input.action === "install_cli") {
    return input.t("workspace.git.forgeSetup.installCli", { cli: signInCli, brand: brandLabel });
  }
  const command = buildForgeSignInCommand(input.forge, input.host);
  return input.t("workspace.git.forgeSetup.signIn", { command, brand: brandLabel });
}

function buildDiffModeTriggerStyle(): PressableStyleFn {
  return ({ hovered, pressed, open }) => [
    styles.diffModeTrigger,
    (Boolean(hovered) || pressed || Boolean(open)) && styles.diffModeTriggerHovered,
  ];
}

function buildPromptTurnTriggerStyle(): PressableStyleFn {
  return ({ hovered, pressed, open }) => [
    styles.diffModeTrigger,
    styles.promptTurnTrigger,
    (Boolean(hovered) || pressed || Boolean(open)) && styles.diffModeTriggerHovered,
  ];
}

function buildExpandAllButtonStyle(): PressableStyleFn {
  return ({ hovered, pressed }) => [
    styles.expandAllButton,
    (Boolean(hovered) || pressed) && styles.toggleButtonSelected,
  ];
}

function buildOverflowButtonStyle(): PressableStyleFn {
  return ({ hovered, pressed }) => [
    styles.overflowButton,
    (Boolean(hovered) || pressed) && styles.toggleButtonSelected,
  ];
}

function buildToggleButtonStyle(
  selected: boolean,
  baseStyles: StyleProp<ViewStyle> | StyleProp<ViewStyle>[],
): PressableStyleFn {
  return ({ hovered, pressed }) => [
    baseStyles,
    (selected || Boolean(hovered) || pressed) && styles.toggleButtonSelected,
  ];
}

function resolveCheckoutDiffFileGrouping(input: {
  preferred: CheckoutDiffFileGrouping;
  submoduleGroupingSupported: boolean;
}): CheckoutDiffFileGrouping {
  if (input.preferred === "submodule" && !input.submoduleGroupingSupported) {
    return "flat";
  }
  return input.preferred;
}

function resolveEffectiveDiffLayout(input: {
  canUseSplitLayout: boolean;
  preferred: "unified" | "split";
}): "unified" | "split" {
  return input.canUseSplitLayout ? input.preferred : "unified";
}

function useDiffTabNavigation({
  serverId,
  workspaceId,
  cwd,
  isMobile,
}: {
  serverId: string;
  workspaceId?: string | null;
  cwd: string;
  isMobile: boolean;
}) {
  const openWorkspaceTabFocused = useWorkspaceLayoutStore((state) => state.openTabFocused);
  const closeWorkspaceTab = useWorkspaceLayoutStore((state) => state.closeTab);
  const persistenceKey = useMemo(
    () => buildWorkspaceTabPersistenceKey({ serverId, workspaceId: workspaceId ?? cwd }),
    [cwd, serverId, workspaceId],
  );
  const changesTabId = useWorkspaceLayoutStore((state) => {
    if (!persistenceKey) {
      return null;
    }
    const layout = state.layoutByWorkspace[persistenceKey];
    return (
      layout && collectAllTabs(layout.root).find((tab) => tab.target.kind === "working_diff")?.tabId
    );
  });
  const changesTabOpen = !isMobile && Boolean(changesTabId);
  const openChanges = useCallback(
    (path?: string) => {
      if (!persistenceKey || isMobile) {
        return;
      }
      openWorkspaceTabFocused(persistenceKey, {
        kind: "working_diff",
        ...(path ? { focusPath: path, focusRequestId: Date.now() } : {}),
      });
    },
    [isMobile, openWorkspaceTabFocused, persistenceKey],
  );
  const toggleChanges = useCallback(() => {
    if (!persistenceKey || isMobile) {
      return;
    }
    if (changesTabId) {
      closeWorkspaceTab(persistenceKey, changesTabId);
      return;
    }
    openChanges();
  }, [changesTabId, closeWorkspaceTab, isMobile, openChanges, persistenceKey]);
  const openCommit = useCallback(
    (sha: string) => {
      if (persistenceKey) {
        openWorkspaceTabFocused(persistenceKey, { kind: "commit_diff", sha });
      }
    },
    [openWorkspaceTabFocused, persistenceKey],
  );
  return {
    changesTabOpen,
    openChanges,
    toggleChanges,
    openCommit,
    onChangesFilePress: changesTabOpen ? openChanges : undefined,
  };
}

function resolveActiveChangesSource(
  source: ChangesSource,
  agentSessionChangesSupported: boolean,
): ChangesSource {
  if (source === "session" && agentSessionChangesSupported) {
    return "session";
  }
  return "checkout";
}

function useFocusedWorkspaceAgentId(input: {
  serverId: string;
  workspaceId?: string | null;
  cwd: string;
}): string | null {
  return useSessionStore((state) => {
    const session = state.sessions[input.serverId];
    const agentId = session?.focusedAgentId;
    const agent = agentId ? session.agents.get(agentId) : null;
    if (!agent) {
      return null;
    }
    if (input.workspaceId && agent.workspaceId && agent.workspaceId !== input.workspaceId) {
      return null;
    }
    if ((!input.workspaceId || !agent.workspaceId) && agent.cwd !== input.cwd) {
      return null;
    }
    return agent.id;
  });
}

function resolveDiffQueryEnablement(input: {
  source: ChangesSource;
  paneEnabled: boolean;
  isGit: boolean;
}): { checkout: boolean; session: boolean } {
  const enabled = input.paneEnabled && input.isGit;
  return {
    checkout: enabled && input.source === "checkout",
    session: enabled && input.source === "session",
  };
}

interface SelectableDiffQueryState {
  files: ParsedDiffFile[];
  payloadError: { message: string } | null;
  isLoading: boolean;
}

function selectDiffQueryState(input: {
  source: ChangesSource;
  checkout: SelectableDiffQueryState;
  session: SelectableDiffQueryState;
}): SelectableDiffQueryState {
  return input.source === "session" ? input.session : input.checkout;
}

function checkoutOnlyValue<T>(source: ChangesSource, value: T): T | undefined {
  return source === "checkout" ? value : undefined;
}

function computeChangesSourceLabel(input: {
  source: ChangesSource;
  diffMode: "uncommitted" | "base";
  uncommitted: string;
  committed: string;
  session: string;
}): string {
  if (input.source === "session") {
    return input.session;
  }
  if (input.diffMode === "uncommitted") {
    return input.uncommitted;
  }
  return input.committed;
}

function computeChangesEmptyMessage(input: {
  source: ChangesSource;
  focusedAgentId: string | null;
  baselineAvailable: boolean;
  hasPromptTurns: boolean;
  hideWhitespace: boolean;
  diffMode: "uncommitted" | "base";
  baseRefLabel: string;
  t: TFunction;
}): string {
  if (input.source === "session") {
    if (!input.focusedAgentId) {
      return input.t("workspace.git.diff.sessionAgentRequired");
    }
    if (!input.hasPromptTurns || !input.baselineAvailable) {
      return input.t("workspace.git.diff.sessionTrackingPending");
    }
    return input.hideWhitespace
      ? input.t("workspace.git.diff.emptyHiddenWhitespace")
      : input.t("workspace.git.diff.emptyPromptChanges");
  }
  return computeEmptyMessage(input.hideWhitespace, input.diffMode, input.baseRefLabel, {
    hiddenWhitespace: input.t("workspace.git.diff.emptyHiddenWhitespace"),
    uncommitted: input.t("workspace.git.diff.emptyUncommitted"),
    againstBase: (label) => input.t("workspace.git.diff.emptyAgainstBase", { baseRef: label }),
  });
}

function promptTurnLabel(prompt: string, fallback: string): string {
  return prompt.replace(/\s+/g, " ").trim() || fallback;
}

function promptTurnStatusLabel(status: AgentTurnChangesSummary["status"], t: TFunction): string {
  return t(`workspace.git.diff.promptTurnStatus.${status}`);
}

function promptTurnMetadata(
  turn: AgentTurnChangesSummary,
  turnNumber: number,
  t: TFunction,
): string {
  const status = promptTurnStatusLabel(turn.status, t);
  if (turn.hasChanges !== true) {
    return t("workspace.git.diff.promptTurnMetadata", { number: turnNumber, status });
  }
  return t("workspace.git.diff.promptTurnMetadataWithChanges", {
    number: turnNumber,
    status,
    changes: t("workspace.git.diff.promptTurnHasChanges"),
  });
}

const PromptTurnMenuItem = memo(function PromptTurnMenuItem({
  turn,
  turnNumber,
  selected,
  latest,
  emptyPromptLabel,
  t,
  onSelectPromptTurn,
}: {
  turn: AgentTurnChangesSummary;
  turnNumber: number;
  selected: boolean;
  latest: boolean;
  emptyPromptLabel: string;
  t: TFunction;
  onSelectPromptTurn: (turnId: string | null) => void;
}) {
  const handleSelect = useCallback(() => {
    onSelectPromptTurn(latest ? null : turn.id);
  }, [latest, onSelectPromptTurn, turn.id]);
  return (
    <DropdownMenuItem
      testID={`changes-prompt-turn-${turn.id}`}
      selected={selected}
      description={promptTurnMetadata(turn, turnNumber, t)}
      onSelect={handleSelect}
    >
      {promptTurnLabel(turn.prompt, emptyPromptLabel)}
    </DropdownMenuItem>
  );
});

function ChangesSourceControls({
  source,
  diffMode,
  agentTurnChangesSupported,
  promptTurns,
  selectedPromptTurnId,
  sourceLabel,
  uncommittedLabel,
  committedLabel,
  sessionChangesLabel,
  committedDiffDescription,
  triggerStyle,
  promptTriggerStyle,
  t,
  onSelectUncommitted,
  onSelectBase,
  onSelectSessionChanges,
  onSelectPromptTurn,
}: {
  source: ChangesSource;
  diffMode: "uncommitted" | "base";
  agentTurnChangesSupported: boolean;
  promptTurns: AgentTurnChangesSummary[];
  selectedPromptTurnId: string | null;
  sourceLabel: string;
  uncommittedLabel: string;
  committedLabel: string;
  sessionChangesLabel: string;
  committedDiffDescription: string | undefined;
  triggerStyle: PressableStyleFn;
  promptTriggerStyle: PressableStyleFn;
  t: TFunction;
  onSelectUncommitted: () => void;
  onSelectBase: () => void;
  onSelectSessionChanges: () => void;
  onSelectPromptTurn: (turnId: string | null) => void;
}) {
  const selectedPromptTurnIndex = promptTurns.findIndex((turn) => turn.id === selectedPromptTurnId);
  const selectedPromptTurn = promptTurns[selectedPromptTurnIndex] ?? null;
  const latestPromptTurnId = promptTurns.at(-1)?.id ?? null;
  const emptyPromptLabel = t("workspace.git.diff.promptWithAttachments");
  return (
    <View style={styles.diffSourceControls}>
      <DropdownMenu>
        <DropdownMenuTrigger
          style={triggerStyle}
          testID="changes-diff-status"
          accessibilityRole="button"
          accessibilityLabel={t("workspace.git.diff.diffMode")}
        >
          <Text style={styles.diffStatusText} numberOfLines={1}>
            {sourceLabel}
          </Text>
          <ThemedChevronDown size={12} uniProps={foregroundMutedIconColorMapping} />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" width={280} testID="changes-diff-status-menu">
          <DropdownMenuItem
            testID="changes-diff-mode-uncommitted"
            selected={source === "checkout" && diffMode === "uncommitted"}
            onSelect={onSelectUncommitted}
          >
            {uncommittedLabel}
          </DropdownMenuItem>
          <DropdownMenuItem
            testID="changes-diff-mode-committed"
            selected={source === "checkout" && diffMode === "base"}
            description={committedDiffDescription}
            onSelect={onSelectBase}
          >
            {committedLabel}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            testID="changes-source-session"
            selected={source === "session"}
            description={t(
              agentTurnChangesSupported
                ? "workspace.git.diff.sessionChangesDescription"
                : "workspace.git.diff.sessionChangesUnavailable",
            )}
            disabled={!agentTurnChangesSupported}
            onSelect={onSelectSessionChanges}
          >
            {sessionChangesLabel}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {source === "session" ? (
        <DropdownMenu>
          <DropdownMenuTrigger
            style={promptTriggerStyle}
            testID="changes-prompt-turn"
            accessibilityRole="button"
            accessibilityLabel={t("workspace.git.diff.promptTurnSelector")}
            disabled={promptTurns.length === 0}
          >
            <Text style={[styles.diffStatusText, styles.promptTurnText]} numberOfLines={1}>
              {selectedPromptTurn
                ? `#${selectedPromptTurnIndex + 1} · ${promptTurnLabel(
                    selectedPromptTurn.prompt,
                    emptyPromptLabel,
                  )}`
                : t("workspace.git.diff.noPromptTurns")}
            </Text>
            <ThemedChevronDown size={12} uniProps={foregroundMutedIconColorMapping} />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" width={300} maxHeight={360} scrollable>
            {promptTurns.toReversed().map((turn, reverseIndex) => {
              const turnNumber = promptTurns.length - reverseIndex;
              return (
                <PromptTurnMenuItem
                  key={turn.id}
                  turn={turn}
                  turnNumber={turnNumber}
                  selected={turn.id === selectedPromptTurnId}
                  latest={turn.id === latestPromptTurnId}
                  emptyPromptLabel={emptyPromptLabel}
                  t={t}
                  onSelectPromptTurn={onSelectPromptTurn}
                />
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </View>
  );
}

// This component coordinates persisted diff UI state with host capabilities and tab navigation.
// oxlint-disable-next-line complexity
export function GitDiffPane({
  serverId,
  workspaceId,
  cwd,
  enabled,
  onOpenWorkspaceFile,
  onAddToChat,
}: GitDiffPaneProps) {
  const { settings: appSettings } = useAppSettings();
  const { t } = useTranslation();
  const isMobile = useIsCompactFormFactor();
  const canUseSplitLayout = isWeb && !isMobile;
  const { preferences: changesPreferences, updatePreferences: updateChangesPreferences } =
    useChangesPreferences();
  const [changesSource, setChangesSource] = useState<ChangesSource>("checkout");
  const [selectedPromptTurnId, setSelectedPromptTurnId] = useState<string | null>(null);
  const diffFocusRequestIdRef = useRef(0);
  const [diffFocusRequest, setDiffFocusRequest] = useState<{
    path: string;
    requestId: number;
    reviewTarget?: { side: "old" | "new"; lineNumber: number };
  } | null>(null);
  const [activeDiffFileIndex, setActiveDiffFileIndex] = useState(-1);
  const [activeDiffHunkIndex, setActiveDiffHunkIndex] = useState(-1);
  const [activeReviewCommentIndex, setActiveReviewCommentIndex] = useState(-1);
  const wrapLines = changesPreferences.wrapLines;
  // COMPAT(checkoutDiffSubmodulePaths): added in v0.1.103, remove gate after 2027-01-08.
  const submoduleGroupingSupported = useSessionStore(
    (state) => state.sessions[serverId]?.serverInfo?.features?.checkoutDiffSubmodulePaths === true,
  );
  // COMPAT(agentTurnChanges): added in v1.1.114, remove gate after 2027-01-22.
  const agentTurnChangesSupported = useSessionStore(
    (state) => state.sessions[serverId]?.serverInfo?.features?.agentTurnChanges === true,
  );
  const focusedAgentId = useFocusedWorkspaceAgentId({
    serverId,
    workspaceId,
    cwd,
  });
  const activeChangesSource = resolveActiveChangesSource(changesSource, agentTurnChangesSupported);
  const fileGrouping = resolveCheckoutDiffFileGrouping({
    preferred: changesPreferences.fileGrouping,
    submoduleGroupingSupported,
  });
  const effectiveLayout = resolveEffectiveDiffLayout({
    canUseSplitLayout,
    preferred: changesPreferences.layout,
  });

  const handleToggleWrapLines = useCallback(() => {
    void updateChangesPreferences({ wrapLines: !wrapLines });
  }, [updateChangesPreferences, wrapLines]);

  const handleToggleHideWhitespace = useCallback(() => {
    void updateChangesPreferences({ hideWhitespace: !changesPreferences.hideWhitespace });
  }, [changesPreferences.hideWhitespace, updateChangesPreferences]);

  const handleLayoutChange = useCallback(
    (layout: "unified" | "split") => {
      if (layout !== changesPreferences.layout) {
        void updateChangesPreferences({ layout });
      }
    },
    [changesPreferences.layout, updateChangesPreferences],
  );

  const codeFontSize = appSettings.codeFontSize;
  const diffModeTriggerStyle = useMemo(() => buildDiffModeTriggerStyle(), []);
  const promptTurnTriggerStyle = useMemo(() => buildPromptTurnTriggerStyle(), []);

  const expandAllToggleStyle = useMemo(() => buildExpandAllButtonStyle(), []);

  const overflowToggleStyle = useMemo(() => buildOverflowButtonStyle(), []);

  const toast = useToast();
  const isLocalDaemon = useIsLocalDaemon(serverId);
  const { targets: desktopOpenTargets, isAvailable: isDesktopOpenAvailable } =
    useDesktopOpenTargets({ isLocalExecution: isLocalDaemon });
  const { preferredEditorId } = usePreferredEditor();
  const fileManagerTarget = desktopOpenTargets.find((target) => target.kind === "file-manager");
  const {
    changesTabOpen,
    toggleChanges: handleToggleChangesTab,
    openCommit: handleCommitPress,
    onChangesFilePress,
  } = useDiffTabNavigation({ serverId, workspaceId, cwd, isMobile });
  const refreshSupported = useSessionStore(
    (s) => s.sessions[serverId]?.serverInfo?.features?.checkoutRefresh === true,
  );
  const client = useSessionStore((state) => state.sessions[serverId]?.client);
  // COMPAT(fsEntryDuplicate): added in v0.3.0, remove gate after 2027-02-09.
  const fsEntryDuplicateEnabled = useSessionStore(
    (state) => state.sessions[serverId]?.serverInfo?.features?.fsEntryDuplicate === true,
  );
  const runRefresh = useCheckoutGitActionsStore((s) => s.refresh);
  const isRefreshing =
    useCheckoutGitActionsStore((s) => s.getStatus({ serverId, cwd, actionId: "refresh" })) ===
    "pending";

  const handleRefresh = useCallback(() => {
    if (isRefreshing) {
      return;
    }
    void runRefresh({ serverId, cwd }).catch((error) => {
      toast.error(error instanceof Error ? error.message : t("workspace.git.diff.failedRefresh"));
    });
  }, [cwd, isRefreshing, runRefresh, serverId, t, toast]);

  const {
    status,
    isStatusLoading,
    isGit,
    notGit,
    statusErrorMessage,
    baseRef,
    currentBranchName,
    diffMode,
    selectUncommitted: selectCheckoutUncommitted,
    selectBase: selectCheckoutBase,
    files: checkoutFiles,
    diffPayloadError: checkoutDiffPayloadError,
    diffTooLarge: checkoutDiffTooLarge,
    isDiffLoading: isCheckoutDiffLoading,
    reviewActions,
    reviewComments,
    reviewDraftKey,
    reviewedPaths,
    setFileReviewed,
    reviewAttachment,
  } = useWorkingDiff({
    serverId,
    workspaceId: workspaceId ?? undefined,
    cwd,
    ignoreWhitespace: changesPreferences.hideWhitespace,
    enabled: enabled !== false && activeChangesSource === "checkout",
  });
  const diffQueryEnablement = resolveDiffQueryEnablement({
    source: activeChangesSource,
    paneEnabled: enabled !== false,
    isGit,
  });
  const agentSessionChangesQuery = useAgentSessionChangesQuery({
    serverId,
    agentId: focusedAgentId,
    mode: "session",
    turnId: selectedPromptTurnId,
    ignoreWhitespace: changesPreferences.hideWhitespace,
    enabled: diffQueryEnablement.session,
  });
  const {
    files,
    payloadError: diffPayloadError,
    isLoading: isDiffLoading,
  } = selectDiffQueryState({
    source: activeChangesSource,
    checkout: {
      files: checkoutFiles,
      payloadError: checkoutDiffPayloadError,
      isLoading: isCheckoutDiffLoading,
    },
    session: agentSessionChangesQuery,
  });
  const sortedReviewComments = useMemo(
    () =>
      activeChangesSource === "checkout" ? sortReviewCommentsForDiff(reviewComments, files) : [],
    [activeChangesSource, files, reviewComments],
  );
  const reviewedFileCount = activeChangesSource === "checkout" ? reviewedPaths.size : 0;
  const diffHunkNavigationTargets = useMemo(() => buildDiffHunkNavigationTargets(files), [files]);

  useEffect(() => {
    setDiffFocusRequest(null);
    setActiveDiffFileIndex(-1);
    setActiveDiffHunkIndex(-1);
    setActiveReviewCommentIndex(-1);
  }, [activeChangesSource, reviewDraftKey]);
  const diffTooLarge = activeChangesSource === "checkout" && checkoutDiffTooLarge;
  usePublishWorkingDiffAttachment({
    serverId,
    workspaceId: workspaceId ?? undefined,
    cwd,
    attachment: reviewAttachment,
    enabled: activeChangesSource === "checkout" && !changesTabOpen,
  });
  const buildActiveDiffContext = useCallback((): WorkspaceFileDiffContext | null => {
    if (activeChangesSource === "session") {
      if (!focusedAgentId) {
        return null;
      }
      return {
        source: "session",
        agentId: focusedAgentId,
        ...(selectedPromptTurnId ? { turnId: selectedPromptTurnId } : {}),
        ignoreWhitespace: changesPreferences.hideWhitespace,
      };
    }
    return {
      cwd,
      mode: diffMode,
      ...(diffMode === "base" && baseRef ? { baseRef } : {}),
      ignoreWhitespace: changesPreferences.hideWhitespace,
    };
  }, [
    activeChangesSource,
    baseRef,
    changesPreferences.hideWhitespace,
    cwd,
    diffMode,
    focusedAgentId,
    selectedPromptTurnId,
  ]);
  const handleOpenDiffFile = useCallback(
    (filePath: string) => {
      const diffContext = buildActiveDiffContext();
      if (!diffContext) {
        return;
      }
      const target = createDiffFileOpenTarget({ filePath, diffContext });
      onOpenWorkspaceFile?.(target.request);
    },
    [buildActiveDiffContext, onOpenWorkspaceFile],
  );
  const handleViewSourceFile = useCallback(
    (file: ParsedDiffFile) => {
      const diffContext = buildActiveDiffContext();
      if (!diffContext) {
        return;
      }
      const firstChange = buildSourceDiffHunkNavigationTargets(file)[0];
      const target = createDiffFileSourceTarget({
        filePath: file.path,
        diffContext,
        ...(firstChange ? { lineNumber: firstChange.lineNumber } : {}),
      });
      onOpenWorkspaceFile?.(target.request);
    },
    [buildActiveDiffContext, onOpenWorkspaceFile],
  );
  const handleOpenSourceFile = useCallback(
    (file: ParsedDiffFile) => {
      onOpenWorkspaceFile?.(createChangedFileSourceTarget(file.path).request);
    },
    [onOpenWorkspaceFile],
  );
  const handleViewDiffFile = useCallback(
    (filePath: string) => {
      if (activeChangesSource === "checkout" && onChangesFilePress) {
        onChangesFilePress(filePath);
        return;
      }
      handleOpenDiffFile(filePath);
    },
    [activeChangesSource, handleOpenDiffFile, onChangesFilePress],
  );
  const handleSelectUncommitted = useCallback(() => {
    setChangesSource("checkout");
    selectCheckoutUncommitted();
  }, [selectCheckoutUncommitted]);

  const handleSelectBase = useCallback(() => {
    setChangesSource("checkout");
    selectCheckoutBase();
  }, [selectCheckoutBase]);

  const handleSelectSessionChanges = useCallback(() => {
    setChangesSource("session");
  }, []);

  useEffect(() => {
    setSelectedPromptTurnId(null);
  }, [focusedAgentId]);
  const {
    githubFeaturesEnabled,
    forge,
    authState,
    payloadError: prPayloadError,
  } = useCheckoutPrStatusQuery({
    serverId,
    cwd,
    enabled: isGit,
  });
  const workspaceOpenTargets = useMemo(
    () =>
      planWorkspaceOpenTargets({
        workspaceDirectory: cwd,
        desktopTargets: desktopOpenTargets,
        canUseDesktopBridge: isDesktopOpenAvailable,
        isLocalExecution: isLocalDaemon,
        checkoutStatus: status,
        forge,
      }),
    [cwd, desktopOpenTargets, forge, isDesktopOpenAvailable, isLocalDaemon, status],
  );
  const preferredOpenTarget = useMemo(
    () => resolvePreferredEditorTarget(workspaceOpenTargets, preferredEditorId),
    [preferredEditorId, workspaceOpenTargets],
  );
  const openInPreferredToolMutation = useMutation({
    mutationFn: async (file: ParsedDiffFile) => {
      const fileTargets = planWorkspaceOpenTargets({
        workspaceDirectory: cwd,
        activeFile: { path: file.path },
        desktopTargets: desktopOpenTargets,
        canUseDesktopBridge: isDesktopOpenAvailable,
        isLocalExecution: isLocalDaemon,
        checkoutStatus: status,
        forge,
      });
      const target = resolvePreferredEditorTarget(fileTargets, preferredEditorId);
      if (!target) {
        throw new Error(t("workspace.git.openInEditor.targetUnavailable"));
      }
      if (target.source === "desktop") {
        await openDesktopTarget(target.openInput);
        return;
      }
      await openExternalUrl(target.url);
    },
    onError: (error: unknown) => {
      toast.error(
        error instanceof Error ? error.message : t("workspace.git.openInEditor.failedOpenFile"),
      );
    },
  });
  const handleOpenInPreferredTool = useCallback(
    (file: ParsedDiffFile) => {
      if (!openInPreferredToolMutation.isPending) {
        openInPreferredToolMutation.mutate(file);
      }
    },
    [openInPreferredToolMutation],
  );
  const openingPreferredToolPath = openInPreferredToolMutation.isPending
    ? (openInPreferredToolMutation.variables?.path ?? null)
    : null;
  const forgeProvidersSupported = useSessionStore(
    (s) => s.sessions[serverId]?.serverInfo?.features?.forgeProviders === true,
  );
  const forgeSetupAction = computeForgeSetupAction({
    forge,
    forgeProvidersSupported,
    authState,
  });
  const forgeSetupMessage = useMemo(
    () =>
      buildForgeSetupMessage({
        action: forgeSetupAction,
        forge,
        host: parseForgeHost(status?.remoteUrl),
        t,
      }),
    [forgeSetupAction, forge, status?.remoteUrl, t],
  );
  const normalizedWorkspaceRoot = useMemo(() => cwd.trim(), [cwd]);
  const workspaceStateKey = useMemo(
    () =>
      buildWorkspaceExplorerStateKey({
        workspaceId,
        workspaceRoot: normalizedWorkspaceRoot,
      }),
    [normalizedWorkspaceRoot, workspaceId],
  );
  const expandedPathsArray = usePanelStore((state) =>
    workspaceStateKey ? state.diffExpandedPathsByWorkspace[workspaceStateKey] : undefined,
  );
  const setDiffExpandedPathsForWorkspace = usePanelStore(
    (state) => state.setDiffExpandedPathsForWorkspace,
  );
  const collapsedFoldersArray = usePanelStore((state) =>
    workspaceStateKey ? state.diffCollapsedFoldersByWorkspace[workspaceStateKey] : undefined,
  );
  const collapsedGroupKeysArray = usePanelStore((state) =>
    workspaceStateKey ? state.diffCollapsedGroupsByWorkspace[workspaceStateKey] : undefined,
  );
  const setDiffCollapsedFoldersForWorkspace = usePanelStore(
    (state) => state.setDiffCollapsedFoldersForWorkspace,
  );
  const setDiffCollapsedGroupsForWorkspace = usePanelStore(
    (state) => state.setDiffCollapsedGroupsForWorkspace,
  );
  const stableExpandedPathsArray = expandedPathsArray ?? EMPTY_PATH_LIST;
  const stableCollapsedFoldersArray = collapsedFoldersArray ?? EMPTY_PATH_LIST;
  const stableCollapsedGroupKeysArray = collapsedGroupKeysArray ?? EMPTY_PATH_LIST;
  const expandedPaths = useMemo(
    () => new Set(stableExpandedPathsArray),
    [stableExpandedPathsArray],
  );
  const handleFileGroupingChange = useCallback(
    (nextGrouping: CheckoutDiffFileGrouping) => {
      if (nextGrouping === "submodule" && !submoduleGroupingSupported) {
        return;
      }
      if (nextGrouping === changesPreferences.fileGrouping) {
        return;
      }
      if (nextGrouping === "directory" && workspaceStateKey) {
        setDiffCollapsedFoldersForWorkspace(workspaceStateKey, []);
      }
      void updateChangesPreferences({ fileGrouping: nextGrouping });
    },
    [
      changesPreferences.fileGrouping,
      setDiffCollapsedFoldersForWorkspace,
      submoduleGroupingSupported,
      updateChangesPreferences,
      workspaceStateKey,
    ],
  );
  const sharedDisplayPreferences = useMemo(
    () => ({
      layout: effectiveLayout,
      wrapLines,
      codeFontSize,
      monoFontFamily: appSettings.monoFontFamily,
    }),
    [appSettings.monoFontFamily, codeFontSize, effectiveLayout, wrapLines],
  );
  const visibleExpandedPathsArray = changesTabOpen ? EMPTY_PATH_LIST : stableExpandedPathsArray;
  const allFileDiffsExpanded = useMemo(() => {
    if (files.length === 0 || changesTabOpen) return false;
    return files.every((file) => expandedPaths.has(file.path));
  }, [changesTabOpen, expandedPaths, files]);

  const handleToggleExpandAll = useCallback(() => {
    if (!workspaceStateKey) {
      return;
    }
    if (allFileDiffsExpanded) {
      setDiffExpandedPathsForWorkspace(workspaceStateKey, []);
    } else {
      setDiffExpandedPathsForWorkspace(
        workspaceStateKey,
        files.map((file) => file.path),
      );
    }
  }, [allFileDiffsExpanded, files, setDiffExpandedPathsForWorkspace, workspaceStateKey]);
  const handleExpandedPathsChange = useCallback(
    (nextPaths: string[]) => {
      if (!workspaceStateKey) {
        return;
      }
      setDiffExpandedPathsForWorkspace(workspaceStateKey, nextPaths);
    },
    [setDiffExpandedPathsForWorkspace, workspaceStateKey],
  );
  const handleCollapsedFoldersChange = useCallback(
    (nextPaths: string[]) => {
      if (!workspaceStateKey) {
        return;
      }
      setDiffCollapsedFoldersForWorkspace(workspaceStateKey, nextPaths);
    },
    [setDiffCollapsedFoldersForWorkspace, workspaceStateKey],
  );
  const downloadFile = useFileDownload({ serverId, workspaceId, workspaceRoot: cwd });
  const handleCopyPath = useCallback(
    (path: string) => {
      void Clipboard.setStringAsync(
        buildAbsoluteExplorerPath({ workspaceRoot: cwd, entryPath: path }),
      );
    },
    [cwd],
  );
  const handleCopyRelativePath = useCallback((path: string) => {
    void Clipboard.setStringAsync(path);
  }, []);
  const handleRevealPath = useCallback(
    async (path: string) => {
      if (!fileManagerTarget) {
        return;
      }
      try {
        await openDesktopTarget({
          editorId: fileManagerTarget.id,
          workspacePath: cwd,
          filePath: buildAbsoluteExplorerPath({ workspaceRoot: cwd, entryPath: path }),
        });
      } catch (cause) {
        toast.error(
          cause instanceof Error ? cause.message : t("workspace.fileExplorer.errors.revealFailed"),
        );
      }
    },
    [cwd, fileManagerTarget, t, toast],
  );
  const handleDownloadPath = useCallback(
    (path: string) => {
      downloadFile({ fileName: path.split("/").pop() ?? path, path });
    },
    [downloadFile],
  );
  const handleCollapsedGroupKeysChange = useCallback(
    (nextKeys: string[]) => {
      if (!workspaceStateKey) {
        return;
      }
      setDiffCollapsedGroupsForWorkspace(workspaceStateKey, nextKeys);
    },
    [setDiffCollapsedGroupsForWorkspace, workspaceStateKey],
  );
  const focusDiffFile = useCallback(
    (input: { fileIndex: number; reviewTarget?: { side: "old" | "new"; lineNumber: number } }) => {
      const file = files[input.fileIndex];
      if (!file) {
        return;
      }
      if (workspaceStateKey) {
        // Navigation targets must not remain hidden inside a collapsed grouping.
        setDiffCollapsedFoldersForWorkspace(workspaceStateKey, []);
        setDiffCollapsedGroupsForWorkspace(workspaceStateKey, []);
        if (input.reviewTarget && !expandedPaths.has(file.path)) {
          setDiffExpandedPathsForWorkspace(workspaceStateKey, [...expandedPaths, file.path]);
        }
      }
      diffFocusRequestIdRef.current += 1;
      setDiffFocusRequest({
        path: file.path,
        requestId: diffFocusRequestIdRef.current,
        ...(input.reviewTarget ? { reviewTarget: input.reviewTarget } : {}),
      });
      setActiveDiffFileIndex(input.fileIndex);
    },
    [
      expandedPaths,
      files,
      setDiffCollapsedFoldersForWorkspace,
      setDiffCollapsedGroupsForWorkspace,
      setDiffExpandedPathsForWorkspace,
      workspaceStateKey,
    ],
  );
  const navigateChangedFile = useCallback(
    (direction: "previous" | "next") => {
      const nextIndex = getAdjacentCircularIndex({
        currentIndex: activeDiffFileIndex,
        itemCount: files.length,
        direction,
      });
      if (nextIndex !== null) {
        focusDiffFile({ fileIndex: nextIndex });
      }
    },
    [activeDiffFileIndex, files.length, focusDiffFile],
  );
  const handlePreviousChangedFile = useCallback(
    () => navigateChangedFile("previous"),
    [navigateChangedFile],
  );
  const handleNextChangedFile = useCallback(
    () => navigateChangedFile("next"),
    [navigateChangedFile],
  );
  const navigateChangedHunk = useCallback(
    (direction: "previous" | "next") => {
      const nextIndex = getAdjacentCircularIndex({
        currentIndex: activeDiffHunkIndex,
        itemCount: diffHunkNavigationTargets.length,
        direction,
      });
      const target = nextIndex === null ? null : diffHunkNavigationTargets[nextIndex];
      if (!target || nextIndex === null) {
        return;
      }
      setActiveDiffHunkIndex(nextIndex);
      focusDiffFile({
        fileIndex: target.fileIndex,
        reviewTarget: { side: target.side, lineNumber: target.lineNumber },
      });
    },
    [activeDiffHunkIndex, diffHunkNavigationTargets, focusDiffFile],
  );
  const handlePreviousChangedHunk = useCallback(
    () => navigateChangedHunk("previous"),
    [navigateChangedHunk],
  );
  const handleNextChangedHunk = useCallback(
    () => navigateChangedHunk("next"),
    [navigateChangedHunk],
  );
  const handleSelectReviewComment = useCallback(
    (comment: ReviewDraftComment, commentIndex: number) => {
      const fileIndex = files.findIndex((file) => file.path === comment.filePath);
      if (fileIndex < 0) {
        return;
      }
      setActiveReviewCommentIndex(commentIndex);
      focusDiffFile({
        fileIndex,
        reviewTarget: { side: comment.side, lineNumber: comment.lineNumber },
      });
    },
    [files, focusDiffFile],
  );

  const handleDuplicatePath = useCallback(
    async (path: string) => {
      if (!client) {
        return;
      }
      try {
        const payload = await client.duplicateFileEntry({ cwd, path });
        if (!payload.success) {
          toast.error(payload.error ?? t("workspace.fileExplorer.errors.duplicateFailed"));
        }
      } catch (cause) {
        toast.error(cause instanceof Error ? cause.message : String(cause));
      }
    },
    [client, cwd, t, toast],
  );
  const onRevertPath = useDiscardChangesAction({ serverId, cwd, diffMode });
  const workingTreeMode = useMemo(
    () => ({
      kind: "working_tree" as const,
      fileGrouping,
      expandedPaths: visibleExpandedPathsArray,
      persistedExpandedPaths: stableExpandedPathsArray,
      collapsedFolders: stableCollapsedFoldersArray,
      collapsedGroupKeys: stableCollapsedGroupKeysArray,
      reviewActions: checkoutOnlyValue(activeChangesSource, reviewActions),
      reviewedPaths: checkoutOnlyValue(activeChangesSource, reviewedPaths),
      onToggleReviewed: checkoutOnlyValue(activeChangesSource, setFileReviewed),
      focusPath: checkoutOnlyValue(activeChangesSource, diffFocusRequest?.path),
      focusRequestId: checkoutOnlyValue(activeChangesSource, diffFocusRequest?.requestId),
      reviewFocusTarget: checkoutOnlyValue(
        activeChangesSource,
        diffFocusRequest?.reviewTarget
          ? {
              filePath: diffFocusRequest.path,
              side: diffFocusRequest.reviewTarget.side,
              lineNumber: diffFocusRequest.reviewTarget.lineNumber,
              requestId: diffFocusRequest.requestId,
            }
          : undefined,
      ),
      onFilePress: onOpenWorkspaceFile ? handleViewDiffFile : undefined,
      workspaceFileDragScope: workspaceId ? { serverId, workspaceId } : undefined,
      onViewSource: onOpenWorkspaceFile ? handleViewSourceFile : undefined,
      onOpenFile: onOpenWorkspaceFile ? handleOpenSourceFile : undefined,
      onOpenInPreferredTool: preferredOpenTarget ? handleOpenInPreferredTool : undefined,
      preferredOpenToolLabel: preferredOpenTarget?.label,
      openingPreferredToolPath,
      onAddToChat,
      onCopyPath: handleCopyPath,
      onCopyRelativePath: handleCopyRelativePath,
      onReveal: fileManagerTarget ? handleRevealPath : undefined,
      revealTargetName: fileManagerTarget?.label,
      onDownload: handleDownloadPath,
      onDuplicate: fsEntryDuplicateEnabled ? handleDuplicatePath : undefined,
      onRevert: onRevertPath,
      onExpandedPathsChange: handleExpandedPathsChange,
      onCollapsedFoldersChange: handleCollapsedFoldersChange,
      onCollapsedGroupKeysChange: handleCollapsedGroupKeysChange,
    }),
    [
      activeChangesSource,
      diffFocusRequest,
      fileGrouping,
      handleCollapsedFoldersChange,
      handleCollapsedGroupKeysChange,
      handleExpandedPathsChange,
      handleOpenSourceFile,
      handleViewSourceFile,
      handleViewDiffFile,
      handleOpenInPreferredTool,
      handleCopyPath,
      handleCopyRelativePath,
      handleDownloadPath,
      handleDuplicatePath,
      handleRevealPath,
      fileManagerTarget,
      fsEntryDuplicateEnabled,
      onRevertPath,
      onAddToChat,
      onOpenWorkspaceFile,
      openingPreferredToolPath,
      preferredOpenTarget,
      reviewActions,
      reviewedPaths,
      setFileReviewed,
      serverId,
      stableCollapsedFoldersArray,
      stableCollapsedGroupKeysArray,
      stableExpandedPathsArray,
      visibleExpandedPathsArray,
      workspaceId,
    ],
  );

  const hasChanges = files.length > 0;
  const diffErrorMessage = diffPayloadError?.message ?? null;
  const prErrorMessage = computePrErrorMessage(githubFeaturesEnabled, prPayloadError);
  const baseRefLabel = useMemo(
    () => computeBaseRefLabel(baseRef, t("workspace.git.diff.base")),
    [baseRef, t],
  );
  const { gitActions, branchLabel } = useGitActions({
    serverId,
    cwd,
    icons: GIT_ACTION_ICONS,
  });
  const committedDiffDescription = useMemo(
    () => computeCommittedDiffDescription(branchLabel, baseRefLabel),
    [baseRefLabel, branchLabel],
  );
  const uncommittedLabel = t("workspace.git.diff.uncommitted");
  const committedLabel = t("workspace.git.diff.committed");
  const sessionChangesLabel = t("workspace.git.diff.sessionChanges");
  const sourceLabel = computeChangesSourceLabel({
    source: activeChangesSource,
    diffMode,
    uncommitted: uncommittedLabel,
    committed: committedLabel,
    session: sessionChangesLabel,
  });

  const emptyMessage = computeChangesEmptyMessage({
    source: activeChangesSource,
    focusedAgentId,
    baselineAvailable: agentSessionChangesQuery.baselineAvailable,
    hasPromptTurns: agentSessionChangesQuery.turns.length > 0,
    hideWhitespace: changesPreferences.hideWhitespace,
    diffMode,
    baseRefLabel,
    t,
  });

  const bodyContent: ReactElement = (
    <DiffBodyContent
      isStatusLoading={isStatusLoading}
      statusErrorMessage={statusErrorMessage}
      notGit={notGit}
      isDiffLoading={isDiffLoading}
      diffErrorMessage={diffErrorMessage}
      diffTooLarge={diffTooLarge}
      hasChanges={hasChanges}
      emptyMessage={emptyMessage}
      checkingRepositoryLabel={t("workspace.git.diff.checkingRepository")}
      notRepositoryLabel={t("workspace.git.diff.notRepository")}
    >
      <SharedDiffView
        files={files}
        displayPreferences={sharedDisplayPreferences}
        mode={workingTreeMode}
      />
    </DiffBodyContent>
  );

  return (
    <View
      {...{
        onContextMenu: (event: { preventDefault?: () => void }) => event.preventDefault?.(),
      }}
      style={styles.container}
    >
      {isGit && (currentBranchName || isMobile) ? (
        <View style={styles.header} testID="changes-header">
          <BranchSwitcher
            currentBranchName={currentBranchName}
            serverId={serverId}
            workspaceId={workspaceId ?? cwd}
            workspaceDirectory={cwd}
            isGitCheckout={isGit}
            testID="changes-branch-switcher"
          />
          {isMobile ? <GitActionsSplitButton gitActions={gitActions} /> : null}
        </View>
      ) : null}

      {isGit ? (
        <View style={styles.diffStatusContainer}>
          <View style={styles.diffStatusInner}>
            <ChangesSourceControls
              source={activeChangesSource}
              diffMode={diffMode}
              agentTurnChangesSupported={agentTurnChangesSupported}
              promptTurns={agentSessionChangesQuery.turns}
              selectedPromptTurnId={agentSessionChangesQuery.selectedTurnId}
              sourceLabel={sourceLabel}
              uncommittedLabel={uncommittedLabel}
              committedLabel={committedLabel}
              sessionChangesLabel={sessionChangesLabel}
              committedDiffDescription={committedDiffDescription}
              triggerStyle={diffModeTriggerStyle}
              promptTriggerStyle={promptTurnTriggerStyle}
              t={t}
              onSelectUncommitted={handleSelectUncommitted}
              onSelectBase={handleSelectBase}
              onSelectSessionChanges={handleSelectSessionChanges}
              onSelectPromptTurn={setSelectedPromptTurnId}
            />
            <View style={styles.diffStatusButtons}>
              <ChangesTabToggle
                isMobile={isMobile}
                selected={changesTabOpen}
                onPress={handleToggleChangesTab}
              />
              {files.length > 0 && !changesTabOpen ? (
                <DiffFilesToolbar
                  allFileDiffsExpanded={allFileDiffsExpanded}
                  isMobile={isMobile}
                  expandAllToggleStyle={expandAllToggleStyle}
                  onToggleExpandAll={handleToggleExpandAll}
                />
              ) : null}
              {activeChangesSource === "checkout" &&
              diffHunkNavigationTargets.length > 0 &&
              !changesTabOpen ? (
                <DiffHunkNavigationControls
                  currentIndex={activeDiffHunkIndex}
                  total={diffHunkNavigationTargets.length}
                  onPrevious={handlePreviousChangedHunk}
                  onNext={handleNextChangedHunk}
                />
              ) : null}
              {activeChangesSource === "checkout" && files.length > 0 && !changesTabOpen ? (
                <ReviewWorkflowControls
                  comments={sortedReviewComments}
                  activeCommentIndex={activeReviewCommentIndex}
                  reviewedCount={reviewedFileCount}
                  totalFiles={files.length}
                  isMobile={isMobile}
                  onPreviousFile={handlePreviousChangedFile}
                  onNextFile={handleNextChangedFile}
                  onSelectComment={handleSelectReviewComment}
                />
              ) : null}
              <DiffOptionsMenu
                brand={getForgePresentation(forge).brandLabel}
                fileGrouping={files.length > 0 ? fileGrouping : undefined}
                hideWhitespace={changesPreferences.hideWhitespace}
                isMobile={isMobile}
                isRefreshing={isRefreshing}
                layout={
                  canUseSplitLayout && !changesTabOpen ? changesPreferences.layout : undefined
                }
                overflowToggleStyle={overflowToggleStyle}
                refreshSupported={refreshSupported}
                submoduleGroupingSupported={submoduleGroupingSupported}
                wrapLines={wrapLines}
                onFileGroupingChange={files.length > 0 ? handleFileGroupingChange : undefined}
                onLayoutChange={handleLayoutChange}
                onRefresh={handleRefresh}
                onToggleHideWhitespace={handleToggleHideWhitespace}
                onToggleWrapLines={handleToggleWrapLines}
              />
            </View>
          </View>
        </View>
      ) : null}

      {forgeSetupMessage ? (
        <View style={styles.forgeSetupCallout} testID="forge-setup-callout">
          <Text style={styles.forgeSetupCalloutText}>{forgeSetupMessage}</Text>
        </View>
      ) : null}

      {prErrorMessage ? <Text style={styles.actionErrorText}>{prErrorMessage}</Text> : null}

      <View style={styles.diffContainer}>{bodyContent}</View>

      <CommitsSection serverId={serverId} cwd={cwd} onCommitPress={handleCommitPress} />
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  container: {
    flex: 1,
    minHeight: 0,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing[2],
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[2],
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  diffStatusContainer: {
    height: WORKSPACE_SECONDARY_HEADER_HEIGHT,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    backgroundColor: theme.colors.surface0,
  },
  diffStatusInner: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingRight: theme.spacing[3],
  },
  diffSourceControls: {
    flexDirection: "row",
    alignItems: "center",
    minWidth: 0,
  },
  diffModeTrigger: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: theme.spacing[1],
    // Align text with header branch icon (at spacing[3] from edge, minus our horizontal padding)
    marginLeft: theme.spacing[3] - theme.spacing[1],
    paddingHorizontal: theme.spacing[1],
    height: {
      xs: 28,
      sm: 28,
      md: 24,
    },
    borderRadius: theme.borderRadius.lg,
    flexShrink: 0,
  },
  diffModeTriggerHovered: {
    backgroundColor: theme.colors.surface2,
  },
  promptTurnTrigger: {
    marginLeft: 0,
    maxWidth: 280,
    flexShrink: 1,
  },
  diffModeTriggerPressed: {
    backgroundColor: theme.colors.surface2,
  },
  diffStatusRowHovered: {
    backgroundColor: theme.colors.surface2,
  },
  diffStatusText: {
    fontSize: theme.fontSize.xs,
    lineHeight: theme.fontSize.xs * 1.25,
    color: theme.colors.foregroundMuted,
  },
  promptTurnText: {
    flexShrink: 1,
  },
  diffStatusIconHidden: {
    opacity: 0,
  },
  diffStatusButtons: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
    flexWrap: "wrap",
  },
  reviewWorkflowControls: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
  },
  hunkNavigationControls: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
  },
  hunkProgressText: {
    minWidth: 30,
    textAlign: "center",
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
    fontWeight: theme.fontWeight.medium,
    fontVariant: ["tabular-nums"],
  },
  reviewNavigationButton: {
    minWidth: {
      xs: 32,
      sm: 32,
      md: 24,
    },
    height: {
      xs: 32,
      sm: 32,
      md: 24,
    },
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.borderRadius.md,
  },
  reviewDraftCount: {
    height: {
      xs: 32,
      sm: 32,
      md: 24,
    },
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: theme.spacing[1],
    paddingHorizontal: theme.spacing[2],
    borderRadius: theme.borderRadius.full,
    backgroundColor: theme.colors.surface2,
  },
  reviewSummaryDivider: {
    width: theme.borderWidth[1],
    height: 12,
    marginHorizontal: theme.spacing[1],
    backgroundColor: theme.colors.borderAccent,
  },
  reviewDraftCountText: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
    fontWeight: theme.fontWeight.medium,
    fontVariant: ["tabular-nums"],
  },
  toggleButtonSelected: {
    backgroundColor: theme.colors.surface2,
  },
  expandAllButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: theme.spacing[1],
    minWidth: {
      xs: 32,
      sm: 32,
      md: 24,
    },
    height: {
      xs: 32,
      sm: 32,
      md: 24,
    },
    paddingHorizontal: {
      xs: theme.spacing[2],
      sm: theme.spacing[2],
      md: theme.spacing[1],
    },
    borderRadius: theme.borderRadius.lg,
    flexShrink: 0,
  },
  overflowButton: {
    width: FILE_ACTIONS_MENU_WIDTH,
    height: {
      xs: 32,
      sm: 32,
      md: 24,
    },
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.borderRadius.lg,
    flexShrink: 0,
  },
  actionErrorText: {
    paddingHorizontal: theme.spacing[3],
    paddingBottom: theme.spacing[1],
    fontSize: theme.fontSize.xs,
    color: theme.colors.destructive,
  },
  forgeSetupCallout: {
    marginHorizontal: theme.spacing[3],
    marginBottom: theme.spacing[2],
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[2],
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.xl,
    backgroundColor: theme.colors.surface1,
  },
  forgeSetupCalloutText: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.foregroundMuted,
  },
  diffContainer: {
    flex: 1,
    minHeight: 0,
    position: "relative",
  },
  scrollView: {
    flex: 1,
  },
  contentContainer: {
    paddingBottom: theme.spacing[8],
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingTop: theme.spacing[16],
    gap: theme.spacing[4],
  },
  loadingText: {
    fontSize: theme.fontSize.base,
    color: theme.colors.foregroundMuted,
  },
  errorContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingTop: theme.spacing[16],
    paddingHorizontal: theme.spacing[6],
  },
  errorText: {
    fontSize: theme.fontSize.base,
    color: theme.colors.destructive,
    textAlign: "center",
  },
  emptyContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingTop: theme.spacing[16],
    paddingHorizontal: theme.spacing[6],
    gap: theme.spacing[3],
  },
  emptyIconBadge: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.borderRadius.xl,
    backgroundColor: theme.colors.surface1,
  },
  emptyText: {
    fontSize: theme.fontSize.base,
    color: theme.colors.foregroundMuted,
    textAlign: "center",
  },
  fileSection: {
    overflow: "hidden",
    backgroundColor: theme.colors.surface0,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  fileSectionHeaderContainer: {
    overflow: "hidden",
  },
  fileSectionHeaderExpanded: {
    backgroundColor: theme.colors.surface1,
  },
  fileSectionBodyContainer: {
    overflow: "hidden",
    backgroundColor: theme.colors.surface2,
  },
  fileSectionBorder: {
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  fileHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingLeft: theme.spacing[3],
    paddingRight: theme.spacing[3],
    paddingVertical: WORKSPACE_FILE_ROW_VERTICAL_PADDING,
    gap: theme.spacing[1],
    minWidth: 0,
    zIndex: 2,
    elevation: 2,
  },
  fileHeaderHovered: {
    backgroundColor: theme.colors.surface1,
  },
  fileExpandButton: {
    width: 24,
    height: 24,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  fileHeaderFileTarget: {
    flex: 1,
    minWidth: 0,
    alignSelf: "stretch",
    justifyContent: "center",
  },
  fileHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
    flex: 1,
    minWidth: 0,
  },
  fileHeaderRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
    flexShrink: 0,
  },
  fileOpenButton: {
    alignItems: "center",
    justifyContent: "center",
    width: 24,
    height: 24,
    borderRadius: theme.borderRadius.lg,
  },
  fileOpenButtonPressed: {
    backgroundColor: theme.colors.surface2,
  },
  fileOpenButtonDisabled: {
    opacity: 0.6,
  },
  fileIcon: {
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  fileName: {
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.normal,
    color: theme.colors.foreground,
    flexShrink: 1,
    minWidth: 0,
    userSelect: "none",
  },
  fileDir: {
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.normal,
    color: theme.colors.foregroundMuted,
    flex: 1,
    minWidth: 0,
    userSelect: "none",
  },
  fileDirSpacer: {
    flex: 1,
    minWidth: 0,
  },
  newBadge: {
    backgroundColor: "rgba(46, 160, 67, 0.2)",
    paddingHorizontal: theme.spacing[2],
    paddingVertical: theme.spacing[1],
    borderRadius: theme.borderRadius.full,
    flexShrink: 0,
  },
  newBadgeText: {
    fontSize: theme.fontSize.xs,
    fontWeight: theme.fontWeight.normal,
    color: theme.colors.diffAddition,
  },
  deletedBadge: {
    backgroundColor: "rgba(248, 81, 73, 0.2)",
    paddingHorizontal: theme.spacing[2],
    paddingVertical: theme.spacing[1],
    borderRadius: theme.borderRadius.full,
    flexShrink: 0,
  },
  deletedBadgeText: {
    fontSize: theme.fontSize.xs,
    fontWeight: theme.fontWeight.normal,
    color: theme.colors.diffDeletion,
  },
  additions: {
    fontSize: theme.fontSize.xs,
    fontWeight: theme.fontWeight.normal,
    color: theme.colors.diffAddition,
  },
  deletions: {
    fontSize: theme.fontSize.xs,
    fontWeight: theme.fontWeight.normal,
    color: theme.colors.diffDeletion,
  },
  diffContent: {
    borderTopWidth: theme.borderWidth[1],
    borderTopColor: theme.colors.border,
    backgroundColor: theme.colors.surface1,
  },
  diffContentRow: {
    flexDirection: "row",
    alignItems: "stretch",
  },
  diffContentInner: {
    flexDirection: "column",
  },
  linesContainer: {
    backgroundColor: theme.colors.surface1,
  },
  gutterColumn: {
    backgroundColor: theme.colors.surface1,
    zIndex: 4,
    elevation: 4,
    overflow: "visible",
  },
  gutterCell: {
    borderRightWidth: theme.borderWidth[1],
    borderRightColor: theme.colors.border,
    justifyContent: "flex-start",
    zIndex: 4,
    elevation: 4,
    overflow: "visible",
  },
  gutterContent: {
    width: "100%",
    flexDirection: "row",
    alignItems: "flex-start",
  },
  inlineReviewRow: {
    flexDirection: "row",
    alignItems: "stretch",
    backgroundColor: theme.colors.surface1,
  },
  inlineReviewGutterSpacer: {
    borderRightWidth: theme.borderWidth[1],
    borderRightColor: theme.colors.border,
    backgroundColor: theme.colors.surface1,
    flexShrink: 0,
  },
  textLineContainer: {
    flexDirection: "row",
    alignItems: "stretch",
    paddingLeft: theme.spacing[2],
  },
  splitRow: {
    flexDirection: "row",
    alignItems: "stretch",
  },
  splitColumnScroll: {
    flex: 1,
  },
  splitHeaderRow: {
    backgroundColor: theme.colors.surface2,
    paddingHorizontal: theme.spacing[3],
  },
  splitCell: {
    flex: 1,
    flexBasis: 0,
    backgroundColor: theme.colors.surface2,
  },
  splitCellRow: {
    flexDirection: "row",
    alignItems: "stretch",
  },
  emptySplitCell: {
    backgroundColor: theme.colors.surfaceDiffEmpty,
  },
  splitCellWithDivider: {
    borderLeftWidth: theme.borderWidth[1],
    borderLeftColor: theme.colors.border,
  },
  diffLineContainer: {
    flexDirection: "row",
    alignItems: "stretch",
    overflow: "visible",
  },
  lineNumberGutter: {
    borderRightWidth: theme.borderWidth[1],
    borderRightColor: theme.colors.border,
    marginRight: theme.spacing[2],
    alignSelf: "stretch",
    justifyContent: "flex-start",
    zIndex: 4,
    elevation: 4,
    overflow: "visible",
  },
  diffTextMetrics: {
    fontSize: theme.fontSize.code,
    lineHeight: theme.lineHeight.diff,
    fontFamily: theme.fontFamily.mono,
  },
  lineNumberText: {
    flex: 1,
    minWidth: 0,
    textAlign: "right",
    paddingRight: theme.spacing[2],
    color: theme.colors.foregroundMuted,
    userSelect: "none",
  },
  diffLineIndicator: {
    width: theme.spacing[2],
    flexShrink: 0,
    textAlign: "center",
    fontWeight: theme.fontWeight.bold,
    userSelect: "none",
  },
  addLineIndicator: {
    color: theme.colors.diffAddition,
  },
  removeLineIndicator: {
    color: theme.colors.diffDeletion,
  },
  addLineNumberText: {
    color: theme.colors.diffAddition,
  },
  removeLineNumberText: {
    color: theme.colors.diffDeletion,
  },
  diffLineText: {
    flex: 1,
    paddingRight: theme.spacing[3],
    color: theme.colors.foreground,
    userSelect: "text",
  },
  searchMatch: {
    backgroundColor: theme.colors.accentBorder,
  },
  currentSearchMatch: {
    color: theme.colors.accentForeground,
    backgroundColor: theme.colors.accent,
  },
  addLineContainer: {
    backgroundColor: "rgba(46, 160, 67, 0.15)", // GitHub green
  },
  addLineText: {
    color: theme.colors.foreground,
  },
  removeLineContainer: {
    backgroundColor: "rgba(248, 81, 73, 0.1)", // GitHub red
  },
  removeLineText: {
    color: theme.colors.foreground,
  },
  headerLineContainer: {
    backgroundColor: theme.colors.surface2,
  },
  headerLineText: {
    color: theme.colors.foregroundMuted,
  },
  diffContextExpander: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
  },
  diffContextExpandLabel: {
    flexShrink: 0,
    color: theme.colors.accent,
    fontSize: theme.fontSize.xs,
  },
  contextLineContainer: {
    backgroundColor: theme.colors.surface1,
  },
  contextLineText: {
    color: theme.colors.foregroundMuted,
  },
  emptySplitCellText: {
    color: "transparent",
  },
  statusMessageContainer: {
    borderTopWidth: theme.borderWidth[1],
    borderTopColor: theme.colors.border,
    backgroundColor: theme.colors.surface1,
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[4],
  },
  statusMessageText: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.foregroundMuted,
    fontStyle: "italic",
  },
  tooltipText: {
    fontSize: theme.fontSize.xs,
    color: theme.colors.foreground,
  },
}));

const DIFF_HEIGHT_CHANGE_EPSILON = 0.5;
