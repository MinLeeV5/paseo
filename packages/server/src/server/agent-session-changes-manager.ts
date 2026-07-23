import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import type { ParsedDiffFile } from "@getpaseo/protocol/messages";
import type pino from "pino";
import type {
  AgentStorage,
  StoredAgentRecord,
  StoredAgentSessionDiffBaseline,
  StoredAgentTurnDiffRecord,
  StoredAgentTurnDiffSnapshot,
} from "./agent/agent-storage.js";
import { toCheckoutError, type CheckoutErrorPayload } from "./checkout-git-utils.js";
import type { WorkspaceGitService } from "./workspace-git-service.js";
import { runGitCommand } from "../utils/run-git-command.js";

const SESSION_CHANGES_WATCH_DEBOUNCE_MS = 150;
const SESSION_BASELINE_REF_PREFIX = "refs/paseo/session-baselines";
const TURN_SNAPSHOT_REF_PREFIX = "refs/paseo/turn-snapshots";

export type AgentSessionChangesMode = "working_tree" | "session";

export interface AgentSessionChangesSnapshotPayload {
  agentId: string;
  cwd: string;
  mode: AgentSessionChangesMode;
  baselineAvailable: boolean;
  turns: AgentTurnChangesSummary[];
  selectedTurnId: string | null;
  files: ParsedDiffFile[];
  error: CheckoutErrorPayload | null;
}

export interface AgentTurnChangesSummary {
  id: string;
  messageId?: string;
  prompt: string;
  status: StoredAgentTurnDiffRecord["status"];
  hasChanges?: boolean;
  startedAt: string;
  endedAt?: string;
}

interface AgentSessionChangesTarget {
  key: string;
  agentId: string;
  cwd: string;
  mode: AgentSessionChangesMode;
  turnId: string | null | undefined;
  ignoreWhitespace: boolean;
  listeners: Set<(snapshot: AgentSessionChangesSnapshotPayload) => void>;
  workingTreeWatchUnsubscribe: (() => void) | null;
  debounceTimer: NodeJS.Timeout | null;
  refreshPromise: Promise<void> | null;
  refreshQueued: boolean;
  latestPayload: AgentSessionChangesSnapshotPayload | null;
  latestFingerprint: string | null;
}

export interface AgentSessionChangesMetrics {
  agentSessionChangesTargetCount: number;
  agentSessionChangesSubscriptionCount: number;
}

function baselineRefForAgent(agentId: string): string {
  return `${SESSION_BASELINE_REF_PREFIX}/${agentId}`;
}

function turnSnapshotRefForAgent(
  agentId: string,
  turnDiffRecordId: string,
  boundary: "start" | "end",
): string {
  return `${TURN_SNAPSHOT_REF_PREFIX}/${agentId}/${turnDiffRecordId}/${boundary}`;
}

function summarizeTurns(
  records: StoredAgentTurnDiffRecord[],
  snapshotTreeByCommit: ReadonlyMap<string, string>,
): AgentTurnChangesSummary[] {
  return records.map((record) => {
    const startTree =
      record.startSnapshot.tree ?? snapshotTreeByCommit.get(record.startSnapshot.commit);
    const endTree = record.endSnapshot
      ? (record.endSnapshot.tree ?? snapshotTreeByCommit.get(record.endSnapshot.commit))
      : undefined;
    let hasChanges = record.hasChanges;
    if (hasChanges === undefined) {
      if (startTree && endTree) {
        hasChanges = startTree !== endTree;
      }
    }
    return {
      id: record.id,
      ...(record.messageId ? { messageId: record.messageId } : null),
      prompt: record.prompt,
      status: record.status,
      ...(hasChanges !== undefined ? { hasChanges } : null),
      startedAt: record.startedAt,
      ...(record.endedAt ? { endedAt: record.endedAt } : null),
    };
  });
}

function selectTurnDiffRecord(
  records: StoredAgentTurnDiffRecord[],
  turnId: string | null | undefined,
): StoredAgentTurnDiffRecord | null {
  if (turnId === undefined) {
    return null;
  }
  if (turnId === null) {
    return records.at(-1) ?? null;
  }
  return records.find((candidate) => candidate.id === turnId) ?? null;
}

