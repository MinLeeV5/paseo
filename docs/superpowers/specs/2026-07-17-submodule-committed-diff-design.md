# Submodule Committed Diff Design

## Problem

The Changes pane already lets users switch between **Uncommitted** and **Committed**. Each
initialized repository must classify its own files at its own commit boundary:

- child `HEAD -> worktree` changes are **Uncommitted**;
- commits between the locally fetched `.gitmodules` tracking branch and the checked-out child
  `HEAD` are **Committed**;
- when no tracking branch is configured or resolvable, child `HEAD -> HEAD` is the committed
  comparison and does not expand stale history;
- the still-unrecorded parent gitlink may remain as one compact **Uncommitted** pointer row, but it
  must not pull the child's already-committed file history into that view.

This distinction matters in real worktrees whose setup advances ignored submodules to their remote
tracking commits. The parent checkout can be clean against its base while initialized children are
hundreds of commits ahead of stale recorded gitlinks but exactly equal to their configured tracking
branches. Treating the parent gitlink as the committed baseline produces hundreds of false file
changes even though the child is not ahead of its branch.

Git's default diff behavior can also hide submodules when `.gitmodules` uses `ignore = all`. Paseo
therefore overrides submodule-ignore behavior and expands initialized child repositories into their
underlying files. The recursive comparator addresses four separate model gaps:

1. Committed comparisons never enter the scanner because recursion is still gated by
   `includeUntracked`.
2. Initialized submodule discovery does not retain `.gitmodules` branch metadata, so committed
   comparisons cannot use the child's intended tracking baseline.
3. Recursive patches are buffered and converted to structured hunks even after the shared raw diff
   budget is exhausted.
4. A parent-gitlink-only endpoint model conflates the parent's historical pointer with the child's
   own branch divergence instead of comparing each initialized repository from its configured
   branch.

These are architectural gaps rather than isolated ignore-mode bugs. Traversal, endpoint identity,
and output admission need independent models.

## Goal

Make all initialized submodule file changes visible through the existing
**Uncommitted / Committed** switch, including ignored and nested submodules, while classifying each
repository at its own `HEAD`, using the configured submodule branch as the committed baseline,
retaining parent gitlinks as compact fallbacks, and applying one deterministic output budget to the
complete checkout diff.

## Non-goals

- Do not add a root-versus-submodule filter or per-submodule mode selector.
- Do not change Git status, commit, staging, or mutation behavior.
- Do not change WebSocket schemas, feature flags, or client state.
- Do not initialize submodules, fetch missing objects, or write repository configuration.
- Do not fetch a configured branch while reading a diff; only locally available remote-tracking or
  local refs are eligible.
- Do not expand historical-only submodules that have no initialized checkout. Their nearest
  gitlink remains the fallback row.

## Design

### Explicit comparison endpoints

Represent every repository-level comparison with two explicit endpoints:

```typescript
type RecursiveDiffEndpoint =
  | { kind: "absent" }
  | { kind: "commit"; ref: string }
  | {
      kind: "checkedCommit";
      recordedCommit: string;
      headCommit: string;
    }
  | {
      kind: "worktree";
      recordedCommit: string | null;
      headCommit: string | null;
    };
```

`absent` maps to Git's empty tree. A `commit` is an exact historical or parent-recorded tree.
`checkedCommit` is the checked-out child `HEAD` used as a Committed target while retaining the
parent-recorded commit for compact fallback rendering. A `worktree` has no target argument when
rendering `git diff`; it retains the parent-recorded commit and checked-out child `HEAD` separately
so Uncommitted can compare that child's own `HEAD` to its files.

The top-level modes become:

| View        | Old endpoint                                      | New endpoint    | Collect untracked |
| ----------- | ------------------------------------------------- | --------------- | ----------------- |
| Uncommitted | parent `HEAD`, or absent for an unborn repository | parent worktree | yes               |
| Committed   | merge base                                        | parent `HEAD`   | no                |

Recursion is unconditional for both views. `includeUntracked` controls only
`git ls-files --others --exclude-standard`; it never controls whether child repositories are
visited.

At each initialized gitlink, resolve the modes independently:

- **Uncommitted:** resolve the parent-recorded gitlink and child `HEAD`, then compare child `HEAD`
  to child worktree. A recorded/checked-out mismatch is a compact gitlink change, not the baseline
  for expanding child files.
