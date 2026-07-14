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
});