function sortFiles(files: ParsedDiffFile[]): ParsedDiffFile[] {
  return [...files].sort((left, right) => left.path.localeCompare(right.path));
}

function projectWorkingTreeDiffToSessionFiles(
  sessionFiles: ParsedDiffFile[],
  workingTreeFiles: ParsedDiffFile[],
): ParsedDiffFile[] {
  const workingTreeByPath = new Map(workingTreeFiles.map((file) => [file.path, file]));
  return sortFiles(
    sessionFiles.map((sessionFile) => {
      const workingTreeFile = workingTreeByPath.get(sessionFile.path);
      if (workingTreeFile) {
        return workingTreeFile;
      }
      return {
        path: sessionFile.path,
        ...(sessionFile.submodulePath ? { submodulePath: sessionFile.submodulePath } : null),
        isNew: sessionFile.isNew,
        isDeleted: sessionFile.isDeleted,
        additions: 0,
        deletions: 0,
        hunks: [],
        status: "ok" as const,
      };
    }),
  );
}

export class AgentSessionChangesManager {
  private readonly agentStorage: AgentStorage;
  private readonly workspaceGitService: WorkspaceGitService;
  private readonly paseoHome: string;
  private readonly logger: pino.Logger;
  private readonly capturePromises = new Map<string, Promise<void>>();
  private readonly targets = new Map<string, AgentSessionChangesTarget>();
  private readonly snapshotTreeByCommit = new Map<string, string>();

  constructor(options: {
    agentStorage: AgentStorage;
    workspaceGitService: WorkspaceGitService;
    paseoHome: string;
    logger: pino.Logger;
  }) {
    this.agentStorage = options.agentStorage;
    this.workspaceGitService = options.workspaceGitService;
    this.paseoHome = options.paseoHome;
    this.logger = options.logger.child({ module: "agent-session-changes" });
  }

  async ensureBaseline(input: { agentId: string; cwd: string }): Promise<void> {
    const existing = this.capturePromises.get(input.agentId);
    if (existing) {
      return existing;
    }
    const capture = this.captureBaselineIfNeeded(input).finally(() => {
      if (this.capturePromises.get(input.agentId) === capture) {
        this.capturePromises.delete(input.agentId);
      }
    });
    this.capturePromises.set(input.agentId, capture);
    return capture;
  }

  async beginTurn(input: {
    agentId: string;
    cwd: string;
    prompt: string;
    messageId?: string;
  }): Promise<string | null> {
    const record = await this.agentStorage.get(input.agentId);
    if (!record || record.internal) {
      return null;
    }

    const workspace = await this.workspaceGitService.getSnapshot(input.cwd, {
      force: true,
      reason: "agent-turn-diff-start",
    });
    if (!workspace.git.isGit || !workspace.git.repoRoot) {
      return null;
    }

    const turnDiffRecordId = randomUUID();
    const startedAt = new Date().toISOString();
    const startSnapshot = await this.captureSnapshot({
      repoRoot: workspace.git.repoRoot,
      ref: turnSnapshotRefForAgent(input.agentId, turnDiffRecordId, "start"),
      message: `Paseo agent prompt start ${input.agentId} ${turnDiffRecordId}`,
      capturedAt: startedAt,
    });
    try {
      await this.agentStorage.appendTurnDiffRecord(input.agentId, {
        id: turnDiffRecordId,
        ...(input.messageId ? { messageId: input.messageId } : null),
        prompt: input.prompt,
        status: "running",
        startSnapshot,
        startedAt,
      });
    } catch (error) {
      await runGitCommand(["update-ref", "-d", startSnapshot.ref], {
        cwd: startSnapshot.repoRoot,
      }).catch(() => undefined);
      throw error;
    }

    // Keep the original whole-Agent diff working for older clients. The first
    // Prompt start is the same boundary, so both refs can point at one commit.
    if (!record.sessionDiffBaseline) {
      try {
        const ref = baselineRefForAgent(input.agentId);
        await runGitCommand(["update-ref", ref, startSnapshot.commit], {
          cwd: startSnapshot.repoRoot,
        });
        await this.agentStorage.setSessionDiffBaseline(input.agentId, {
          ...startSnapshot,
          ref,
        });
      } catch (error) {
        this.logger.warn(
          { err: error, agentId: input.agentId },
          "Failed to preserve legacy agent session baseline",
        );
      }
    }
    this.scheduleRefreshForAgent(input.agentId);
    return turnDiffRecordId;
  }

