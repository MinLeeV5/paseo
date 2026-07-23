import { describe, expect, it } from "vitest";
import { shouldShowAgentAttentionNotification } from "./session-attention-notifications";

describe("shouldShowAgentAttentionNotification", () => {
  it("keeps ordinary lifecycle errors silent", () => {
    expect(shouldShowAgentAttentionNotification({ reason: "error" })).toBe(false);
  });

  it("allows terminal goal error notifications", () => {
    expect(
      shouldShowAgentAttentionNotification({
        reason: "error",
        notification: {
          title: "Goal needs attention",
          body: "Ship it",
          data: {
            type: "agent_attention",
            serverId: "server-a",
            agentId: "agent-a",
            reason: "error",
            goalStatus: "blocked",
          },
        },
      }),
    ).toBe(true);
  });

  it("continues to allow finished and permission notifications", () => {
    expect(shouldShowAgentAttentionNotification({ reason: "finished" })).toBe(true);
    expect(shouldShowAgentAttentionNotification({ reason: "permission" })).toBe(true);
  });

  it("suppresses archived Goal notifications while preserving permission notifications", () => {
    const goalArchivedAt = new Date("2026-07-22T10:16:40.738Z");
    expect(shouldShowAgentAttentionNotification({ reason: "finished", goalArchivedAt })).toBe(
      false,
    );
    expect(
      shouldShowAgentAttentionNotification({
        reason: "error",
        goalArchivedAt,
        notification: {
          title: "Goal needs attention",
          body: "Ship it",
          data: {
            type: "agent_attention",
            serverId: "server-a",
            agentId: "agent-a",
            reason: "error",
            goalStatus: "blocked",
          },
        },
      }),
    ).toBe(false);
    expect(shouldShowAgentAttentionNotification({ reason: "permission", goalArchivedAt })).toBe(
      true,
    );
  });
});
