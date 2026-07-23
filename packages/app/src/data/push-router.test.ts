import { QueryClient, QueryObserver, skipToken } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import type { MutableDaemonConfig, SessionOutboundMessage } from "@getpaseo/protocol/messages";
import { agentSessionChangesQueryKey, checkoutDiffQueryKey } from "@/git/query-keys";
import { buildTerminalsQueryKey } from "@/screens/workspace/terminals/state";
import { daemonConfigQueryKey } from "@/data/daemon-config";
import { providersSnapshotQueryKey } from "@/data/providers-snapshot";
import {
  agentSessionChangesPushRoute,
  checkoutDiffPushRoute,
  invalidateServerDataQueriesAfterReconnect,
  mountServerDataPushRouter,
  workspaceTerminalsPushRoute,
} from "@/data/push-router";

type ProvidersSnapshotUpdateMessage = Extract<
  SessionOutboundMessage,
  { type: "providers_snapshot_update" }
>;
type CheckoutDiffUpdateMessage = Extract<SessionOutboundMessage, { type: "checkout_diff_update" }>;
type SubscribeCheckoutDiffResponseMessage = Extract<
  SessionOutboundMessage,
  { type: "subscribe_checkout_diff_response" }
>;
type AgentSessionChangesUpdateMessage = Extract<
  SessionOutboundMessage,
  { type: "agent.session_changes.update" }
>;
type AgentSessionChangesSubscribeResponseMessage = Extract<
  SessionOutboundMessage,
  { type: "agent.session_changes.subscribe.response" }
>;
type StatusMessage = Extract<SessionOutboundMessage, { type: "status" }>;
type TerminalsChangedMessage = Extract<SessionOutboundMessage, { type: "terminals_changed" }>;
type RouterMessage =
  | ProvidersSnapshotUpdateMessage
  | CheckoutDiffUpdateMessage
  | SubscribeCheckoutDiffResponseMessage
  | AgentSessionChangesUpdateMessage
  | AgentSessionChangesSubscribeResponseMessage
  | StatusMessage
  | TerminalsChangedMessage;
type RouterMessageType = RouterMessage["type"];
type RouterHandler = (message: RouterMessage) => void;
type RouterClient = Parameters<typeof mountServerDataPushRouter>[0]["client"];

const daemonConfig: MutableDaemonConfig = {
  mcp: { injectIntoAgents: true },
  browserTools: { enabled: false },
  providers: {},
  metadataGeneration: { providers: [] },
  autoArchiveAfterMerge: false,
  enableTerminalAgentHooks: false,
  appendSystemPrompt: "",
};