  async attachProviderTurnId(input: {
    agentId: string;
    turnDiffRecordId: string;
    providerTurnId: string;
  }): Promise<void> {
    await this.agentStorage.updateTurnDiffRecord(input.agentId, input.turnDiffRecordId, {
      providerTurnId: input.providerTurnId,
    });
    this.scheduleRefreshForAgent(input.agentId);
  }

  async finishTurn(input: {
    agentId: string;
    turnDiffRecordId: string;
    status: "completed" | "failed" | "canceled";
  }): Promise<void> {
    const record = await this.requireAgentRecord(input.agentId);
    const turnDiffRecord = record.turnDiffRecords?.find(
      (candidate) => candidate.id === input.turnDiffRecordId,
    );
    if (!turnDiffRecord || turnDiffRecord.endSnapshot) {
      return;
    }
    const endedAt = new Date().toISOString();
    const endSnapshot = await this.captureSnapshot({
      repoRoot: turnDiffRecord.startSnapshot.repoRoot,
      ref: turnSnapshotRefForAgent(input.agentId, input.turnDiffRecordId, "end"),
      message: `Paseo agent prompt end ${input.agentId} ${input.turnDiffRecordId}`,
      capturedAt: endedAt,
    });
    const hasChanges = await this.snapshotsHaveChanges(turnDiffRecord.startSnapshot, endSnapshot);
    await this.agentStorage.updateTurnDiffRecord(input.agentId, input.turnDiffRecordId, {
      status: input.status,
      endSnapshot,
      hasChanges,
      endedAt,
    });
    this.scheduleRefreshForAgent(input.agentId);
  }

  async subscribe(
    params: {
      agentId: string;
      mode: AgentSessionChangesMode;
      turnId?: string | null;
      ignoreWhitespace?: boolean;
    },
    listener: (snapshot: AgentSessionChangesSnapshotPayload) => void,
  ): Promise<{ initial: AgentSessionChangesSnapshotPayload; unsubscribe: () => void }> {
    const record = await this.requireAgentRecord(params.agentId);
    const cwd = record.cwd;
    const key = JSON.stringify([
      params.agentId,
      params.mode,
      params.turnId,
      params.ignoreWhitespace === true,
    ]);
    let target = this.targets.get(key);
    if (!target) {
      target = await this.createTarget({
        key,
        agentId: params.agentId,
        cwd,
        mode: params.mode,
        turnId: params.turnId,
        ignoreWhitespace: params.ignoreWhitespace === true,
      });
      this.targets.set(key, target);
    }
    target.listeners.add(listener);

    const initial = target.latestPayload ?? (await this.computeSnapshot(target));
    target.latestPayload = initial;
    target.latestFingerprint = JSON.stringify(initial);
    return {
      initial,
      unsubscribe: () => this.removeListener(key, listener),
    };
  }

  scheduleRefreshForAgent(agentId: string): void {
    for (const target of this.targets.values()) {
      if (target.agentId === agentId) {
        this.scheduleTargetRefresh(target);
      }
    }
  }

  getMetrics(): AgentSessionChangesMetrics {
    let agentSessionChangesSubscriptionCount = 0;
    for (const target of this.targets.values()) {
      agentSessionChangesSubscriptionCount += target.listeners.size;
    }
    return {
      agentSessionChangesTargetCount: this.targets.size,
      agentSessionChangesSubscriptionCount,
    };
  }

