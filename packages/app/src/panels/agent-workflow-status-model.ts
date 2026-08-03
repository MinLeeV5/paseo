import type { AgentLifecycleStatus } from "@getpaseo/protocol/agent-lifecycle";

export type AgentWorkflowTone = "active" | "muted" | "success" | "danger" | "warning";
export type AgentWorkflowIcon = "activity" | "error" | "permission" | "success";

export interface AgentWorkflowStatusModel {
  tone: AgentWorkflowTone;
  icon: AgentWorkflowIcon;
  labelKey:
    | "agentPanel.workflow.starting"
    | "agentPanel.workflow.thinking"
    | "agentPanel.workflow.runningTool"
    | "agentPanel.workflow.working"
    | "agentPanel.workflow.permission"
    | "agentPanel.workflow.error"
    | "agentPanel.workflow.readyForReview";
  detail: string | null;
  toolName: string | null;
  showRecoveryHint: boolean;
}

export function buildAgentWorkflowStatusModel(input: {
  status: AgentLifecycleStatus | null | undefined;
  lastError?: string | null;
  attentionReason?: "finished" | "error" | "permission" | null;
  pendingPermissionTitle?: string | null;
  hasVisibleGoal: boolean;
  liveActivityKind?: "thought" | "tool" | "compaction" | null;
  liveToolName?: string | null;
}): AgentWorkflowStatusModel | null {
  if (input.pendingPermissionTitle || input.attentionReason === "permission") {
    return {
      tone: "warning",
      icon: "permission",
      labelKey: "agentPanel.workflow.permission",
      detail: input.pendingPermissionTitle ?? null,
      toolName: null,
      showRecoveryHint: false,
    };
  }

  if (input.status === "error" || input.attentionReason === "error") {
    return {
      tone: "danger",
      icon: "error",
      labelKey: "agentPanel.workflow.error",
      detail: input.lastError?.trim() || null,
      toolName: null,
      showRecoveryHint: true,
    };
  }

  if (input.status === "initializing") {
    return {
      tone: "muted",
      icon: "activity",
      labelKey: "agentPanel.workflow.starting",
      detail: null,
      toolName: null,
      showRecoveryHint: false,
    };
  }

  if (input.status === "running") {
    if (input.liveActivityKind === "thought") {
      return {
        tone: "active",
        icon: "activity",
        labelKey: "agentPanel.workflow.thinking",
        detail: null,
        toolName: null,
        showRecoveryHint: false,
      };
    }
    if (input.liveActivityKind === "tool" && input.liveToolName) {
      return {
        tone: "active",
        icon: "activity",
        labelKey: "agentPanel.workflow.runningTool",
        detail: null,
        toolName: input.liveToolName,
        showRecoveryHint: false,
      };
    }
    if (input.liveActivityKind === "compaction") {
      return {
        tone: "muted",
        icon: "activity",
        labelKey: "agentPanel.workflow.working",
        detail: null,
        toolName: null,
        showRecoveryHint: false,
      };
    }
    if (!input.hasVisibleGoal) {
      return {
        tone: "active",
        icon: "activity",
        labelKey: "agentPanel.workflow.working",
        detail: null,
        toolName: null,
        showRecoveryHint: false,
      };
    }
  }

  if (input.attentionReason === "finished" && !input.hasVisibleGoal) {
    return {
      tone: "success",
      icon: "success",
      labelKey: "agentPanel.workflow.readyForReview",
      detail: null,
      toolName: null,
      showRecoveryHint: false,
    };
  }

  return null;
}