function createFakeClient(config: { rejectCheckoutDiffSubscribe?: boolean } = {}): {
  client: RouterClient;
  emit: <K extends RouterMessageType>(message: Extract<RouterMessage, { type: K }>) => void;
  subscribeCheckoutDiffCalls: Array<{
    cwd: string;
    compare: { mode: "uncommitted" | "base"; baseRef?: string; ignoreWhitespace?: boolean };
    subscriptionId: string;
  }>;
  unsubscribeCheckoutDiffCalls: string[];
  subscribeAgentSessionChangesCalls: Array<{
    agentId: string;
    mode: "working_tree" | "session";
    turnId?: string | null;
    ignoreWhitespace?: boolean;
    subscriptionId: string;
  }>;
  unsubscribeAgentSessionChangesCalls: string[];
  subscribeTerminalCalls: Array<{ cwd: string; workspaceId?: string }>;
  unsubscribeTerminalCalls: Array<{ cwd: string; workspaceId?: string }>;
} {
  const handlers: Record<RouterMessageType, RouterHandler[]> = {
    providers_snapshot_update: [],
    checkout_diff_update: [],
    subscribe_checkout_diff_response: [],
    "agent.session_changes.update": [],
    "agent.session_changes.subscribe.response": [],
    status: [],
    terminals_changed: [],
  };
  const subscribeCheckoutDiffCalls: Array<{
    cwd: string;
    compare: { mode: "uncommitted" | "base"; baseRef?: string; ignoreWhitespace?: boolean };
    subscriptionId: string;
  }> = [];
  const unsubscribeCheckoutDiffCalls: string[] = [];
  const subscribeAgentSessionChangesCalls: Array<{
    agentId: string;
    mode: "working_tree" | "session";
    turnId?: string | null;
    ignoreWhitespace?: boolean;
    subscriptionId: string;
  }> = [];
  const unsubscribeAgentSessionChangesCalls: string[] = [];
  const subscribeTerminalCalls: Array<{ cwd: string; workspaceId?: string }> = [];
  const unsubscribeTerminalCalls: Array<{ cwd: string; workspaceId?: string }> = [];

  function on<K extends RouterMessageType>(
    type: K,
    handler: (message: Extract<RouterMessage, { type: K }>) => void,
  ): () => void {
    const routerHandler: RouterHandler = (message) => {
      if (message.type === type) {
        handler(message as Extract<RouterMessage, { type: K }>);
      }
    };
    handlers[type].push(routerHandler);
    return () => {
      handlers[type] = handlers[type].filter((candidate) => candidate !== routerHandler);
    };
  }

  function emit<K extends RouterMessageType>(message: Extract<RouterMessage, { type: K }>): void {
    for (const handler of handlers[message.type]) {
      handler(message);
    }
  }

  return {
    client: {
      on,
      async subscribeCheckoutDiff(cwd, compare, requestOptions) {
        subscribeCheckoutDiffCalls.push({
          cwd,
          compare,
          subscriptionId: requestOptions.subscriptionId,
        });
        if (config.rejectCheckoutDiffSubscribe) {
          throw new Error("subscribe failed");
        }
        return {
          subscriptionId: requestOptions.subscriptionId,
          cwd,
          files: [],
          error: null,
          requestId: requestOptions.requestId ?? "subscribe-checkout-diff",
        };
      },
      unsubscribeCheckoutDiff(subscriptionId) {
        unsubscribeCheckoutDiffCalls.push(subscriptionId);
      },
      async subscribeAgentSessionChanges(subscription, requestOptions) {
        subscribeAgentSessionChangesCalls.push({
          ...subscription,
          subscriptionId: requestOptions.subscriptionId,
        });
        return {
          subscriptionId: requestOptions.subscriptionId,
          agentId: subscription.agentId,
          cwd: "/repo",
          mode: subscription.mode,
          baselineAvailable: true,
          files: [],
          error: null,
          requestId: requestOptions.requestId ?? "subscribe-agent-session-changes",
        };
      },
      unsubscribeAgentSessionChanges(subscriptionId) {
        unsubscribeAgentSessionChangesCalls.push(subscriptionId);
      },
      subscribeTerminals(subscription) {
        subscribeTerminalCalls.push(subscription);
      },
      unsubscribeTerminals(subscription) {
        unsubscribeTerminalCalls.push(subscription);
      },
    },
    emit,
    subscribeCheckoutDiffCalls,
    unsubscribeCheckoutDiffCalls,
    subscribeAgentSessionChangesCalls,
    unsubscribeAgentSessionChangesCalls,
    subscribeTerminalCalls,
    unsubscribeTerminalCalls,
  };
}

function providerUpdate(generatedAt: string): ProvidersSnapshotUpdateMessage {
  return {
    type: "providers_snapshot_update",
    payload: {
      entries: [{ provider: "codex", status: "ready", enabled: true, models: [] }],
      generatedAt,
    },
  };
}

