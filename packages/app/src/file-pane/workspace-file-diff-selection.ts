import type { WorkspaceFileDiffContext } from "@/workspace/file-open";

export function selectWorkspaceFileDiffFiles<T>(input: {
  diffContext: WorkspaceFileDiffContext | undefined;
  checkoutFiles: T[];
  sessionFiles: T[];
}): T[] {
  // Disabled replica queries retain cached data. Pane identity comes from the
  // location, so a plain source tab must never inherit a previous diff result.
  if (!input.diffContext) {
    return [];
  }
  return input.diffContext.source === "session" ? input.sessionFiles : input.checkoutFiles;
}
