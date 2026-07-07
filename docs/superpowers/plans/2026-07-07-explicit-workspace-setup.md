# Explicit Workspace Setup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an explicit `Create and run setup` action for worktree-backed workspace creation, and remove the `waitForSetup` behavior from agent startup.

**Architecture:** `runSetup?: boolean` becomes the explicit wire-level creation option. The server starts the existing workspace setup progress flow only when worktree-backed creation requests set `runSetup: true`; agent-created worktrees may still run setup asynchronously but never block agent startup. The new workspace UI adds a separate setup action that creates the workspace without sending the composer draft.

**Tech Stack:** TypeScript, Zod wire schemas, Vitest, React Native/Expo, Zustand stores, existing Paseo workspace setup progress messages.

## Global Constraints

- Setup failure must preserve the created workspace/worktree.
- The new action must not automatically send the composer draft.
- Directory-backed workspace setup is out of scope for this implementation.
- `runSetup` must be optional and default to `false`.
- Protocol changes must remain backward-compatible: no required fields, no narrowed fields, no removed wire fields.
- Run only targeted test files, then `npm run format`, `npm run typecheck`, and `npm run lint`.

---

## File Structure

- `packages/protocol/src/paseo-config-schema.ts` owns `paseo.json` parsing. Remove `waitForSetup` from normalized config output while keeping unknown fields parseable via passthrough.
- `packages/protocol/src/paseo-config-schema.test.ts` proves setup/teardown normalization without `waitForSetup`.
- `packages/protocol/src/messages.ts` owns WebSocket request schemas. Add optional `runSetup` to creation requests.
- `packages/protocol/src/messages.workspaces.test.ts` proves the new optional field parses and old messages still parse.
- `packages/protocol/src/tool-call-display.ts` and `.test.ts` remove the wait-for-setup-specific timeline display.
- `packages/client/src/daemon-client.ts` forwards `runSetup` from client helpers.
- `packages/client/src/daemon-client.test.ts` proves client serialization for both creation helpers.
- `packages/server/src/utils/worktree.ts` removes `getWorktreeWaitForSetup`.
- `packages/server/src/server/worktree/commands.ts` preserves `runSetup` in the command input.
- `packages/server/src/server/worktree-session.ts` gates workspace setup on explicit `runSetup`, removes blocking agent setup metadata, and preserves workspaces on setup failure.
- `packages/server/src/server/worktree-session.test.ts` covers explicit setup trigger, default no setup trigger, async nonblocking agent setup, and failure preservation.
- `packages/server/src/server/session.ts` forwards `request.runSetup` from `workspace.create.request`.
- `packages/server/src/server/session.workspaces.test.ts` covers `workspace.create.request` with `runSetup: true`.
- `packages/app/src/screens/new-workspace-empty.ts` owns pure creation helpers for empty/new-workspace flows. Add a helper for create-and-setup.
- `packages/app/src/screens/new-workspace-empty.test.ts` proves create-and-setup does not send prompt/attachments and preserves navigation behavior.
- `packages/app/src/screens/new-workspace-screen.tsx` threads `runSetup` through `ensureWorkspace` and renders the new worktree-only action.
- `packages/app/src/i18n/resources/en.ts` and `packages/app/src/i18n/resources/zh-CN.ts` add button copy.

---

### Task 1: Remove `waitForSetup` Config and Display Behavior

**Files:**

- Modify: `packages/protocol/src/paseo-config-schema.ts`
- Modify: `packages/protocol/src/paseo-config-schema.test.ts`
- Modify: `packages/protocol/src/tool-call-display.ts`
- Modify: `packages/protocol/src/tool-call-display.test.ts`
- Modify: `packages/server/src/utils/worktree.ts`

**Interfaces:**

- Consumes: existing `worktree.setup` and `worktree.teardown` config fields.
- Produces: normalized `PaseoConfig["worktree"]` with only `setup` and `teardown` lifecycle arrays.

