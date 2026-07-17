# Submodule Committed Diff Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep committed child changes visible through the existing Uncommitted/Committed switch when a submodule is configured with `ignore = all`.

**Architecture:** Preserve the parent gitlink as the source of truth and make every tracked checkout-diff read explicitly override Git's submodule ignore setting. A real-repository regression test proves the same child file appears in Uncommitted before the parent gitlink commit and in Committed afterward.

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
- Produces: internal `getCheckoutDiffComparisonArgs(refs: CheckoutDiffRefs): string[]`, returning `--ignore-submodules=none` followed by the base and optional target refs.

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

- [ ] **Step 3: Apply the minimal shared argument fix**

Rename the helper and prepend the explicit override in `packages/server/src/utils/checkout-git.ts`:

```typescript
function getCheckoutDiffComparisonArgs(refs: CheckoutDiffRefs): string[] {
  return ["--ignore-submodules=none", refs.baseRef, ...(refs.targetRef ? [refs.targetRef] : [])];
}
```

Use it in each tracked checkout-diff command:

```typescript
extra: ["--name-status", ...getCheckoutDiffComparisonArgs(refs)],
```

```typescript
extra: ["--numstat", ...getCheckoutDiffComparisonArgs(refs)],
```

```typescript
extra: [
  "--submodule=diff",
  ...getCheckoutDiffComparisonArgs(input.refsForDiff),
  "--",
  input.path,
],
```

Update the exact command assertions in `packages/server/src/utils/checkout-git.test.ts`:

```typescript
expect(commands).toContain("diff --numstat --ignore-submodules=none HEAD");
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

Expected: all tests in `checkout-git.test.ts` pass, including exact command metrics, ordinary files, ignored dirty submodules, untracked child files, whitespace filtering, and size limits.

- [ ] **Step 6: Format and run repository static checks**

Run:

```bash
npm run format
npm run typecheck
npm run lint
npm run format:check
```

Expected: all four commands exit 0; lint reports no warnings or errors and format verification reports no mismatches.

- [ ] **Step 7: Commit the implementation**

```bash
git add packages/server/src/utils/checkout-git.ts packages/server/src/utils/checkout-git.test.ts
git commit -m "fix: show ignored submodule changes in committed diffs"
```
