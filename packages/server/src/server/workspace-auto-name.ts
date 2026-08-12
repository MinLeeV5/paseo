import type pino from "pino";
import { basename } from "node:path";
import type { FirstAgentContext } from "@getpaseo/protocol/messages";

import { resolveFirstAgentPromptTitle } from "./agent/create-agent-title.js";
import type { AgentManager } from "./agent/agent-manager.js";
import type { ProviderSnapshotManager } from "./agent/provider-snapshot-manager.js";
import type { StructuredGenerationDaemonConfig } from "./agent/structured-generation-providers.js";
import {
  attemptFirstAgentBranchAutoName,
  type AttemptFirstAgentBranchAutoNameResult,
} from "./paseo-worktree-service.js";
import type { GitMutationService } from "./session/git-mutation/git-mutation-service.js";
import type { WorkspaceGitService } from "./workspace-git-service.js";
import type { PersistedWorkspaceRecord, WorkspaceRegistry } from "./workspace-registry.js";
import { mapWorkspaceRelativeCwdToWorktree, movePaseoWorktree } from "../utils/worktree.js";
import { getRealpathAwareRelativePath } from "../utils/path.js";
import { renameCurrentBranch } from "../utils/checkout-git.js";
import {
  generateBranchNameFromFirstAgentContext,
  type GeneratedWorkspaceName,
  type GenerateBranchNameFromFirstAgentContextOptions,
} from "./worktree-branch-name-generator.js";

type WorkspaceNameGenerator = typeof generateBranchNameFromFirstAgentContext;

type CurrentSelection = GenerateBranchNameFromFirstAgentContextOptions["currentSelection"] | null;

interface WorkspaceAutoNameOptions {
  agentManager: AgentManager;
  workspaceRegistry: Pick<WorkspaceRegistry, "update">;
  workspaceGitService: WorkspaceGitService;
  providerSnapshotManager: ProviderSnapshotManager;
  readDaemonConfig: () => StructuredGenerationDaemonConfig;
  gitMutation: Pick<GitMutationService, "notifyGitMutation">;
  emitWorkspaceUpdateForCwd: (cwd: string) => Promise<void>;
  emitWorkspaceUpdateForWorkspaceId: (workspaceId: string) => Promise<void>;
  logger: pino.Logger;
  paseoHome?: string;
  worktreesRoot?: string;
  generateWorkspaceName?: WorkspaceNameGenerator;
}

export interface AutoNamedWorktreeResult {
  workspace: PersistedWorkspaceRecord;
  worktreePath: string;
  branchName: string | null;
}

interface WorktreeLocation {
  worktreeRoot: string;
  workspaceCwd: string;
  moved: boolean;
}

interface WorkspaceTitleUpdate {
  title: string | null;
  branch?: string | null;
  cwd?: string;
  worktreeRoot?: string;
  promptTitle?: string | null;
}

interface ScheduleContext {
  currentSelection?: CurrentSelection;
}

export class WorkspaceAutoName {
  private readonly agentManager: AgentManager;
  private readonly workspaceRegistry: Pick<WorkspaceRegistry, "update">;
  private readonly workspaceGitService: WorkspaceGitService;
  private readonly providerSnapshotManager: ProviderSnapshotManager;
  private readonly readDaemonConfig: () => StructuredGenerationDaemonConfig;
  private readonly gitMutation: Pick<GitMutationService, "notifyGitMutation">;
  private readonly emitWorkspaceUpdateForCwd: (cwd: string) => Promise<void>;
  private readonly emitWorkspaceUpdateForWorkspaceId: (workspaceId: string) => Promise<void>;
  private readonly logger: pino.Logger;
  private readonly paseoHome: string | undefined;
  private readonly worktreesRoot: string | undefined;
  private readonly generateWorkspaceName: WorkspaceNameGenerator;

