import type { WorkspaceFileReveal } from "@/workspace/file-open";

export interface WorkspaceFileNavigationState {
  revision: number;
  reveal?: WorkspaceFileReveal;
}

export function advanceWorkspaceFileNavigation(
  current: WorkspaceFileNavigationState | undefined,
  reveal?: WorkspaceFileReveal,
): WorkspaceFileNavigationState {
  return {
    revision: (current?.revision ?? 0) + 1,
    ...(reveal ? { reveal } : {}),
  };
}
