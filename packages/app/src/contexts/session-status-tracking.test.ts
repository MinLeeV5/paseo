import { describe, expect, it } from "vitest";
import type { Agent } from "@/stores/session-store";
import { reconcilePreviousAgentOngoing } from "./session-status-tracking";

function createAgent(status: Agent["status"]): Agent {
  return {
    serverId: "server-1",
    id: "agent-1",
    provider: "codex",
    status,
    goal: null,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    lastUserMessageAt: null,
    lastActivityAt: new Date(0),
    capabilities: {
      supportsStreaming: true,
      supportsSessionPersistence: true,
      supportsDynamicModes: true,
      supportsMcpServers: true,
      supportsReasoningStream: true,
      supportsToolInvocations: true,
    },
    currentModeId: null,
    availableModes: [],
    pendingPermissions: [],
    persistence: null,
    title: "Agent",
    cwd: "/tmp",
    model: null,
    parentAgentId: null,
    labels: {},
    projectPlacement: null,
  };
}

describe("reconcilePreviousAgentOngoing", () => {
  it("preserves previously seen ongoing state for existing agents", () => {
    const previous = new Map([["agent-1", true]]);
    const sessionAgents = new Map([["agent-1", createAgent("idle")]]);

    const result = reconcilePreviousAgentOngoing(previous, sessionAgents);

    expect(result).toEqual(new Map([["agent-1", true]]));
  });

  it("seeds newly seen agents from the current snapshot", () => {
    const sessionAgents = new Map([["agent-1", createAgent("idle")]]);

    const result = reconcilePreviousAgentOngoing(new Map(), sessionAgents);

    expect(result).toEqual(new Map([["agent-1", false]]));
  });

  it("seeds active-goal idle agents as ongoing", () => {
    const agent = createAgent("idle");
    agent.goal = { objective: "Ship Goal state support", status: "active" };

    const result = reconcilePreviousAgentOngoing(new Map(), new Map([[agent.id, agent]]));

    expect(result).toEqual(new Map([["agent-1", true]]));
  });

  it("removes agents that are no longer present", () => {
    const previous = new Map([
      ["agent-1", true],
      ["agent-2", false],
    ]);
    const sessionAgents = new Map([["agent-1", createAgent("idle")]]);

    const result = reconcilePreviousAgentOngoing(previous, sessionAgents);

    expect(result).toEqual(new Map([["agent-1", true]]));
  });

  it("clears all tracked statuses when the session is unavailable", () => {
    const previous = new Map([["agent-1", true]]);

    const result = reconcilePreviousAgentOngoing(previous, undefined);

    expect(result).toEqual(new Map());
  });
});
