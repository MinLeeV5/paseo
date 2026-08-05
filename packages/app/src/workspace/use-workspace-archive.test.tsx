/** @vitest-environment jsdom */

import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  archiveWorkspaceOptimistically: vi.fn(async () => undefined),
  confirmWorkspaceArchive: vi.fn(async () => true),
  getClient: vi.fn(() => ({ archiveWorkspace: vi.fn() })),
  purgeWorkspace: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("@/contexts/toast-context", () => ({
  useToast: () => ({ error: mocks.toastError }),
}));

vi.mock("@/git/worktree-archive-warning", () => ({
  confirmWorkspaceArchive: mocks.confirmWorkspaceArchive,
  DEFAULT_WORKTREE_ARCHIVE_WARNING_LABELS: {
    title: (workspaceName: string) => workspaceName,
    confirm: "Archive",
    cancel: "Cancel",
    message: "Archive workspace",
    uncommittedChanges: "Uncommitted changes",
    uncommittedChangesWithDiff: (diffStat: string) => diffStat,
    addedLine: (count: number) => String(count),
    deletedLine: (count: number) => String(count),
    unpushedCommit: (count: number) => String(count),
  },
}));

vi.mock("@/runtime/host-runtime", () => ({
  getHostRuntimeStore: () => ({ getClient: mocks.getClient }),
}));

vi.mock("@/stores/workspace-layout-store", () => ({
  useWorkspaceLayoutStore: {
    getState: () => ({ purgeWorkspace: mocks.purgeWorkspace }),
  },
}));

vi.mock("@/workspace/workspace-archive", () => ({
  archiveWorkspaceOptimistically: mocks.archiveWorkspaceOptimistically,
}));

import { useWorkspaceArchive } from "@/workspace/use-workspace-archive";

describe("useWorkspaceArchive", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.confirmWorkspaceArchive.mockResolvedValue(true);
  });

  it("does not start archiving a directory workspace when confirmation is canceled", async () => {
    mocks.confirmWorkspaceArchive.mockResolvedValue(false);
    const onArchiveStarted = vi.fn();
    const onSetHiding = vi.fn();
    const { result } = renderHook(() =>
      useWorkspaceArchive({
        serverId: "server-1",
        workspaceId: "workspace-1",
        workspaceKind: "directory",
        name: "local-workspace",
        onArchiveStarted,
        onSetHiding,
      }),
    );

    act(() => result.current.archive());

    await waitFor(() => expect(mocks.confirmWorkspaceArchive).toHaveBeenCalledOnce());
    expect(mocks.confirmWorkspaceArchive).toHaveBeenCalledWith(
      { workspaceName: "local-workspace" },
      expect.any(Object),
    );
    expect(mocks.getClient).not.toHaveBeenCalled();
    expect(onArchiveStarted).not.toHaveBeenCalled();
    expect(onSetHiding).not.toHaveBeenCalled();
    expect(mocks.archiveWorkspaceOptimistically).not.toHaveBeenCalled();
  });

  it("preserves worktree risk details when confirmation is accepted", async () => {
    const onArchiveStarted = vi.fn();
    const { result } = renderHook(() =>
      useWorkspaceArchive({
        serverId: "server-1",
        workspaceId: "workspace-1",
        workspaceKind: "worktree",
        name: "risky-worktree",
        isDirty: true,
        aheadOfOrigin: 2,
        diffStat: { additions: 4, deletions: 1 },
        onArchiveStarted,
      }),
    );

    act(() => result.current.archive());

    await waitFor(() => expect(mocks.archiveWorkspaceOptimistically).toHaveBeenCalledOnce());
    expect(mocks.confirmWorkspaceArchive).toHaveBeenCalledWith(
      {
        workspaceName: "risky-worktree",
        isDirty: true,
        aheadOfOrigin: 2,
        diffStat: { additions: 4, deletions: 1 },
      },
      expect.any(Object),
    );
    expect(onArchiveStarted).toHaveBeenCalledOnce();
  });
});