- **Committed:** read the branch configured for the child in the current `.gitmodules`. Resolve
  `refs/remotes/origin/<branch>` first, then `refs/heads/<branch>`, and compare that commit to the
  initialized child `HEAD`. The special branch `.` resolves to the parent repository's current
  branch. If the branch is absent, missing, or the parent is detached for `.`, use child `HEAD` as
  both endpoints. Retain parent-recorded gitlinks only for compact pointer fallback rows.
- A parent `absent` old endpoint still becomes child `absent`; a successfully missing target
  gitlink remains absent and is never replaced by an unrelated checkout.

Git lookup failure is not the same as absence. A successful empty `ls-tree` result means
`absent`; a missing object or failed command means `unavailable`. Unavailable comparisons stop at
the nearest gitlink fallback rather than substituting `HEAD`, initializing, or fetching.

### Recursive discovery and ownership

The recursive comparator walks the currently configured, initialized submodule graph. At each
repository level it:

1. Loads the initialized child paths once.
2. Discovers tracked changes with `git diff --name-status --ignore-submodules=dirty` for that
   level's explicit endpoint pair.
3. Collects untracked paths only when the comparison requests them.
4. Emits ordinary files as owned by the current repository level.
5. Treats an exact initialized gitlink path as a recursion boundary, derives its child endpoints,
   and descends regardless of whether untracked files are enabled.

No ancestor-wide suppression set is used. A repository owns only its direct ordinary files. A
child owns paths below its gitlink and receives a full parent-relative display prefix. This gives
each tracked path one nearest owner and preserves the full nested `submodulePath`.

When descent emits tracked child files, they replace the parent gitlink row. In Uncommitted, those
files are only child `HEAD -> worktree` changes. If there is no tracked child owner and the checked
child commit differs from the parent record, the nearest gitlink remains as one compact
`--submodule=short` row. In Committed, child files compare the configured branch to checked child
`HEAD`; when that patch is unavailable, fallback first renders a compact parent gitlink change, then
climbs outward. A parent gitlink committed between the root comparison endpoints remains visible as
one compact row when the child branch has no file diff. The canonical-path visited set still
prevents cycles. Results are deduplicated and sorted by full display path before rendering.

The root repository keeps its existing ordinary-file pipeline. The recursive comparator returns
which root gitlinks were successfully expanded so those exact root rows can be removed without
suppressing unrelated root files.

### Discovery and rendering arguments

Discovery and rendering continue to use different ignore modes:

1. `git diff --name-status` and `git diff --numstat` use
   `--ignore-submodules=dirty`.
2. A previously discovered path is rendered with
   `git diff --submodule=diff --ignore-submodules=none`.

`dirty` exposes recorded gitlink changes even when `.gitmodules` says `ignore = all`, but does not
invent a parent-root row for child-only worktree dirt. `none` expands an already-owned gitlink range
through the initialized child checkout. Neither command mutates repository configuration.

### Request-local structural cache

The recursive walk shares a request-local cache for:

- configured-and-initialized child paths and branch metadata by canonical repository path;
- gitlink object lookup by canonical repository path, commit, and child path;
- checked-out child `HEAD` by canonical child path;
- current parent branch names used by the special submodule branch `.`.

The cache stores promises so concurrent requests inside the same walk coalesce. It is discarded at
the end of `getCheckoutDiff`; repository state is never cached across calls. This prevents the same
`.gitmodules`, `rev-parse`, or `ls-tree` query from being issued repeatedly at adjacent recursion
levels while avoiding stale results.

### One output-admission budget per mode

The per-file limit remains 1 MB. Uncommitted diffs retain a 2 MB total limit because they refresh on
every edit; committed diffs use a 20 MB total limit so long-lived branches do not turn every file
after the first 2 MB into a `too_large` placeholder. Each mode's total limit is an explicit contract
for both raw and structured output.

A request-local accumulator admits complete patch chunks in deterministic path order. Every root
tracked file, recursive tracked file, and untracked file uses the same remaining-byte count:

- a patch over the per-file limit is `too_large`;
- a patch that fits the per-file limit but not the remaining total budget is also `too_large`;
- only an admitted complete patch is parsed into full structured hunks;
- rejected patches receive a hunk-free `too_large` placeholder and a best-effort omission comment
  through the same raw-text cap.