- [ ] **Step 1: Update failing config tests**

  In `packages/protocol/src/paseo-config-schema.test.ts`, update the expected normalized worktree output:

  ```ts
  expect(PaseoConfigSchema.parse(config)).toEqual({
    worktree: {
      setup: ["npm install"],
      teardown: ["npm run clean"],
    },
    scripts: config.scripts,
  });
  ```

  Delete the test named `preserves explicit waitForSetup false`.

- [ ] **Step 2: Run the config test and verify failure**

  Run:

  ```bash
  npx vitest run packages/protocol/src/paseo-config-schema.test.ts --bail=1
  ```

  Expected: FAIL because schema still adds `waitForSetup: true`.

- [ ] **Step 3: Remove normalized `waitForSetup`**

  In `packages/protocol/src/paseo-config-schema.ts`, remove `waitForSetup` from `PaseoWorktreeConfigRawSchema` and `WorktreeConfigSchema`:

  ```ts
  export const PaseoWorktreeConfigRawSchema = z
    .object({
      setup: PaseoLifecycleCommandRawSchema.optional(),
      teardown: PaseoLifecycleCommandRawSchema.optional(),
      terminals: z.unknown().optional(),
    })
    .passthrough();

  export const WorktreeConfigSchema = PaseoWorktreeConfigRawSchema.extend({
    setup: z.unknown().optional().transform(normalizeLifecycleCommands),
    teardown: z.unknown().optional().transform(normalizeLifecycleCommands),
  })
    .passthrough()
    .catch({ setup: [], teardown: [] });
  ```

- [ ] **Step 4: Remove wait-specific tool-call display**

  In `packages/protocol/src/tool-call-display.ts`, delete `isWaitForSetupBlocked` and simplify worktree setup summary:

  ```ts
  case "worktree_setup":
    return {
      displayName: "Worktree Setup",
      summary: input.detail.branchName,
    };
  ```

  In `packages/protocol/src/tool-call-display.test.ts`, delete the test named `tells the user when worktree setup is blocking agent startup`.

- [ ] **Step 5: Remove server config helper**

  In `packages/server/src/utils/worktree.ts`, delete `getWorktreeWaitForSetup`.

- [ ] **Step 6: Run targeted tests**

  Run:

  ```bash
  npx vitest run packages/protocol/src/paseo-config-schema.test.ts packages/protocol/src/tool-call-display.test.ts --bail=1
  ```

  Expected: PASS.

- [ ] **Step 7: Commit**

  ```bash
  git add packages/protocol/src/paseo-config-schema.ts packages/protocol/src/paseo-config-schema.test.ts packages/protocol/src/tool-call-display.ts packages/protocol/src/tool-call-display.test.ts packages/server/src/utils/worktree.ts
  git commit -m "refactor: remove worktree waitForSetup config"
  ```

---

### Task 2: Add `runSetup` to Protocol and Client Creation Helpers

**Files:**

- Modify: `packages/protocol/src/messages.ts`
- Modify: `packages/protocol/src/messages.workspaces.test.ts`
- Modify: `packages/client/src/daemon-client.ts`
- Modify: `packages/client/src/daemon-client.test.ts`

**Interfaces:**

- Produces: optional `runSetup?: boolean` on `create_paseo_worktree_request`.
- Produces: optional top-level `runSetup?: boolean` on `workspace.create.request`.
- Produces: client helper inputs that accept `runSetup?: boolean`.

- [ ] **Step 1: Write protocol parser tests**

  In `packages/protocol/src/messages.workspaces.test.ts`, extend the workspace create parser test with:

  ```ts
  const runSetupWorktree = WorkspaceCreateRequestSchema.parse({
    type: "workspace.create.request",
    requestId: "req-setup",
    runSetup: true,
    source: {
      kind: "worktree",
      cwd: "/tmp/repo",
      action: "checkout",
      refName: "feat/my-feature",
    },
  });
  expect(runSetupWorktree.runSetup).toBe(true);
  ```

  Add a `CreatePaseoWorktreeRequestSchema` parse assertion:

  ```ts
  const createWorktree = CreatePaseoWorktreeRequestSchema.parse({
    type: "create_paseo_worktree_request",
    requestId: "req-create-setup",
    cwd: "/tmp/repo",
    runSetup: true,
  });
  expect(createWorktree.runSetup).toBe(true);
  ```

