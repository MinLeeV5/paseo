import { Fragment, useMemo, type ReactElement, type ReactNode } from "react";
import { type PressableStateCallbackType } from "react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import {
  Copy,
  CopyPlus,
  Download,
  FilePlus,
  FileText,
  FolderMinus,
  FolderOpen,
  FolderPlus,
  MessageSquarePlus,
  MoreVertical,
  Pencil,
  Trash2,
  Undo2,
  type LucideIcon,
} from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { ICON_SIZE, SPACING, type Theme } from "@/styles/theme";
import {
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
} from "@/components/ui/context-menu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const foregroundMutedColorMapping = (theme: Theme) => ({ color: theme.colors.foregroundMuted });
const ThemedMoreVertical = withUnistyles(MoreVertical);
const destructiveColorMapping = (theme: Theme) => ({ color: theme.colors.destructive });

// COMPAT(fileActionsDropdown): used by legacy diff rows while they migrate to context triggers.
export const FILE_ACTIONS_MENU_WIDTH = ICON_SIZE.sm + 2 * SPACING[1];
interface FileAction {
  key: string;
  label: string;
  icon: LucideIcon;
  onSelect: () => void;
  destructive?: boolean;
  separatorBefore?: boolean;
  testID?: string;
}

interface FileActionsContextMenuContentProps {
  fileKind: "file" | "directory";
  fileExists?: boolean;
  onOpenFile?: () => void;
  onCopyPath?: () => void;
  onCopyRelativePath?: () => void;
  onReveal?: () => void;
  revealTargetName?: string;
  onDownload?: () => void;
  onAddToChat?: () => void;
  onNewFile?: () => void;
  onNewFolder?: () => void;
  onCollapseFolder?: () => void;
  onRename?: () => void;
  onDuplicate?: () => void;
  onRevert?: () => void;
  onDelete?: () => void;
  /** Optional metadata block rendered above the actions (e.g. size/modified). */
  header?: ReactNode;
  testIDPrefix?: string;
}

interface FileActionsMenuProps extends FileActionsContextMenuContentProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  hitSlop?: number;
  accessibilityLabel: string;
}

function dropdownTriggerStyle({
  hovered,
  pressed,
  open,
}: PressableStateCallbackType & { hovered?: boolean; open?: boolean }) {
  return [
    styles.dropdownTrigger,
    (Boolean(hovered) || pressed || Boolean(open)) && styles.dropdownTriggerActive,
  ];
}

function stopDropdownTriggerPropagation(event: { stopPropagation?: () => void }) {
  event.stopPropagation?.();
}

