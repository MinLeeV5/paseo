import { isAgentOngoing } from "@getpaseo/protocol/agent-state-bucket";
import type { Agent } from "@/stores/session-store";
import type { ConfirmDialogInput } from "@/utils/confirm-dialog";

export interface ArchiveGoalAgentCopy {
  title: string;
  message: string;
  runningTitle: string;
  runningMessage: string;
  confirmLabel: string;
  cancelLabel: string;
}

export interface ResolveArchiveGoalAgentDialogInput {
  status: Agent["status"] | null | undefined;
  goalStatus?: string | null;
}

export function resolveArchiveGoalAgentDialog(
  input: ResolveArchiveGoalAgentDialogInput,
  copy: ArchiveGoalAgentCopy,
): ConfirmDialogInput {
  const isRunning = input.status
    ? isAgentOngoing({ status: input.status, goalStatus: input.goalStatus })
    : false;

  return {
    title: isRunning ? copy.runningTitle : copy.title,
    message: isRunning ? copy.runningMessage : copy.message,
    confirmLabel: copy.confirmLabel,
    cancelLabel: copy.cancelLabel,
    destructive: true,
  };
}

export interface ArchiveGoalAgentDeps {
  getAgent: (agentId: string) => ResolveArchiveGoalAgentDialogInput | undefined;
  confirm: (input: ConfirmDialogInput) => Promise<boolean>;
  archiveAgent: (input: { serverId: string; agentId: string }) => Promise<void>;
  reportError: (error: unknown) => void;
}

export interface RequestArchiveGoalAgentInput {
  serverId: string;
  agentId: string;
  copy: ArchiveGoalAgentCopy;
}

export async function requestArchiveGoalAgent(
  input: RequestArchiveGoalAgentInput,
  deps: ArchiveGoalAgentDeps,
): Promise<void> {
  const agent = deps.getAgent(input.agentId);
  const confirmed = await deps.confirm(
    resolveArchiveGoalAgentDialog(
      {
        status: agent?.status,
        goalStatus: agent?.goalStatus,
      },
      input.copy,
    ),
  );
  if (!confirmed) {
    return;
  }

  try {
    await deps.archiveAgent({ serverId: input.serverId, agentId: input.agentId });
  } catch (error) {
    deps.reportError(error);
  }
}
