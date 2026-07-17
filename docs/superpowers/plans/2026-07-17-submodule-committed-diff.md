# Recursive Submodule Diff Comparator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the legacy untracked-gated submodule scanner with an endpoint-aware recursive comparator that handles Committed diffs, newly added nested submodules, one shared output budget, and request-local structural caching.

**Architecture:** Keep the root ordinary-file pipeline, but model every recursive child comparison as `absent`, exact `commit`, or `worktree`. Always traverse initialized children, let `includeUntracked` control only untracked discovery, remove an exact parent gitlink only after a child owns tracked output, and admit every complete patch through the same 2 MB accumulator before creating structured hunks.

**Tech Stack:** TypeScript, Node.js child processes, Git, Vitest.

## Global Constraints

- Do not add a root-versus-submodule filter or per-submodule mode selector.
- Do not infer or compare a submodule's own base branch.
- Do not change Git status, commit, staging, mutation behavior, WebSocket schemas, feature flags, or client state.
- Do not initialize submodules, fetch missing objects, or write repository configuration.
- Preserve `--ignore-submodules=dirty` for discovery and `--ignore-submodules=none` for rendering.
- Preserve full parent-relative paths, nearest full `submodulePath`, binary handling, whitespace filtering, the 1 MB per-file limit, and the canonical-path cycle guard.
- Run only `packages/server/src/utils/checkout-git.test.ts`; never run a broader local test suite.
- Use the clean Git environment for Vitest so the installed git-ai trace wrapper cannot recreate `.git/ai` during fixture teardown.
- After every implementation change run `npm run typecheck` and `npm run lint`; before each commit run repository formatting and `git diff --check`.

## File Structure

- Modify `packages/server/src/utils/checkout-git.ts`: keep endpoint resolution, request-local recursive caches, recursive ownership, and the checkout-diff accumulator next to the private Git diff helpers they compose.
- Modify `packages/server/src/utils/checkout-git.test.ts`: add real-repository regressions beside the existing submodule tests and total-budget tests.
- Modify `docs/superpowers/specs/2026-07-17-submodule-committed-diff-design.md` only if implementation evidence requires a design correction; otherwise the committed design remains authoritative.

No new production module is created. The comparator relies on private `CheckoutDiffRefs`, `CheckoutFileChange`, Git rendering helpers, and diff-highlighter callbacks already housed in `checkout-git.ts`; exporting those primitives solely to split the file would enlarge the public surface without creating an independently reusable unit.

---

### Task 1: Endpoint-aware recursion and structural caching

**Files:**

- Modify: `packages/server/src/utils/checkout-git.test.ts:219-275`
- Modify: `packages/server/src/utils/checkout-git.test.ts:728-845`
- Modify: `packages/server/src/utils/checkout-git.ts:182-209`
- Modify: `packages/server/src/utils/checkout-git.ts:727-945`
- Modify: `packages/server/src/utils/checkout-git.ts:2812-2882`

**Interfaces:**

- Consumes: `getCheckoutDiff(cwd, { mode, baseRef?, includeStructured, ignoreWhitespace? })`, `CheckoutDiffRefs`, `listCheckoutFileChanges()`, `EMPTY_TREE_OBJECT_ID`, `listInitializedSubmodulePaths()`, and `runGitCommand()`.
- Produces: `RecursiveDiffEndpoint`, `SubmoduleDiffComparison`, `SubmoduleScanCache`, `GitlinkLookup`, `getSubmoduleComparisonDiffRefs()`, and `listSubmoduleFileChanges()` returning `{ tracked, untracked, expandedSubmodulePaths }`.
- Invariant: a successful empty `ls-tree` is `absent`; a failed lookup is `unavailable`; only the latter stops descent and keeps the nearest gitlink fallback.

- [ ] **Step 1: Add the Committed deep-recursion regression**

Add this test after `expands a nested gitlink recorded by an advanced ancestor commit`:

```typescript
it("recurses through committed nested submodule changes", async () => {
  const { midCheckout, leafCheckout } = setupNestedIgnoredSubmoduleFixture({
    tempDir,
    repoDir,
  });
  execFileSync("git", ["checkout", "-b", "feature/committed-submodules"], { cwd: repoDir });

  writeFileSync(join(leafCheckout, "leaf.txt"), "leaf-one\nleaf-two\n");
  execFileSync("git", ["add", "leaf.txt"], { cwd: leafCheckout });
  execFileSync("git", ["-c", "commit.gpgsign=false", "commit", "-m", "advance leaf"], {
    cwd: leafCheckout,
  });
  writeFileSync(join(midCheckout, "mid.txt"), "mid-one\nmid-two\n");
  execFileSync("git", ["add", "mid.txt"], { cwd: midCheckout });
  execFileSync("git", ["add", "-f", "deps/leaf"], { cwd: midCheckout });
  execFileSync("git", ["-c", "commit.gpgsign=false", "commit", "-m", "advance mid and leaf"], {
    cwd: midCheckout,
  });
  execFileSync("git", ["add", "-f", "modules/mid"], { cwd: repoDir });
  execFileSync("git", ["-c", "commit.gpgsign=false", "commit", "-m", "record nested changes"], {
    cwd: repoDir,
  });

  const diff = await getCheckoutDiff(repoDir, {
    mode: "base",
    baseRef: "main",
    includeStructured: true,
  });

  expect(
    diff.structured
      ?.filter((file) => file.path.endsWith("mid.txt") || file.path.endsWith("leaf.txt"))
      .map((file) => ({ path: file.path, submodulePath: file.submodulePath }))
      .sort((a, b) => a.path.localeCompare(b.path)),
  ).toEqual([
    {
      path: "modules/mid/deps/leaf/leaf.txt",
      submodulePath: "modules/mid/deps/leaf",
    },
    { path: "modules/mid/mid.txt", submodulePath: "modules/mid" },
  ]);
  expect(diff.diff).toContain("+leaf-two");
  expect(diff.diff).toContain("+mid-two");
});
```

