import { describe, expect, test } from "vitest";
import {
  AgentSessionChangesSubscribeRequestSchema,
  AgentSessionChangesSubscribeResponseSchema,
  AgentSessionChangesUpdateSchema,
  AgentSessionChangesUnsubscribeRequestSchema,
  ServerInfoStatusPayloadSchema,
  SessionInboundMessageSchema,
  SessionOutboundMessageSchema,
} from "./messages.js";

describe("agent.session_changes schemas", () => {
  test("parses subscribe and unsubscribe requests through the inbound union", () => {
    const subscribe = {
      type: "agent.session_changes.subscribe.request" as const,
      subscriptionId: "session-diff-1",
      agentId: "agent-1",
      mode: "session" as const,
      turnId: null,
      ignoreWhitespace: true,
      requestId: "request-1",
    };
    const unsubscribe = {
      type: "agent.session_changes.unsubscribe.request" as const,
      subscriptionId: "session-diff-1",
    };

    expect(AgentSessionChangesSubscribeRequestSchema.parse(subscribe)).toEqual(subscribe);
    expect(SessionInboundMessageSchema.parse(subscribe)).toEqual(subscribe);
    expect(AgentSessionChangesUnsubscribeRequestSchema.parse(unsubscribe)).toEqual(unsubscribe);
    expect(SessionInboundMessageSchema.parse(unsubscribe)).toEqual(unsubscribe);
  });

  test("parses initial and live snapshots through the outbound union", () => {
    const commonPayload = {
      subscriptionId: "session-diff-1",
      agentId: "agent-1",
      cwd: "/tmp/repo",
      mode: "working_tree" as const,
      baselineAvailable: true,
      files: [],
      error: null,
    };
    const response = {
      type: "agent.session_changes.subscribe.response" as const,
      payload: { ...commonPayload, requestId: "request-1" },
    };
    const update = {
      type: "agent.session_changes.update" as const,
      payload: commonPayload,
    };

    expect(AgentSessionChangesSubscribeResponseSchema.parse(response)).toEqual(response);
    expect(SessionOutboundMessageSchema.parse(response)).toEqual(response);
    expect(AgentSessionChangesUpdateSchema.parse(update)).toEqual(update);
    expect(SessionOutboundMessageSchema.parse(update)).toEqual(update);
  });

  test("parses Prompt turn summaries while keeping them optional", () => {
    const response = {
      type: "agent.session_changes.subscribe.response" as const,
      payload: {
        subscriptionId: "session-diff-1",
        agentId: "agent-1",
        cwd: "/tmp/repo",
        mode: "session" as const,
        baselineAvailable: true,
        turns: [
          {
            id: "turn-record-1",
            messageId: "message-1",
            prompt: "Fix the bug",
            status: "completed" as const,
            startedAt: "2026-07-22T00:00:00.000Z",
            endedAt: "2026-07-22T00:01:00.000Z",
          },
        ],
        selectedTurnId: "turn-record-1",
        files: [],
        error: null,
        requestId: "request-1",
      },
    };

    expect(AgentSessionChangesSubscribeResponseSchema.parse(response)).toEqual(response);
  });

  test("keeps the server capability optional for old daemons", () => {
    expect(
      ServerInfoStatusPayloadSchema.parse({
        status: "server_info",
        serverId: "srv_test",
        features: { agentSessionChanges: true, agentTurnChanges: true },
      }).features,
    ).toEqual({ agentSessionChanges: true, agentTurnChanges: true });

    expect(
      ServerInfoStatusPayloadSchema.parse({
        status: "server_info",
        serverId: "srv_test",
        features: {},
      }).features.agentSessionChanges,
    ).toBeUndefined();
  });
});
