import { useMemo, type ReactElement, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { type PressableStateCallbackType } from "react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { Archive, CircleCheck, Copy, MoreVertical, Pencil, Pin, PinOff } from "lucide-react-native";
import { isNative, isWeb } from "@/constants/platform";
import type { Theme } from "@/styles/theme";
import type { ShortcutKey } from "@/utils/format-shortcut";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ContextMenuContent, ContextMenuItem } from "@/components/ui/context-menu";
import { Shortcut } from "@/components/ui/shortcut";

const foregroundColorMapping = (theme: Theme) => ({ color: theme.colors.foreground });
const foregroundMutedColorMapping = (theme: Theme) => ({
  color: theme.colors.foregroundMuted,
});

const ThemedMoreVertical = withUnistyles(MoreVertical);
const ThemedCopy = withUnistyles(Copy);
const ThemedArchive = withUnistyles(Archive);
const ThemedPencil = withUnistyles(Pencil);
const ThemedCircleCheck = withUnistyles(CircleCheck);
const ThemedPin = withUnistyles(Pin);
const ThemedPinOff = withUnistyles(PinOff);

const copyLeadingIcon = <ThemedCopy size={14} uniProps={foregroundMutedColorMapping} />;
const renameLeadingIcon = <ThemedPencil size={14} uniProps={foregroundMutedColorMapping} />;
const markAsReadLeadingIcon = (
  <ThemedCircleCheck size={14} uniProps={foregroundMutedColorMapping} />
);
const archiveLeadingIcon = <ThemedArchive size={14} uniProps={foregroundMutedColorMapping} />;
const pinLeadingIcon = <ThemedPin size={14} uniProps={foregroundMutedColorMapping} />;
const unpinLeadingIcon = <ThemedPinOff size={14} uniProps={foregroundMutedColorMapping} />;

function renderTriggerIcon({ hovered }: { hovered?: boolean }) {
  return (
    <ThemedMoreVertical
      size={14}
      uniProps={hovered ? foregroundColorMapping : foregroundMutedColorMapping}
    />
  );
}

interface SidebarWorkspaceMenuProps {
  workspaceKey: string;
  onCopyPath?: () => void;
  onCopyBranchName?: () => void;
  onRename?: () => void;
  onMarkAsRead?: () => void;
  onArchive: () => void;
  archiveLabel?: string;
  archiveStatus?: "idle" | "pending" | "success";
  archivePendingLabel?: string;
  archiveShortcutKeys?: ShortcutKey[][] | null;
  isPinned?: boolean;
  onTogglePin?: () => void;
}

type SidebarWorkspaceMenuSurface = "context" | "dropdown";

interface SidebarWorkspaceMenuItemProps {
  surface: SidebarWorkspaceMenuSurface;
  children: ReactNode;
  testID: string;
  leading: ReactElement;
  trailing?: ReactElement | null;
  status?: "idle" | "pending" | "success";
  pendingLabel?: string;
  onSelect?: () => void;
}

function SidebarWorkspaceMenuItem({
  surface,
  children,
  testID,
  leading,
  trailing,
  status,
  pendingLabel,
  onSelect,
}: SidebarWorkspaceMenuItemProps) {
  const itemProps = {
    testID,
    leading,
    trailing,
    status,
    pendingLabel,
    onSelect,
  };
  if (surface === "context") {
    return <ContextMenuItem {...itemProps}>{children}</ContextMenuItem>;
  }
  return <DropdownMenuItem {...itemProps}>{children}</DropdownMenuItem>;
}

