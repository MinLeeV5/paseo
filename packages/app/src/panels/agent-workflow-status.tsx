import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Text, View } from "react-native";
import { AlertTriangle, CheckCircle2, ShieldAlert } from "lucide-react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { useShallow } from "zustand/shallow";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { useRetainedPanelActive } from "@/components/retained-panel";
import { MAX_CONTENT_WIDTH } from "@/constants/layout";
import { useSessionStore } from "@/stores/session-store";
import type { Theme } from "@/styles/theme";
import type { StreamItem } from "@/types/stream";
import {
  buildAgentWorkflowStatusModel,
  type AgentWorkflowTone,
} from "./agent-workflow-status-model";

const ThemedAlertTriangle = withUnistyles(AlertTriangle);
const ThemedCheckCircle2 = withUnistyles(CheckCircle2);
const ThemedLoadingSpinner = withUnistyles(LoadingSpinner);
const ThemedShieldAlert = withUnistyles(ShieldAlert);

const activeColorMapping = (theme: Theme) => ({ color: theme.colors.accentBright });
const mutedColorMapping = (theme: Theme) => ({ color: theme.colors.foregroundMuted });
const successColorMapping = (theme: Theme) => ({ color: theme.colors.statusSuccess });
const dangerColorMapping = (theme: Theme) => ({ color: theme.colors.statusDanger });
const warningColorMapping = (theme: Theme) => ({ color: theme.colors.statusWarning });

const iconColorMappings = {
  active: activeColorMapping,
  muted: mutedColorMapping,
  success: successColorMapping,
  danger: dangerColorMapping,
  warning: warningColorMapping,
} as const;

function deriveLiveActivity(item: StreamItem | undefined): {
  kind: "thought" | "tool" | "compaction" | null;
  toolName: string | null;
} {
  if (item?.kind === "thought" && item.status === "loading") {
    return { kind: "thought", toolName: null };
  }
  if (item?.kind === "tool_call") {
    const isRunning =
      item.payload.source === "agent"
        ? item.payload.data.status === "running"
        : item.payload.data.status === "executing";
    if (isRunning) {
      return {
        kind: "tool",
        toolName:
          item.payload.source === "agent" ? item.payload.data.name : item.payload.data.toolName,
      };
    }
  }
  if (item?.kind === "compaction" && item.status === "loading") {
    return { kind: "compaction", toolName: null };
  }
  return { kind: null, toolName: null };
}

function WorkflowIcon({
  icon,
  tone,
  animate,
}: {
  icon: "activity" | "error" | "permission" | "success";
  tone: AgentWorkflowTone;
  animate: boolean;
}) {
  if (icon === "activity" && animate) {
    return <ThemedLoadingSpinner size="small" uniProps={iconColorMappings[tone]} />;
  }
  if (icon === "permission") {
    return <ThemedShieldAlert size={14} strokeWidth={1.8} uniProps={warningColorMapping} />;
  }
  if (icon === "error") {
    return <ThemedAlertTriangle size={14} strokeWidth={1.8} uniProps={dangerColorMapping} />;
  }
  if (icon === "success") {
    return <ThemedCheckCircle2 size={14} strokeWidth={1.8} uniProps={successColorMapping} />;
  }
  return <View style={styles.activityDot} />;
}

export function AgentWorkflowStatus({ serverId, agentId }: { serverId: string; agentId: string }) {
  const { t } = useTranslation();
  const panelActive = useRetainedPanelActive();
  const selection = useSessionStore(
    useShallow((state) => {
      const session = state.sessions[serverId];
      const agent = session?.agents.get(agentId) ?? session?.agentDetails.get(agentId);
      const streamHead = session?.agentStreamHead.get(agentId);
      const liveActivity = deriveLiveActivity(streamHead?.[streamHead.length - 1]);
      const permission = agent?.pendingPermissions[0];
      return {
        status: agent?.status ?? null,
        lastError: agent?.lastError ?? null,
        attentionReason: agent?.attentionReason ?? null,
        pendingPermissionTitle: permission?.title ?? permission?.name ?? null,
        hasVisibleGoal: Boolean(agent?.goal && !agent.goalArchivedAt),
        liveActivityKind: liveActivity.kind,
        liveToolName: liveActivity.toolName,
      };
    }),
  );
  const model = buildAgentWorkflowStatusModel(selection);
  const surfaceStyle = useMemo(
    () => (model ? [styles.surface, toneSurfaceStyles[model.tone]] : styles.surface),
    [model],
  );
  const labelStyle = useMemo(
    () => (model ? [styles.label, toneTextStyles[model.tone]] : styles.label),
    [model],
  );

  if (!model) {
    return null;
  }

  const label = t(model.labelKey, model.toolName ? { tool: model.toolName } : undefined);
  const detail = [
    model.detail,
    model.showRecoveryHint ? t("agentPanel.workflow.recoveryHint") : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <View
      style={styles.outer}
      accessibilityRole="summary"
      accessibilityLabel={detail ? `${label}: ${detail}` : label}
      testID="agent-workflow-status"
    >
      <View style={surfaceStyle}>
        <WorkflowIcon
          icon={model.icon}
          tone={model.tone}
          animate={model.icon === "activity" && panelActive}
        />
        <Text style={labelStyle} numberOfLines={1}>
          {label}
        </Text>
        {detail ? (
          <Text style={styles.detail} numberOfLines={1} ellipsizeMode="tail">
            {detail}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  outer: {
    width: "100%",
    alignItems: "center",
    paddingHorizontal: theme.spacing[4],
    marginBottom: theme.spacing[2],
  },
  surface: {
    width: "100%",
    maxWidth: MAX_CONTENT_WIDTH,
    minHeight: 34,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[2],
    backgroundColor: theme.colors.surface1,
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.borderAccent,
    borderRadius: theme.borderRadius.xl,
  },
  surfaceActive: {
    borderColor: theme.colors.accent,
  },
  surfaceMuted: {
    opacity: 0.8,
  },
  surfaceSuccess: {
    borderColor: theme.colors.statusSuccess,
  },
  surfaceDanger: {
    borderColor: theme.colors.statusDanger,
  },
  surfaceWarning: {
    borderColor: theme.colors.statusWarning,
  },
  label: {
    flexShrink: 0,
    fontSize: theme.fontSize.xs,
    fontWeight: theme.fontWeight.semibold,
  },
  labelActive: {
    color: theme.colors.accentBright,
  },
  labelMuted: {
    color: theme.colors.foregroundMuted,
  },
  labelSuccess: {
    color: theme.colors.statusSuccess,
  },
  labelDanger: {
    color: theme.colors.statusDanger,
  },
  labelWarning: {
    color: theme.colors.statusWarning,
  },
  detail: {
    flex: 1,
    minWidth: 0,
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
  },
  activityDot: {
    width: 8,
    height: 8,
    borderRadius: theme.borderRadius.full,
    backgroundColor: theme.colors.accent,
  },
}));

const toneSurfaceStyles = {
  active: styles.surfaceActive,
  muted: styles.surfaceMuted,
  success: styles.surfaceSuccess,
  danger: styles.surfaceDanger,
  warning: styles.surfaceWarning,
} as const;

const toneTextStyles = {
  active: styles.labelActive,
  muted: styles.labelMuted,
  success: styles.labelSuccess,
  danger: styles.labelDanger,
  warning: styles.labelWarning,
} as const;