- [ ] **Step 2: Run the Committed regression and verify RED**

Run:

```bash
PATH=/Users/min/.nvm/versions/node/v22.22.0/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin GIT_CONFIG_GLOBAL=/dev/null npx vitest run packages/server/src/utils/checkout-git.test.ts --bail=1 -t "recurses through committed nested submodule changes"
```

Expected: FAIL because the result contains the outer direct file but omits
`modules/mid/deps/leaf/leaf.txt`; `includeUntracked: false` currently prevents recursive scanning.

- [ ] **Step 3: Add the absent-old-endpoint regression**

Add this test immediately after the Committed regression:

```typescript
it("expands a newly added initialized submodule from an absent endpoint", async () => {
  execFileSync("git", ["checkout", "-b", "feature/new-nested-submodule"], { cwd: repoDir });
  setupNestedIgnoredSubmoduleFixture({ tempDir, repoDir });

  const diff = await getCheckoutDiff(repoDir, {
    mode: "base",
    baseRef: "main",
    includeStructured: true,
  });
  const targetFiles = diff.structured
    ?.filter((file) => file.path.endsWith("mid.txt") || file.path.endsWith("leaf.txt"))
    .map((file) => ({ path: file.path, submodulePath: file.submodulePath }))
    .sort((a, b) => a.path.localeCompare(b.path));

  expect(targetFiles).toEqual([
    {
      path: "modules/mid/deps/leaf/leaf.txt",
      submodulePath: "modules/mid/deps/leaf",
    },
    { path: "modules/mid/mid.txt", submodulePath: "modules/mid" },
  ]);
  expect(diff.diff).toContain("+leaf-one");
  expect(diff.diff).toContain("+mid-one");
});
```

- [ ] **Step 4: Run the absent-endpoint regression and verify RED**

Run:

```bash
PATH=/Users/min/.nvm/versions/node/v22.22.0/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin GIT_CONFIG_GLOBAL=/dev/null npx vitest run packages/server/src/utils/checkout-git.test.ts --bail=1 -t "expands a newly added initialized submodule from an absent endpoint"
```

Expected: FAIL because the old outer gitlink resolves to `null`, falls back to the current child
`HEAD`, and therefore produces no recursive direct or nested additions.

- [ ] **Step 5: Add the request-local structural-cache regression**

Add this test immediately after the absent-endpoint regression:

```typescript
it("does not repeat structural submodule queries within one recursive diff", async () => {
  const { midCheckout, leafCheckout } = setupNestedIgnoredSubmoduleFixture({
    tempDir,
    repoDir,
  });
  writeFileSync(join(midCheckout, "mid.txt"), "mid-one\nmid-two\n");
  writeFileSync(join(leafCheckout, "leaf.txt"), "leaf-one\nleaf-two\n");

  startGitCommandMetrics();
  const diff = await getCheckoutDiff(repoDir, {
    mode: "uncommitted",
    includeStructured: true,
  });
  const metrics = stopGitCommandMetrics();
  const structuralKeys = metrics.commands
    .filter(({ args }) => {
      const isGitmodulesRead =
        args[0] === "config" && args[1] === "--file" && args[2] === ".gitmodules";
      const isInitializedCheck = args[0] === "rev-parse" && args[1] === "--is-inside-work-tree";
      return isGitmodulesRead || isInitializedCheck || args[0] === "ls-tree";
    })
    .map(({ cwd, args }) => `${cwd}\0${args.join("\0")}`);
  const duplicates = structuralKeys.filter((key, index) => structuralKeys.indexOf(key) !== index);

  expect(diff.diff).toContain("+mid-two");
  expect(diff.diff).toContain("+leaf-two");
  expect(duplicates).toEqual([]);
});
```

- [ ] **Step 6: Run the structural-cache regression and verify RED**

Run:

```bash
PATH=/Users/min/.nvm/versions/node/v22.22.0/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin GIT_CONFIG_GLOBAL=/dev/null npx vitest run packages/server/src/utils/checkout-git.test.ts --bail=1 -t "does not repeat structural submodule queries within one recursive diff"
```

Expected: FAIL with at least the nested repository's identical `.gitmodules` read repeated by the
parent classification and recursive call.

