import type { AgentAttentionNotificationPayload } from "@getpaseo/protocol/agent-attention-notification";

export function shouldShowAgentAttentionNotification(input: {
  reason: "finished" | "error" | "permission";
  notification?: AgentAttentionNotificationPayload;
  goalArchivedAt?: Date | string | null;
}): boolean {
  const isGoalNotification =
    input.reason === "finished" || input.notification?.data.goalStatus !== undefined;
  if (input.goalArchivedAt && isGoalNotification) {
    return false;
  }
  if (input.reason !== "error") {
    return true;
  }
  return Boolean(input.notification?.data.goalStatus);
}
