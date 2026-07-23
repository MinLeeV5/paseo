import { describe, expect, it } from "vitest";
import { buildAgentGoalStatusModel } from "./agent-goal-status-model";

describe("buildAgentGoalStatusModel", () => {
  it("hides the status bar without the daemon capability or a goal", () => {
    expect(
      buildAgentGoalStatusModel({
        supported: false,
        goal: { objective: "Ship it", status: "active" },
      }),
    ).toBeNull();
    expect(buildAgentGoalStatusModel({ supported: true, goal: null })).toBeNull();
  });

  it("hides an archived Goal status bar", () => {
    expect(
      buildAgentGoalStatusModel({
        supported: true,
        goal: { objective: "Ship it", status: "complete" },
        goalArchivedAt: "2026-07-22T08:00:00.000Z",
      }),
    ).toBeNull();
  });

  it.each([
    ["active", "active", "agentPanel.goal.status.active"],
    ["paused", "muted", "agentPanel.goal.status.paused"],
    ["complete", "success", "agentPanel.goal.status.complete"],
    ["blocked", "danger", "agentPanel.goal.status.blocked"],
    ["usageLimited", "warning", "agentPanel.goal.status.usageLimited"],
    ["budgetLimited", "warning", "agentPanel.goal.status.budgetLimited"],
    ["future-status", "warning", "agentPanel.goal.status.needsAttention"],
  ] as const)("maps %s to the expected presentation", (status, tone, labelKey) => {
    expect(
      buildAgentGoalStatusModel({
        supported: true,
        goal: { objective: "Ship it", status },
      }),
    ).toEqual({ objective: "Ship it", status, tone, labelKey });
  });
});
