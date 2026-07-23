import type {
  AgentSessionChangesMode,
  AgentSessionChangesSubscribeResponse,
} from "@getpaseo/protocol/messages";
import { useMemo } from "react";
import { agentSessionChangesPushRoute } from "@/data/push-router";
import { useReplicaQuery } from "@/data/query";
import { agentSessionChangesQueryKey } from "@/git/query-keys";
import { useHostRuntimeIsConnected } from "@/runtime/host-runtime";

interface UseAgentSessionChangesQueryOptions {
  serverId: string;
  agentId: string | null;
  mode: AgentSessionChangesMode;
  turnId: string | null;
  ignoreWhitespace?: boolean;
  enabled?: boolean;
}

type AgentSessionChangesQueryPayload = Omit<
  AgentSessionChangesSubscribeResponse["payload"],
  "subscriptionId"
>;

export function useAgentSessionChangesQuery({
  serverId,
  agentId,
  mode,
  turnId,
  ignoreWhitespace,
  enabled = true,
}: UseAgentSessionChangesQueryOptions) {
  const isConnected = useHostRuntimeIsConnected(serverId);
  const normalizedAgentId = agentId ?? "";
  const normalizedIgnoreWhitespace = ignoreWhitespace === true;
  const queryKey = useMemo(
    () =>
      agentSessionChangesQueryKey(
        serverId,
        normalizedAgentId,
        mode,
        turnId,
        normalizedIgnoreWhitespace,
      ),
    [mode, normalizedAgentId, normalizedIgnoreWhitespace, serverId, turnId],
  );
  const subscriptionId = useMemo(
    () => `agentSessionChanges:${JSON.stringify(queryKey)}`,
    [queryKey],
  );
  const routeEnabled = Boolean(enabled && isConnected && normalizedAgentId);

  const query = useReplicaQuery<AgentSessionChangesQueryPayload>({
    queryKey,
    enabled: routeEnabled,
    pushEvent: "agent.session_changes.update",
    meta: agentSessionChangesPushRoute({
      enabled: routeEnabled,
      serverId,
      subscriptionId,
      agentId: normalizedAgentId,
      mode,
      turnId,
      ignoreWhitespace: normalizedIgnoreWhitespace,
    }),
  });

  const payload = query.data ?? null;
  const payloadError = payload?.error ?? null;

  return {
    files: payload?.files ?? [],
    turns: payload?.turns ?? [],
    selectedTurnId: payload?.selectedTurnId ?? null,
    baselineAvailable: payload?.baselineAvailable ?? false,
    payloadError,
    isLoading: payload === null && routeEnabled,
    isFetching: false,
    isError: Boolean(payloadError),
    error: null,
  };
}
