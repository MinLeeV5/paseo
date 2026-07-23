import { describe, expect, it, vi } from "vitest";
import type { WorkspaceTabTarget } from "@/workspace-tabs/model";
import { openWorkspaceFileFromExplorer } from "./workspace-file-open-command";

describe("openWorkspaceFileFromExplorer", () => {
  it("opens and focuses a file tab with diff context preserved", () => {
    const showMobileAgent = vi.fn();
    const focusWorkspaceTab = vi.fn();
    const openedTargets: WorkspaceTabTarget[] = [];

    openWorkspaceFileFromExplorer({
      location: {
        path: "src/app.ts",
        diffContext: {
          cwd: "/repo",
          mode: "base",
          baseRef: "main",
          ignoreWhitespace: true,
        },
      },
      persistenceKey: "server:/repo",
      showMobileAgent,
      openWorkspaceTabFocused: (_workspaceKey, target) => {
        openedTargets.push(target);
        return "file_src/app.ts";
      },
      focusWorkspaceTab,
    });

    expect(showMobileAgent).toHaveBeenCalledOnce();
    expect(openedTargets).toEqual([
      {
        kind: "file",
        path: "src/app.ts",
        diffContext: {
          cwd: "/repo",
          mode: "base",
          baseRef: "main",
          ignoreWhitespace: true,
        },
      },
    ]);
    expect(focusWorkspaceTab).toHaveBeenCalledWith("server:/repo", "file_src/app.ts");
  });
});
