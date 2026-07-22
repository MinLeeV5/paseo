import { describe, expect, it } from "vitest";
import {
  requestArchiveGoalAgent,
  resolveArchiveGoalAgentDialog,
  type ArchiveGoalAgentCopy,
  type ArchiveGoalAgentDeps,
  type ResolveArchiveGoalAgentDialogInput,
} from "./archive-goal-agent";

const copy: ArchiveGoalAgentCopy = {
  title: "Archive agent?",
  message: "This will archive the agent and close its tab.",
  runningTitle: "Archive running agent?",
  runningMessage: "This Goal is still active. Archiving will stop the agent and close its tab.",
  confirmLabel: "Archive",
  cancelLabel: "Cancel",
};

interface FakeArchiveGoalAgentEnv {
  deps: ArchiveGoalAgentDeps;
  archived: Array<{ serverId: string; agentId: string }>;
  confirmations: ReturnType<typeof resolveArchiveGoalAgentDialog>[];
  reportedErrors: unknown[];
}

function createEnv(input?: {
  agent?: ResolveArchiveGoalAgentDialogInput;
  confirmed?: boolean;
  archiveError?: Error;
}): FakeArchiveGoalAgentEnv {
  const archived: Array<{ serverId: string; agentId: string }> = [];
  const confirmations: ReturnType<typeof resolveArchiveGoalAgentDialog>[] = [];
  const reportedErrors: unknown[] = [];
  return {
    archived,
    confirmations,
    reportedErrors,
    deps: {
      getAgent: () => input?.agent,
      confirm: async (dialog) => {
        confirmations.push(dialog);
        return input?.confirmed ?? true;
      },
      archiveAgent: async (archiveInput) => {
        if (input?.archiveError) {
          throw input.archiveError;
        }
        archived.push(archiveInput);
      },
      reportError: (error) => reportedErrors.push(error),
    },
  };
}

describe("resolveArchiveGoalAgentDialog", () => {
  it("warns that archiving an active Goal stops the agent", () => {
    expect(resolveArchiveGoalAgentDialog({ status: "idle", goalStatus: "active" }, copy)).toEqual({
      title: copy.runningTitle,
      message: copy.runningMessage,
      confirmLabel: "Archive",
      cancelLabel: "Cancel",
      destructive: true,
    });
  });

  it("uses the standard confirmation after the Goal finishes", () => {
    expect(resolveArchiveGoalAgentDialog({ status: "idle", goalStatus: "complete" }, copy)).toEqual(
      {
        title: copy.title,
        message: copy.message,
        confirmLabel: "Archive",
        cancelLabel: "Cancel",
        destructive: true,
      },
    );
  });
});

describe("requestArchiveGoalAgent", () => {
  it("archives the current agent after confirmation", async () => {
    const env = createEnv({
      agent: { status: "idle", goalStatus: "complete" },
    });

    await requestArchiveGoalAgent({ serverId: "server-1", agentId: "agent-1", copy }, env.deps);

    expect(env.archived).toEqual([{ serverId: "server-1", agentId: "agent-1" }]);
    expect(env.reportedErrors).toEqual([]);
  });

  it("keeps the agent when confirmation is canceled", async () => {
    const env = createEnv({
      agent: { status: "idle", goalStatus: "complete" },
      confirmed: false,
    });

    await requestArchiveGoalAgent({ serverId: "server-1", agentId: "agent-1", copy }, env.deps);

    expect(env.archived).toEqual([]);
    expect(env.reportedErrors).toEqual([]);
  });

  it("reports an archive failure", async () => {
    const archiveError = new Error("archive failed");
    const env = createEnv({
      agent: { status: "idle", goalStatus: "complete" },
      archiveError,
    });

    await requestArchiveGoalAgent({ serverId: "server-1", agentId: "agent-1", copy }, env.deps);

    expect(env.archived).toEqual([]);
    expect(env.reportedErrors).toEqual([archiveError]);
  });
});
