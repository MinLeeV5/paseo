import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import pino from "pino";
import { expect, test } from "vitest";
import type { AgentManager } from "./agent/agent-manager.js";
import type { ProviderSnapshotManager } from "./agent/provider-snapshot-manager.js";
import { WorkspaceAutoName } from "./workspace-auto-name.js";
import { createPersistedWorkspaceRecord, type WorkspaceRegistry } from "./workspace-registry.js";
import type { WorkspaceGitService } from "./workspace-git-service.js";
import { createWorktree } from "../utils/worktree.js";
import { writePaseoWorktreeFirstAgentBranchAutoNameMetadata } from "../utils/worktree-metadata.js";

function deferred(): { promise: Promise<void>; resolve(): void } {
  let resolve!: () => void;
  const promise = new Promise<void>((accept) => {
    resolve = accept;
  });
  return { promise, resolve };
}

function createGitRepo(): { tempDir: string; repoDir: string; paseoHome: string } {
  const tempDir = realpathSync(mkdtempSync(path.join(tmpdir(), "workspace-auto-name-")));
  const repoDir = path.join(tempDir, "repo");
  const paseoHome = path.join(tempDir, "paseo-home");
  mkdirSync(repoDir, { recursive: true });
  execFileSync("git", ["init", "-b", "main"], { cwd: repoDir });
  execFileSync("git", ["config", "user.email", "test@test.com"], { cwd: repoDir });
  execFileSync("git", ["config", "user.name", "Test"], { cwd: repoDir });
  writeFileSync(path.join(repoDir, "README.md"), "test\n");
  execFileSync("git", ["add", "."], { cwd: repoDir });
  execFileSync("git", ["-c", "commit.gpgsign=false", "commit", "-m", "initial"], {
    cwd: repoDir,
  });
  return { tempDir, repoDir, paseoHome };
}

test("auto-name preserves workspace archival that lands during its metadata write", async () => {
  let workspace = createPersistedWorkspaceRecord({
    workspaceId: "workspace-auto-name",
    projectId: "project-auto-name",
    cwd: "/workspace",
    kind: "directory",
    displayName: "workspace",
    createdAt: "2026-08-08T00:00:00.000Z",
    updatedAt: "2026-08-08T00:00:00.000Z",
  });
  const mutationStarted = deferred();
  const allowMutation = deferred();
  const updateEmitted = deferred();
  const workspaceRegistry = {
    update: async (_workspaceId, updater) => {
      mutationStarted.resolve();
      await allowMutation.promise;
      workspace = updater(workspace);
      return workspace;
    },
  } satisfies Pick<WorkspaceRegistry, "update">;
  const autoName = new WorkspaceAutoName({
    agentManager: {} as AgentManager,
    workspaceRegistry,
    workspaceGitService: {} as WorkspaceGitService,
    providerSnapshotManager: {} as ProviderSnapshotManager,
    readDaemonConfig: () => ({}),
    gitMutation: { notifyGitMutation: async () => {} },
    emitWorkspaceUpdateForCwd: async () => {},
    emitWorkspaceUpdateForWorkspaceId: async () => updateEmitted.resolve(),
    logger: pino({ level: "silent" }),
    generateWorkspaceName: async () => ({ title: "generated", branch: null }),
  });

  autoName.scheduleForDirectory({
    workspaceId: workspace.workspaceId,
    cwd: workspace.cwd,
    firstAgentContext: { prompt: "Name this workspace" },
  });
  await mutationStarted.promise;
  const archivedAt = "2026-08-08T00:01:00.000Z";
  workspace = { ...workspace, updatedAt: archivedAt, archivedAt };
  allowMutation.resolve();
  await updateEmitted.promise;

  expect(workspace).toMatchObject({
    title: "generated",
    archivedAt,
  });
});

