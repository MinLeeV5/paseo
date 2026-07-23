import type { AgentGoalPayload } from "@getpaseo/protocol/messages";

export type GoalTone = "active" | "muted" | "success" | "danger" | "warning";

export interface AgentGoalStatusModel {
  objective: string;
  status: string;
  tone: GoalTone;
  labelKey:
    | "agentPanel.goal.status.active"
    | "agentPanel.goal.status.paused"
    | "agentPanel.goal.status.complete"
    | "agentPanel.goal.status.blocked"
    | "agentPanel.goal.status.usageLimited"
    | "agentPanel.goal.status.budgetLimited"
    | "agentPanel.goal.status.needsAttention";
}

export function buildAgentGoalStatusModel(input: {
  supported: boolean;
  goal: AgentGoalPayload | null | undefined;
  goalArchivedAt?: Date | string | null;
}): AgentGoalStatusModel | null {
  if (!input.supported || !input.goal || input.goalArchivedAt) {
    return null;
  }

  const base = {
    objective: input.goal.objective,
    status: input.goal.status,
  };
  switch (input.goal.status) {
    case "active":
      return { ...base, tone: "active", labelKey: "agentPanel.goal.status.active" };
    case "paused":
      return { ...base, tone: "muted", labelKey: "agentPanel.goal.status.paused" };
    case "complete":
      return { ...base, tone: "success", labelKey: "agentPanel.goal.status.complete" };
    case "blocked":
      return { ...base, tone: "danger", labelKey: "agentPanel.goal.status.blocked" };
    case "usageLimited":
      return { ...base, tone: "warning", labelKey: "agentPanel.goal.status.usageLimited" };
    case "budgetLimited":
      return { ...base, tone: "warning", labelKey: "agentPanel.goal.status.budgetLimited" };
    default:
      return { ...base, tone: "warning", labelKey: "agentPanel.goal.status.needsAttention" };
  }
}