Recursive tracked fallback groups are resolved sequentially rather than all being buffered with
`Promise.all`. Every group is resolved even when no budget remains so successful-empty paths
disappear and the nearest fallback keeps ownership. Zero remaining bytes still admits no complete
patch or structured hunks, and buffering stays bounded to one outer fallback group. Binary
placeholders, whitespace filtering, and deterministic ordering retain their existing semantics.

This intentionally tightens the historical behavior, which capped only `diffText` while allowing
structured hunks to continue growing. The response schema is unchanged; only oversized entries
become bounded placeholders consistently.

### Missing submodule data

Only initialized child worktrees are expanded. A missing checkout, failed Git command, unavailable
branch object, or cycle must not make the parent diff fail. An unresolved configured branch falls
back to child `HEAD`; an unavailable patch retains the nearest compact gitlink when one changed.
Paseo never runs `submodule update`, fetches an object, or writes `.gitmodules` or local Git config
while reading a diff.

## Compatibility

This is a daemon-only correction to existing checkout-diff behavior. The response already carries
parent-relative file paths, optional `submodulePath`, and `too_large` placeholders. The app already
groups and renders these shapes, so no protocol or UI compatibility gate is required.

## Testing

Keep all existing real-Git regressions and add eight architecture regressions:

1. **Configured branch at HEAD:** leave parent gitlinks stale while the configured remote-tracking
   refs equal each child HEAD; assert Committed contains no child files.
2. **Missing branch fallback:** omit `submodule.*.branch`, advance and then record a child gitlink,
   and assert only the compact parent pointer appears in Committed.
3. **Mixed child state:** keep the configured branch behind a child commit, modify the child
   worktree again, and assert the two patches are split between Committed and Uncommitted.
4. **Committed deep recursion:** configure a branch at each initialized level and assert direct and
   leaf commits ahead of those branches are both visible.
5. **New submodule at branch HEAD:** add an initialized nested submodule whose configured branches
   equal their HEADs and assert only the compact parent pointer is emitted.
6. **Shared recursive budget:** create four submodule file patches below 1 MB each but above 2 MB in
   aggregate; assert only budget-admitted files have hunks and the remainder are `too_large`.
7. **Structural command cache:** inspect Git command metrics for a nested comparison and assert no
   identical `.gitmodules`, `rev-parse`, or `ls-tree` structural lookup is repeated.
8. **Large committed aggregate:** create several individually valid committed patches above 2 MB in
   aggregate and assert they remain fully displayable under the committed 20 MB budget.

Each regression must be observed failing before production changes and passing afterward. Run only
`packages/server/src/utils/checkout-git.test.ts`, using the clean Git environment documented in the
task report when local git-ai tracing causes teardown-only failures. Then run repository formatting,
typecheck, lint, formatting verification, and `git diff --check`.

## Acceptance criteria

- A child commit appears under **Committed** only when its HEAD differs from the configured branch,
  including with `ignore = all`; Uncommitted contains only the child worktree patch and any compact
  unrecorded parent pointer.
- A configured remote-tracking ref equal to child HEAD yields no child files even when the parent
  gitlink is far behind.
- A missing or unresolved branch uses `HEAD -> HEAD` and never expands stale parent history.
- A child file modified again after its commit appears only as `HEAD -> worktree` content under
  **Uncommitted**, while the committed portion remains under **Committed**.
- Committed comparisons recurse through every initialized nested level.
- A newly added initialized submodule at its configured branch HEAD stays compact rather than
  exposing its complete direct and nested trees.
- Direct ancestor files and deeper gitlink files each have one full parent-relative path and the
  nearest full `submodulePath`.
- Traversal does not depend on untracked-file collection.
- Missing data retains the nearest gitlink fallback without initialization, fetching, or mutation.
- The 1 MB per-file limit and the mode-specific total limits (2 MB uncommitted, 20 MB committed)
  govern both raw patches and structured hunks across root, recursive, tracked, and untracked paths.
- Structural Git queries are request-cached and recursion remains cycle-safe.
- Normal files, whitespace filtering, binaries, unborn repositories, and existing path grouping
  retain their behavior.
- No app or protocol change is introduced.