  async removeBaselineForAgent(input: {
    agentId: string;
    baseline?: StoredAgentSessionDiffBaseline;
    turnDiffRecords?: StoredAgentTurnDiffRecord[];
  }): Promise<void> {
    for (const [key, target] of this.targets) {
      if (target.agentId !== input.agentId) {
        continue;
      }
      this.closeTarget(target);
      this.targets.delete(key);
    }
    const storedRecord = await this.agentStorage.get(input.agentId);
    const baseline = input.baseline ?? storedRecord?.sessionDiffBaseline;
    const turnDiffRecords = input.turnDiffRecords ?? storedRecord?.turnDiffRecords ?? [];
    const snapshots: StoredAgentTurnDiffSnapshot[] = [];
    for (const record of turnDiffRecords) {
      snapshots.push(record.startSnapshot);
      if (record.endSnapshot) {
        snapshots.push(record.endSnapshot);
      }
    }
    const refsByRepoRoot = new Map<string, Set<string>>();
    for (const snapshot of [...(baseline ? [baseline] : []), ...snapshots]) {
      const refs = refsByRepoRoot.get(snapshot.repoRoot) ?? new Set<string>();
      refs.add(snapshot.ref);
      refsByRepoRoot.set(snapshot.repoRoot, refs);
    }
    for (const [repoRoot, refs] of refsByRepoRoot) {
      try {
        const prefix = `${TURN_SNAPSHOT_REF_PREFIX}/${input.agentId}/`;
        const listed = await runGitCommand(["for-each-ref", "--format=%(refname)", prefix], {
          cwd: repoRoot,
        });
        for (const ref of listed.stdout
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean)) {
          refs.add(ref);
        }
      } catch (error) {
        this.logger.warn(
          { err: error, agentId: input.agentId, repoRoot },
          "Failed to enumerate agent diff snapshot refs",
        );
      }
    }
    for (const [repoRoot, refs] of refsByRepoRoot) {
      for (const ref of refs) {
        try {
          await runGitCommand(["update-ref", "-d", ref], { cwd: repoRoot });
        } catch (error) {
          this.logger.warn(
            { err: error, agentId: input.agentId, ref },
            "Failed to remove agent diff snapshot ref",
          );
        }
      }
    }
  }

  dispose(): void {
    for (const target of this.targets.values()) {
      this.closeTarget(target);
    }
    this.targets.clear();
  }

  private async captureBaselineIfNeeded(input: { agentId: string; cwd: string }): Promise<void> {
    const record = await this.agentStorage.get(input.agentId);
    if (!record || record.internal || record.sessionDiffBaseline) {
      return;
    }

    const snapshot = await this.workspaceGitService.getSnapshot(input.cwd, {
      force: true,
      reason: "agent-session-baseline",
    });
    if (!snapshot.git.isGit || !snapshot.git.repoRoot) {
      return;
    }
    const ref = baselineRefForAgent(input.agentId);
    const baseline = await this.captureSnapshot({
      repoRoot: snapshot.git.repoRoot,
      ref,
      message: `Paseo agent session baseline ${input.agentId}`,
    });
    await this.agentStorage.setSessionDiffBaseline(input.agentId, baseline);
    this.scheduleRefreshForAgent(input.agentId);
  }

  private async captureSnapshot(input: {
    repoRoot: string;
    ref: string;
    message: string;
    capturedAt?: string;
  }): Promise<StoredAgentTurnDiffSnapshot> {
    const capturesRoot = join(this.paseoHome, "session-diff-captures");
    await mkdir(capturesRoot, { recursive: true });
    const captureDirectory = await mkdtemp(join(capturesRoot, "capture-"));
    const indexPath = join(captureDirectory, "index");
    const envOverlay = {
      GIT_INDEX_FILE: indexPath,
      GIT_AUTHOR_NAME: "Paseo",
      GIT_AUTHOR_EMAIL: "paseo@localhost",
      GIT_COMMITTER_NAME: "Paseo",
      GIT_COMMITTER_EMAIL: "paseo@localhost",
    };

    try {
      const head = await runGitCommand(["rev-parse", "--verify", "HEAD"], {
        cwd: input.repoRoot,
        envOverlay,
        acceptExitCodes: [0, 128],
      });
      await runGitCommand(head.exitCode === 0 ? ["read-tree", "HEAD"] : ["read-tree", "--empty"], {
        cwd: input.repoRoot,
        envOverlay,
      });
      await runGitCommand(["add", "-A", "--", "."], {
        cwd: input.repoRoot,
        envOverlay,
        timeout: 120_000,
      });
      const tree = (
        await runGitCommand(["write-tree"], { cwd: input.repoRoot, envOverlay })
      ).stdout.trim();
      const commit = (
        await runGitCommand(["commit-tree", tree, "-m", input.message], {
          cwd: input.repoRoot,
          envOverlay,
        })
      ).stdout.trim();
      await runGitCommand(["update-ref", input.ref, commit], { cwd: input.repoRoot });
      return {
        ref: input.ref,
        commit,
        tree,
        repoRoot: input.repoRoot,
        capturedAt: input.capturedAt ?? new Date().toISOString(),
      };
    } finally {
      await rm(captureDirectory, { recursive: true, force: true });
    }
  }

  private async snapshotsHaveChanges(
    start: StoredAgentTurnDiffSnapshot,
    end: StoredAgentTurnDiffSnapshot,
  ): Promise<boolean> {
    if (start.tree && end.tree) {
      return start.tree !== end.tree;
    }
    const diff = await runGitCommand(["diff", "--quiet", start.commit, end.commit, "--"], {
      cwd: start.repoRoot,
      acceptExitCodes: [0, 1],
    });
    return diff.exitCode === 1;
  }

  private async cacheLegacySnapshotTrees(records: StoredAgentTurnDiffRecord[]): Promise<void> {
    const commitsByRepoRoot = new Map<string, Set<string>>();
    for (const record of records) {
      if (record.hasChanges !== undefined || !record.endSnapshot) {
        continue;
      }
      for (const snapshot of [record.startSnapshot, record.endSnapshot]) {
        if (snapshot.tree || this.snapshotTreeByCommit.has(snapshot.commit)) {
          continue;
        }
        const commits = commitsByRepoRoot.get(snapshot.repoRoot) ?? new Set<string>();
        commits.add(snapshot.commit);
        commitsByRepoRoot.set(snapshot.repoRoot, commits);
      }
    }
    for (const [repoRoot, commits] of commitsByRepoRoot) {
      const result = await runGitCommand(
        ["log", "--no-walk=unsorted", "--format=%H%x09%T", ...commits],
        { cwd: repoRoot },
      );
      for (const line of result.stdout.trim().split("\n")) {
        const [commit, tree] = line.split("\t");
        if (commit && tree) {
          this.snapshotTreeByCommit.set(commit, tree);
        }
      }
    }
  }

  private async requireAgentRecord(agentId: string): Promise<StoredAgentRecord> {
    const record = await this.agentStorage.get(agentId);
    if (!record) {
      throw new Error(`Agent ${agentId} not found`);
    }
    return record;
  }

  private async createTarget(input: {
    key: string;
    agentId: string;
    cwd: string;
    mode: AgentSessionChangesMode;
    turnId: string | null | undefined;
    ignoreWhitespace: boolean;
  }): Promise<AgentSessionChangesTarget> {
    const target: AgentSessionChangesTarget = {
      ...input,
      listeners: new Set(),
      workingTreeWatchUnsubscribe: null,
      debounceTimer: null,
      refreshPromise: null,
      refreshQueued: false,
      latestPayload: null,
      latestFingerprint: null,
    };
    const { unsubscribe } = await this.workspaceGitService.requestWorkingTreeWatch(input.cwd, () =>
      this.scheduleTargetRefresh(target),
    );
    target.workingTreeWatchUnsubscribe = unsubscribe;
    return target;
  }

  private async computeSnapshot(
    target: AgentSessionChangesTarget,
  ): Promise<AgentSessionChangesSnapshotPayload> {
    let turns: AgentTurnChangesSummary[] = [];
    let selectedTurnId: string | null = null;
    try {
      const record = await this.requireAgentRecord(target.agentId);
      const turnDiffRecords = record.turnDiffRecords ?? [];
      await this.cacheLegacySnapshotTrees(turnDiffRecords);
      turns = summarizeTurns(turnDiffRecords, this.snapshotTreeByCommit);

      // An omitted turnId is the legacy whole-Agent session view. New clients
      // send null for the latest Prompt or a concrete record ID.
      const selectedTurn = selectTurnDiffRecord(turnDiffRecords, target.turnId);
      selectedTurnId = selectedTurn?.id ?? null;
      const baseline =
        target.turnId === undefined ? record.sessionDiffBaseline : selectedTurn?.startSnapshot;
      if (!baseline || (target.turnId !== undefined && !selectedTurn)) {
        return {
          agentId: target.agentId,
          cwd: target.cwd,
          mode: target.mode,
          baselineAvailable: false,
          turns,
          selectedTurnId,
          files: [],
          error: null,
        };
      }
      const targetRef = selectedTurn?.endSnapshot?.commit;
      const sessionResult = await this.workspaceGitService.getCheckoutDiff(
        target.cwd,
        {
          mode: "snapshot",
          baseRef: baseline.commit,
          ...(targetRef ? { targetRef } : null),
          ignoreWhitespace: target.ignoreWhitespace,
          includeStructured: true,
        },
        { force: true, reason: "agent-turn-changes" },
      );
      const sessionFiles = sortFiles(sessionResult.structured ?? []);
      const selectedHasChanges = sessionFiles.length > 0;
      turns = turns.map((turn) =>
        turn.id === selectedTurnId ? { ...turn, hasChanges: selectedHasChanges } : turn,
      );
      if (target.mode === "session") {
        return {
          agentId: target.agentId,
          cwd: target.cwd,
          mode: target.mode,
          baselineAvailable: true,
          turns,
          selectedTurnId,
          files: sessionFiles,
          error: null,
        };
      }
      const workingTreeResult = await this.workspaceGitService.getCheckoutDiff(
        target.cwd,
        {
          mode: "uncommitted",
          ignoreWhitespace: target.ignoreWhitespace,
          includeStructured: true,
        },
        { force: true, reason: "agent-session-working-tree-changes" },
      );
      return {
        agentId: target.agentId,
        cwd: target.cwd,
        mode: target.mode,
        baselineAvailable: true,
        turns,
        selectedTurnId,
        files: projectWorkingTreeDiffToSessionFiles(
          sessionFiles,
          workingTreeResult.structured ?? [],
        ),
        error: null,
      };
    } catch (error) {
      this.logger.warn({ err: error, agentId: target.agentId }, "Session changes refresh failed");
      return {
        agentId: target.agentId,
        cwd: target.cwd,
        mode: target.mode,
        baselineAvailable: false,
        turns,
        selectedTurnId,
        files: [],
        error: toCheckoutError(error),
      };
    }
  }

  private scheduleTargetRefresh(target: AgentSessionChangesTarget): void {
    if (target.debounceTimer) {
      clearTimeout(target.debounceTimer);
    }
    target.debounceTimer = setTimeout(() => {
      target.debounceTimer = null;
      void this.refreshTarget(target);
    }, SESSION_CHANGES_WATCH_DEBOUNCE_MS);
  }

  private async refreshTarget(target: AgentSessionChangesTarget): Promise<void> {
    if (target.refreshPromise) {
      target.refreshQueued = true;
      return;
    }
    target.refreshPromise = (async () => {
      do {
        target.refreshQueued = false;
        const snapshot = await this.computeSnapshot(target);
        target.latestPayload = snapshot;
        const fingerprint = JSON.stringify(snapshot);
        if (fingerprint !== target.latestFingerprint) {
          target.latestFingerprint = fingerprint;
          for (const listener of target.listeners) {
            listener(snapshot);
          }
        }
      } while (target.refreshQueued);
    })();
    try {
      await target.refreshPromise;
    } finally {
      target.refreshPromise = null;
    }
  }

  private removeListener(
    targetKey: string,
    listener: (snapshot: AgentSessionChangesSnapshotPayload) => void,
  ): void {
    const target = this.targets.get(targetKey);
    if (!target) {
      return;
    }
    target.listeners.delete(listener);
    if (target.listeners.size === 0) {
      this.closeTarget(target);
      this.targets.delete(targetKey);
    }
  }

  private closeTarget(target: AgentSessionChangesTarget): void {
    if (target.debounceTimer) {
      clearTimeout(target.debounceTimer);
      target.debounceTimer = null;
    }
    target.workingTreeWatchUnsubscribe?.();
    target.workingTreeWatchUnsubscribe = null;
    target.listeners.clear();
  }
}

export const agentSessionChangesInternals = {
  baselineRefForAgent,
  projectWorkingTreeDiffToSessionFiles,
};
