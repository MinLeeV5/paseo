import {
  type WorkspaceFileDiffContext,
  type WorkspaceFileOpenRequest,
} from "@/workspace/file-open";

export interface DiffFileFileTarget {
  kind: "file";
  request: WorkspaceFileOpenRequest;
}

export function createDiffFileOpenTarget(input: {
  filePath: string;
  diffContext: WorkspaceFileDiffContext;
}): DiffFileFileTarget {
  return {
    kind: "file",
    request: {
      disposition: "main",
      location: {
        path: input.filePath,
        diffContext: input.diffContext,
      },
    },
  };
}
