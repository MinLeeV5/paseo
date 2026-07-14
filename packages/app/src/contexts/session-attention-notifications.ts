import type { AgentAttentionNotificationPayload } from "@getpaseo/protocol/agent-attention-notification";

export function shouldShowAgentAttentionNotification(input: {
  reason: "finished" | "error" | "permission";
  notification?: AgentAttentionNotificationPayload;
}): boolean {
  if (input.reason !== "error") {
    return true;
  }
  return Boolean(input.notification?.data.goalStatus);
}