- [ ] **Step 7: Replace fallback refs with explicit endpoint and lookup result types**

Replace `SubmoduleDiffComparison` and add the cache/result types beside it:

```typescript
type RecursiveDiffEndpoint =
  | { kind: "absent" }
  | { kind: "commit"; ref: string }
  | {
      kind: "worktree";
      recordedCommit: string | null;
      headCommit: string | null;
    };

interface SubmoduleDiffComparison {
  oldEndpoint: RecursiveDiffEndpoint;
  newEndpoint: RecursiveDiffEndpoint;
  includeUntracked: boolean;
}

type GitlinkLookup =
  | { kind: "present"; objectId: string }
  | { kind: "absent" }
  | { kind: "unavailable" };

interface SubmoduleScanCache {
  initializedPaths: Map<string, Promise<string[]>>;
  gitlinks: Map<string, Promise<GitlinkLookup>>;
  headObjectIds: Map<string, Promise<string | null>>;
}

function createSubmoduleScanCache(): SubmoduleScanCache {
  return {
    initializedPaths: new Map(),
    gitlinks: new Map(),
    headObjectIds: new Map(),
  };
}
```

Change `SubmoduleFileChanges` to expose exact immediate-child ownership:

```typescript
interface SubmoduleFileChanges {
  tracked: SubmoduleTrackedFileChange[];
  untracked: CheckoutFileChange[];
  expandedSubmodulePaths: Set<string>;
}
```

- [ ] **Step 8: Distinguish absent gitlinks from unavailable objects and cache structural reads**

Replace `readGitlinkObjectIdAtRef()` with a result-bearing lookup and add request-cache wrappers:

```typescript
async function readGitlinkObjectIdAtRef(
  cwd: string,
  ref: string,
  path: string,
): Promise<GitlinkLookup> {
  try {
    const result = await runGitCommand(["ls-tree", ref, "--", path], {
      cwd,
      envOverlay: READ_ONLY_GIT_ENV,
    });
    const metadata = result.stdout.split("\t", 1)[0]?.trim().split(/\s+/) ?? [];
    const [mode, type, objectId] = metadata;
    if (mode === "160000" && type === "commit" && objectId) {
      return { kind: "present", objectId };
    }
    return { kind: "absent" };
  } catch {
    return { kind: "unavailable" };
  }
}

function getCanonicalPathOrResolved(path: string): string {
  try {
    return realpathSync.native(path);
  } catch {
    return resolve(path);
  }
}

function listInitializedSubmodulePathsCached(
  cwd: string,
  cache: SubmoduleScanCache,
): Promise<string[]> {
  const key = getCanonicalPathOrResolved(cwd);
  const cached = cache.initializedPaths.get(key);
  if (cached) return cached;
  const load = listInitializedSubmodulePaths(cwd);
  cache.initializedPaths.set(key, load);
  return load;
}

function readGitlinkObjectIdAtRefCached(
  cwd: string,
  ref: string,
  path: string,
  cache: SubmoduleScanCache,
): Promise<GitlinkLookup> {
  const key = `${getCanonicalPathOrResolved(cwd)}\0${ref}\0${path}`;
  const cached = cache.gitlinks.get(key);
  if (cached) return cached;
  const load = readGitlinkObjectIdAtRef(cwd, ref, path);
  cache.gitlinks.set(key, load);
  return load;
}

function readHeadObjectIdCached(cwd: string, cache: SubmoduleScanCache): Promise<string | null> {
  const key = getCanonicalPathOrResolved(cwd);
  const cached = cache.headObjectIds.get(key);
  if (cached) return cached;
  const load = readHeadObjectId(cwd);
  cache.headObjectIds.set(key, load);
  return load;
}
```

- [ ] **Step 9: Convert endpoints to Git refs and resolve each child without `HEAD` fallback**

Replace `getSubmoduleComparisonDiffRefs()` and `resolveSubmoduleDiffComparison()` with:

```typescript
function getCommitRefForEndpoint(endpoint: RecursiveDiffEndpoint): string | null {
  switch (endpoint.kind) {
    case "absent":
      return EMPTY_TREE_OBJECT_ID;
    case "commit":
      return endpoint.ref;
    case "worktree":
      return null;
  }
}

function getSubmoduleComparisonDiffRefs(
  comparison: SubmoduleDiffComparison,
): CheckoutDiffRefs | null {
  if (comparison.oldEndpoint.kind === "worktree") return null;
  const baseRef = getCommitRefForEndpoint(comparison.oldEndpoint);
  const targetRef = getCommitRefForEndpoint(comparison.newEndpoint);
  if (!baseRef) return null;
  return {
    baseRef,
    ...(targetRef ? { targetRef } : null),
    includeUntracked: comparison.includeUntracked && comparison.newEndpoint.kind === "worktree",
  };
}

async function resolveChildEndpoint(input: {
  parentCwd: string;
  childCwd: string;
  submodulePath: string;
  endpoint: RecursiveDiffEndpoint;
  cache: SubmoduleScanCache;
}): Promise<RecursiveDiffEndpoint | null> {
  if (input.endpoint.kind === "absent") return { kind: "absent" };
  if (input.endpoint.kind === "commit") {
    const lookup = await readGitlinkObjectIdAtRefCached(
      input.parentCwd,
      input.endpoint.ref,
      input.submodulePath,
      input.cache,
    );
    if (lookup.kind === "unavailable") return null;
    return lookup.kind === "present"
      ? { kind: "commit", ref: lookup.objectId }
      : { kind: "absent" };
  }

  const [recordedLookup, headCommit] = await Promise.all([
    input.endpoint.headCommit
      ? readGitlinkObjectIdAtRefCached(
          input.parentCwd,
          input.endpoint.headCommit,
          input.submodulePath,
          input.cache,
        )
      : Promise.resolve<GitlinkLookup>({ kind: "absent" }),
    readHeadObjectIdCached(input.childCwd, input.cache),
  ]);
  if (recordedLookup.kind === "unavailable" || !headCommit) return null;
  return {
    kind: "worktree",
    recordedCommit: recordedLookup.kind === "present" ? recordedLookup.objectId : null,
    headCommit,
  };
}

async function resolveSubmoduleDiffComparison(input: {
  parentCwd: string;
  submoduleCwd: string;
  submodulePath: string;
  parentComparison: SubmoduleDiffComparison;
  cache: SubmoduleScanCache;
}): Promise<SubmoduleDiffComparison | null> {
  const [oldEndpoint, newEndpoint] = await Promise.all([
    resolveChildEndpoint({
      parentCwd: input.parentCwd,
      childCwd: input.submoduleCwd,
      submodulePath: input.submodulePath,
      endpoint: input.parentComparison.oldEndpoint,
      cache: input.cache,
    }),
    resolveChildEndpoint({
      parentCwd: input.parentCwd,
      childCwd: input.submoduleCwd,
      submodulePath: input.submodulePath,
      endpoint: input.parentComparison.newEndpoint,
      cache: input.cache,
    }),
  ]);
  if (!oldEndpoint || !newEndpoint) return null;
  return {
    oldEndpoint,
    newEndpoint,
    includeUntracked: input.parentComparison.includeUntracked,
  };
}
```

- [ ] **Step 10: Make recursive ownership exact and cache-aware**

Update `listSubmoduleFileChanges()` to accept `cache`, use cached child lists, remove
`skipTrackedSubmodulePaths`, retain exact nested fallbacks, and report successful immediate
expansion. The complete ownership skeleton is:

```typescript
async function listSubmoduleFileChanges(input: {
  cwd: string;
  displayPrefix?: string;
  ignoreWhitespace: boolean;
  comparison: SubmoduleDiffComparison;
  cache: SubmoduleScanCache;
  visited?: Set<string>;
}): Promise<SubmoduleFileChanges> {
  const {
    cwd,
    displayPrefix = "",
    ignoreWhitespace,
    comparison,
    cache,
    visited = new Set<string>(),
  } = input;
  let canonicalCwd: string;
  try {
    canonicalCwd = realpathSync.native(cwd);
  } catch {
    return { tracked: [], untracked: [], expandedSubmodulePaths: new Set() };
  }
  if (visited.has(canonicalCwd)) {
    return { tracked: [], untracked: [], expandedSubmodulePaths: new Set() };
  }
  visited.add(canonicalCwd);

  const tracked: SubmoduleTrackedFileChange[] = [];
  const untracked: CheckoutFileChange[] = [];
  const expandedSubmodulePaths = new Set<string>();
  const submodulePaths = await listInitializedSubmodulePathsCached(cwd, cache);
  for (const submodulePath of submodulePaths) {
    const submoduleCwd = resolve(cwd, submodulePath);
    const displaySubmodulePath = joinGitPath(displayPrefix, submodulePath);
    const submoduleComparison = await resolveSubmoduleDiffComparison({
      parentCwd: cwd,
      submoduleCwd,
      submodulePath,
      parentComparison: comparison,
      cache,
    });
    if (!submoduleComparison) continue;
    const refsForDiff = getSubmoduleComparisonDiffRefs(submoduleComparison);
    if (!refsForDiff) continue;

    const trackedBeforeChild = tracked.length;
    const nestedSubmodulePaths = new Set(
      await listInitializedSubmodulePathsCached(submoduleCwd, cache),
    );
    const nestedFallbacks = new Map<string, SubmoduleTrackedFileChange>();
    try {
      const childChanges = await listCheckoutFileChanges(
        submoduleCwd,
        refsForDiff,
        ignoreWhitespace,
      );
      for (const change of childChanges) {
        if (change.isUntracked) {
          untracked.push({
            path: joinGitPath(displaySubmodulePath, change.path),
            submodulePath: displaySubmodulePath,
            status: "U",
            isNew: true,
            isDeleted: false,
            isUntracked: true,
          });
        } else if (nestedSubmodulePaths.has(change.path)) {
          nestedFallbacks.set(joinGitPath(displaySubmodulePath, change.path), {
            cwd: submoduleCwd,
            displayPrefix: displaySubmodulePath,
            refsForDiff,
            change,
          });
        } else {
          tracked.push({
            cwd: submoduleCwd,
            displayPrefix: displaySubmodulePath,
            refsForDiff,
            change,
          });
        }
      }
    } catch {
      // The nearest parent gitlink remains when this child comparison is unavailable.
    }

    const nestedChanges = await listSubmoduleFileChanges({
      cwd: submoduleCwd,
      displayPrefix: displaySubmodulePath,
      ignoreWhitespace,
      comparison: submoduleComparison,
      cache,
      visited,
    });
    for (const [fallbackPath, fallback] of nestedFallbacks) {
      if (!nestedChanges.expandedSubmodulePaths.has(fallbackPath)) {
        tracked.push(fallback);
      }
    }
    tracked.push(...nestedChanges.tracked);
    untracked.push(...nestedChanges.untracked);
    if (tracked.length > trackedBeforeChild) {
      expandedSubmodulePaths.add(displaySubmodulePath);
    }
  }

  const trackedByPath = new Map(
    tracked.map((change) => [joinGitPath(change.displayPrefix, change.change.path), change]),
  );
  const untrackedByPath = new Map(untracked.map((change) => [change.path, change]));
  return {
    tracked: [...trackedByPath.values()].sort((a, b) =>
      joinGitPath(a.displayPrefix, a.change.path).localeCompare(
        joinGitPath(b.displayPrefix, b.change.path),
      ),
    ),
    untracked: [...untrackedByPath.values()].sort((a, b) => a.path.localeCompare(b.path)),
    expandedSubmodulePaths,
  };
}
```

