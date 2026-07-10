# Codex Usage Request-Local Proxy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `CodexQuotaProvider` read proxy settings from the active Codex home's `.env` file and apply them only to Codex usage-related HTTP requests.

**Architecture:** Keep proxy resolution private to `packages/server/src/services/quota-fetcher/providers/codex.ts`, matching the provider ownership contract in `docs/providers.md`. Parse the Codex-home `.env` without mutating `process.env`, attach a request-local Undici `ProxyAgent` through the Node fetch `dispatcher` extension, reuse it across the usage/auth-refresh flow, and close it after response consumption.

**Tech Stack:** TypeScript, Node.js fetch/Undici, dotenv, Vitest, npm workspaces.

## Global Constraints

- Read `${CODEX_HOME}/.env`, falling back to `~/.codex/.env` when `CODEX_HOME` is unset.
- Recognize `HTTPS_PROXY` first and `HTTP_PROXY` as a fallback.
- Apply proxying only to `CodexQuotaProvider`, including its usage request and OAuth token refresh.
- Never mutate `process.env` or Node's global dispatcher.
- Missing `.env` or missing proxy keys preserves direct networking.
- Invalid configured proxy values fail explicitly without attempting a direct request.
- Never log proxy credentials or complete proxy URLs.
- Preserve the existing 15-second provider HTTP timeout.
- Do not change the WebSocket protocol, client UI, other provider fetchers, or agent subprocesses.
- Run only the changed quota-fetcher test file; never run the full local test suite.

## File Structure

- Modify `packages/server/src/services/quota-fetcher/providers/codex.ts`: private proxy configuration parsing, request-local dispatcher creation, request wiring, and dispatcher lifecycle.
- Modify `packages/server/src/services/quota-fetcher/service.test.ts`: observable proxy routing, fallback, validation, refresh, isolation, and lifecycle coverage.
- Modify `packages/server/package.json`: declare Undici as a direct runtime dependency.
- Modify `package-lock.json`: record the server workspace dependency.

---

### Task 1: Route the Codex usage request through `HTTPS_PROXY`

**Files:**

- Modify: `packages/server/src/services/quota-fetcher/service.test.ts`
- Modify: `packages/server/src/services/quota-fetcher/providers/codex.ts`
- Modify: `packages/server/package.json`
- Modify: `package-lock.json`

**Interfaces:**

- Consumes: `<codexHome>/.env`, existing `ProviderApiFetch`, and `fetchProviderApi()`.
- Produces: private `CodexProxyDispatcher`, `CodexProxyAgentFactory`, and `readCodexProxyUrl()` behavior inside `codex.ts`; the only exported provider symbol remains `CodexQuotaProvider`.

- [ ] **Step 1: Write a failing test for request-local HTTPS proxy routing**

Add a test helper near the existing Codex helpers in `service.test.ts`:

```ts
function createTestProxyDispatcher() {
  const dispatcher = {
    dispatch: vi.fn(),
    close: vi.fn(async () => {}),
  };
  const createProxyAgent = vi.fn(() => dispatcher as never);
  return { dispatcher, createProxyAgent };
}
```

Add this test beside the existing Codex usage tests:

```ts
it("routes Codex usage through HTTPS_PROXY from the Codex home", async () => {
  writeCodexAuth(codexHome, "at_codex_valid");
  writeFileSync(join(codexHome, ".env"), 'HTTPS_PROXY="http://127.0.0.1:7897"\n');
  const { dispatcher, createProxyAgent } = createTestProxyDispatcher();
  fetchApi = mockFetch(
    new Map([
      ["https://chatgpt.com/backend-api/wham/usage", () => jsonResponse(makeCodexResponse())],
    ]),
  );

  const provider = new CodexQuotaProvider({
    logger: createLogger(),
    codexHome,
    fetch: fetchApi,
    createProxyAgent,
  });

  await expect(provider.fetchUsage()).resolves.toMatchObject({ status: "available" });
  expect(createProxyAgent).toHaveBeenCalledWith("http://127.0.0.1:7897/");
  expect(fetchApi).toHaveBeenCalledWith(
    "https://chatgpt.com/backend-api/wham/usage",
    expect.objectContaining({ dispatcher }),
  );
  expect(dispatcher.close).toHaveBeenCalledOnce();
});
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```bash
npx vitest run packages/server/src/services/quota-fetcher/service.test.ts \
  -t "routes Codex usage through HTTPS_PROXY" --bail=1
