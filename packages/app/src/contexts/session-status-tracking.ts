import { isAgentOngoing } from "@getpaseo/protocol/agent-state-bucket";
import type { Agent } from "@/stores/session-store";

export function reconcilePreviousAgentOngoing(
  previousOngoing: Map<string, boolean>,
  sessionAgents: Map<string, Agent> | undefined,
): Map<string, boolean> {
  if (!sessionAgents) {
    return new Map();
  }

  const nextOngoing = new Map(previousOngoing);
  const seenAgentIds = new Set<string>();

  for (const agent of sessionAgents.values()) {
    seenAgentIds.add(agent.id);
    if (!nextOngoing.has(agent.id)) {
      nextOngoing.set(
        agent.id,
        isAgentOngoing({ status: agent.status, goalStatus: agent.goal?.status }),
      );
    }
  }

  for (const agentId of nextOngoing.keys()) {
    if (!seenAgentIds.has(agentId)) {
      nextOngoing.delete(agentId);
    }
  }

  return nextOngoing;
}