  constructor(options: WorkspaceAutoNameOptions) {
    this.agentManager = options.agentManager;
    this.workspaceRegistry = options.workspaceRegistry;
    this.workspaceGitService = options.workspaceGitService;
    this.providerSnapshotManager = options.providerSnapshotManager;
    this.readDaemonConfig = options.readDaemonConfig;
    this.gitMutation = options.gitMutation;
    this.emitWorkspaceUpdateForCwd = options.emitWorkspaceUpdateForCwd;
    this.emitWorkspaceUpdateForWorkspaceId = options.emitWorkspaceUpdateForWorkspaceId;
    this.logger = options.logger;
    this.paseoHome = options.paseoHome;
    this.worktreesRoot = options.worktreesRoot;
    this.generateWorkspaceName =
      options.generateWorkspaceName ?? generateBranchNameFromFirstAgentContext;
  }

  scheduleForWorktree(
    input: {
      workspace: PersistedWorkspaceRecord;
      firstAgentContext: FirstAgentContext;
    },
    context: ScheduleContext = {},
  ): void {
    this.schedule(
      () =>
        this.maybeAutoNameWorkspaceBranchForFirstAgent({
          ...input,
          currentSelection: context.currentSelection ?? null,
          relocateWorktree: false,
        }),
      {
        cwd: input.workspace.cwd,
        message: "Failed to auto-name worktree branch",
      },
    );
  }

  async autoNameWorktreeBeforeUse(
    input: {
      workspace: PersistedWorkspaceRecord;
      firstAgentContext: FirstAgentContext;
    },
    context: ScheduleContext = {},
  ): Promise<AutoNamedWorktreeResult | null> {
    return this.maybeAutoNameWorkspaceBranchForFirstAgent({
      ...input,
      currentSelection: context.currentSelection ?? null,
      relocateWorktree: true,
    });
  }

  scheduleForDirectory(
    input: {
      workspaceId: string;
      cwd: string;
      firstAgentContext: FirstAgentContext;
    },
    context: ScheduleContext = {},
  ): void {
    this.schedule(
      () =>
        this.maybeAutoNameDirectoryWorkspaceTitle({
          ...input,
          currentSelection: context.currentSelection ?? null,
        }),
      { cwd: input.cwd, message: "Failed to auto-name directory workspace title" },
    );
  }

  private async maybeAutoNameWorkspaceBranchForFirstAgent(input: {
    workspace: PersistedWorkspaceRecord;
    firstAgentContext: FirstAgentContext;
    currentSelection: CurrentSelection;
    relocateWorktree: boolean;
  }): Promise<AutoNamedWorktreeResult | null> {
    const worktreeRoot = input.workspace.worktreeRoot ?? input.workspace.cwd;
    let generated: GeneratedWorkspaceName | null = null;
    const result: AttemptFirstAgentBranchAutoNameResult = await attemptFirstAgentBranchAutoName({
      cwd: worktreeRoot,
      firstAgentContext: input.firstAgentContext,
      generateBranchNameFromContext: ({ firstAgentContext }) => {
        return this.generateFromContext({
          cwd: input.workspace.cwd,
          firstAgentContext,
          currentSelection: input.currentSelection,
        }).then((nextGenerated) => {
          generated = nextGenerated;
          return nextGenerated?.branch ?? null;
        });
      },
    });

    if (!generated) {
      generated = await this.generateFromContext({
        cwd: input.workspace.cwd,
        firstAgentContext: input.firstAgentContext,
        currentSelection: input.currentSelection,
      });
    }
    const generatedTitle = generated?.title ?? null;
    if (!generatedTitle && !result.renamed) {
      return null;
    }

    const location = await this.maybeRelocateWorktree({
      workspace: input.workspace,
      worktreeRoot,
      relocateWorktree: input.relocateWorktree,
      branchName: result.renamed ? result.branchName : null,
    });

    // K4: re-read from the registry before writing so any concurrent upsert
    // that happened between workspace creation and this async path is not clobbered.
    // When the first-agent rename changed the git branch too, persist that branch
    // alongside the title — both are this path's own fields.
    const updatedWorkspace = await this.persistAutoNamedWorktree({
      workspace: input.workspace,
      originalWorktreeRoot: worktreeRoot,
      location,
      update: {
        title: generatedTitle,
        cwd: location.workspaceCwd,
        worktreeRoot: location.worktreeRoot,
        ...(result.renamed ? { branch: result.branchName } : {}),
        promptTitle: resolveFirstAgentPromptTitle(input.firstAgentContext),
      },
    });
    if (!updatedWorkspace) {
      return null;
    }
    if (result.renamed) {
      await this.gitMutation
        .notifyGitMutation(location.worktreeRoot, "rename-branch")
        .catch((error) => {
          this.logger.warn(
            { err: error, cwd: location.worktreeRoot },
            "Failed to notify observers after auto-naming worktree",
          );
        });
    }
    await (
      location.workspaceCwd !== input.workspace.cwd
        ? this.emitWorkspaceUpdateForWorkspaceId(input.workspace.workspaceId)
        : this.emitWorkspaceUpdateForCwd(input.workspace.cwd)
    ).catch((error) => {
      this.logger.warn(
        { err: error, workspaceId: input.workspace.workspaceId },
        "Failed to emit auto-named workspace update",
      );
    });
    return {
      workspace: updatedWorkspace,
      worktreePath: location.worktreeRoot,
      branchName: result.renamed ? result.branchName : updatedWorkspace.branch,
    };
  }

