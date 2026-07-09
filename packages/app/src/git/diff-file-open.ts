import { pathToFileUri } from "@/attachments/utils";
import {
  type WorkspaceFileDiffContext,
  type WorkspaceFileOpenRequest,
  resolveWorkspaceFilePaths,
} from "@/workspace/file-open";

export interface DiffFileFileTarget {
  kind: "file";
  request: WorkspaceFileOpenRequest;
}

export interface DiffFileBrowserTarget {
  kind: "browser";
  url: string;
}

export type DiffFileOpenTarget = DiffFileFileTarget | DiffFileBrowserTarget;

function isHtmlFile(filePath: string): boolean {
  const normalizedPath = filePath.trim().toLowerCase();
  return normalizedPath.endsWith(".html") || normalizedPath.endsWith(".htm");
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

export function createDiffFilePreviewTarget(input: {
  filePath: string;
  workspaceRoot: string;
}): DiffFileOpenTarget {
  if (isHtmlFile(input.filePath)) {
    const resolvedFile = resolveWorkspaceFilePaths({
      path: input.filePath,
      workspaceRoot: input.workspaceRoot,
    });
    if (resolvedFile) {
      return {
        kind: "browser",
        url: pathToFileUri(resolvedFile.absolutePath),
      };
    }
  }

  return {
    kind: "file",
    request: {
      disposition: "main",
      location: {
        path: input.filePath,
      },
    },
  };
}