describe("server data push router", () => {
  it("routes provider snapshot and daemon config payloads until detached", () => {
    const queryClient = new QueryClient();
    const fake = createFakeClient();
    const serverId = "server-1";
    const unmount = mountServerDataPushRouter({ client: fake.client, queryClient, serverId });

    fake.emit(providerUpdate("2026-01-01T00:00:00.000Z"));
    fake.emit({
      type: "status",
      payload: { status: "daemon_config_changed", config: daemonConfig },
    });

    expect(queryClient.getQueryData(providersSnapshotQueryKey(serverId))).toEqual({
      entries: [{ provider: "codex", status: "ready", enabled: true, models: [] }],
      generatedAt: "2026-01-01T00:00:00.000Z",
      requestId: "providers_snapshot_update",
    });
    expect(queryClient.getQueryData(daemonConfigQueryKey(serverId))).toEqual(daemonConfig);

    unmount();
    fake.emit(providerUpdate("2026-01-01T00:00:01.000Z"));

    expect(queryClient.getQueryData(providersSnapshotQueryKey(serverId))).toEqual({
      entries: [{ provider: "codex", status: "ready", enabled: true, models: [] }],
      generatedAt: "2026-01-01T00:00:00.000Z",
      requestId: "providers_snapshot_update",
    });
  });

  it("subscribes active checkout diff queries and writes matching diff events", () => {
    const queryClient = new QueryClient();
    const fake = createFakeClient();
    const serverId = "server-1";
    const cwd = "/repo";
    const queryKey = checkoutDiffQueryKey(serverId, cwd, "base", "main", true);
    const subscriptionId = `checkoutDiff:${JSON.stringify(queryKey)}`;
    const observer = new QueryObserver(queryClient, {
      queryKey,
      queryFn: skipToken,
      enabled: true,
      gcTime: Infinity,
      staleTime: Infinity,
      meta: checkoutDiffPushRoute({
        enabled: true,
        serverId,
        subscriptionId,
        cwd,
        compare: { mode: "base", baseRef: "main", ignoreWhitespace: true },
      }),
    });
    const unsubscribeObserver = observer.subscribe(() => undefined);
    const unmount = mountServerDataPushRouter({ client: fake.client, queryClient, serverId });

    expect(fake.subscribeCheckoutDiffCalls).toEqual([
      {
        cwd,
        compare: { mode: "base", baseRef: "main", ignoreWhitespace: true },
        subscriptionId,
      },
    ]);

    fake.emit({
      type: "subscribe_checkout_diff_response",
      payload: { subscriptionId, cwd, files: [], error: null, requestId: "diff-1" },
    });

    expect(queryClient.getQueryData(queryKey)).toEqual({
      cwd,
      files: [],
      error: null,
      requestId: "diff-1",
    });

    fake.emit({
      type: "checkout_diff_update",
      payload: { subscriptionId, cwd, files: [], error: null },
    });

    expect(queryClient.getQueryData(queryKey)).toEqual({
      cwd,
      files: [],
      error: null,
      requestId: `subscription:${subscriptionId}`,
    });

    unsubscribeObserver();

    expect(fake.unsubscribeCheckoutDiffCalls).toEqual([subscriptionId]);

    unmount();
  });

  it("subscribes session-change queries and routes snapshots by agent and mode", () => {
    const queryClient = new QueryClient();
    const fake = createFakeClient();
    const serverId = "server-1";
    const agentId = "agent-1";
    const queryKey = agentSessionChangesQueryKey(serverId, agentId, "session", null, true);
    const subscriptionId = `agentSessionChanges:${JSON.stringify(queryKey)}`;
    const observer = new QueryObserver(queryClient, {
      queryKey,
      queryFn: skipToken,
      enabled: true,
      gcTime: Infinity,
      staleTime: Infinity,
      meta: agentSessionChangesPushRoute({
        enabled: true,
        serverId,
        subscriptionId,
        agentId,
        mode: "session",
        turnId: null,
        ignoreWhitespace: true,
      }),
    });
    const unsubscribeObserver = observer.subscribe(() => undefined);
    const unmount = mountServerDataPushRouter({ client: fake.client, queryClient, serverId });

    expect(fake.subscribeAgentSessionChangesCalls).toEqual([
      { agentId, mode: "session", turnId: null, ignoreWhitespace: true, subscriptionId },
    ]);

    fake.emit({
      type: "agent.session_changes.subscribe.response",
      payload: {
        subscriptionId,
        agentId,
        cwd: "/repo",
        mode: "session",
        baselineAvailable: true,
        turns: [
          {
            id: "turn-1",
            prompt: "First prompt",
            status: "completed",
            hasChanges: false,
            startedAt: "2026-07-23T08:00:00.000Z",
            endedAt: "2026-07-23T08:01:00.000Z",
          },
        ],
        selectedTurnId: "turn-1",
        files: [],
        error: null,
        requestId: "session-diff-1",
      },
    });

    expect(queryClient.getQueryData(queryKey)).toEqual({
      agentId,
      cwd: "/repo",
      mode: "session",
      baselineAvailable: true,
      turns: [
        {
          id: "turn-1",
          prompt: "First prompt",
          status: "completed",
          hasChanges: false,
          startedAt: "2026-07-23T08:00:00.000Z",
          endedAt: "2026-07-23T08:01:00.000Z",
        },
      ],
      selectedTurnId: "turn-1",
      files: [],
      error: null,
      requestId: "session-diff-1",
    });

    fake.emit({
      type: "agent.session_changes.update",
      payload: {
        subscriptionId,
        agentId,
        cwd: "/repo",
        mode: "session",
        baselineAvailable: true,
        turns: [
          {
            id: "turn-1",
            prompt: "First prompt",
            status: "completed",
            hasChanges: false,
            startedAt: "2026-07-23T08:00:00.000Z",
            endedAt: "2026-07-23T08:01:00.000Z",
          },
          {
            id: "turn-2",
            prompt: "Latest prompt",
            status: "running",
            hasChanges: true,
            startedAt: "2026-07-23T08:02:00.000Z",
          },
        ],
        selectedTurnId: "turn-2",
        files: [],
        error: null,
      },
    });

    expect(queryClient.getQueryData(queryKey)).toEqual({
      agentId,
      cwd: "/repo",
      mode: "session",
      baselineAvailable: true,
      turns: [
        {
          id: "turn-1",
          prompt: "First prompt",
          status: "completed",
          hasChanges: false,
          startedAt: "2026-07-23T08:00:00.000Z",
          endedAt: "2026-07-23T08:01:00.000Z",
        },
        {
          id: "turn-2",
          prompt: "Latest prompt",
          status: "running",
          hasChanges: true,
          startedAt: "2026-07-23T08:02:00.000Z",
        },
      ],
      selectedTurnId: "turn-2",
      files: [],
      error: null,
      requestId: `subscription:${subscriptionId}`,
    });

    unsubscribeObserver();
    expect(fake.unsubscribeAgentSessionChangesCalls).toEqual([subscriptionId]);
    unmount();
  });

  it("does not retry failed subscriptions on unrelated cache events", async () => {
    const queryClient = new QueryClient();
    const fake = createFakeClient({ rejectCheckoutDiffSubscribe: true });
    const serverId = "server-1";
    const cwd = "/repo";
    const queryKey = checkoutDiffQueryKey(serverId, cwd, "base", "main", true);
    const subscriptionId = `checkoutDiff:${JSON.stringify(queryKey)}`;
    const observer = new QueryObserver(queryClient, {
      queryKey,
      queryFn: skipToken,
      enabled: true,
      gcTime: Infinity,
      staleTime: Infinity,
      meta: checkoutDiffPushRoute({
        enabled: true,
        serverId,
        subscriptionId,
        cwd,
        compare: { mode: "base", baseRef: "main", ignoreWhitespace: true },
      }),
    });
    const unsubscribeObserver = observer.subscribe(() => undefined);
    const unmount = mountServerDataPushRouter({ client: fake.client, queryClient, serverId });

    expect(fake.subscribeCheckoutDiffCalls).toHaveLength(1);

    await Promise.resolve();
    await Promise.resolve();

    queryClient.setQueryData(["unrelated"], "value");

    expect(fake.subscribeCheckoutDiffCalls).toHaveLength(1);

    unsubscribeObserver();
    unmount();
  });

  it("subscribes active terminal queries and filters terminal pushes by workspace", () => {
    const queryClient = new QueryClient();
    const fake = createFakeClient();
    const serverId = "server-1";
    const cwd = "/repo";
    const workspaceId = "workspace-a";
    const queryKey = buildTerminalsQueryKey(serverId, cwd, workspaceId);
    const observer = new QueryObserver(queryClient, {
      queryKey,
      queryFn: skipToken,
      enabled: true,
      gcTime: Infinity,
      staleTime: Infinity,
      meta: workspaceTerminalsPushRoute({
        enabled: true,
        serverId,
        cwd,
        workspaceId,
      }),
    });
    const unsubscribeObserver = observer.subscribe(() => undefined);
    const unmount = mountServerDataPushRouter({ client: fake.client, queryClient, serverId });

    expect(fake.subscribeTerminalCalls).toEqual([{ cwd, workspaceId }]);

    fake.emit({
      type: "terminals_changed",
      payload: {
        cwd,
        terminals: [
          { id: "terminal-a", name: "Main", workspaceId },
          { id: "terminal-b", name: "Sibling", workspaceId: "workspace-b" },
        ],
      },
    });

    expect(queryClient.getQueryData(queryKey)).toEqual({
      cwd,
      terminals: [{ id: "terminal-a", name: "Main", workspaceId }],
      requestId: expect.stringMatching(/^terminals-changed-/),
    });

    unsubscribeObserver();

    expect(fake.unsubscribeTerminalCalls).toEqual([{ cwd, workspaceId }]);

    unmount();
  });

  it("re-sends active push subscriptions after reconnect", () => {
    const queryClient = new QueryClient();
    const fake = createFakeClient();
    const serverId = "server-1";
    const cwd = "/repo";
    const workspaceId = "workspace-a";
    const checkoutDiffKey = checkoutDiffQueryKey(serverId, cwd, "base", "main", true);
    const checkoutDiffSubscriptionId = `checkoutDiff:${JSON.stringify(checkoutDiffKey)}`;
    const agentSessionChangesKey = agentSessionChangesQueryKey(
      serverId,
      "agent-1",
      "working_tree",
      null,
      false,
    );
    const agentSessionChangesSubscriptionId = `agentSessionChanges:${JSON.stringify(agentSessionChangesKey)}`;
    const terminalKey = buildTerminalsQueryKey(serverId, cwd, workspaceId);
    const checkoutDiffObserver = new QueryObserver(queryClient, {
      queryKey: checkoutDiffKey,
      queryFn: skipToken,
      enabled: true,
      gcTime: Infinity,
      staleTime: Infinity,
      meta: checkoutDiffPushRoute({
        enabled: true,
        serverId,
        subscriptionId: checkoutDiffSubscriptionId,
        cwd,
        compare: { mode: "base", baseRef: "main", ignoreWhitespace: true },
      }),
    });
    const terminalObserver = new QueryObserver(queryClient, {
      queryKey: terminalKey,
      queryFn: skipToken,
      enabled: true,
      gcTime: Infinity,
      staleTime: Infinity,
      meta: workspaceTerminalsPushRoute({
        enabled: true,
        serverId,
        cwd,
        workspaceId,
      }),
    });
    const agentSessionChangesObserver = new QueryObserver(queryClient, {
      queryKey: agentSessionChangesKey,
      queryFn: skipToken,
      enabled: true,
      gcTime: Infinity,
      staleTime: Infinity,
      meta: agentSessionChangesPushRoute({
        enabled: true,
        serverId,
        subscriptionId: agentSessionChangesSubscriptionId,
        agentId: "agent-1",
        mode: "working_tree",
        turnId: null,
        ignoreWhitespace: false,
      }),
    });
    const unsubscribeCheckoutDiffObserver = checkoutDiffObserver.subscribe(() => undefined);
    const unsubscribeAgentSessionChangesObserver = agentSessionChangesObserver.subscribe(
      () => undefined,
    );
    const unsubscribeTerminalObserver = terminalObserver.subscribe(() => undefined);
    const unmount = mountServerDataPushRouter({ client: fake.client, queryClient, serverId });
    const plainCheckoutDiffObserver = new QueryObserver(queryClient, {
      queryKey: checkoutDiffKey,
      queryFn: skipToken,
      enabled: true,
      gcTime: Infinity,
      staleTime: Infinity,
    });
    const plainTerminalObserver = new QueryObserver(queryClient, {
      queryKey: terminalKey,
      queryFn: skipToken,
      enabled: true,
      gcTime: Infinity,
      staleTime: Infinity,
    });
    const plainAgentSessionChangesObserver = new QueryObserver(queryClient, {
      queryKey: agentSessionChangesKey,
      queryFn: skipToken,
      enabled: true,
      gcTime: Infinity,
      staleTime: Infinity,
    });
    const unsubscribePlainCheckoutDiffObserver = plainCheckoutDiffObserver.subscribe(
      () => undefined,
    );
    const unsubscribePlainTerminalObserver = plainTerminalObserver.subscribe(() => undefined);
    const unsubscribePlainAgentSessionChangesObserver = plainAgentSessionChangesObserver.subscribe(
      () => undefined,
    );

    invalidateServerDataQueriesAfterReconnect({ queryClient, serverId });

    expect(fake.subscribeCheckoutDiffCalls).toEqual([
      {
        cwd,
        compare: { mode: "base", baseRef: "main", ignoreWhitespace: true },
        subscriptionId: checkoutDiffSubscriptionId,
      },
      {
        cwd,
        compare: { mode: "base", baseRef: "main", ignoreWhitespace: true },
        subscriptionId: checkoutDiffSubscriptionId,
      },
    ]);
    expect(fake.subscribeTerminalCalls).toEqual([
      { cwd, workspaceId },
      { cwd, workspaceId },
    ]);
    expect(fake.subscribeAgentSessionChangesCalls).toEqual([
      {
        agentId: "agent-1",
        mode: "working_tree",
        turnId: null,
        ignoreWhitespace: false,
        subscriptionId: agentSessionChangesSubscriptionId,
      },
      {
        agentId: "agent-1",
        mode: "working_tree",
        turnId: null,
        ignoreWhitespace: false,
        subscriptionId: agentSessionChangesSubscriptionId,
      },
    ]);

    fake.emit({
      type: "terminals_changed",
      payload: {
        cwd,
        terminals: [
          { id: "terminal-a", name: "Main", workspaceId },
          { id: "terminal-b", name: "Sibling", workspaceId: "workspace-b" },
        ],
      },
    });

    expect(queryClient.getQueryData(terminalKey)).toEqual({
      cwd,
      terminals: [{ id: "terminal-a", name: "Main", workspaceId }],
      requestId: expect.stringMatching(/^terminals-changed-/),
    });

    unsubscribePlainCheckoutDiffObserver();
    unsubscribePlainTerminalObserver();
    unsubscribePlainAgentSessionChangesObserver();
    unsubscribeCheckoutDiffObserver();
    unsubscribeAgentSessionChangesObserver();
    unsubscribeTerminalObserver();
    unmount();
  });

  it("routes terminal pushes after another observer attaches without push metadata", () => {
    const queryClient = new QueryClient();
    const fake = createFakeClient();
    const serverId = "server-1";
    const cwd = "/repo";
    const workspaceId = "workspace-a";
    const queryKey = buildTerminalsQueryKey(serverId, cwd, workspaceId);
    const pushObserver = new QueryObserver(queryClient, {
      queryKey,
      queryFn: skipToken,
      enabled: true,
      gcTime: Infinity,
      staleTime: Infinity,
      meta: workspaceTerminalsPushRoute({
        enabled: true,
        serverId,
        cwd,
        workspaceId,
      }),
    });
    const unsubscribePushObserver = pushObserver.subscribe(() => undefined);
    const unmount = mountServerDataPushRouter({ client: fake.client, queryClient, serverId });
    expect(fake.subscribeTerminalCalls).toEqual([{ cwd, workspaceId }]);

    const plainObserver = new QueryObserver(queryClient, {
      queryKey,
      queryFn: skipToken,
      enabled: true,
      gcTime: Infinity,
      staleTime: Infinity,
    });
    const unsubscribePlainObserver = plainObserver.subscribe(() => undefined);

    fake.emit({
      type: "terminals_changed",
      payload: {
        cwd,
        terminals: [
          {
            id: "terminal-a",
            name: "Main",
            workspaceId,
            activity: { state: "idle", attentionReason: "needs_input", changedAt: 1 },
          },
        ],
      },
    });

    expect(queryClient.getQueryData(queryKey)).toEqual({
      cwd,
      terminals: [
        {
          id: "terminal-a",
          name: "Main",
          workspaceId,
          activity: { state: "idle", attentionReason: "needs_input", changedAt: 1 },
        },
      ],
      requestId: expect.stringMatching(/^terminals-changed-/),
    });
    expect(fake.unsubscribeTerminalCalls).toEqual([]);

    unsubscribePlainObserver();
    unsubscribePushObserver();
    unmount();
  });

  it("invalidates only the reconnect-repair scopes for one server", () => {
    const queryClient = new QueryClient();
    const serverId = "server-1";
    const otherServerId = "server-2";
    const providerKey = providersSnapshotQueryKey(serverId);
    const daemonConfigKey = daemonConfigQueryKey(serverId);
    const diffKey = checkoutDiffQueryKey(serverId, "/repo", "uncommitted", undefined, false);
    const terminalKey = buildTerminalsQueryKey(serverId, "/repo", "workspace-a");
    const otherProviderKey = providersSnapshotQueryKey(otherServerId);

    queryClient.setQueryData(providerKey, { entries: [], generatedAt: "now", requestId: "p" });
    queryClient.setQueryData(daemonConfigKey, daemonConfig);
    queryClient.setQueryData(diffKey, { cwd: "/repo", files: [], error: null, requestId: "d" });
    queryClient.setQueryData(terminalKey, { cwd: "/repo", terminals: [], requestId: "t" });
    queryClient.setQueryData(otherProviderKey, {
      entries: [],
      generatedAt: "now",
      requestId: "other",
    });

    invalidateServerDataQueriesAfterReconnect({ queryClient, serverId });

    expect(queryClient.getQueryState(providerKey)?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(daemonConfigKey)?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(diffKey)?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(terminalKey)?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(otherProviderKey)?.isInvalidated).toBe(false);
  });
});