function SidebarWorkspaceMenuItems({
  surface,
  workspaceKey,
  onCopyPath,
  onCopyBranchName,
  onRename,
  onMarkAsRead,
  onArchive,
  archiveLabel,
  archiveStatus,
  archivePendingLabel,
  archiveShortcutKeys,
  isPinned,
  onTogglePin,
}: SidebarWorkspaceMenuProps & { surface: SidebarWorkspaceMenuSurface }) {
  const { t } = useTranslation();
  const archiveTrailing = useMemo(
    () => (archiveShortcutKeys && !isNative ? <Shortcut chord={archiveShortcutKeys} /> : null),
    [archiveShortcutKeys],
  );

  return (
    <>
      {onCopyPath ? (
        <SidebarWorkspaceMenuItem
          surface={surface}
          testID={`sidebar-workspace-menu-copy-path-${workspaceKey}`}
          leading={copyLeadingIcon}
          onSelect={onCopyPath}
        >
          {t("sidebar.workspace.actions.copyPath")}
        </SidebarWorkspaceMenuItem>
      ) : null}
      {onCopyBranchName ? (
        <SidebarWorkspaceMenuItem
          surface={surface}
          testID={`sidebar-workspace-menu-copy-branch-name-${workspaceKey}`}
          leading={copyLeadingIcon}
          onSelect={onCopyBranchName}
        >
          {t("sidebar.workspace.actions.copyBranchName")}
        </SidebarWorkspaceMenuItem>
      ) : null}
      {onRename ? (
        <SidebarWorkspaceMenuItem
          surface={surface}
          testID={`sidebar-workspace-menu-rename-${workspaceKey}`}
          leading={renameLeadingIcon}
          onSelect={onRename}
        >
          {t("sidebar.workspace.actions.rename")}
        </SidebarWorkspaceMenuItem>
      ) : null}
      {onMarkAsRead ? (
        <SidebarWorkspaceMenuItem
          surface={surface}
          testID={`sidebar-workspace-menu-mark-as-read-${workspaceKey}`}
          leading={markAsReadLeadingIcon}
          onSelect={onMarkAsRead}
        >
          Mark as read
        </SidebarWorkspaceMenuItem>
      ) : null}
      {onTogglePin ? (
        <SidebarWorkspaceMenuItem
          surface={surface}
          testID={`sidebar-workspace-menu-pin-${workspaceKey}`}
          leading={isPinned ? unpinLeadingIcon : pinLeadingIcon}
          onSelect={onTogglePin}
        >
          {isPinned ? t("sidebar.workspace.actions.unpin") : t("sidebar.workspace.actions.pin")}
        </SidebarWorkspaceMenuItem>
      ) : null}
      <SidebarWorkspaceMenuItem
        surface={surface}
        testID={`sidebar-workspace-menu-archive-${workspaceKey}`}
        leading={archiveLeadingIcon}
        trailing={archiveTrailing}
        status={archiveStatus}
        pendingLabel={archivePendingLabel}
        onSelect={onArchive}
      >
        {archiveLabel ?? t("sidebar.workspace.actions.archive")}
      </SidebarWorkspaceMenuItem>
    </>
  );
}

export function SidebarWorkspaceMenu({
  workspaceKey,
  onCopyPath,
  onCopyBranchName,
  onRename,
  onMarkAsRead,
  onArchive,
  archiveLabel,
  archiveStatus,
  archivePendingLabel,
  archiveShortcutKeys,
  isPinned,
  onTogglePin,
}: SidebarWorkspaceMenuProps) {
  const { t } = useTranslation();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        hitSlop={8}
        style={triggerStyle}
        accessibilityRole={isWeb ? undefined : "button"}
        accessibilityLabel={t("sidebar.workspace.actions.menu")}
        testID={`sidebar-workspace-kebab-${workspaceKey}`}
      >
        {renderTriggerIcon}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" width={260}>
        <SidebarWorkspaceMenuItems
          surface="dropdown"
          workspaceKey={workspaceKey}
          onCopyPath={onCopyPath}
          onCopyBranchName={onCopyBranchName}
          onRename={onRename}
          onMarkAsRead={onMarkAsRead}
          onArchive={onArchive}
          archiveLabel={archiveLabel}
          archiveStatus={archiveStatus}
          archivePendingLabel={archivePendingLabel}
          archiveShortcutKeys={archiveShortcutKeys}
          isPinned={isPinned}
          onTogglePin={onTogglePin}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function SidebarWorkspaceContextMenuContent(props: SidebarWorkspaceMenuProps) {
  return (
    <ContextMenuContent
      align="start"
      width={260}
      testID={`sidebar-workspace-context-menu-${props.workspaceKey}`}
    >
      <SidebarWorkspaceMenuItems surface="context" {...props} />
    </ContextMenuContent>
  );
}

function triggerStyle({ hovered = false }: PressableStateCallbackType & { hovered?: boolean }) {
  return [styles.trigger, hovered && styles.triggerHovered];
}

const styles = StyleSheet.create((theme) => ({
  trigger: {
    padding: 2,
    borderRadius: 4,
    marginLeft: 2,
  },
  triggerHovered: {
    backgroundColor: theme.colors.surface2,
  },
}));