- [ ] **Step 2: Run protocol test and verify failure**

  Run:

  ```bash
  npx vitest run packages/protocol/src/messages.workspaces.test.ts --bail=1
  ```

  Expected: FAIL because `runSetup` is not yet part of the inferred schema output.

- [ ] **Step 3: Add optional wire fields**

  In `packages/protocol/src/messages.ts`, add `runSetup`:

  ```ts
  export const CreatePaseoWorktreeRequestSchema = z.object({
    type: z.literal("create_paseo_worktree_request"),
    cwd: z.string(),
    projectId: z.string().optional(),
    worktreeSlug: z.string().optional(),
    nameContext: z.string().optional(),
    attachments: AgentAttachmentsSchema.optional(),
    firstAgentContext: FirstAgentContextSchema.optional(),
    refName: z.string().min(1).optional(),
    action: z.enum(["branch-off", "checkout"]).optional(),
    githubPrNumber: z.number().int().positive().optional(),
    runSetup: z.boolean().optional(),
    requestId: z.string(),
  });
  ```

  And for workspace create:

  ```ts
  export const WorkspaceCreateRequestSchema = z.object({
    type: z.literal("workspace.create.request"),
    requestId: z.string(),
    title: z.string().optional(),
    firstAgentContext: FirstAgentContextSchema.optional(),
    runSetup: z.boolean().optional(),
    source: z.discriminatedUnion("kind", [
      // existing source branches unchanged
    ]),
  });
  ```

- [ ] **Step 4: Write client serialization tests**

  In `packages/client/src/daemon-client.test.ts`, add assertions that `runSetup: true` is sent by both helpers:

  ```ts
  const createPromise = client.createWorkspace(
    {
      runSetup: true,
      source: {
        kind: "worktree",
        cwd: "/tmp/project",
        projectId: "local:/tmp/project",
      },
    },
    "req-workspace-setup",
  );
  expect(parseSentFrame(mock.sent[0])).toMatchObject({
    type: "workspace.create.request",
    requestId: "req-workspace-setup",
    runSetup: true,
  });
  ```

  Add the same style assertion for `client.createPaseoWorktree({ cwd: "/tmp/project", runSetup: true }, "req-create-setup")`.

- [ ] **Step 5: Run client test and verify failure**

  Run:

  ```bash
  npx vitest run packages/client/src/daemon-client.test.ts --bail=1
  ```

  Expected: FAIL because the client does not forward `runSetup`.

- [ ] **Step 6: Forward `runSetup` in client helpers**

  In `packages/client/src/daemon-client.ts`, include `runSetup` in both message builders:

  ```ts
  ...(input.runSetup !== undefined ? { runSetup: input.runSetup } : {}),
  ```

  Extend `createWorkspace` input:

  ```ts
  input: {
    source: WorkspaceCreateRequest["source"];
    title?: string;
    firstAgentContext?: WorkspaceCreateRequest["firstAgentContext"];
    runSetup?: WorkspaceCreateRequest["runSetup"];
  }
  ```

- [ ] **Step 7: Run targeted tests**

  Run:

  ```bash
  npx vitest run packages/protocol/src/messages.workspaces.test.ts packages/client/src/daemon-client.test.ts --bail=1
  ```

  Expected: PASS.

- [ ] **Step 8: Commit**

  ```bash
  git add packages/protocol/src/messages.ts packages/protocol/src/messages.workspaces.test.ts packages/client/src/daemon-client.ts packages/client/src/daemon-client.test.ts
  git commit -m "feat: add explicit setup flag to workspace creation"
  ```

---

### Task 3: Make Server Setup Explicit and Non-Destructive

**Files:**

