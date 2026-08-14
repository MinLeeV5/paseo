import {
  type WorkspaceFileDiffContext,
  type WorkspaceFileOpenRequest,
} from "@/workspace/file-open";

export interface DiffFileFileTarget {
  kind: "file";
  request: WorkspaceFileOpenRequest;
}

export function createChangedFileSourceTarget(filePath: string): DiffFileFileTarget {
  return {
    kind: "file",
    request: {
      disposition: "main",
      location: { path: filePath },
    },
  };
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

export function createDiffFileSourceTarget(input: {
  filePath: string;
  diffContext: WorkspaceFileDiffContext;
  lineNumber?: number;
}): DiffFileFileTarget {
  return {
    kind: "file",
    request: {
      disposition: "main",
      location: {
        path: input.filePath,
        diffContext: input.diffContext,
      },
      reveal: {
        mode: "source",
        ...(input.lineNumber ? { lineNumber: input.lineNumber } : {}),
      },
    },
  };
}
