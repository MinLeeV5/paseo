import { describe, expect, it, vi } from "vitest";
import { selectProjectWorkspacesToArchive } from "@/workspace/project-workspace-archive";

describe("selectProjectWorkspacesToArchive", () => {
  it("skips each workspace whose archive confirmation is canceled", async () => {
    const confirmWorkspaceArchive = vi
      .fn<(input: { workspaceName: string }) => Promise<boolean>>()
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);

    const targets = await selectProjectWorkspacesToArchive(
      [
        {
          serverId: "server-1",
          workspaceId: "workspace-worktree",
          workspaceKind: "worktree",
          name: "feature/risky",
          archiveHasUncommittedChanges: true,
          archiveUnpushedCommitCount: 2,
          diffStat: { additions: 5, deletions: 1 },
        },
        {
          serverId: "server-1",
          workspaceId: "workspace-checkout",
          workspaceKind: "local_checkout",
          name: "main",
          archiveHasUncommittedChanges: null,
          archiveUnpushedCommitCount: null,
          diffStat: null,
        },
      ],
      confirmWorkspaceArchive,
    );

    expect(confirmWorkspaceArchive).toHaveBeenCalledTimes(2);
    expect(confirmWorkspaceArchive).toHaveBeenNthCalledWith(1, {
      workspaceName: "feature/risky",
      isDirty: true,
      aheadOfOrigin: 2,
      diffStat: { additions: 5, deletions: 1 },
    });
    expect(confirmWorkspaceArchive).toHaveBeenNthCalledWith(2, {
      workspaceName: "main",
    });
    expect(targets).toEqual([
      {
        serverId: "server-1",
        workspaceId: "workspace-checkout",
      },
    ]);
  });

  it("includes every workspace whose archive confirmation is accepted", async () => {
    const confirmWorkspaceArchive = vi.fn(async () => true);

    const targets = await selectProjectWorkspacesToArchive(
      [
        {
          serverId: "server-1",
          workspaceId: "workspace-worktree",
          workspaceKind: "worktree",
          name: "feature/risky",
          archiveHasUncommittedChanges: true,
          archiveUnpushedCommitCount: 2,
          diffStat: { additions: 5, deletions: 1 },
        },
        {
          serverId: "server-1",
          workspaceId: "workspace-checkout",
          workspaceKind: "local_checkout",
          name: "main",
          archiveHasUncommittedChanges: null,
          archiveUnpushedCommitCount: null,
          diffStat: null,
        },
      ],
      confirmWorkspaceArchive,
    );

    expect(confirmWorkspaceArchive).toHaveBeenCalledTimes(2);
    expect(confirmWorkspaceArchive).toHaveBeenNthCalledWith(1, {
      workspaceName: "feature/risky",
      isDirty: true,
      aheadOfOrigin: 2,
      diffStat: { additions: 5, deletions: 1 },
    });
    expect(confirmWorkspaceArchive).toHaveBeenNthCalledWith(2, {
      workspaceName: "main",
    });
    expect(targets).toEqual([
      {
        serverId: "server-1",
        workspaceId: "workspace-worktree",
      },
      {
        serverId: "server-1",
        workspaceId: "workspace-checkout",
      },
    ]);
  });
});
