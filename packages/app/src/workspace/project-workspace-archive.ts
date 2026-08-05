import { confirmWorkspaceArchive, toWorktreeArchiveRisk } from "@/git/worktree-archive-warning";
import type { SidebarWorkspaceEntry } from "@/hooks/use-sidebar-workspaces-list";
import type { WorkspaceArchiveTarget } from "@/workspace/workspace-archive";

export interface ProjectWorkspaceArchiveEntry extends Pick<
  SidebarWorkspaceEntry,
  | "serverId"
  | "workspaceId"
  | "workspaceKind"
  | "name"
  | "archiveHasUncommittedChanges"
  | "archiveUnpushedCommitCount"
  | "diffStat"
> {}

type ConfirmWorkspaceArchive = typeof confirmWorkspaceArchive;

export async function selectProjectWorkspacesToArchive(
  workspaces: ProjectWorkspaceArchiveEntry[],
  confirmArchive: ConfirmWorkspaceArchive = confirmWorkspaceArchive,
): Promise<WorkspaceArchiveTarget[]> {
  const confirmed: WorkspaceArchiveTarget[] = [];

  for (const workspace of workspaces) {
    const shouldArchive = await confirmArchive({
      workspaceName: workspace.name,
      ...(workspace.workspaceKind === "worktree" ? toWorktreeArchiveRisk(workspace) : {}),
    });
    if (!shouldArchive) {
      continue;
    }

    confirmed.push({
      serverId: workspace.serverId,
      workspaceId: workspace.workspaceId,
    });
  }

  return confirmed;
}