- Modify: `packages/server/src/server/worktree/commands.ts`
- Modify: `packages/server/src/server/worktree-session.ts`
- Modify: `packages/server/src/server/worktree-session.test.ts`
- Modify: `packages/server/src/server/session.ts`
- Modify: `packages/server/src/server/session.workspaces.test.ts`
- Modify: `packages/server/src/server/agent/create-agent/create.ts`
- Modify: `packages/server/src/server/agent/create-agent/create.test.ts`

**Interfaces:**

- Consumes: `CreatePaseoWorktreeInput["runSetup"]`.
- Produces: workspace setup starts only when `runSetup === true` and `setupContinuation.kind === "workspace"`.
- Produces: `AgentWorktreeSetupContinuation` without `waitForSetup`.

- [ ] **Step 1: Write workflow tests for explicit setup**

  In `packages/server/src/server/worktree-session.test.ts`, add one test showing `runSetup` defaults to no workspace setup:

  ```ts
  test("workspace setup does not start unless runSetup is explicit", async () => {
    const { tempDir, repoDir } = createGitRepo({
      paseoConfig: { worktree: { setup: "echo setup > setup.txt" } },
    });
    const paseoHome = path.join(tempDir, ".paseo");
    const emitted: SessionOutboundMessage[] = [];

    try {
      const result = await createPaseoWorktreeWorkflow(
        {
          paseoHome,
          createPaseoWorktree: createPaseoWorktreeForTest({ paseoHome }),
          warmWorkspaceGitData: async () => {},
          autoNameWorkspaceBranchForFirstAgent: () => {},
          emitWorkspaceUpdateForWorkspaceId: async () => {},
          cacheWorkspaceSetupSnapshot: () => {},
          emit: (message) => emitted.push(message),
          sessionLogger: createLogger(),
          terminalManager: null,
          archiveWorkspaceRecord: async () => {},
          serviceProxy: null,
          scriptRuntimeStore: null,
          getDaemonTcpPort: null,
          getDaemonTcpHost: null,
          onScriptsChanged: null,
        },
        { cwd: repoDir, worktreeSlug: "no-explicit-setup", runSetup: false, paseoHome },
      );
      await new Promise((resolve) => setTimeout(resolve, 25));
      expect(emitted.some((message) => message.type === "workspace_setup_progress")).toBe(false);
      expect(existsSync(path.join(result.worktree.worktreePath, "setup.txt"))).toBe(false);
    } finally {
      await removeTempDirForTest(tempDir);
    }
  });
  ```

  Add the paired `runSetup: true` test:

  ```ts
  expect(emitted.some((message) => message.type === "workspace_setup_progress")).toBe(true);
  await vi.waitFor(() => {
    expect(existsSync(path.join(result.worktree.worktreePath, "setup.txt"))).toBe(true);
  });
  ```

- [ ] **Step 2: Write failure preservation test**

  In `packages/server/src/server/worktree-session.test.ts`, add a failure case:

  ```ts
  expect(archiveWorkspaceRecord).not.toHaveBeenCalled();
  expect(progressMessages.at(-1)?.payload.status).toBe("failed");
  expect(existsSync(worktreePath)).toBe(true);
  ```

- [ ] **Step 3: Run server workflow test and verify failure**

  Run:

  ```bash
  npx vitest run packages/server/src/server/worktree-session.test.ts --bail=1
  ```

  Expected: FAIL because workspace setup still starts for every workspace continuation, and some failure paths still archive before setup starts.

- [ ] **Step 4: Gate workspace setup on `input.runSetup === true`**

  In `packages/server/src/server/worktree-session.ts`, remove the `getWorktreeWaitForSetup` import and replace workspace setup start with:

  ```ts
  const shouldRunWorkspaceSetup = setupContinuation.kind === "workspace" && input.runSetup === true;

  setTimeout(() => {
    // existing auto-name and warm git code stays unchanged
    if (shouldRunWorkspaceSetup) {
      void runWorktreeSetupInBackground(dependencies, {
        requestCwd: input.cwd,
        repoRoot: createdWorktree.repoRoot,
        workspaceId: workspace.workspaceId,
        worktree: createdWorktree.worktree,
        shouldBootstrap: createdWorktree.created,
        slug,
        worktreePath: createdWorktree.worktree.worktreePath,
      });
    }
  }, 0);
  ```