/** @deprecated Use a row-owned context trigger with FileActionsContextMenuContent. */
export function FileActionsMenu({
  fileKind,
  fileExists = true,
  onOpenFile,
  onCopyPath,
  onDownload,
  onAddToChat,
  header,
  open,
  onOpenChange,
  hitSlop = 12,
  accessibilityLabel,
  testIDPrefix,
}: FileActionsMenuProps): ReactElement | null {
  const { t } = useTranslation();
  const actions = useMemo<FileAction[]>(() => {
    const availableFile = fileKind === "file" && fileExists;
    const next: FileAction[] = [];
    if (availableFile && onOpenFile) {
      next.push({
        key: "open-file",
        label: t("workspace.fileActions.openFile"),
        icon: FileText,
        onSelect: onOpenFile,
        testID: testIDPrefix ? `${testIDPrefix}-menu-open-file` : undefined,
      });
    }
    if (onCopyPath) {
      next.push({
        key: "copy-path",
        label: t("workspace.fileActions.copyPath"),
        icon: Copy,
        onSelect: onCopyPath,
      });
    }
    if (availableFile && onDownload) {
      next.push({
        key: "download",
        label: t("workspace.fileActions.download"),
        icon: Download,
        onSelect: onDownload,
      });
    }
    if (availableFile && onAddToChat) {
      next.push({
        key: "add-to-chat",
        label: t("workspace.fileActions.addToChat"),
        icon: MessageSquarePlus,
        onSelect: onAddToChat,
        testID: testIDPrefix ? `${testIDPrefix}-add-to-chat` : undefined,
      });
    }
    return next;
  }, [fileExists, fileKind, onAddToChat, onCopyPath, onDownload, onOpenFile, t, testIDPrefix]);
  if (actions.length === 0) return null;
  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger
        hitSlop={hitSlop}
        onPressIn={stopDropdownTriggerPropagation}
        style={dropdownTriggerStyle}
        accessibilityLabel={accessibilityLabel}
        testID={testIDPrefix ? `${testIDPrefix}-actions` : undefined}
      >
        <ThemedMoreVertical size={ICON_SIZE.sm} uniProps={foregroundMutedColorMapping} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" width={220}>
        {header ? (
          <>
            {header}
            <DropdownMenuSeparator />
          </>
        ) : null}
        {actions.map((action) => (
          <FileActionDropdownItem key={action.key} action={action} />
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * Shared context-menu content for per-file actions. The file explorer tree and git diff pane
 * own their row triggers while sharing action availability, ordering, and chrome here.
 */
export function FileActionsContextMenuContent({
  fileKind,
  fileExists = true,
  onOpenFile,
  onCopyPath,
  onCopyRelativePath,
  onReveal,
  revealTargetName,
  onDownload,
  onAddToChat,
  onNewFile,
  onNewFolder,
  onCollapseFolder,
  onRename,
  onDuplicate,
  onRevert,
  onDelete,
  header,
  testIDPrefix,
}: FileActionsContextMenuContentProps): ReactElement | null {
  const { t } = useTranslation();
  const actions = useMemo<FileAction[]>(() => {
    const availableFile = fileKind === "file" && fileExists;
    const specs: Array<FileAction | null> = [
      onNewFile
        ? {
            key: "new-file",
            label: t("workspace.fileActions.newFile"),
            icon: FilePlus,
            onSelect: onNewFile,
          }
        : null,
      onNewFolder
        ? {
            key: "new-folder",
            label: t("workspace.fileActions.newFolder"),
            icon: FolderPlus,
            onSelect: onNewFolder,
          }
        : null,
      onCollapseFolder
        ? {
            key: "collapse-folder",
            label: t("workspace.fileActions.collapseFolder"),
            icon: FolderMinus,
            onSelect: onCollapseFolder,
          }
        : null,
      availableFile && onOpenFile
        ? {
            key: "open-file",
            label: t("workspace.fileActions.openFile"),
            icon: FileText,
            onSelect: onOpenFile,
          }
        : null,
      onRename
        ? {
            key: "rename",
            label: t("workspace.fileActions.rename"),
            icon: Pencil,
            onSelect: onRename,
          }
        : null,
      onDuplicate
        ? {
            key: "duplicate",
            label: t("workspace.fileActions.duplicate"),
            icon: CopyPlus,
            onSelect: onDuplicate,
          }
        : null,
      onCopyPath
        ? {
            key: "copy-path",
            label: t("workspace.fileActions.copyPath"),
            icon: Copy,
            onSelect: onCopyPath,
          }
        : null,
      onCopyRelativePath
        ? {
            key: "copy-relative-path",
            label: t("workspace.fileActions.copyRelativePath"),
            icon: Copy,
            onSelect: onCopyRelativePath,
          }
        : null,
      onReveal && revealTargetName
        ? {
            key: "reveal",
            label: t("workspace.fileActions.revealIn", { target: revealTargetName }),
            icon: FolderOpen,
            onSelect: onReveal,
          }
        : null,
      availableFile && onDownload
        ? {
            key: "download",
            label: t("workspace.fileActions.download"),
            icon: Download,
            onSelect: onDownload,
          }
        : null,
      availableFile && onAddToChat
        ? {
            key: "add-to-chat",
            label: t("workspace.fileActions.addToChat"),
            icon: MessageSquarePlus,
            onSelect: onAddToChat,
          }
        : null,
      onRevert
        ? {
            key: "revert",
            label: t("workspace.fileActions.revert"),
            icon: Undo2,
            onSelect: onRevert,
            destructive: true,
          }
        : null,
      onDelete
        ? {
            key: "delete",
            label: t("workspace.fileActions.delete"),
            icon: Trash2,
            onSelect: onDelete,
            destructive: true,
          }
        : null,
    ];
    const availableActions = specs.filter((action): action is FileAction => action !== null);
    return availableActions.map((action, index) =>
      Object.assign(action, {
        separatorBefore: Boolean(
          action.destructive && index > 0 && !availableActions[index - 1].destructive,
        ),
        testID: testIDPrefix ? `${testIDPrefix}-${action.key}` : undefined,
      }),
    );
  }, [
    fileExists,
    fileKind,
    onAddToChat,
    onCollapseFolder,
    onCopyPath,
    onCopyRelativePath,
    onDelete,
    onDownload,
    onDuplicate,
    onNewFile,
    onNewFolder,
    onOpenFile,
    onRename,
    onReveal,
    onRevert,
    revealTargetName,
    t,
    testIDPrefix,
  ]);

  if (actions.length === 0) {
    return null;
  }
  return (
    <ContextMenuContent
      align="start"
      width={220}
      testID={testIDPrefix ? `${testIDPrefix}-context-menu` : undefined}
    >
      {header ? (
        <>
          {header}
          <ContextMenuSeparator />
        </>
      ) : null}
      {actions.map((action) => (
        <Fragment key={action.key}>
          {action.separatorBefore ? <ContextMenuSeparator /> : null}
          <FileActionMenuItem action={action} />
        </Fragment>
      ))}
    </ContextMenuContent>
  );
}

function FileActionMenuItem({ action }: { action: FileAction }): ReactElement {
  const leading = useMemo(() => {
    const ThemedIcon = withUnistyles(action.icon);
    return (
      <ThemedIcon
        size={ICON_SIZE.sm}
        uniProps={action.destructive ? destructiveColorMapping : foregroundMutedColorMapping}
      />
    );
  }, [action.destructive, action.icon]);
  return (
    <ContextMenuItem
      leading={leading}
      onSelect={action.onSelect}
      destructive={action.destructive}
      testID={action.testID}
    >
      {action.label}
    </ContextMenuItem>
  );
}

function FileActionDropdownItem({ action }: { action: FileAction }): ReactElement {
  const Icon = action.icon;
  const ThemedIcon = useMemo(() => withUnistyles(Icon), [Icon]);
  const leading = useMemo(
    () => <ThemedIcon size={ICON_SIZE.sm} uniProps={foregroundMutedColorMapping} />,
    [ThemedIcon],
  );
  return (
    <DropdownMenuItem leading={leading} onSelect={action.onSelect} testID={action.testID}>
      {action.label}
    </DropdownMenuItem>
  );
}

const styles = StyleSheet.create((theme) => ({
  dropdownTrigger: {
    padding: theme.spacing[1],
    width: FILE_ACTIONS_MENU_WIDTH,
    marginVertical: -theme.spacing[1],
    borderRadius: theme.borderRadius.md,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  dropdownTriggerActive: {
    backgroundColor: theme.colors.surface2,
  },
}));