  private async maybeRelocateWorktree(input: {
    workspace: PersistedWorkspaceRecord;
    worktreeRoot: string;
    relocateWorktree: boolean;
    branchName: string | null;
  }): Promise<WorktreeLocation> {
    const original = {
      worktreeRoot: input.worktreeRoot,
      workspaceCwd: input.workspace.cwd,
      moved: false,
    };
    if (!input.relocateWorktree || !input.workspace.isPaseoOwnedWorktree || !input.branchName) {
      return original;
    }

    try {
      const relativeWorkspaceCwd = getRealpathAwareRelativePath(
        input.worktreeRoot,
        input.workspace.cwd,
      );
      if (relativeWorkspaceCwd === null) {
        throw new Error(`Workspace cwd is outside its worktree: ${input.workspace.cwd}`);
      }
      const worktreeRoot = await movePaseoWorktree({
        worktreePath: input.worktreeRoot,
        targetName: input.branchName,
        paseoHome: this.paseoHome,
        worktreesRoot: this.worktreesRoot,
      });
      return {
        worktreeRoot,
        workspaceCwd: mapWorkspaceRelativeCwdToWorktree({
          relativeWorkspaceCwd,
          targetWorktreePath: worktreeRoot,
        }),
        moved: worktreeRoot !== input.worktreeRoot,
      };
    } catch (error) {
      this.logger.warn(
        { err: error, cwd: input.worktreeRoot, branchName: input.branchName },
        "Failed to move auto-named worktree directory",
      );
      return original;
    }
  }

  private async persistAutoNamedWorktree(input: {
    workspace: PersistedWorkspaceRecord;
    originalWorktreeRoot: string;
    location: WorktreeLocation;
    update: WorkspaceTitleUpdate;
  }): Promise<PersistedWorkspaceRecord | null> {
    let updatedWorkspace: PersistedWorkspaceRecord | null;
    try {
      updatedWorkspace = await this.applyGeneratedWorkspaceTitle(
        input.workspace.workspaceId,
        input.update,
      );
    } catch (error) {
      await this.rollbackWorktreeMoveIfNeeded(input);
      throw error;
    }
    if (!updatedWorkspace) {
      await this.rollbackWorktreeMoveIfNeeded(input);
    }
    return updatedWorkspace;
  }

