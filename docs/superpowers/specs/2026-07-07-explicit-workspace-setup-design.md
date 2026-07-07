# Explicit Workspace Setup Design

## Goal

Move worktree setup from an implicit agent-creation wait path to an explicit workspace creation action.

Users should be able to create a workspace or worktree and immediately run setup without first starting an agent session. Setup must stay visible through the existing workspace setup progress UI, and setup failure must preserve the created workspace/worktree for inspection and retry.

## Non-Goals

- Do not keep or repair `worktree.waitForSetup`.
- Do not automatically send the composer draft after setup.
- Do not expand setup semantics to normal directory-backed workspaces in the first implementation.
- Do not create a degraded setup fallback for older daemons.

## User Experience

The new workspace screen keeps the existing submit behavior for ordinary creation and first-message submission.

It adds a separate action labeled like `Create and run setup` for worktree-backed creation. When selected:

1. Paseo creates the workspace/worktree.
2. Paseo starts worktree setup immediately.
3. Paseo navigates to the created workspace.
4. Existing setup progress UI shows running/completed/failed state.
5. The current composer draft remains intact and is not sent.

If setup commands are missing, setup completes quickly and the workspace remains usable.

If setup fails, the workspace/worktree remains. The failed setup snapshot and logs stay available through the existing setup UI.

## Protocol

Add an optional `runSetup?: boolean` field to both workspace creation request shapes that can create worktrees:

- `create_paseo_worktree_request`
- `workspace.create.request`

The field defaults to `false` for backward compatibility. Old clients keep current behavior, and old daemons continue to parse old messages. New clients use this field only when the user selects `Create and run setup`.

No required fields are added, and no existing fields are narrowed or removed.

## Server Design

Remove `worktree.waitForSetup` from config parsing and tests.

Remove agent setup waiting behavior from the worktree setup continuation. Agent creation may still bootstrap a new worktree as needed, but it should not block on project-configured setup.

When a worktree-backed create request has `runSetup: true`, the server starts the existing background worktree setup flow after the workspace/worktree is created. It reuses the existing `workspace_setup_progress` and `workspace_setup_status_response` messages.

Background setup must use `cleanupOnFailure: false` and must not archive the workspace/worktree when setup fails before command execution. The failure is represented only as a failed workspace setup snapshot plus logs.

## Client Design

The daemon client forwards `runSetup` on both create request helpers.

The new workspace screen threads a `runSetup` flag through `ensureWorkspace`. The new action calls `ensureWorkspace` with:

- `withInitialAgent: false`
- `runSetup: true`

This path navigates to the created workspace and leaves the composer draft untouched.

The action should only be shown when worktree isolation is active. Directory-backed workspace setup remains out of scope for this change.

## Testing

Targeted tests should cover:

- `waitForSetup` config behavior is removed.
- `runSetup` is optional and defaults to no setup trigger.
- `runSetup: true` starts workspace setup for worktree-backed creation.
- setup failure preserves the workspace/worktree.
- the new UI action creates a workspace without creating an agent or clearing the draft.

Verification should run only changed test files, then repo typecheck and lint according to repository rules.
