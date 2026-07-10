# Codex Usage Request-Local Proxy Design

## Goal

Allow Paseo's Codex plan-usage fetcher to read proxy settings from the active Codex home and use them only for Codex usage-related HTTP requests. This fixes environments where direct requests to the ChatGPT usage endpoint are blocked while preserving the networking behavior of every other Paseo subsystem and provider.

## Scope

- Read `${CODEX_HOME}/.env`, falling back to `~/.codex/.env` when `CODEX_HOME` is unset.
- Recognize `HTTPS_PROXY` first and `HTTP_PROXY` as a fallback.
- Apply the resolved proxy to HTTP requests owned by `CodexQuotaProvider`, including the usage request and OAuth token refresh needed by that flow.
- Preserve direct requests when the file is absent or neither supported proxy variable is present.
- Do not modify `process.env`, Node's global dispatcher, other provider usage fetchers, agent subprocesses, or unrelated Paseo HTTP traffic.

## Architecture

`CodexQuotaProvider` remains the owner of Codex authentication, upstream API parsing, and normalization. Before starting its HTTP flow, it reads and parses the Codex-home `.env` file without exporting the values globally.

When a supported proxy URL is present, the provider creates a request-local Undici proxy dispatcher and uses it for the provider's usage and token-refresh requests. The provider consumes each response before closing the dispatcher so response bodies remain readable and connections are not leaked. When no proxy is configured, it continues to use the existing injected or global fetch implementation.

The server package will declare Undici as a direct dependency because the implementation relies on its public `ProxyAgent` and fetch dispatcher APIs. It must not depend on a transitive copy supplied by another workspace.

## Configuration Resolution

1. Resolve the Codex home from the constructor override, then `CODEX_HOME`, then `~/.codex`.
2. Read `<codexHome>/.env` immediately before a fresh Codex usage fetch.
3. Parse the file with `dotenv.parse` without mutating `process.env`.
4. Select the first non-empty value in this order: `HTTPS_PROXY`, `HTTP_PROXY`.
5. Validate the value as an `http:` or `https:` URL.

Missing files and missing proxy keys mean direct networking. A present but invalid proxy value is a configuration error and must not silently fall back to direct networking.

Reading the file for each fresh fetch allows configuration changes to take effect without restarting the daemon. The existing provider-usage service cache still controls when a fresh upstream fetch occurs.

## Data Flow

1. The app sends `provider.usage.list.request`.
2. `ProviderUsageService` invokes `CodexQuotaProvider.fetchUsage()` when its cache is cold.
3. The provider reads Codex credentials and the Codex-home `.env` file.
4. The provider creates a request-local proxy dispatcher when configured.
5. Usage and any required token-refresh requests use that dispatcher.
6. The provider validates and normalizes the upstream response into the existing protocol-neutral `ProviderUsage` shape.
7. The dispatcher is closed after response consumption.

No protocol or client changes are required.

## Error Handling and Security

- Do not log proxy credentials or complete proxy URLs.
- Report invalid proxy URLs and proxy connection failures as explicit provider usage errors.
- Keep missing `.env` and missing proxy variables non-errors for backward compatibility.
- Keep credential-file parsing and token persistence behavior unchanged.
- Do not call `setGlobalDispatcher` or copy parsed values into `process.env`.
- Preserve the existing HTTP timeout for both direct and proxied requests.

## Testing

Add focused tests in the quota-fetcher test file covering:

- A Codex-home `.env` with `HTTPS_PROXY` routes the usage request through the request-local proxy path and returns normalized usage.
- `HTTPS_PROXY` takes precedence over `HTTP_PROXY`.
- `HTTP_PROXY` works when `HTTPS_PROXY` is absent.
- A missing `.env` or missing proxy keys keeps the existing direct fetch behavior.
- An invalid configured proxy produces an explicit provider error and does not attempt a direct request.
- A proxied 401/403 token-refresh flow uses the same request-local proxy path.
- The dispatcher is closed after success and failure.
- Other provider fetchers remain unaffected.

Run only the changed quota-fetcher test file, followed by repository typecheck, lint, formatting, and formatting verification as required by the repository workflow.

## Non-Goals

- A global Paseo proxy setting.
- Proxying agent sessions, terminals, relay traffic, updates, or non-Codex providers.
- Changing the provider-usage protocol or UI.
- Replacing the ChatGPT usage endpoint with Codex app-server in this change.
- Automatically importing arbitrary variables from the Codex `.env` file.