```

Expected: FAIL because `CodexQuotaProvider` ignores `createProxyAgent` and the Codex-home `.env`, so the factory and request dispatcher assertions are unmet.

- [ ] **Step 3: Declare Undici as a direct server dependency**

Run:

```bash
npm install undici@^7.24.8 --workspace packages/server
```

Expected: `packages/server/package.json` gains `"undici": "^7.24.8"` and `package-lock.json` records it under the server workspace without replacing unrelated dependency versions.

- [ ] **Step 4: Implement the minimal HTTPS proxy path**

In `codex.ts`, add imports and private types:

```ts
import { parse as parseDotenv } from "dotenv";
import { ProxyAgent, type Dispatcher } from "undici";

type CodexProxyDispatcher = Dispatcher & { close(): Promise<void> };
type CodexProxyAgentFactory = (proxyUrl: string) => CodexProxyDispatcher;
type RequestInitWithDispatcher = RequestInit & { dispatcher?: Dispatcher };
```

Extend `CodexQuotaProviderOptions` and the class fields:

```ts
interface CodexQuotaProviderOptions {
  logger: Logger;
  codexHome?: string;
  fetch?: ProviderApiFetch;
  createProxyAgent?: CodexProxyAgentFactory;
}

private readonly createProxyAgent: CodexProxyAgentFactory;
```

Initialize the factory without changing global networking:

```ts
this.createProxyAgent = options.createProxyAgent ?? ((proxyUrl) => new ProxyAgent(proxyUrl));
```

Add the initial private resolver, treating a missing file as direct networking:

```ts
private async readCodexProxyUrl(): Promise<string | null> {
  const envPath = join(this.codexHome, ".env");
  let content: string;
  try {
    content = await fs.readFile(envPath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
  const value = parseDotenv(content)["HTTPS_PROXY"]?.trim();
  if (!value) return null;
  return new URL(value).toString();
}
```

Resolve one dispatcher per `fetchUsage()` call, pass it only to `callCodexApi()`, and close it after the successful response has been consumed:

```ts
const proxyUrl = await this.readCodexProxyUrl();
const dispatcher = proxyUrl ? this.createProxyAgent(proxyUrl) : null;
let resp = await this.callCodexApi(accessToken, account_id, dispatcher ?? undefined);
if (resp === "NEEDS_AUTH") {
  if (!refresh_token) return unavailableUsage(this);
  const refreshed = await this.refreshCodexToken(refresh_token);
  if (!refreshed?.access_token) return unavailableUsage(this);
  await this.saveCodexAuth(authRecord.path, auth, refreshed);
  resp = await this.callCodexApi(refreshed.access_token, account_id, dispatcher ?? undefined);
  if (resp === "NEEDS_AUTH") return unavailableUsage(this);
}
const usage = this.toUsage(resp);
if (dispatcher) await dispatcher.close();
return usage;
```

Extend `callCodexApi()` with an optional dispatcher and attach it to the request only when present:

```ts
const requestInit: RequestInitWithDispatcher = { headers };
if (dispatcher) requestInit.dispatcher = dispatcher;
const res = await fetchProviderApi(
  this.fetchApi,
  "https://chatgpt.com/backend-api/wham/usage",
  requestInit,
);
```

- [ ] **Step 5: Run the focused test and verify GREEN**

Run the command from Step 2 again.

Expected: PASS with one request carrying the fake dispatcher and one `close()` call.

- [ ] **Step 6: Commit the HTTPS proxy slice**

```bash
git add packages/server/src/services/quota-fetcher/providers/codex.ts \
  packages/server/src/services/quota-fetcher/service.test.ts \
  packages/server/package.json package-lock.json
git commit -m "feat(server): proxy Codex usage from Codex env"
```

---

### Task 2: Add fallback and explicit proxy validation

**Files:**

- Modify: `packages/server/src/services/quota-fetcher/service.test.ts`
- Modify: `packages/server/src/services/quota-fetcher/providers/codex.ts`

**Interfaces:**

- Consumes: Task 1's private `readCodexProxyUrl()` and `createProxyAgent` seam.
- Produces: deterministic `HTTPS_PROXY` precedence, `HTTP_PROXY` fallback, and explicit safe validation errors.

- [ ] **Step 1: Write failing tests for HTTP fallback and invalid configuration**

Add these tests:

```ts
it("falls back to HTTP_PROXY for Codex usage", async () => {
  writeCodexAuth(codexHome, "at_codex_valid");
  writeFileSync(join(codexHome, ".env"), "HTTP_PROXY=http://127.0.0.1:7897\n");
  const { createProxyAgent } = createTestProxyDispatcher();
  fetchApi = mockFetch(
    new Map([
      ["https://chatgpt.com/backend-api/wham/usage", () => jsonResponse(makeCodexResponse())],
    ]),
  );

  const provider = new CodexQuotaProvider({
    logger: createLogger(),
    codexHome,
    fetch: fetchApi,
    createProxyAgent,
  });

  await provider.fetchUsage();
  expect(createProxyAgent).toHaveBeenCalledWith("http://127.0.0.1:7897/");
});

it("prefers HTTPS_PROXY over HTTP_PROXY for Codex usage", async () => {
  writeCodexAuth(codexHome, "at_codex_valid");
  writeFileSync(
    join(codexHome, ".env"),
    "HTTP_PROXY=http://127.0.0.1:7000\nHTTPS_PROXY=http://127.0.0.1:7897\n",
  );
  const { createProxyAgent } = createTestProxyDispatcher();
  fetchApi = mockFetch(
    new Map([
      ["https://chatgpt.com/backend-api/wham/usage", () => jsonResponse(makeCodexResponse())],
    ]),
  );

  const provider = new CodexQuotaProvider({
    logger: createLogger(),
    codexHome,
    fetch: fetchApi,
    createProxyAgent,
  });

  await provider.fetchUsage();
  expect(createProxyAgent).toHaveBeenCalledWith("http://127.0.0.1:7897/");
});

it("reports an invalid Codex proxy without attempting a direct request", async () => {
  writeCodexAuth(codexHome, "at_codex_valid");
  writeFileSync(join(codexHome, ".env"), "HTTPS_PROXY=ftp://proxy.example\n");
  const fetchSpy = vi.fn() as never;
  const provider = new CodexQuotaProvider({
    logger: createLogger(),
    codexHome,
    fetch: fetchSpy,
  });

  await expect(provider.fetchUsage()).rejects.toThrow("Codex proxy URL must use http: or https:");
  expect(fetchSpy).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run the new tests and verify RED**

Run:

```bash
npx vitest run packages/server/src/services/quota-fetcher/service.test.ts \
  -t "HTTP_PROXY|prefers HTTPS_PROXY|invalid Codex proxy" --bail=1
```

Expected: the HTTP fallback test fails because Task 1 reads only `HTTPS_PROXY`; the invalid protocol test fails because `ftp:` is not rejected explicitly.

- [ ] **Step 3: Implement fallback and safe validation**

Replace the value selection and URL parsing in `readCodexProxyUrl()` with:

```ts
const parsed = parseDotenv(content);
const value = parsed["HTTPS_PROXY"]?.trim() || parsed["HTTP_PROXY"]?.trim();
if (!value) return null;

let proxyUrl: URL;
try {
  proxyUrl = new URL(value);
} catch {
  throw new Error("Codex proxy URL is invalid");
}
if (proxyUrl.protocol !== "http:" && proxyUrl.protocol !== "https:") {
  throw new Error("Codex proxy URL must use http: or https:");
}
return proxyUrl.toString();
```

Keep error messages free of the configured URL so credentials cannot enter logs or UI errors.

- [ ] **Step 4: Verify missing configuration still uses direct fetch**

Add this regression assertion to the existing `fetches Codex windows and coerces string credit balances` test:

```ts
expect(fetchApi).toHaveBeenCalledWith(
  "https://chatgpt.com/backend-api/wham/usage",
  expect.not.objectContaining({ dispatcher: expect.anything() }),
);
```

Run:

```bash
npx vitest run packages/server/src/services/quota-fetcher/service.test.ts \
  -t "Codex windows|HTTP_PROXY|prefers HTTPS_PROXY|invalid Codex proxy" --bail=1
```

Expected: PASS for HTTPS precedence, HTTP fallback, invalid URL rejection, and direct networking without `.env`.

- [ ] **Step 5: Commit proxy resolution behavior**

```bash
git add packages/server/src/services/quota-fetcher/providers/codex.ts \
  packages/server/src/services/quota-fetcher/service.test.ts
git commit -m "fix(server): validate Codex usage proxy config"
```

---

### Task 3: Reuse and close the dispatcher across auth refresh and failures

**Files:**

- Modify: `packages/server/src/services/quota-fetcher/service.test.ts`
- Modify: `packages/server/src/services/quota-fetcher/providers/codex.ts`

**Interfaces:**

- Consumes: Task 1's request-local dispatcher and Task 2's validated proxy URL.
- Produces: one dispatcher per fresh Codex usage fetch, reused for usage and OAuth requests and always closed in `finally`.

- [ ] **Step 1: Write failing refresh and failure-lifecycle tests**

Add:

```ts
it("uses one Codex proxy dispatcher across token refresh and retry", async () => {
  writeCodexAuth(codexHome, "at_codex_stale", "rt_codex_valid");
  writeFileSync(join(codexHome, ".env"), "HTTPS_PROXY=http://127.0.0.1:7897\n");
  const { dispatcher, createProxyAgent } = createTestProxyDispatcher();
  let usageCalls = 0;
  fetchApi = vi.fn(async (url: RequestInfo | URL) => {
    if (url.toString() === "https://chatgpt.com/backend-api/wham/usage") {
      usageCalls += 1;
      return usageCalls === 1
        ? new Response(null, { status: 401 })
        : jsonResponse(makeCodexResponse());
    }
    if (url.toString() === "https://auth.openai.com/oauth/token") {
      return jsonResponse({ access_token: "at_codex_fresh", refresh_token: "rt_codex_fresh" });
    }
    throw new Error(`Unmocked fetch: ${url.toString()}`);
  }) as never;

  const provider = new CodexQuotaProvider({
    logger: createLogger(),
    codexHome,
    fetch: fetchApi,
    createProxyAgent,
  });

  await expect(provider.fetchUsage()).resolves.toMatchObject({ status: "available" });
  expect(createProxyAgent).toHaveBeenCalledOnce();
  expect(fetchApi).toHaveBeenCalledTimes(3);
  for (const [, init] of vi.mocked(fetchApi).mock.calls) {
    expect(init).toEqual(expect.objectContaining({ dispatcher }));
  }
  expect(dispatcher.close).toHaveBeenCalledOnce();
});

it("closes the Codex proxy dispatcher when the usage request fails", async () => {
  writeCodexAuth(codexHome, "at_codex_valid");
  writeFileSync(join(codexHome, ".env"), "HTTPS_PROXY=http://127.0.0.1:7897\n");
  const { dispatcher, createProxyAgent } = createTestProxyDispatcher();
  fetchApi = vi.fn(async () => {
    throw new Error("proxy connection failed");
  }) as never;
  const provider = new CodexQuotaProvider({
    logger: createLogger(),
    codexHome,
    fetch: fetchApi,
    createProxyAgent,
  });

  await expect(provider.fetchUsage()).rejects.toThrow("proxy connection failed");
  expect(dispatcher.close).toHaveBeenCalledOnce();
});
```

- [ ] **Step 2: Run the lifecycle tests and verify RED**

Run:

```bash
npx vitest run packages/server/src/services/quota-fetcher/service.test.ts \
  -t "one Codex proxy dispatcher|closes the Codex proxy dispatcher" --bail=1
```

Expected: FAIL because Task 1 does not pass the dispatcher to token refresh and does not close it when a request throws.

- [ ] **Step 3: Thread the dispatcher through the complete flow and close in `finally`**

Restructure `fetchUsage()` so the existing authentication behavior is inside the dispatcher lifecycle:

```ts
const proxyUrl = await this.readCodexProxyUrl();
const dispatcher = proxyUrl ? this.createProxyAgent(proxyUrl) : null;
try {
  let resp = await this.callCodexApi(accessToken, account_id, dispatcher ?? undefined);
  if (resp === "NEEDS_AUTH") {
    if (!refresh_token) return unavailableUsage(this);
    const refreshed = await this.refreshCodexToken(refresh_token, dispatcher ?? undefined);
    if (!refreshed?.access_token) return unavailableUsage(this);
    await this.saveCodexAuth(authRecord.path, auth, refreshed);
    resp = await this.callCodexApi(refreshed.access_token, account_id, dispatcher ?? undefined);
    if (resp === "NEEDS_AUTH") return unavailableUsage(this);
  }
  return this.toUsage(resp);
} finally {
  if (dispatcher) await dispatcher.close();
}
```

Extend `refreshCodexToken()` with `dispatcher?: Dispatcher`, build a `RequestInitWithDispatcher`, and pass it to `fetchProviderApi()` exactly as `callCodexApi()` does.

- [ ] **Step 4: Run the complete quota-fetcher test file**

```bash
npx vitest run packages/server/src/services/quota-fetcher/service.test.ts --bail=1
```

Expected: all tests in the one changed file pass; no other test file is run.

- [ ] **Step 5: Commit lifecycle completion**

```bash
git add packages/server/src/services/quota-fetcher/providers/codex.ts \
  packages/server/src/services/quota-fetcher/service.test.ts
git commit -m "fix(server): close Codex usage proxy dispatcher"
```

---

### Task 4: Repository validation and real local smoke test

**Files:**

- Verify only; modify files only if a validation command exposes a defect in the scoped change.

**Interfaces:**

- Consumes: completed proxy implementation and the user's existing `~/.codex/.env`.
- Produces: fresh automated and real-request evidence without restarting the main daemon.

- [ ] **Step 1: Format all changed files**

```bash
npm run format:files -- \
  packages/server/src/services/quota-fetcher/providers/codex.ts \
  packages/server/src/services/quota-fetcher/service.test.ts \
  packages/server/package.json package-lock.json
```

Expected: formatter exits 0.

- [ ] **Step 2: Run the required static validation**

```bash
npm run typecheck
npm run lint
npm run format:check
```

Expected: all commands exit 0 with no type, lint, or formatting errors.

- [ ] **Step 3: Re-run the changed test file after formatting**

```bash
npx vitest run packages/server/src/services/quota-fetcher/service.test.ts --bail=1
```

Expected: the changed test file passes completely.

- [ ] **Step 4: Run a redacted real Codex usage smoke test**

Run the provider directly from source, using the existing Codex auth and `.env`, and print only normalized status fields:

```bash
npx tsx -e '
import pino from "pino";
import { CodexQuotaProvider } from "./packages/server/src/services/quota-fetcher/providers/codex.ts";
const provider = new CodexQuotaProvider({ logger: pino({ enabled: false }) });
const usage = await provider.fetchUsage();
console.log(JSON.stringify({
  status: usage.status,
  planLabel: usage.planLabel,
  windowIds: usage.windows.map((window) => window.id),
  hasError: Boolean(usage.error),
}));
'
```

Expected: `status` is `available`, `windowIds` contains `session` and `weekly`, and no token, email, proxy URL, or account id is printed.

- [ ] **Step 5: Confirm scope and working tree**

```bash
git diff --check
git status --short
git diff -- packages/server/src/services/quota-fetcher/providers/codex.ts \
  packages/server/src/services/quota-fetcher/service.test.ts \
  packages/server/package.json package-lock.json
```

Expected: no unrelated files changed and `git diff --check` exits 0.

- [ ] **Step 6: Commit any formatter-only follow-up if needed**

If Step 1 changed tracked files after Task 3's commit:

```bash
git add packages/server/src/services/quota-fetcher/providers/codex.ts \
  packages/server/src/services/quota-fetcher/service.test.ts \
  packages/server/package.json package-lock.json
git commit -m "chore: format Codex usage proxy changes"
```

If formatting made no changes, do not create an empty commit.
