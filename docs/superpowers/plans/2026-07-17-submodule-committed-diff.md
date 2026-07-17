# Submodule Committed Diff Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep committed child changes visible through the existing Uncommitted/Committed switch when a submodule is configured with `ignore = all`.

**Architecture:** Preserve the parent gitlink as the source of truth. Discover paths and collect
statistics with `--ignore-submodules=dirty`, then render already-discovered tracked paths with
`--ignore-submodules=none`. Real-repository regressions cover mode ownership, mixed child
commit/worktree dirt, nested ignored gitlinks, and path-specific recursive ownership based on
recorded gitlink object IDs.

**Tech Stack:** TypeScript, Node.js child processes, Git, Vitest.

## Global Constraints

- Do not add a second root-versus-submodule filter or per-submodule mode selector.
- Do not infer or compare a submodule's own base branch.
- Do not change Git status, commit, staging, mutation behavior, WebSocket schemas, feature flags, or client state.
- Do not initialize or fetch missing submodules.
- Keep the override read-only; do not write `.gitmodules` or local Git config.
- Run only `packages/server/src/utils/checkout-git.test.ts`, never a full local test suite.
- Run `npm run format`, `npm run typecheck`, and `npm run lint` before the implementation commit.

---

### Task 1: Include ignored gitlinks in checkout diffs

**Files:**

- Modify: `packages/server/src/utils/checkout-git.test.ts:416`
- Modify: `packages/server/src/utils/checkout-git.test.ts:1314`
- Modify: `packages/server/src/utils/checkout-git.ts:199`
- Modify: `packages/server/src/utils/checkout-git.ts:466`
- Modify: `packages/server/src/utils/checkout-git.ts:626`
- Modify: `packages/server/src/utils/checkout-git.ts:684`

**Interfaces:**

- Consumes: `getCheckoutDiff(cwd, { mode, baseRef?, includeStructured })` and the existing `CheckoutDiffRefs` shape `{ baseRef, targetRef?, includeUntracked }`.
- Produces: internal `getCheckoutDiffDiscoveryArgs(refs: CheckoutDiffRefs): string[]`, returning
  `--ignore-submodules=dirty` followed by the base and optional target refs, and
  `getCheckoutDiffRenderingArgs(refs: CheckoutDiffRefs): string[]`, returning
  `--ignore-submodules=none` followed by the same refs.

- [ ] **Step 1: Write the failing real-repository regression test**

Add this test after the existing ignored-submodule uncommitted test in `packages/server/src/utils/checkout-git.test.ts`:

```typescript
it("moves committed changes in ignored submodules between diff modes", async () => {
  const submoduleSource = join(tempDir, "submodule-source");
  mkdirSync(submoduleSource, { recursive: true });
  execFileSync("git", ["init", "-b", "main"], { cwd: submoduleSource });
  execFileSync("git", ["config", "user.email", "test@test.com"], { cwd: submoduleSource });
  execFileSync("git", ["config", "user.name", "Test"], { cwd: submoduleSource });
  writeFileSync(join(submoduleSource, "inner.txt"), "one\n");
  execFileSync("git", ["add", "inner.txt"], { cwd: submoduleSource });
  execFileSync("git", ["-c", "commit.gpgsign=false", "commit", "-m", "submodule initial"], {
    cwd: submoduleSource,
  });

  execFileSync(
    "git",
    ["-c", "protocol.file.allow=always", "submodule", "add", submoduleSource, "modules/sub"],
    { cwd: repoDir },
  );
  execFileSync("git", ["config", "--file", ".gitmodules", "submodule.modules/sub.ignore", "all"], {
    cwd: repoDir,
  });
  execFileSync("git", ["add", ".gitmodules", "modules/sub"], { cwd: repoDir });
  execFileSync("git", ["-c", "commit.gpgsign=false", "commit", "-m", "add submodule"], {
    cwd: repoDir,
  });
  execFileSync("git", ["checkout", "-b", "feature/submodule"], { cwd: repoDir });

  const submoduleCheckout = join(repoDir, "modules/sub");
  writeFileSync(join(submoduleCheckout, "inner.txt"), "one\ntwo\n");
  execFileSync("git", ["add", "inner.txt"], { cwd: submoduleCheckout });
  execFileSync("git", ["-c", "commit.gpgsign=false", "commit", "-m", "submodule change"], {
    cwd: submoduleCheckout,
  });

  const uncommittedBeforeParentCommit = await getCheckoutDiff(repoDir, {
    mode: "uncommitted",
    includeStructured: true,
  });
  const committedBeforeParentCommit = await getCheckoutDiff(repoDir, {
    mode: "base",
    baseRef: "main",
    includeStructured: true,
  });

  expect(
    uncommittedBeforeParentCommit.structured?.map((file) => ({
      path: file.path,
      submodulePath: file.submodulePath,
    })),
  ).toEqual([{ path: "modules/sub/inner.txt", submodulePath: "modules/sub" }]);
  expect(uncommittedBeforeParentCommit.diff).toContain("+two");
  expect(committedBeforeParentCommit.structured).toEqual([]);

  execFileSync("git", ["add", "-f", "modules/sub"], { cwd: repoDir });
  execFileSync("git", ["-c", "commit.gpgsign=false", "commit", "-m", "advance submodule"], {
    cwd: repoDir,
  });

  const uncommittedAfterParentCommit = await getCheckoutDiff(repoDir, {
    mode: "uncommitted",
    includeStructured: true,
  });
  const committedAfterParentCommit = await getCheckoutDiff(repoDir, {
    mode: "base",
    baseRef: "main",
    includeStructured: true,
  });

  expect(uncommittedAfterParentCommit.structured).toEqual([]);
  expect(
    committedAfterParentCommit.structured?.map((file) => ({
      path: file.path,
      submodulePath: file.submodulePath,
    })),
  ).toEqual([{ path: "modules/sub/inner.txt", submodulePath: "modules/sub" }]);
  expect(committedAfterParentCommit.diff).toContain("+two");
});
```

