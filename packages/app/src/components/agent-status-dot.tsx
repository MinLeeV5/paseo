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

function AgentStatusDotView({ bucket }: { bucket: ReturnType<typeof deriveSidebarStateBucket> }) {
  const dotStyle = useMemo(() => [styles.dot, getDotColorStyle(bucket)], [bucket]);
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

function getDotColorStyle(bucket: ReturnType<typeof deriveSidebarStateBucket>) {
  switch (bucket) {
    case "needs_input":
      return styles.needsInput;
    case "failed":
      return styles.failed;
    case "running":
      return styles.running;
    case "attention":
      return styles.attention;
    case "done":
      return styles.done;
  }
}
