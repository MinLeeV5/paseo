import type { FetchAgentsEntry } from "@getpaseo/client/internal/daemon-client";
import type { Agent } from "@/stores/session-store";
import type { AgentDirectoryDelta } from "./agent-directory-sync";
import { acceptAgentDirectoryUpdate } from "./agent-directory-update-policy";
import { isAgentOngoing } from "@getpaseo/protocol/agent-state-bucket";

export function reconcileAgentDirectory(input: {
  previous: ReadonlyMap<string, Agent>;
  snapshot: FetchAgentsEntry[];
  deltas: readonly AgentDirectoryDelta[];
}): { entries: FetchAgentsEntry[]; stoppedOngoingAgentIds: string[] } {
  const entries = new Map(input.snapshot.map((entry) => [entry.agent.id, entry]));
  const ongoingByAgentId = new Map(
    Array.from(input.previous, ([id, agent]) => [
      id,
      isAgentOngoing({ status: agent.status, goalStatus: agent.goal?.status }),
    ]),
  );
  const stoppedOngoingAgentIds = new Set<string>();

  for (const entry of input.snapshot) {
    const ongoing = isAgentOngoing({
      status: entry.agent.status,
      goalStatus: entry.agent.goal?.status,
    });
    if (ongoingByAgentId.get(entry.agent.id) === true && !ongoing) {
      stoppedOngoingAgentIds.add(entry.agent.id);
    }
    ongoingByAgentId.set(entry.agent.id, ongoing);
  }

  for (const delta of input.deltas) {
    if (delta.kind === "remove") {
      entries.delete(delta.agentId);
      ongoingByAgentId.delete(delta.agentId);
      stoppedOngoingAgentIds.delete(delta.agentId);
      continue;
    }
    const previousEntry = entries.get(delta.agent.id);
    const acceptedAgent = acceptAgentDirectoryUpdate(previousEntry?.agent, delta.agent);
    const ongoing = isAgentOngoing({
      status: acceptedAgent.status,
      goalStatus: acceptedAgent.goal?.status,
    });
    if (ongoing) {
      stoppedOngoingAgentIds.delete(delta.agent.id);
    } else if (ongoingByAgentId.get(delta.agent.id) === true) {
      stoppedOngoingAgentIds.add(delta.agent.id);
    }
    ongoingByAgentId.set(delta.agent.id, ongoing);
    const previousProject = previousEntry?.project;
    const acceptedProject =
      acceptedAgent === delta.agent ? (delta.project ?? previousProject) : previousProject;
    entries.set(delta.agent.id, {
      agent: acceptedAgent,
      project: acceptedProject ?? {
        projectKey: delta.agent.cwd,
        projectName: /[^/]+$/.exec(delta.agent.cwd)?.[0] ?? delta.agent.cwd,
        checkout: {
          cwd: delta.agent.cwd,
          isGit: false,
          currentBranch: null,
          remoteUrl: null,
          worktreeRoot: null,
          isPaseoOwnedWorktree: false,
          mainRepoRoot: null,
        },
      },
    });
  }

  return {
    entries: Array.from(entries.values()),
    stoppedOngoingAgentIds: Array.from(stoppedOngoingAgentIds),
  };
}