- [ ] **Step 2: Run the regression test and verify RED**

Run:

```bash
npx vitest run packages/server/src/utils/checkout-git.test.ts --bail=1 -t "moves committed changes in ignored submodules between diff modes"
```

Expected: FAIL at the first structured-file assertion because the current parent diff honors `ignore = all` and returns `[]`.

- [ ] **Step 3: Apply the discovery/rendering argument split**

Use separate argument helpers in `packages/server/src/utils/checkout-git.ts`:

```typescript
function getCheckoutDiffDiscoveryArgs(refs: CheckoutDiffRefs): string[] {
  return ["--ignore-submodules=dirty", refs.baseRef, ...(refs.targetRef ? [refs.targetRef] : [])];
}

function getCheckoutDiffRenderingArgs(refs: CheckoutDiffRefs): string[] {
  return ["--ignore-submodules=none", refs.baseRef, ...(refs.targetRef ? [refs.targetRef] : [])];
}
```

`dirty` deliberately includes gitlink/new-commit changes during discovery while leaving child-only
worktree dirt to the existing recursive scanner. `none` is reserved for rendering a path that was
already discovered; using it for discovery would emit a duplicate submodule-root entry.

Use the discovery helper for `--name-status` and `--numstat`:

```typescript
extra: ["--name-status", ...getCheckoutDiffDiscoveryArgs(refs)],
```

```typescript
extra: ["--numstat", ...getCheckoutDiffDiscoveryArgs(refs)],
```

Use the rendering helper for top-level per-path patches:

```typescript
extra: [
  "--submodule=diff",
  ...getCheckoutDiffRenderingArgs(input.refsForDiff),
  "--",
  input.path,
],
```

Keep the unborn-repository fallback aligned with the generated command:

```typescript
error.message.includes("--name-status --ignore-submodules=dirty HEAD");
```

Update the exact command assertions in `packages/server/src/utils/checkout-git.test.ts`:

```typescript
expect(commands).toContain("diff --numstat --ignore-submodules=dirty HEAD");
expect(commands).toContain("diff --submodule=diff --ignore-submodules=none HEAD -- generated.js");
expect(commands).toContain("diff --submodule=diff --ignore-submodules=none HEAD -- small.ts");
```

- [ ] **Step 4: Run the regression test and verify GREEN**

Run:

```bash
npx vitest run packages/server/src/utils/checkout-git.test.ts --bail=1 -t "moves committed changes in ignored submodules between diff modes"
```

Expected: PASS; the child file is in Uncommitted before the parent commit and Committed after it.

- [ ] **Step 5: Run the complete modified test file**

Run:

```bash
npx vitest run packages/server/src/utils/checkout-git.test.ts --bail=1
```

Expected: all tests in `checkout-git.test.ts` pass, including exact command metrics, ordinary files, unborn repositories, ignored dirty submodules, untracked child files without a duplicate submodule-root entry, whitespace filtering, and size limits.

- [ ] **Step 6: Format and run repository static checks**

Run:

```bash
npm run format
npm run typecheck
npm run lint
npm run format:check
git diff --check
```

Expected: all five commands exit 0; lint reports no warnings or errors and format verification reports no mismatches.

