import { execFileSync } from "node:child_process";
import { access, mkdtemp, mkdir, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestLogger } from "../test-utils/test-logger.js";
import { AgentStorage } from "./agent/agent-storage.js";
import {
  AgentSessionChangesManager,
  agentSessionChangesInternals,
} from "./agent-session-changes-manager.js";
import { WorkspaceGitServiceImpl } from "./workspace-git-service.js";

describe("AgentSessionChangesManager", () => {
  let tempRoot: string;
  let paseoHome: string;
  let repoRoot: string;
  let agentStorage: AgentStorage;
  let workspaceGitService: WorkspaceGitServiceImpl;
  let manager: AgentSessionChangesManager;

  beforeEach(async () => {
    tempRoot = await mkdtemp(join(tmpdir(), "paseo-session-changes-"));
    paseoHome = join(tempRoot, "paseo-home");
    repoRoot = join(tempRoot, "repo");
    await mkdir(repoRoot, { recursive: true });
    repoRoot = await realpath(repoRoot);
    git(["init", "-b", "main"]);
    git(["config", "user.email", "test@example.com"]);
    git(["config", "user.name", "Paseo Test"]);
    await writeFile(join(repoRoot, "tracked.txt"), "head\n");
    await writeFile(join(repoRoot, ".gitignore"), "ignored-tracked.txt\n");
    await writeFile(join(repoRoot, "ignored-tracked.txt"), "ignored-head\n");
    git(["add", "tracked.txt", ".gitignore"]);
    git(["add", "-f", "ignored-tracked.txt"]);
    git(["-c", "commit.gpgsign=false", "commit", "-m", "initial"]);

    const logger = createTestLogger();
    agentStorage = new AgentStorage(join(paseoHome, "agents"), logger);
    await agentStorage.initialize();
    await agentStorage.upsert({
      id: "agent-1",
      provider: "codex",
      cwd: repoRoot,
      createdAt: "2026-07-22T00:00:00.000Z",
      updatedAt: "2026-07-22T00:00:00.000Z",
      labels: {},
      lastStatus: "closed",
      config: null,
      persistence: null,
    });
    workspaceGitService = new WorkspaceGitServiceImpl({ logger, paseoHome });
    manager = new AgentSessionChangesManager({
      agentStorage,
      workspaceGitService,
      paseoHome,
      logger,
    });
  });

  afterEach(async () => {
    manager.dispose();
    workspaceGitService.dispose();
    await rm(tempRoot, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
  });

  it("does not report an unchanged file that was untracked when the baseline was captured", async () => {
    await writeFile(join(repoRoot, "untracked-before-session.txt"), "unchanged\n");
    await manager.ensureBaseline({ agentId: "agent-1", cwd: repoRoot });

    const subscription = await manager.subscribe(
      { agentId: "agent-1", mode: "session" },
      () => undefined,
    );

    expect(subscription.initial.files).toEqual([]);
    subscription.unsubscribe();
  });

  it("separates the complete current Git diff from edits made after the session baseline", async () => {
    await writeFile(join(repoRoot, "tracked.txt"), "before-session\n");
    await writeFile(join(repoRoot, "ignored-tracked.txt"), "ignored-before-session\n");
    await writeFile(join(repoRoot, "untracked.txt"), "untracked-before-session\n");
    git(["add", "tracked.txt"]);
    const stagedPathsBeforeCapture = git(["diff", "--cached", "--name-only"]);

    await manager.ensureBaseline({ agentId: "agent-1", cwd: repoRoot });

    expect(git(["diff", "--cached", "--name-only"])).toBe(stagedPathsBeforeCapture);

    const stored = await agentStorage.get("agent-1");
    expect(stored?.sessionDiffBaseline).toMatchObject({
      ref: "refs/paseo/session-baselines/agent-1",
      repoRoot,
    });
    expect(git(["rev-parse", "refs/paseo/session-baselines/agent-1"])).toBe(
      stored?.sessionDiffBaseline?.commit,
    );

    await writeFile(join(repoRoot, "tracked.txt"), "during-session\n");
    await writeFile(join(repoRoot, "ignored-tracked.txt"), "ignored-during-session\n");
    await writeFile(join(repoRoot, "untracked.txt"), "untracked-during-session\n");
    await writeFile(join(repoRoot, "created-during-session.txt"), "new\n");

    const sessionSubscription = await manager.subscribe(
      { agentId: "agent-1", mode: "session" },
      () => undefined,
    );
    const workingTreeSubscription = await manager.subscribe(
      { agentId: "agent-1", mode: "working_tree" },
      () => undefined,
    );

    expect(sessionSubscription.initial.files.map((file) => file.path)).toEqual([
      "created-during-session.txt",
      "ignored-tracked.txt",
      "tracked.txt",
      "untracked.txt",
    ]);
    expect(diffLineTexts(sessionSubscription.initial.files, "tracked.txt", "remove")).toContain(
      "before-session",
    );
    expect(diffLineTexts(sessionSubscription.initial.files, "untracked.txt", "remove")).toContain(
      "untracked-before-session",
    );
    expect(
      diffLineTexts(sessionSubscription.initial.files, "ignored-tracked.txt", "remove"),
    ).toContain("ignored-before-session");

    expect(diffLineTexts(workingTreeSubscription.initial.files, "tracked.txt", "remove")).toContain(
      "head",
    );
    expect(diffLineTexts(workingTreeSubscription.initial.files, "untracked.txt", "remove")).toEqual(
      [],
    );
    expect(diffLineTexts(workingTreeSubscription.initial.files, "untracked.txt", "add")).toContain(
      "untracked-during-session",
    );

    sessionSubscription.unsubscribe();
    workingTreeSubscription.unsubscribe();
  });

  it("captures the baseline once across later agent turns", async () => {
    await manager.ensureBaseline({ agentId: "agent-1", cwd: repoRoot });
    const first = await agentStorage.get("agent-1");

    await writeFile(join(repoRoot, "tracked.txt"), "later\n");
    await manager.ensureBaseline({ agentId: "agent-1", cwd: repoRoot });
    const second = await agentStorage.get("agent-1");

    expect(second?.sessionDiffBaseline).toEqual(first?.sessionDiffBaseline);
  });

  it("records each user prompt and freezes its diff at the terminal boundary", async () => {
    const firstTurnId = await manager.beginTurn({
      agentId: "agent-1",
      cwd: repoRoot,
      prompt: "Change the greeting",
      messageId: "message-1",
    });
    expect(firstTurnId).toBeTruthy();
    await manager.attachProviderTurnId({
      agentId: "agent-1",
      turnDiffRecordId: firstTurnId!,
      providerTurnId: "provider-turn-1",
    });
    await writeFile(join(repoRoot, "tracked.txt"), "first turn\n");
    await manager.finishTurn({
      agentId: "agent-1",
      turnDiffRecordId: firstTurnId!,
      status: "completed",
    });

    const secondTurnId = await manager.beginTurn({
      agentId: "agent-1",
      cwd: repoRoot,
      prompt: "Change it again",
    });
    expect(secondTurnId).toBeTruthy();
    await writeFile(join(repoRoot, "tracked.txt"), "second turn\n");
    await manager.finishTurn({
      agentId: "agent-1",
      turnDiffRecordId: secondTurnId!,
      status: "failed",
    });

    // Later workspace edits cannot contaminate either completed Prompt record.
    await writeFile(join(repoRoot, "tracked.txt"), "after both turns\n");
    const first = await manager.subscribe(
      { agentId: "agent-1", mode: "session", turnId: firstTurnId },
      () => undefined,
    );
    const second = await manager.subscribe(
      { agentId: "agent-1", mode: "session", turnId: secondTurnId },
      () => undefined,
    );
    const latest = await manager.subscribe(
      { agentId: "agent-1", mode: "session", turnId: null },
      () => undefined,
    );

    expect(diffLineTexts(first.initial.files, "tracked.txt", "remove")).toContain("head");
    expect(diffLineTexts(first.initial.files, "tracked.txt", "add")).toContain("first turn");
    expect(diffLineTexts(first.initial.files, "tracked.txt", "add")).not.toContain(
      "after both turns",
    );
    expect(diffLineTexts(second.initial.files, "tracked.txt", "remove")).toContain("first turn");
    expect(diffLineTexts(second.initial.files, "tracked.txt", "add")).toContain("second turn");
    expect(latest.initial.selectedTurnId).toBe(secondTurnId);
    expect(latest.initial.files).toEqual(second.initial.files);
    expect(latest.initial.turns).toEqual([
      expect.objectContaining({
        id: firstTurnId,
        messageId: "message-1",
        prompt: "Change the greeting",
        status: "completed",
        hasChanges: true,
      }),
      expect.objectContaining({
        id: secondTurnId,
        prompt: "Change it again",
        status: "failed",
        hasChanges: true,
      }),
    ]);

    first.unsubscribe();
    second.unsubscribe();
    latest.unsubscribe();
  });

  it("marks a completed prompt with no file changes", async () => {
    const turnId = await manager.beginTurn({
      agentId: "agent-1",
      cwd: repoRoot,
      prompt: "Inspect without editing",
    });
    await manager.finishTurn({
      agentId: "agent-1",
      turnDiffRecordId: turnId!,
      status: "completed",
    });

    const subscription = await manager.subscribe(
      { agentId: "agent-1", mode: "session", turnId: null },
      () => undefined,
    );

    expect(subscription.initial.files).toEqual([]);
    expect(subscription.initial.turns).toEqual([
      expect.objectContaining({ id: turnId, status: "completed", hasChanges: false }),
    ]);
    expect((await agentStorage.get("agent-1"))?.turnDiffRecords?.[0]?.hasChanges).toBe(false);
    subscription.unsubscribe();
  });

  it("derives change state for every legacy completed prompt", async () => {
    const initialCommit = git(["rev-parse", "HEAD"]);
    await writeFile(join(repoRoot, "tracked.txt"), "changed\n");
    git(["add", "tracked.txt"]);
    git(["-c", "commit.gpgsign=false", "commit", "-m", "changed"]);
    const changedCommit = git(["rev-parse", "HEAD"]);
    await agentStorage.appendTurnDiffRecord("agent-1", {
      id: "legacy-changed",
      prompt: "Change the file",
      status: "completed",
      startSnapshot: {
        ref: "refs/paseo/test/legacy-changed-start",
        commit: initialCommit,
        repoRoot,
        capturedAt: "2026-07-22T01:00:00.000Z",
      },
      endSnapshot: {
        ref: "refs/paseo/test/legacy-changed-end",
        commit: changedCommit,
        repoRoot,
        capturedAt: "2026-07-22T01:01:00.000Z",
      },
      startedAt: "2026-07-22T01:00:00.000Z",
      endedAt: "2026-07-22T01:01:00.000Z",
    });
    await agentStorage.appendTurnDiffRecord("agent-1", {
      id: "legacy-unchanged",
      prompt: "Inspect the file",
      status: "completed",
      startSnapshot: {
        ref: "refs/paseo/test/legacy-unchanged-start",
        commit: changedCommit,
        repoRoot,
        capturedAt: "2026-07-22T02:00:00.000Z",
      },
      endSnapshot: {
        ref: "refs/paseo/test/legacy-unchanged-end",
        commit: changedCommit,
        repoRoot,
        capturedAt: "2026-07-22T02:01:00.000Z",
      },
      startedAt: "2026-07-22T02:00:00.000Z",
      endedAt: "2026-07-22T02:01:00.000Z",
    });

    const subscription = await manager.subscribe(
      { agentId: "agent-1", mode: "session", turnId: null },
      () => undefined,
    );

    expect(subscription.initial.turns).toEqual([
      expect.objectContaining({ id: "legacy-changed", hasChanges: true }),
      expect.objectContaining({ id: "legacy-unchanged", hasChanges: false }),
    ]);
    subscription.unsubscribe();
  });

  it("shows live worktree changes for the latest running prompt", async () => {
    await writeFile(join(repoRoot, "preexisting-untracked.txt"), "unchanged\n");
    const turnId = await manager.beginTurn({
      agentId: "agent-1",
      cwd: repoRoot,
      prompt: "Create a file",
    });
    await writeFile(join(repoRoot, "created-by-turn.txt"), "created\n");

    const subscription = await manager.subscribe(
      { agentId: "agent-1", mode: "session", turnId: null },
      () => undefined,
    );

    expect(subscription.initial.selectedTurnId).toBe(turnId);
    expect(subscription.initial.turns).toEqual([
      expect.objectContaining({
        id: turnId,
        prompt: "Create a file",
        status: "running",
        hasChanges: true,
      }),
    ]);
    expect(subscription.initial.files.map((file) => file.path)).toEqual(["created-by-turn.txt"]);
    subscription.unsubscribe();
  });

  it("removes legacy and per-prompt hidden Git refs when an agent is hard-deleted", async () => {
    const turnId = await manager.beginTurn({
      agentId: "agent-1",
      cwd: repoRoot,
      prompt: "Update the file",
    });
    await writeFile(join(repoRoot, "tracked.txt"), "updated\n");
    await manager.finishTurn({
      agentId: "agent-1",
      turnDiffRecordId: turnId!,
      status: "completed",
    });
    const stored = await agentStorage.get("agent-1");
    const baseline = stored?.sessionDiffBaseline;
    const turnDiffRecords = stored?.turnDiffRecords;
    expect(baseline).toBeDefined();
    expect(turnDiffRecords?.[0]?.endSnapshot).toBeDefined();

    await agentStorage.remove("agent-1");
    await manager.removeBaselineForAgent({
      agentId: "agent-1",
      baseline: baseline!,
      turnDiffRecords,
    });

    await Promise.all(
      [baseline!, turnDiffRecords![0]!.startSnapshot, turnDiffRecords![0]!.endSnapshot!].map(
        async (snapshot) => {
          await expect(
            access(join(repoRoot, ".git", ...snapshot.ref.split("/").slice(1))),
          ).rejects.toThrow();
        },
      ),
    );
  });

  function git(args: string[]): string {
    return execFileSync("git", args, { cwd: repoRoot, encoding: "utf8" }).trim();
  }
});

function diffLineTexts(
  files: Array<{ path: string; hunks: Array<{ lines: Array<{ type: string; content: string }> }> }>,
  path: string,
  type: "add" | "remove",
): string[] {
  const file = files.find((candidate) => candidate.path === path);
  return (
    file?.hunks.flatMap((hunk) =>
      hunk.lines.filter((line) => line.type === type).map((line) => line.content),
    ) ?? []
  );
}

describe("agent session changes projection", () => {
  it("keeps session files visible after their current Git diff becomes clean", () => {
    const result = agentSessionChangesInternals.projectWorkingTreeDiffToSessionFiles(
      [
        {
          path: "committed.ts",
          isNew: true,
          isDeleted: false,
          additions: 1,
          deletions: 0,
          hunks: [],
          status: "ok",
        },
      ],
      [],
    );

    expect(result).toEqual([
      {
        path: "committed.ts",
        isNew: true,
        isDeleted: false,
        additions: 0,
        deletions: 0,
        hunks: [],
        status: "ok",
      },
    ]);
  });
});