- [ ] **Step 5: Remove blocking agent setup continuation**

  In `packages/server/src/server/worktree-session.ts`, remove `waitForSetup` from `AgentWorktreeSetupContinuation` and simplify `startAfterAgentCreate`:

  ```ts
  startAfterAgentCreate: async ({ agentId }) => {
    void runAsyncWorktreeBootstrap({
      agentId,
      workspaceId: workspace.workspaceId,
      worktree: createdWorktree.worktree,
      shouldBootstrap: createdWorktree.created,
      terminalManager: setupContinuation.terminalManager,
      appendTimelineItem: setupContinuation.appendTimelineItem,
      emitLiveTimelineItem: setupContinuation.emitLiveTimelineItem,
      logger: setupContinuation.logger,
    });
    return true;
  };
  ```

  In `packages/server/src/server/agent/create-agent/create.ts`, replace the wait check with:

  ```ts
  resolved.setupContinuation?.startAfterAgentCreate({ agentId: snapshot.id });
  const setupCompleted = true;
  ```

  Keep any existing cleanup behavior that depends on `setupCompleted` by passing `true`.

- [ ] **Step 6: Preserve workspace on setup failure**

  In `runWorktreeSetupInBackground`, delete the archive call:

  ```ts
  if (!setupStarted) {
    await dependencies.archiveWorkspaceRecord(options.workspaceId);
  }
  ```

  Keep the failed progress snapshot and final workspace update.

- [ ] **Step 7: Forward `runSetup` from request handlers**

  In `packages/server/src/server/worktree/commands.ts`, include `runSetup` in `CreatePaseoWorktreeCommandInput` and pass it to the workflow:

  ```ts
  runSetup: input.runSetup === true,
  ```

  In `handleCreatePaseoWorktreeRequest`, pass `runSetup: request.runSetup === true`.

  In `packages/server/src/server/session.ts`, pass `runSetup: request.runSetup === true` into `createPaseoWorktreeWorkflow` for `workspace.create.request`.

- [ ] **Step 8: Update agent tests**

  In `packages/server/src/server/worktree-session.test.ts`, remove assertions for:

  ```ts
  result.setupContinuation?.waitForSetup
  metadata: { waitForSetup: true }
  waitingAgentId mirrored setup timeline entries
  ```

  Replace them with an assertion that `startAfterAgentCreate` returns without waiting:

  ```ts
  await expect(
    result.setupContinuation?.startAfterAgentCreate({ agentId: "agent-after-create" }),
  ).resolves.toBe(true);
  ```

  In `packages/server/src/server/agent/create-agent/create.test.ts`, remove `waitForSetup: true` from setup continuation fixtures and assertions.

- [ ] **Step 9: Add session create test**

  In `packages/server/src/server/session.workspaces.test.ts`, add a `workspace.create.request` worktree test so the emitted workflow input includes:

  ```ts
  runSetup: true,
  ```

  when the inbound request contains:

  ```ts
  runSetup: true,
  ```

- [ ] **Step 10: Run targeted server tests**

  Run:

  ```bash
  npx vitest run packages/server/src/server/worktree-session.test.ts packages/server/src/server/session.workspaces.test.ts packages/server/src/server/agent/create-agent/create.test.ts --bail=1
  ```

  Expected: PASS.

- [ ] **Step 11: Commit**

  ```bash
  git add packages/server/src/server/worktree/commands.ts packages/server/src/server/worktree-session.ts packages/server/src/server/worktree-session.test.ts packages/server/src/server/session.ts packages/server/src/server/session.workspaces.test.ts packages/server/src/server/agent/create-agent/create.ts packages/server/src/server/agent/create-agent/create.test.ts
  git commit -m "feat: run workspace setup explicitly"
  ```