- [ ] **Step 11: Invoke recursion in both modes and filter only expanded root gitlinks**

In `getCheckoutDiff()`, create one cache and root comparison after the unborn fallback, then call
the recursive comparator unconditionally:

```typescript
const submoduleScanCache = createSubmoduleScanCache();
const rootHead = await readHeadObjectIdCached(cwd, submoduleScanCache);
const rootComparison: SubmoduleDiffComparison = {
  oldEndpoint:
    effectiveRefsForDiff.baseRef === EMPTY_TREE_OBJECT_ID
      ? { kind: "absent" }
      : { kind: "commit", ref: effectiveRefsForDiff.baseRef },
  newEndpoint: effectiveRefsForDiff.targetRef
    ? { kind: "commit", ref: effectiveRefsForDiff.targetRef }
    : {
        kind: "worktree",
        recordedCommit: rootHead,
        headCommit: rootHead,
      },
  includeUntracked: effectiveRefsForDiff.includeUntracked,
};
const submoduleFileChanges = await listSubmoduleFileChanges({
  cwd,
  ignoreWhitespace,
  comparison: rootComparison,
  cache: submoduleScanCache,
});
const trackedChanges = changes.filter(
  (change) => !change.isUntracked && !submoduleFileChanges.expandedSubmodulePaths.has(change.path),
);
const untrackedChanges = changes.filter((change) => change.isUntracked === true);
if (effectiveRefsForDiff.includeUntracked) {
  untrackedChanges.push(...submoduleFileChanges.untracked);
  untrackedChanges.sort((a, b) => a.path.localeCompare(b.path));
}
```

Delete the `includeUntracked ? listSubmoduleFileChanges(...) : empty` gate,
`parentTrackedChangePaths`, and `skipTrackedSubmodulePaths` plumbing. Keep
`processSubmoduleTrackedChanges()` after root tracked rendering.

- [ ] **Step 12: Run all three new regressions and prior ownership regressions GREEN**

Run:

```bash
PATH=/Users/min/.nvm/versions/node/v22.22.0/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin GIT_CONFIG_GLOBAL=/dev/null npx vitest run packages/server/src/utils/checkout-git.test.ts --bail=1 -t "recurses through committed nested submodule changes|expands a newly added initialized submodule from an absent endpoint|does not repeat structural submodule queries within one recursive diff|keeps a separately advanced nested gitlink beneath an advanced ancestor|expands a nested gitlink recorded by an advanced ancestor commit"
```

Expected: PASS; both new endpoint cases expose direct and leaf files, the cache reports no exact
structural duplicates, and both prior ownership regressions remain green.

- [ ] **Step 13: Run repository static checks**

Run:

```bash
npm run format:files -- packages/server/src/utils/checkout-git.ts packages/server/src/utils/checkout-git.test.ts
npm run typecheck
npm run lint
npm run format:check
git diff --check
```

Expected: all commands exit 0; lint reports zero warnings and errors.

- [ ] **Step 14: Commit endpoint-aware recursion**

```bash
git add packages/server/src/utils/checkout-git.ts packages/server/src/utils/checkout-git.test.ts
git commit -m "fix: compare nested submodules across explicit endpoints"
```

---

### Task 2: Shared raw-and-structured output budget

**Files:**

- Modify: `packages/server/src/utils/checkout-git.test.ts:1673-1705`
- Modify: `packages/server/src/utils/checkout-git.ts:987-1062`
- Modify: `packages/server/src/utils/checkout-git.ts:2643-2700`
- Modify: `packages/server/src/utils/checkout-git.ts:2841-2951`

**Interfaces:**