  private async rollbackWorktreeMoveIfNeeded(input: {
    workspace: PersistedWorkspaceRecord;
    originalWorktreeRoot: string;
    location: WorktreeLocation;
  }): Promise<void> {
    if (!input.location.moved) {
      return;
    }
    await this.rollbackWorktreeMove({
      currentWorktreeRoot: input.location.worktreeRoot,
      originalWorktreeRoot: input.originalWorktreeRoot,
      originalBranch: input.workspace.branch,
    });
  }

  private async rollbackWorktreeMove(input: {
    currentWorktreeRoot: string;
    originalWorktreeRoot: string;
    originalBranch: string | null;
  }): Promise<void> {
    try {
      const restoredWorktreeRoot = await movePaseoWorktree({
        worktreePath: input.currentWorktreeRoot,
        targetName: basename(input.originalWorktreeRoot),
        paseoHome: this.paseoHome,
        worktreesRoot: this.worktreesRoot,
      });
      if (input.originalBranch) {
        await renameCurrentBranch(restoredWorktreeRoot, input.originalBranch);
      }
    } catch (rollbackError) {
      this.logger.error(
        {
          err: rollbackError,
          currentWorktreeRoot: input.currentWorktreeRoot,
          originalWorktreeRoot: input.originalWorktreeRoot,
        },
        "Failed to roll back auto-named worktree move",
      );
    }
  }

  private async maybeAutoNameDirectoryWorkspaceTitle(input: {
    workspaceId: string;
    cwd: string;
    firstAgentContext: FirstAgentContext;
    currentSelection: CurrentSelection;
  }): Promise<void> {
    const generated = await this.generateFromContext({
      cwd: input.cwd,
      firstAgentContext: input.firstAgentContext,
      currentSelection: input.currentSelection,
    });
    const title = generated?.title ?? null;
    if (!title) {
      return;
    }
    // K4: applyGeneratedWorkspaceTitle re-reads from the registry before writing.
    // Directory workspaces have no branch — write only the title.
    await this.applyGeneratedWorkspaceTitle(input.workspaceId, {
      title,
      promptTitle: resolveFirstAgentPromptTitle(input.firstAgentContext),
    });
    await this.emitWorkspaceUpdateForWorkspaceId(input.workspaceId);
  }

  private async applyGeneratedWorkspaceTitle(
    workspaceId: string,
    input: WorkspaceTitleUpdate,
  ): Promise<PersistedWorkspaceRecord | null> {
    return this.workspaceRegistry.update(workspaceId, (current) => {
      let title = current.title;
      if (input.title && (!title || (input.promptTitle && title === input.promptTitle))) {
        title = input.title;
      }
      return {
        ...current,
        title,
        ...(input.branch ? { branch: input.branch } : {}),
        ...(input.cwd ? { cwd: input.cwd } : {}),
        ...(input.worktreeRoot ? { worktreeRoot: input.worktreeRoot } : {}),
        updatedAt: new Date().toISOString(),
      };
    });
  }

  private generateFromContext(input: {
    cwd: string;
    firstAgentContext: FirstAgentContext;
    currentSelection: CurrentSelection;
  }): Promise<GeneratedWorkspaceName | null> {
    return this.generateWorkspaceName({
      agentManager: this.agentManager,
      cwd: input.cwd,
      workspaceGitService: this.workspaceGitService,
      providerSnapshotManager: this.providerSnapshotManager,
      daemonConfig: this.readDaemonConfig(),
      currentSelection: input.currentSelection ?? undefined,
      firstAgentContext: input.firstAgentContext,
      logger: this.logger,
    });
  }

  private schedule(run: () => Promise<unknown>, context: { cwd: string; message: string }): void {
    setTimeout(() => {
      void run().catch((error) => {
        this.logger.warn({ err: error, cwd: context.cwd }, context.message);
      });
    }, 0);
  }
}
