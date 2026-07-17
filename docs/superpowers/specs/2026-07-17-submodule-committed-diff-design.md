# Submodule Committed Diff Design

## Problem

The Changes pane already lets users switch between **Uncommitted** and **Committed**. For a
normally configured submodule, the daemon also already follows Git's superproject semantics:

- a child commit whose parent gitlink is still dirty appears under **Uncommitted**;
- after the parent commits that gitlink, the child commit appears under **Committed** when the
  branch is compared with its base.

This breaks when `.gitmodules` configures the submodule with `ignore = all`. Git applies that
setting to `git diff`, so the parent diff omits the gitlink even when its recorded object ID
changed. The recursive uncommitted scanner can find dirty files inside a child worktree, but it
cannot find a clean child worktree whose new `HEAD` has already been committed. The result is that
the same child change can disappear from both views.

## Goal

Make submodule file changes visible through the existing **Uncommitted / Committed** switch,
including submodules configured with `ignore = all`, while preserving the parent repository's
gitlink as the source of truth for which view owns the change.

## Non-goals

- Do not add a second root-versus-submodule filter or per-submodule mode selector.
- Do not infer or compare a submodule's own base branch.
- Do not change Git status, commit, staging, or mutation behavior.
- Do not change WebSocket schemas, feature flags, or client state.
- Do not initialize or fetch missing submodules.

## Design

### Diff comparison arguments

Rename the helper that assembles checkout comparison arguments so its name reflects that it
returns both options and refs. Have it prepend `--ignore-submodules=none` before the base and target
refs.

All tracked checkout-diff reads already use this shared argument list:

1. `git diff --name-status` discovers changed paths;
2. `git diff --numstat` calculates per-path statistics;
3. `git diff --submodule=diff` produces the per-file patch.

Applying the override at this shared boundary keeps those reads consistent. It deliberately does
not affect unrelated `git diff --no-index` calls used to render untracked files.

The override means “include submodule gitlink changes in this review,” not “change repository
configuration.” It is read-only and does not write to `.gitmodules` or local Git config.

### View semantics

The existing client modes remain unchanged:

- **Uncommitted** compares the parent `HEAD` with its working tree. If the child has advanced to a
  committed child `HEAD` but the parent gitlink is not committed, the parent gitlink is a tracked
  uncommitted change. `--submodule=diff` expands the recorded-to-checked-out child range into files.
- **Committed** compares the parent branch `HEAD` with the merge base of the selected base branch.
  Once the parent gitlink update is committed, the historical gitlink range is expanded into the
  changed child files.

Existing duplicate prevention remains in place: when the parent diff reports a submodule path,
the recursive dirty-worktree scan does not emit the same tracked child changes again.

### Missing submodule data

Keep the current resilience rules. Recursive scans continue to skip uninitialized or temporarily
unavailable child worktrees. Historical expansion uses Git's existing output; if Git cannot
produce nested file patches, the parent gitlink change remains represented by the existing
structured fallback rather than triggering initialization, fetching objects, or mutating the
checkout.

## Compatibility

This is a daemon-only correction to existing checkout-diff behavior. The response already carries
parent-relative file paths and optional `submodulePath`, and the app already groups and renders
those files. No protocol or UI compatibility gate is required.

## Testing

Add a real-repository regression test in
`packages/server/src/utils/checkout-git.test.ts` with a submodule configured as `ignore = all`:

1. Record child commit A in the parent and create the parent base ref.
2. Commit a file change as child commit B without committing the parent gitlink.
3. Assert **Uncommitted** returns that child file with its parent-relative path and
   `submodulePath`; assert **Committed** is empty.
4. Commit the parent gitlink update.
5. Assert **Uncommitted** is empty and **Committed** returns the same child file and content.

The test must fail on the current implementation because Git suppresses the parent path, then pass
after the shared comparison arguments include `--ignore-submodules=none`. Update command-metrics
assertions that intentionally check the exact generated Git command. Run only the modified test
file, followed by repository typecheck, lint, formatting, and formatting verification.

## Acceptance criteria

- The existing switch shows a child commit under **Uncommitted** before the parent gitlink commit.
- The same child change moves to **Committed** after the parent gitlink commit.
- Both behaviors work when `.gitmodules` contains `ignore = all`.
- Normal files, untracked child files, whitespace filtering, size limits, and nested path grouping
  retain their existing behavior.
- No app or protocol change is introduced.