test("auto-name before use renames the branch and owned worktree directory together", async () => {
  const { tempDir, repoDir, paseoHome } = createGitRepo();

  try {
    const created = await createWorktree({
      cwd: repoDir,
      source: {
        kind: "branch-off",
        baseBranch: "main",
        branchName: "placeholder-branch",
      },
      worktreeSlug: "placeholder-worktree",
      paseoHome,
    });
    writePaseoWorktreeFirstAgentBranchAutoNameMetadata(created.worktreePath, {
      placeholderBranchName: created.branchName,
    });

    let workspace = createPersistedWorkspaceRecord({
      workspaceId: "workspace-auto-name-worktree",
      projectId: "project-auto-name-worktree",
      cwd: created.worktreePath,
      kind: "worktree",
      displayName: "placeholder-branch",
      branch: "placeholder-branch",
      worktreeRoot: created.worktreePath,
      isPaseoOwnedWorktree: true,
      mainRepoRoot: repoDir,
      createdAt: "2026-08-08T00:00:00.000Z",
      updatedAt: "2026-08-08T00:00:00.000Z",
    });
    const workspaceRegistry = {
      update: async (_workspaceId, updater) => {
        workspace = updater(workspace);
        return workspace;
      },
    } satisfies Pick<WorkspaceRegistry, "update">;
    const emittedWorkspaceIds: string[] = [];
    const autoName = new WorkspaceAutoName({
      agentManager: {} as AgentManager,
      workspaceRegistry,
      workspaceGitService: {} as WorkspaceGitService,
      providerSnapshotManager: {} as ProviderSnapshotManager,
      readDaemonConfig: () => ({}),
      gitMutation: { notifyGitMutation: async () => {} },
      emitWorkspaceUpdateForCwd: async () => {},
      emitWorkspaceUpdateForWorkspaceId: async (workspaceId) => {
        emittedWorkspaceIds.push(workspaceId);
      },
      logger: pino({ level: "silent" }),
      paseoHome,
      generateWorkspaceName: async () => ({
        title: "Generated workspace",
        branch: "feature/generated-branch",
      }),
    });

    const result = await autoName.autoNameWorktreeBeforeUse({
      workspace,
      firstAgentContext: { prompt: "Name this workspace" },
    });
    const expectedWorktreeRoot = path.join(
      path.dirname(created.worktreePath),
      "feature-generated-branch",
    );

    expect(result).toMatchObject({
      workspace: {
        title: "Generated workspace",
        branch: "feature/generated-branch",
        cwd: expectedWorktreeRoot,
        worktreeRoot: expectedWorktreeRoot,
      },
      worktreePath: expectedWorktreeRoot,
      branchName: "feature/generated-branch",
    });
    expect(existsSync(created.worktreePath)).toBe(false);
    expect(existsSync(expectedWorktreeRoot)).toBe(true);
    expect(
      execFileSync("git", ["branch", "--show-current"], {
        cwd: expectedWorktreeRoot,
      })
        .toString()
        .trim(),
    ).toBe("feature/generated-branch");
    expect(emittedWorkspaceIds).toEqual([workspace.workspaceId]);
  } finally {
    rmSync(tempDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});

test("auto-name restores the original worktree path when registry persistence fails", async () => {
  const { tempDir, repoDir, paseoHome } = createGitRepo();

  try {
    const created = await createWorktree({
      cwd: repoDir,
      source: {
        kind: "branch-off",
        baseBranch: "main",
        branchName: "placeholder-branch",
      },
      worktreeSlug: "placeholder-worktree",
      paseoHome,
    });
    writePaseoWorktreeFirstAgentBranchAutoNameMetadata(created.worktreePath, {
      placeholderBranchName: created.branchName,
    });
    const workspace = createPersistedWorkspaceRecord({
      workspaceId: "workspace-auto-name-rollback",
      projectId: "project-auto-name-rollback",
      cwd: created.worktreePath,
      kind: "worktree",
      displayName: "placeholder-branch",
      branch: "placeholder-branch",
      worktreeRoot: created.worktreePath,
      isPaseoOwnedWorktree: true,
      mainRepoRoot: repoDir,
      createdAt: "2026-08-08T00:00:00.000Z",
      updatedAt: "2026-08-08T00:00:00.000Z",
    });
    const autoName = new WorkspaceAutoName({
      agentManager: {} as AgentManager,
      workspaceRegistry: {
        update: async () => {
          throw new Error("workspace persistence failed");
        },
      },
      workspaceGitService: {} as WorkspaceGitService,
      providerSnapshotManager: {} as ProviderSnapshotManager,
      readDaemonConfig: () => ({}),
      gitMutation: { notifyGitMutation: async () => {} },
      emitWorkspaceUpdateForCwd: async () => {},
      emitWorkspaceUpdateForWorkspaceId: async () => {},
      logger: pino({ level: "silent" }),
      paseoHome,
      generateWorkspaceName: async () => ({
        title: "Generated workspace",
        branch: "generated-branch",
      }),
    });

    await expect(
      autoName.autoNameWorktreeBeforeUse({
        workspace,
        firstAgentContext: { prompt: "Name this workspace" },
      }),
    ).rejects.toThrow("workspace persistence failed");

    expect(existsSync(created.worktreePath)).toBe(true);
    expect(existsSync(path.join(path.dirname(created.worktreePath), "generated-branch"))).toBe(
      false,
    );
    expect(
      execFileSync("git", ["branch", "--show-current"], { cwd: created.worktreePath })
        .toString()
        .trim(),
    ).toBe("placeholder-branch");
  } finally {
    rmSync(tempDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});
