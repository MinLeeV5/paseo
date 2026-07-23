import { describe, expect, it } from "vitest";
import {
  requestArchiveGoalAgent,
  resolveArchiveGoalAgentDialog,
  type ArchiveGoalAgentCopy,
  type ArchiveGoalAgentDeps,
} from "./archive-goal-agent";

const copy: ArchiveGoalAgentCopy = {
  title: "Archive Goal?",
  message: "This hides the Goal status. The Agent and Goal keep running.",
  confirmLabel: "Archive",
  cancelLabel: "Cancel",
};

interface FakeArchiveGoalAgentEnv {
  deps: ArchiveGoalAgentDeps;
  archived: Array<{ serverId: string; agentId: string }>;
  confirmations: ReturnType<typeof resolveArchiveGoalAgentDialog>[];
  reportedErrors: unknown[];
}

function createEnv(input?: { confirmed?: boolean; archiveError?: Error }): FakeArchiveGoalAgentEnv {
  const archived: Array<{ serverId: string; agentId: string }> = [];
  const confirmations: ReturnType<typeof resolveArchiveGoalAgentDialog>[] = [];
  const reportedErrors: unknown[] = [];
  return {
    archived,
    confirmations,
    reportedErrors,
    deps: {
      confirm: async (dialog) => {
        confirmations.push(dialog);
        return input?.confirmed ?? true;
      },
      archiveGoal: async (archiveInput) => {
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
  it("describes a non-destructive Goal-only archive", () => {
    expect(resolveArchiveGoalAgentDialog(copy)).toEqual({
      title: copy.title,
      message: copy.message,
      confirmLabel: "Archive",
      cancelLabel: "Cancel",
      destructive: false,
    });
  });
});

describe("requestArchiveGoalAgent", () => {
  it("archives only the current Goal after confirmation", async () => {
    const env = createEnv();

    await requestArchiveGoalAgent({ serverId: "server-1", agentId: "agent-1", copy }, env.deps);

    expect(env.archived).toEqual([{ serverId: "server-1", agentId: "agent-1" }]);
    expect(env.reportedErrors).toEqual([]);
  });

  it("keeps the agent when confirmation is canceled", async () => {
    const env = createEnv({
      confirmed: false,
    });

    await requestArchiveGoalAgent({ serverId: "server-1", agentId: "agent-1", copy }, env.deps);

    expect(env.archived).toEqual([]);
    expect(env.reportedErrors).toEqual([]);
  });

  it("reports an archive failure", async () => {
    const archiveError = new Error("archive failed");
    const env = createEnv({
      archiveError,
    });

    await requestArchiveGoalAgent({ serverId: "server-1", agentId: "agent-1", copy }, env.deps);

    expect(env.archived).toEqual([]);
    expect(env.reportedErrors).toEqual([archiveError]);
  });
});
