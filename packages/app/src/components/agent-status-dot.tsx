import { useMemo } from "react";
import { View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import {
  AGENT_LIFECYCLE_STATUSES,
  type AgentLifecycleStatus,
} from "@getpaseo/protocol/agent-lifecycle";
import { deriveSidebarStateBucket } from "@/utils/sidebar-agent-state";

export function AgentStatusDot({
  status,
  goalStatus,
  requiresAttention,
  attentionReason,
  pendingPermissionCount,
  showInactive = false,
}: {
  status: string | null | undefined;
  goalStatus?: string | null;
  requiresAttention: boolean | null | undefined;
  attentionReason?: "finished" | "error" | "permission" | null;
  pendingPermissionCount?: number;
  showInactive?: boolean;
}) {
  if (!status) {
    return null;
  }
  if (!isAgentLifecycleStatus(status)) {
    return null;
  }

  const bucket = deriveSidebarStateBucket({
    status,
    goalStatus,
    requiresAttention: Boolean(requiresAttention),
    attentionReason: attentionReason ?? null,
    pendingPermissionCount: pendingPermissionCount ?? 0,
  });
  if (bucket === "done" && !showInactive) {
    return null;
  }

  return <AgentStatusDotView bucket={bucket} />;
}

function AgentStatusDotView({ bucket }: { bucket: keyof typeof dotColorStyles }) {
  const dotStyle = useMemo(() => [styles.dot, dotColorStyles[bucket]], [bucket]);
  return <View style={dotStyle} />;
}

function isAgentLifecycleStatus(value: string): value is AgentLifecycleStatus {
  return AGENT_LIFECYCLE_STATUSES.some((status) => status === value);
}

const styles = StyleSheet.create((theme) => ({
  dot: {
    width: 8,
    height: 8,
    borderRadius: theme.borderRadius.full,
  },
  needsInput: {
    backgroundColor: theme.colors.palette.amber[500],
  },
  failed: {
    backgroundColor: theme.colors.palette.red[500],
  },
  running: {
    backgroundColor: theme.colors.palette.blue[500],
  },
  attention: {
    backgroundColor: theme.colors.palette.green[500],
  },
  done: {
    backgroundColor: theme.colors.border,
  },
}));

const dotColorStyles = {
  needs_input: styles.needsInput,
  failed: styles.failed,
  running: styles.running,
  attention: styles.attention,
  done: styles.done,
} as const;