---

### Task 4: Add the New Workspace UI Action

**Files:**

- Modify: `packages/app/src/screens/new-workspace-empty.ts`
- Modify: `packages/app/src/screens/new-workspace-empty.test.ts`
- Modify: `packages/app/src/screens/new-workspace-screen.tsx`
- Modify: `packages/app/src/i18n/resources/en.ts`
- Modify: `packages/app/src/i18n/resources/zh-CN.ts`

**Interfaces:**

- Consumes: `ensureWorkspace({ cwd, prompt, attachments, withInitialAgent, runSetup })`.
- Produces: `runCreateWorkspaceWithSetup` helper that navigates to the created workspace without sending text or attachments.

- [ ] **Step 1: Extend pure helper tests**

  In `packages/app/src/screens/new-workspace-empty.test.ts`, add:

  ```ts
  import { runCreateWorkspaceWithSetup } from "./new-workspace-empty";

  it("creates a setup workspace without prompt or attachments and navigates to it", async () => {
    const workspace = { id: "workspace-setup" };
    const ensureWorkspace = vi.fn().mockResolvedValue(workspace);
    const { navigate, recorded } = createRecordingNavigate();

    await runCreateWorkspaceWithSetup({
      payload: payload({ text: "keep this draft" }),
      ensureWorkspace,
      serverId: "server-abc",
      navigate,
    });

    expect(ensureWorkspace).toHaveBeenCalledWith({
      cwd: "/sample/repo",
      prompt: "",
      attachments: [],
      withInitialAgent: false,
      runSetup: true,
    });
    expect(recorded).toEqual([{ serverId: "server-abc", workspaceId: "workspace-setup" }]);
  });
  ```

- [ ] **Step 2: Run helper test and verify failure**

  Run:

  ```bash
  npx vitest run packages/app/src/screens/new-workspace-empty.test.ts --bail=1
  ```

  Expected: FAIL because `runCreateWorkspaceWithSetup` does not exist.

- [ ] **Step 3: Add helper and extend `ensureWorkspace` input type**

  In `packages/app/src/screens/new-workspace-empty.ts`, extend `ensureWorkspace` input:

  ```ts
  ensureWorkspace: (input: {
    cwd: string;
    prompt: string;
    attachments: AgentAttachment[];
    withInitialAgent: boolean;
    runSetup?: boolean;
  }) => Promise<ReturnType<typeof normalizeWorkspaceDescriptor>>;
  ```

  Add:

  ```ts
  export async function runCreateWorkspaceWithSetup(
    input: CreateEmptyWorkspaceInput,
  ): Promise<void> {
    const { payload, ensureWorkspace, serverId, navigate } = input;
    const ensuredWorkspace = await ensureWorkspace({
      cwd: payload.cwd,
      prompt: "",
      attachments: [],
      withInitialAgent: false,
      runSetup: true,
    });
    navigate(serverId, ensuredWorkspace.id);
  }
  ```

- [ ] **Step 4: Thread `runSetup` through new workspace creation**

  In `packages/app/src/screens/new-workspace-screen.tsx`, extend:

  ```ts
  ensureWorkspace(input: {
    cwd: string;
    prompt: string;
    attachments: AgentAttachment[];
    withInitialAgent: boolean;
    runSetup?: boolean;
  })
  ```

  Pass `runSetup: input.runSetup` to both `createMultiplicityWorkspace` and `buildCreateWorktreeInput`.

  In `createMultiplicityWorkspace`, forward:

  ```ts
  runSetup: input.runSetup === true,
  ```

  to `client.createWorkspace`.

  In `buildCreateWorktreeInput`, include:

  ```ts
  runSetup: input.runSetup === true,
  ```