- Consumes: Task 1's sorted `SubmoduleTrackedFileChange[]`, `PER_FILE_DIFF_MAX_BYTES`, `TOTAL_DIFF_MAX_BYTES`, `buildPlaceholderParsedDiffFile()`, `getSubmoduleTrackedDiffTextForPath()`, and `getUntrackedDiffText()`.
- Produces: `DiffOutputAccumulator` with `tryAppend(text): boolean`, `remainingBytes(): number`, and `getText(): string`; both recursive tracked and untracked processors receive this accumulator.
- Invariant: a structured entry contains full hunks only when its complete raw patch was admitted; otherwise it is a hunk-free `too_large` placeholder.

- [ ] **Step 1: Add the recursive aggregate-budget regression**

Add this test after `marks tracked files omitted by the total diff budget as too_large`:

```typescript
it("shares the total diff budget with recursively rendered submodule files", async () => {
  const submoduleSource = join(tempDir, "budget-submodule-source");
  mkdirSync(submoduleSource, { recursive: true });
  execFileSync("git", ["init", "-b", "main"], { cwd: submoduleSource });
  execFileSync("git", ["config", "user.email", "test@test.com"], { cwd: submoduleSource });
  execFileSync("git", ["config", "user.name", "Test"], { cwd: submoduleSource });
  for (let index = 1; index <= 4; index += 1) {
    writeFileSync(join(submoduleSource, `budget-${index}.txt`), "old\n");
  }
  execFileSync("git", ["add", "."], { cwd: submoduleSource });
  execFileSync("git", ["-c", "commit.gpgsign=false", "commit", "-m", "add budget files"], {
    cwd: submoduleSource,
  });
  execFileSync(
    "git",
    ["-c", "protocol.file.allow=always", "submodule", "add", submoduleSource, "modules/budget"],
    { cwd: repoDir },
  );
  execFileSync(
    "git",
    ["config", "--file", ".gitmodules", "submodule.modules/budget.ignore", "all"],
    { cwd: repoDir },
  );
  execFileSync("git", ["add", ".gitmodules", "modules/budget"], { cwd: repoDir });
  execFileSync("git", ["-c", "commit.gpgsign=false", "commit", "-m", "add budget submodule"], {
    cwd: repoDir,
  });

  const submoduleCheckout = join(repoDir, "modules/budget");
  const largeLine = "x".repeat(700_000);
  for (let index = 1; index <= 4; index += 1) {
    writeFileSync(join(submoduleCheckout, `budget-${index}.txt`), `${largeLine}-${index}\n`);
  }

  const diff = await getCheckoutDiff(repoDir, {
    mode: "uncommitted",
    includeStructured: true,
  });
  const recursiveFiles = diff.structured?.filter((file) =>
    file.path.startsWith("modules/budget/budget-"),
  );

  expect(
    recursiveFiles?.map((file) => ({
      path: file.path,
      status: file.status,
      hunks: file.hunks.length,
    })),
  ).toEqual([
    { path: "modules/budget/budget-1.txt", status: "ok", hunks: 1 },
    { path: "modules/budget/budget-2.txt", status: "ok", hunks: 1 },
    { path: "modules/budget/budget-3.txt", status: "too_large", hunks: 0 },
    { path: "modules/budget/budget-4.txt", status: "too_large", hunks: 0 },
  ]);
  expect(Buffer.byteLength(diff.diff, "utf8")).toBeLessThanOrEqual(2 * 1024 * 1024);
  expect(diff.diff).toContain("# modules/budget/budget-3.txt: diff too large omitted");
  expect(diff.diff).toContain("# modules/budget/budget-4.txt: diff too large omitted");
});
```

- [ ] **Step 2: Run the recursive budget regression and verify RED**

Run:

```bash
PATH=/Users/min/.nvm/versions/node/v22.22.0/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin GIT_CONFIG_GLOBAL=/dev/null npx vitest run packages/server/src/utils/checkout-git.test.ts --bail=1 -t "shares the total diff budget with recursively rendered submodule files"
```

Expected: FAIL because all four recursive files have `status: "ok"` and full hunks even though
`appendDiff()` stops the raw response at 2 MB.

- [ ] **Step 3: Add a complete-chunk output accumulator**

Add this private type and factory beside the diff size constants:

```typescript
interface DiffOutputAccumulator {
  tryAppend: (text: string) => boolean;
  remainingBytes: () => number;
  getText: () => string;
}

function createDiffOutputAccumulator(): DiffOutputAccumulator {
  let text = "";
  let bytes = 0;
  return {
    tryAppend(candidate) {
      if (!candidate) return true;
      const candidateBytes = Buffer.byteLength(candidate, "utf8");
      if (bytes + candidateBytes > TOTAL_DIFF_MAX_BYTES) return false;
      text += candidate;
      bytes += candidateBytes;
      return true;
    },
    remainingBytes: () => TOTAL_DIFF_MAX_BYTES - bytes,
    getText: () => text,
  };
}
```

In `getCheckoutDiff()`, replace `diffText`, `diffBytes`, and the partial-buffer `appendDiff()` with:

