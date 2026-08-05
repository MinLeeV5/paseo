import { Text, View } from "react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { useTranslation } from "react-i18next";
import { Search } from "lucide-react-native";
import type { ReactNode } from "react";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { Button } from "@/components/ui/button";
import { SegmentedControl } from "@/components/ui/segmented-control";
import type { Theme } from "@/styles/theme";
import { FileConflictAlert, type FileConflictAlertState } from "./conflict-alert";
import type { FileEditorStatus } from "./editor/model";
import type { FileSearchController } from "./use-search";

const ThemedSpinner = withUnistyles(LoadingSpinner);
const spinnerMapping = (theme: Theme) => ({ color: theme.colors.foregroundMuted });

export function FilePanelBar({
  size,
  lineCount,
  mode,
  onModeChange,
  editorStatus,
  cursor,
  vimMode,
  search,
  conflict,
  actions,
}: {
  size?: number;
  lineCount?: number;
  mode?: "preview" | "source";
  onModeChange?(mode: "preview" | "source"): void;
  editorStatus?: FileEditorStatus;
  cursor?: { line: number; column: number };
  vimMode?: string | null;
  search?: FileSearchController;
  conflict?: FileConflictAlertState;
  actions?: ReactNode;
}) {
  const { t } = useTranslation();
  const previewModes = [
    {
      value: "preview" as const,
      label: t("panels.file.editor.preview"),
      testID: "file-mode-preview",
    },
    { value: "source" as const, label: t("panels.file.editor.source"), testID: "file-mode-source" },
  ];
  return (
    <View style={styles.chrome} testID="file-panel-bar">
      <View style={styles.row}>
        <View style={styles.metadata}>
          {size !== undefined ? (
            <Text
              style={styles.whisper}
              accessibilityLabel={t("panels.file.editor.fileSize", { size: formatFileSize(size) })}
            >
              {formatFileSize(size)}
            </Text>
          ) : null}
          {lineCount !== undefined ? (
            <Text
              style={styles.whisper}
              accessibilityLabel={t("panels.file.editor.lines", { count: lineCount })}
            >
              {t("panels.file.editor.lines", { count: lineCount })}
            </Text>
          ) : null}
        </View>
        <View
          style={styles.status}
          accessibilityLabel={
            editorStatus
              ? t("panels.file.editor.editorStatus", { status: editorStatus })
              : undefined
          }
        >
          {editorStatus === "dirty" ? (
            <View
              style={styles.dirtyDot}
              accessibilityLabel={t("panels.file.editor.unsavedChanges")}
            />
          ) : null}
          {editorStatus === "saving" ? (
            <>
              <ThemedSpinner size={14} uniProps={spinnerMapping} />
              <Text style={styles.secondary}>{t("panels.file.editor.saving")}</Text>
            </>
          ) : null}
          {editorStatus === "error" ? (
            <Text style={styles.error}>{t("panels.file.editor.saveFailed")}</Text>
          ) : null}
          {vimMode ? (
            <Text
              style={styles.vim}
              accessibilityLabel={t("panels.file.editor.vimMode", { mode: vimMode })}
            >
              {vimMode}
            </Text>
          ) : null}
          {cursor ? (
            <Text
              style={styles.whisper}
              accessibilityLabel={t("panels.file.editor.cursor", cursor)}
            >
              Ln {cursor.line}, Col {cursor.column}
            </Text>
          ) : null}
        </View>
        {actions}
        {search ? (
          <Button
            variant="ghost"
            size="xs"
            leftIcon={Search}
            style={styles.iconButton}
            accessibilityLabel={t("panels.file.search.open")}
            onPress={search.open}
            testID="file-search-open"
          />
        ) : null}
        {mode && onModeChange ? (
          <SegmentedControl
            size="xs"
            value={mode}
            onValueChange={onModeChange}
            testID="file-preview-mode"
            options={previewModes}
          />
        ) : null}
      </View>
      {conflict ? <FileConflictAlert state={conflict} /> : null}
    </View>
  );
}

function formatFileSize(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

const styles = StyleSheet.create((theme) => ({
  chrome: {
    flexShrink: 0,
    backgroundColor: theme.colors.surface1,
  },
  row: {
    minHeight: 32,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[3],
    paddingHorizontal: theme.spacing[3],
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  metadata: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
  },
  secondary: { color: theme.colors.foregroundMuted, fontSize: theme.fontSize.xs },
  whisper: { color: theme.colors.foregroundExtraMuted, fontSize: theme.fontSize.xs },
  error: { color: theme.colors.palette.red[300], fontSize: theme.fontSize.xs },
  dirtyDot: {
    width: 6,
    height: 6,
    borderRadius: theme.borderRadius.full,
    backgroundColor: theme.colors.foregroundExtraMuted,
  },
  status: {
    flexShrink: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
  },
  iconButton: {
    width: 28,
    paddingHorizontal: 0,
  },
  vim: {
    color: theme.colors.foregroundMuted,
    fontFamily: theme.fontFamily.mono,
    fontSize: theme.fontSize.xs,
  },
}));
