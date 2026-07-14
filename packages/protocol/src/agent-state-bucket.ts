import type { AgentLifecycleStatus } from "./agent-lifecycle.js";
import type { WorkspaceStateBucket } from "./messages.js";

export type { WorkspaceStateBucket };
export type AgentAttentionReason = "finished" | "error" | "permission" | null | undefined;

export interface AgentStateBucketInput {
  status: AgentLifecycleStatus;
  goalStatus?: string | null;
  pendingPermissionCount?: number;
  requiresAttention?: boolean;
  attentionReason?: AgentAttentionReason;
}

export function isAgentOngoing(
  input: Pick<AgentStateBucketInput, "status" | "goalStatus">,
): boolean {
  if (input.status === "closed") {
    return false;
  }
  return input.status === "running" || input.goalStatus === "active";
}

const WORKSPACE_STATE_BUCKET_PRIORITY = {
  needs_input: 0,
  failed: 1,
  running: 2,
  attention: 3,
  done: 4,
} as const satisfies Record<WorkspaceStateBucket, number>;

export function deriveAgentStateBucket(input: AgentStateBucketInput): WorkspaceStateBucket {
  if ((input.pendingPermissionCount ?? 0) > 0 || input.attentionReason === "permission") {
    return "needs_input";
  }
  if (input.status === "error" || input.attentionReason === "error") {
    return "failed";
  }
  if (isAgentOngoing(input)) {
    return "running";
  }
  if (input.requiresAttention) {
    return "attention";
  }
  return "done";
}

export function getWorkspaceStateBucketPriority(bucket: WorkspaceStateBucket): number {
  return WORKSPACE_STATE_BUCKET_PRIORITY[bucket];
}

export function getAgentStatusPriority(input: AgentStateBucketInput): number {
  if ((input.pendingPermissionCount ?? 0) > 0 || input.attentionReason === "permission") {
    return 0;
  }
  if (input.status === "error" || input.attentionReason === "error") {
    return 1;
  }
  if (isAgentOngoing(input)) {
    return 2;
  }
  if (input.status === "initializing") {
    return 3;
  }
  return 4;
}
