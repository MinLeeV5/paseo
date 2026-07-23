import { describe, expect, it, vi } from "vitest";
import type {
  AgentSessionChangesManager,
  AgentSessionChangesSnapshotPayload,
} from "../../agent-session-changes-manager.js";
import { AgentSessionChangesSession } from "./agent-session-changes-session.js";

describe("AgentSessionChangesSession", () => {
  it("emits the initial response, live updates, and releases the subscription", async () => {
    const emitted: unknown[] = [];
    const unsubscribe = vi.fn();
    let listener: ((snapshot: AgentSessionChangesSnapshotPayload) => void) | null = null;
    const initial: AgentSessionChangesSnapshotPayload = {
      agentId: "agent-1",
      cwd: "/repo",
      mode: "session",
      baselineAvailable: true,
      turns: [],
      selectedTurnId: null,
      files: [],
      error: null,
    };
    const manager = {
      subscribe: vi.fn(
        async (
          _params: {
            agentId: string;
            mode: "working_tree" | "session";
            turnId?: string | null;
            ignoreWhitespace?: boolean;
          },
          nextListener: (snapshot: AgentSessionChangesSnapshotPayload) => void,
        ) => {
          listener = nextListener;
          return { initial, unsubscribe };
        },
      ),
    } as unknown as AgentSessionChangesManager;
    const session = new AgentSessionChangesSession({
      host: { emit: (message) => emitted.push(message) },
      manager,
    });

    await session.handleSubscribeRequest({
      type: "agent.session_changes.subscribe.request",
      subscriptionId: "subscription-1",
      agentId: "agent-1",
      mode: "session",
      turnId: null,
      ignoreWhitespace: true,
      requestId: "request-1",
    });

    expect(manager.subscribe).toHaveBeenCalledWith(
      { agentId: "agent-1", mode: "session", turnId: null, ignoreWhitespace: true },
      expect.any(Function),
    );
    expect(emitted).toEqual([
      {
        type: "agent.session_changes.subscribe.response",
        payload: {
          subscriptionId: "subscription-1",
          ...initial,
          requestId: "request-1",
        },
      },
    ]);

    listener?.({ ...initial, files: [], mode: "working_tree" });
    expect(emitted.at(-1)).toEqual({
      type: "agent.session_changes.update",
      payload: {
        subscriptionId: "subscription-1",
        ...initial,
        files: [],
        mode: "working_tree",
      },
    });

    session.handleUnsubscribeRequest({
      type: "agent.session_changes.unsubscribe.request",
      subscriptionId: "subscription-1",
    });
    expect(unsubscribe).toHaveBeenCalledOnce();
  });
});