- [ ] **Step 5: Add the UI action**

  Import `Button`, `Play`, and `runCreateWorkspaceWithSetup`:

  ```ts
  import { Button } from "@/components/ui/button";
  import { Play } from "lucide-react-native";
  import {
    isEmptyWorkspaceSubmission,
    runCreateEmptyWorkspace,
    runCreateWorkspaceWithSetup,
  } from "./new-workspace-empty";
  ```

  Add a callback:

  ```ts
  const handleCreateAndRunSetup = useCallback(async () => {
    try {
      setErrorMessage(null);
      await composerState?.persistFormPreferences();
      setPendingAction("empty");
      await runCreateWorkspaceWithSetup({
        payload: {
          text: chatDraft.text,
          attachments: chatDraft.attachments,
          cwd: selectedSourceDirectory ?? "",
        },
        ensureWorkspace,
        serverId: selectedServerId,
        navigate: (targetServerId, workspaceId) => navigateToWorkspace(targetServerId, workspaceId),
      });
    } catch (error) {
      const message = toErrorMessage(error, t("newWorkspace.errors.createWorktreeFailed"));
      setErrorMessage(message);
      toast.show({ title: message, variant: "destructive" });
    } finally {
      setPendingAction(null);
    }
  }, [
    chatDraft.attachments,
    chatDraft.text,
    composerState,
    ensureWorkspace,
    selectedServerId,
    selectedSourceDirectory,
    t,
    toast,
  ]);
  ```

  Render in `composerFooter` only for worktree isolation:

  ```tsx
  {
    effectiveIsolation === "worktree" ? (
      <Button
        variant="secondary"
        size="sm"
        leftIcon={Play}
        onPress={handleCreateAndRunSetup}
        disabled={isPending || !selectedSourceDirectory}
        loading={pendingAction === "setup"}
        testID="workspace-create-and-run-setup"
      >
        {t("newWorkspace.createAndRunSetup")}
      </Button>
    ) : null;
  }
  ```

  Use `setPendingAction("setup")`; extend the pending action type if it currently only accepts `"empty" | "chat"`.

- [ ] **Step 6: Add copy**

  In English:

  ```ts
  createAndRunSetup: "Create and run setup",
  ```

  In Chinese:

  ```ts
  createAndRunSetup: "创建并执行 setup",
  ```

- [ ] **Step 7: Run targeted app test**

  Run:

  ```bash
  npx vitest run packages/app/src/screens/new-workspace-empty.test.ts --bail=1
  ```

  Expected: PASS.

- [ ] **Step 8: Commit**

  ```bash
  git add packages/app/src/screens/new-workspace-empty.ts packages/app/src/screens/new-workspace-empty.test.ts packages/app/src/screens/new-workspace-screen.tsx packages/app/src/i18n/resources/en.ts packages/app/src/i18n/resources/zh-CN.ts
  git commit -m "feat: add create and run setup action"
  ```

---

### Task 5: Final Verification

**Files:**

- Verify all changed files.

**Interfaces:**

- Consumes: Tasks 1-4.
- Produces: formatted, typechecked, linted branch.

- [ ] **Step 1: Run targeted tests**

  Run:

  ```bash
  npx vitest run packages/protocol/src/paseo-config-schema.test.ts packages/protocol/src/tool-call-display.test.ts packages/protocol/src/messages.workspaces.test.ts packages/client/src/daemon-client.test.ts packages/server/src/server/worktree-session.test.ts packages/server/src/server/session.workspaces.test.ts packages/server/src/server/agent/create-agent/create.test.ts packages/app/src/screens/new-workspace-empty.test.ts --bail=1
  ```

  Expected: PASS.

- [ ] **Step 2: Format**

  Run:

  ```bash
  npm run format
  ```

  Expected: formatter completes successfully.

- [ ] **Step 3: Typecheck**

  Run:

  ```bash
  npm run typecheck
  ```

  Expected: PASS.

- [ ] **Step 4: Lint**

  Run:

  ```bash
  npm run lint
  ```

  Expected: PASS.

- [ ] **Step 5: Inspect final diff**

  Run:

  ```bash
  git status --short
  git log --oneline -5
  ```

  Expected: only intentional files are modified or committed.
