import type { ConfirmDialogInput } from "@/utils/confirm-dialog";

export interface ArchiveGoalAgentCopy {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
}

export function resolveArchiveGoalAgentDialog(copy: ArchiveGoalAgentCopy): ConfirmDialogInput {
  return {
    title: copy.title,
    message: copy.message,
    confirmLabel: copy.confirmLabel,
    cancelLabel: copy.cancelLabel,
    destructive: false,
  };
}

export interface ArchiveGoalAgentDeps {
  confirm: (input: ConfirmDialogInput) => Promise<boolean>;
  archiveGoal: (input: { serverId: string; agentId: string }) => Promise<void>;
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
  const confirmed = await deps.confirm(resolveArchiveGoalAgentDialog(input.copy));
  if (!confirmed) {
    return;
  }

  try {
    await deps.archiveGoal({ serverId: input.serverId, agentId: input.agentId });
  } catch (error) {
    deps.reportError(error);
  }
}