- [ ] **Step 7: Commit the implementation**

```bash
git add packages/server/src/utils/checkout-git.ts packages/server/src/utils/checkout-git.test.ts
git commit -m "fix: show ignored submodule changes in committed diffs"
```

---

### Task 2: Fix final-review rendering regressions

**Files:**

- Modify: `packages/server/src/utils/checkout-git.test.ts`
- Modify: `packages/server/src/utils/checkout-git.ts`
- Modify: `docs/superpowers/specs/2026-07-17-submodule-committed-diff-design.md`
- Modify: `docs/superpowers/plans/2026-07-17-submodule-committed-diff.md`

- [ ] **Step 1: Add both real-Git regressions and verify RED**

Add one test for ignored child commit B plus a tracked edit after B. Assert one child-file row and
patch content from both the commit and worktree. Add another test for an ignored nested submodule
commit inside an outer submodule. Assert the underlying file's full parent-relative path, full
nested `submodulePath`, and visible patch content. Run each test by name before editing production
code and confirm a behavioral failure.

- [ ] **Step 2: Render discovered paths with `none`**

Keep `--name-status` and `--numstat` on the discovery helper (`dirty`). Use the rendering helper
(`none`) in `getTrackedDiffTextForPath()`, and add `--ignore-submodules=none` to
`getSubmoduleTrackedDiffTextForPath()`.

- [ ] **Step 3: Preserve nested file ownership and duplicate prevention**

When recursive submodule rendering parses files below a discovered gitlink, emit those files rather
than a gitlink-root fallback. Preserve their full prefixed paths and use the full discovered gitlink
path as `submodulePath`. Keep one owner for each tracked path; Task 3 refines this rule so an
ancestor owns direct files without suppressing separately discovered deeper gitlinks.

- [ ] **Step 4: Verify focused and complete behavior**

Run both new tests, the unborn-HEAD and child-only untracked tests, the existing ignored-submodule
tests, and the exact-command metrics test by name. Then run
`packages/server/src/utils/checkout-git.test.ts` once in full using clean Git if local trace tooling
causes teardown-only fixture failures.

- [ ] **Step 5: Format, statically verify, document, and commit**

Run the repository formatting, typecheck, lint, formatting verification, and `git diff --check`.
Commit the scoped code, tests, design, and plan updates with a final-review fix subject.

---

### Task 3: Preserve deeper gitlinks beneath an advanced ancestor

**Files:**

- Modify: `packages/server/src/utils/checkout-git.test.ts`
- Modify: `packages/server/src/utils/checkout-git.ts`
- Modify: `docs/superpowers/specs/2026-07-17-submodule-committed-diff-design.md`
- Modify: `docs/superpowers/plans/2026-07-17-submodule-committed-diff.md`

- [ ] **Step 1: Add both real-Git ownership regressions and verify RED**

Create a `modules/mid` submodule with ignored nested `deps/leaf`. First advance `mid` for a direct
file and advance the leaf checkout without recording that pointer in `mid`. Then cover a separate
case where the new `mid` commit records both its direct file and the advanced leaf pointer. In both
cases assert exactly the `mid` direct file and underlying leaf file, with their respective full
`submodulePath` values and visible patch content. Run each test by name before production edits and
confirm the leaf file is missing.

- [ ] **Step 2: Make recursive ownership direct-file-specific**

At each initialized submodule level, classify configured nested gitlink paths separately from
direct files. A parent renderer continues to suppress duplicate direct files that it already owns,
but a nested gitlink descends into its child instead of inheriting ancestor suppression. Emit the
nearest gitlink fallback only when recursive descent produces no tracked child owner.

- [ ] **Step 3: Carry recorded gitlink comparisons through recursion**

Resolve each child object's ID from the parent base and recorded target trees. When the comparison
includes worktree state, also retain the checked-out child `HEAD` and render the combined range from
the recorded base through the worktree. Pass the derived comparison into the next recursive level
and into per-file rendering. Preserve initialized-worktree checks, the visited-set cycle guard, and
existing diff byte limits.

- [ ] **Step 4: Verify focused and complete behavior**

Run both new regressions and all prior submodule transition, mixed commit/worktree, nested ignored,
unborn, child-only tracked/untracked, and exact-command cases. Run
`packages/server/src/utils/checkout-git.test.ts` exactly once in full after formatting.

- [ ] **Step 5: Run static checks, review, and commit**

Run `npm run format`, `npm run typecheck`, `npm run lint`, `npm run format:check`, and
`git diff --check`. Confirm the patch is limited to code, tests, design, and plan, then commit with a
round-2 fix subject and append exact evidence to the ignored task report.