```typescript
const output = createDiffOutputAccumulator();
const appendDiff = (text: string): void => {
  output.tryAppend(text);
};
```

Return `output.getText()` as `diff`. A zero `remainingBytes()` may short-circuit output admission,
but it must not short-circuit recursive fallback-group resolution.

- [ ] **Step 4: Make recursive tracked rendering sequential and admission-aware**

Change `processSubmoduleTrackedChanges()` to receive `output: DiffOutputAccumulator`. Replace its
`Promise.all` and loop with this sequential admission flow while preserving the existing
parse/highlight mapping for accepted patches:

> **Approved implementation correction:** The initial per-path sketch below is superseded for
> recursive ownership. Group tracked changes by their outer fallback, resolve every group
> sequentially even when `remainingBytes()` is exactly zero, and then apply the admission flow to
> the resolved winners. This removes successful-empty paths and preserves the nearest fallback.
> Zero bytes admits no complete patch or structured hunks, and resolution buffers at most one outer
> fallback group.

```typescript
for (const trackedChange of trackedChanges) {
  const path = joinGitPath(trackedChange.displayPrefix, trackedChange.change.path);
  const pushTooLarge = () => {
    if (includeStructured) {
      structured.push(
        buildPlaceholderParsedDiffFile(
          {
            path,
            submodulePath: trackedChange.displayPrefix,
            status: trackedChange.change.status,
            isNew: trackedChange.change.isNew,
            isDeleted: trackedChange.change.isDeleted,
          },
          { status: "too_large", stat: null },
        ),
      );
    }
    output.tryAppend(`# ${path}: diff too large omitted\n`);
  };

  if (output.remainingBytes() === 0) {
    pushTooLarge();
    continue;
  }
  const fileDiff = await getSubmoduleTrackedDiffTextForPath({
    trackedChange,
    ignoreWhitespace,
  });
  if (fileDiff.truncated || !output.tryAppend(fileDiff.text)) {
    pushTooLarge();
    continue;
  }
  if (!includeStructured) continue;

  const parsed = await parseAndHighlightDiff(fileDiff.text, cwd);
  const nestedParsedFiles = getNestedParsedFilesForPath(parsed, fileDiff.path);
  if (nestedParsedFiles.length > 0) {
    for (const nestedFile of nestedParsedFiles) {
      structured.push({ ...nestedFile, submodulePath: fileDiff.path, status: "ok" });
    }
    continue;
  }
  const parsedFile =
    parsed[0] ??
    ({
      path: fileDiff.path,
      isNew: fileDiff.change.isNew,
      isDeleted: fileDiff.change.isDeleted,
      additions: 0,
      deletions: 0,
      hunks: [],
    } satisfies ParsedDiffFile);
  structured.push({
    ...parsedFile,
    path: fileDiff.path,
    submodulePath: fileDiff.submodulePath,
    isNew: fileDiff.change.isNew,
    isDeleted: fileDiff.change.isDeleted,
    status: "ok",
  });
}
```

Pass the same `output` instance from `getCheckoutDiff()`.

- [ ] **Step 5: Apply the same admission rule to untracked files**

Change `ProcessUntrackedChangeInput` to receive `output: DiffOutputAccumulator` instead of
`appendDiff`. Replace `processUntrackedChange()` with the complete admission-aware function:

```typescript
async function processUntrackedChange(input: ProcessUntrackedChangeInput): Promise<void> {
  const { cwd, change, ignoreWhitespace, includeStructured, structured, output } = input;
  if (output.remainingBytes() === 0) {
    if (includeStructured) {
      structured.push(buildPlaceholderParsedDiffFile(change, { status: "too_large", stat: null }));
    }
    return;
  }

  const { text, truncated, stat } = await getUntrackedDiffText(cwd, change, ignoreWhitespace);
  if (stat?.isBinary) {
    if (includeStructured) {
      structured.push(buildPlaceholderParsedDiffFile(change, { status: "binary", stat }));
    }
    output.tryAppend(`# ${change.path}: binary diff omitted\n`);
    return;
  }
  if (truncated || !output.tryAppend(text)) {
    if (includeStructured) {
      structured.push(buildPlaceholderParsedDiffFile(change, { status: "too_large", stat }));
    }
    output.tryAppend(`# ${change.path}: diff too large omitted\n`);
    return;
  }
  if (!includeStructured) return;

  const parsed = await parseAndHighlightDiff(text, cwd);
  const parsedFile =
    parsed[0] ??
    ({
      path: change.path,
      isNew: change.isNew,
      isDeleted: change.isDeleted,
      additions: stat?.additions ?? 0,
      deletions: stat?.deletions ?? 0,
      hunks: [],
    } satisfies ParsedDiffFile);
  structured.push({
    ...parsedFile,
    path: change.path,
    ...(change.submodulePath !== undefined ? { submodulePath: change.submodulePath } : null),
    isNew: change.isNew,
    isDeleted: change.isDeleted,
    status: "ok",
  });
}
```

Use this input shape:

```typescript
interface ProcessUntrackedChangeInput {
  cwd: string;
  change: CheckoutFileChange;
  ignoreWhitespace: boolean;
  includeStructured: boolean;
  structured: ParsedDiffFile[];
  output: DiffOutputAccumulator;
}
```

Pass the shared accumulator in the caller:

```typescript
for (const change of untrackedChanges) {
  if (output.remainingBytes() === 0) {
    if (compare.includeStructured) {
      structured.push(buildPlaceholderParsedDiffFile(change, { status: "too_large", stat: null }));
    }
    continue;
  }
  await processUntrackedChange({
    cwd,
    change,
    ignoreWhitespace,
    includeStructured: compare.includeStructured === true,
    structured,
    output,
  });
}
```

- [ ] **Step 6: Run focused budget tests GREEN**

Run:

```bash
PATH=/Users/min/.nvm/versions/node/v22.22.0/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin GIT_CONFIG_GLOBAL=/dev/null npx vitest run packages/server/src/utils/checkout-git.test.ts --bail=1 -t "shares the total diff budget with recursively rendered submodule files|marks tracked files omitted by the total diff budget as too_large|marks untracked oversized files as too_large|keeps small tracked files displayable when another tracked file has a massive diff"
```

Expected: PASS; recursive files 3 and 4 are hunk-free `too_large` placeholders, raw output is at
most 2 MB, and existing root/per-file behavior remains green.

- [ ] **Step 7: Run repository static checks**

Run:

```bash
npm run format:files -- packages/server/src/utils/checkout-git.ts packages/server/src/utils/checkout-git.test.ts
npm run typecheck
npm run lint
npm run format:check
git diff --check
```

Expected: all commands exit 0; lint reports zero warnings and errors.

- [ ] **Step 8: Commit the shared-budget correction**

```bash
git add packages/server/src/utils/checkout-git.ts packages/server/src/utils/checkout-git.test.ts
git commit -m "fix: bound recursive checkout diff output"
```

---

### Task 3: Integrated verification and branch review

**Files:**

- Verify: `packages/server/src/utils/checkout-git.ts`
- Verify: `packages/server/src/utils/checkout-git.test.ts`
- Verify: `docs/superpowers/specs/2026-07-17-submodule-committed-diff-design.md`
- Verify: `docs/superpowers/plans/2026-07-17-submodule-committed-diff.md`

**Interfaces:**

- Consumes: Tasks 1 and 2 plus the complete feature range from `caf1494d4` to the new branch `HEAD`.
- Produces: one clean, statically verified branch whose focused and complete checkout-git tests pass and whose final review has no Critical or Important findings.

- [ ] **Step 1: Format the complete scoped patch**

Run:

```bash
npm run format
git diff --check
```

Expected: both commands exit 0 and formatting introduces no unrelated tracked files.

- [ ] **Step 2: Run the modified test file exactly once in full**

Run:

```bash
PATH=/Users/min/.nvm/versions/node/v22.22.0/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin GIT_CONFIG_GLOBAL=/dev/null npx vitest run packages/server/src/utils/checkout-git.test.ts --bail=1
```

Expected: the complete file passes, including ordinary, unborn, ignored, mixed commit/worktree,
nested ownership, Committed recursion, absent endpoint, cache, binary, whitespace, and size-limit
cases. Do not rerun this full file after a trusted green result unless code changes.

- [ ] **Step 3: Run final repository static checks**

Run:

```bash
npm run typecheck
npm run lint
npm run format:check
git diff --check
```

Expected: all commands exit 0; lint reports zero warnings and errors and formatting reports no
mismatches.

- [ ] **Step 4: Review the complete feature range**

Review:

```bash
git diff --check caf1494d4..HEAD
git diff --stat caf1494d4..HEAD
git diff caf1494d4..HEAD -- packages/server/src/utils/checkout-git.ts packages/server/src/utils/checkout-git.test.ts docs/superpowers/specs/2026-07-17-submodule-committed-diff-design.md docs/superpowers/plans/2026-07-17-submodule-committed-diff.md
```

Required review questions:

- Can Committed recurse without enabling untracked collection?
- Can a successful missing gitlink become `absent` without masking an unavailable object?
- Does a new outer submodule recurse from the empty tree at every nested level?
- Does each tracked path have exactly one nearest owner and deterministic display path?
- Can any full structured hunk be produced for a patch rejected by the shared total budget?
- Are initialized-path, gitlink, and child-HEAD structural reads request-local and deduplicated?
- Are missing objects and uninitialized children still read-only fallbacks?

Expected: no Critical or Important finding. If review changes production code, rerun only the
affected focused tests, then repeat Steps 1-4; do not trust the prior full-file result after code
changes.

- [ ] **Step 5: Commit any final formatting or documentation-only adjustment**

If Steps 1-4 changed tracked documentation or formatting, run:

```bash
git add docs/superpowers/specs/2026-07-17-submodule-committed-diff-design.md docs/superpowers/plans/2026-07-17-submodule-committed-diff.md packages/server/src/utils/checkout-git.ts packages/server/src/utils/checkout-git.test.ts
git commit -m "docs: finalize recursive submodule diff verification"
```

If `git status --short` is already empty, do not create an empty commit.
