import { existsSync, promises as fs } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { parse as parseDotenv } from "dotenv";
import type { Logger } from "pino";
import { ProxyAgent, type Dispatcher } from "undici";
import { z } from "zod";
import type {
  ProviderUsage,
  ProviderUsageBalance,
  ProviderUsageWindow,
} from "../../../server/messages.js";
import type { ProviderApiFetch, ProviderUsageFetcher } from "../provider.js";
import {
  ApiNumberSchema,
  balanceToneFromRemaining,
  fetchProviderApi,
  unavailableUsage,
  windowFromUsedPct,
} from "../usage.js";

const CODEX_CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann";

const CodexAuthSchema = z.object({
  tokens: z
    .object({
      access_token: z.string().optional(),
      refresh_token: z.string().optional(),
      account_id: z.string().optional(),
    })
    .optional(),
});

const CodexWindowSchema = z.object({
  used_percent: ApiNumberSchema.optional(),
  reset_at: ApiNumberSchema.optional(),
});

const CodexUsageResponseSchema = z.object({
  plan_type: z.string().optional(),
  email: z.string().optional(),
  rate_limit: z
    .object({
      primary_window: CodexWindowSchema.nullish(),
      secondary_window: CodexWindowSchema.nullish(),
    })
    .nullish(),
  code_review_rate_limit: z
    .object({
      primary_window: CodexWindowSchema.nullish(),
    })
    .nullish(),
  credits: z
    .object({
      has_credits: z.boolean().optional(),
      unlimited: z.boolean().optional(),
      balance: ApiNumberSchema.optional(),
    })
    .nullish(),
});

const CodexTokenRefreshSchema = z.object({
  access_token: z.string().optional(),
  refresh_token: z.string().optional(),
});

type CodexAuth = z.infer<typeof CodexAuthSchema>;
type CodexWindow = z.infer<typeof CodexWindowSchema>;
type CodexUsageResponse = z.infer<typeof CodexUsageResponseSchema>;
type CodexTokenRefresh = z.infer<typeof CodexTokenRefreshSchema>;

interface CodexAuthRecord {
  auth: CodexAuth;
  path: string;
}

type CodexProxyDispatcher = Dispatcher & { close(): Promise<void> };
type CodexProxyAgentFactory = (proxyUrl: string) => CodexProxyDispatcher;
type RequestInitWithDispatcher = RequestInit & { dispatcher?: Dispatcher };

interface CodexQuotaProviderOptions {
  logger: Logger;
  codexHome?: string;
  fetch?: ProviderApiFetch;
  createProxyAgent?: CodexProxyAgentFactory;
}

function codexWindow(
  window: CodexWindow | null | undefined,
): { usedPct: number; resetsAt: string | null } | null {
  if (!window) return null;
  return {
    usedPct: window.used_percent ?? 0,
    resetsAt: window.reset_at != null ? new Date(window.reset_at * 1000).toISOString() : null,
  };
}

export class CodexQuotaProvider implements ProviderUsageFetcher {
  readonly providerId = "codex";
  readonly displayName = "Codex";

  private readonly codexHome: string;
  private readonly fetchApi: ProviderApiFetch;
  private readonly createProxyAgent: CodexProxyAgentFactory;

  constructor(options: CodexQuotaProviderOptions) {
    this.codexHome = options.codexHome || process.env["CODEX_HOME"] || join(homedir(), ".codex");
    this.fetchApi = options.fetch ?? fetch;
    this.createProxyAgent = options.createProxyAgent ?? ((proxyUrl) => new ProxyAgent(proxyUrl));
  }

  async fetchUsage(): Promise<ProviderUsage> {
    const authRecord = await this.readCodexAuth();
    const auth = authRecord?.auth;
    const accessToken = auth?.tokens?.access_token;
    if (!authRecord || !auth || !accessToken) {
      return unavailableUsage(this);
    }

    const { refresh_token, account_id } = auth.tokens ?? {};
    const proxyUrl = await this.readCodexProxyUrl();
    const dispatcher = proxyUrl ? this.createProxyAgent(proxyUrl) : null;
    try {
      let resp = await this.callCodexApi(accessToken, account_id, dispatcher ?? undefined);

      if (resp === "NEEDS_AUTH") {
        if (!refresh_token) {
          return unavailableUsage(this);
        }
        const refreshed = await this.refreshCodexToken(refresh_token, dispatcher ?? undefined);
        if (!refreshed?.access_token) {
          return unavailableUsage(this);
        }

        await this.saveCodexAuth(authRecord.path, auth, refreshed);
        resp = await this.callCodexApi(refreshed.access_token, account_id, dispatcher ?? undefined);
        if (resp === "NEEDS_AUTH") {
          return unavailableUsage(this);
        }
      }

      return this.toUsage(resp);
    } finally {
      if (dispatcher) await dispatcher.close();
    }
  }

  private toUsage(resp: CodexUsageResponse): ProviderUsage {
    const session = codexWindow(resp.rate_limit?.primary_window);
    const weekly = codexWindow(resp.rate_limit?.secondary_window);
    const codeReview = codexWindow(resp.code_review_rate_limit?.primary_window);
    const windows: ProviderUsageWindow[] = [];

    if (session) {
      windows.push(
        windowFromUsedPct({
          id: "session",
          label: "Session",
          utilizationPct: session.usedPct,
          resetsAt: session.resetsAt,
          tone: "ok",
        }),
      );
    }
    if (weekly) {
      windows.push(
        windowFromUsedPct({
          id: "weekly",
          label: "Weekly",
          utilizationPct: weekly.usedPct,
          resetsAt: weekly.resetsAt,
          tone: weekly.usedPct >= 70 ? "warning" : "ok",
        }),
      );
    }
    if (codeReview) {
      windows.push(
        windowFromUsedPct({
          id: "code_review",
          label: "Code review",
          utilizationPct: codeReview.usedPct,
          resetsAt: codeReview.resetsAt,
          tone: codeReview.usedPct >= 70 ? "warning" : "ok",
        }),
      );
    }

    const balances: ProviderUsageBalance[] = [];
    if (resp.credits?.balance !== undefined) {
      balances.push({
        id: "credits",
        label: "Credits",
        remaining: resp.credits.balance,
        unit: "usd",
        tone: balanceToneFromRemaining(resp.credits.balance),
      });
    }

    return {
      providerId: this.providerId,
      displayName: this.displayName,
      status: "available",
      planLabel: resp.plan_type ?? null,
      windows,
      balances,
      details: [],
      error: null,
    };
  }

  private async readCodexAuth(): Promise<CodexAuthRecord | null> {
    const candidates = [
      ...(process.env["CODEX_HOME"] ? [join(process.env["CODEX_HOME"], "auth.json")] : []),
      join(homedir(), ".config", "codex", "auth.json"),
      join(this.codexHome, "auth.json"),
    ];
    for (const path of candidates) {
      if (!existsSync(path)) continue;
      try {
        const auth = CodexAuthSchema.parse(JSON.parse(await fs.readFile(path, "utf8")));
        if (auth.tokens?.access_token) return { auth, path };
      } catch {
        continue;
      }
    }
    return null;
  }

  private async readCodexProxyUrl(): Promise<string | null> {
    const envPath = join(this.codexHome, ".env");
    let content: string;
    try {
      content = await fs.readFile(envPath, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
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
  }

  private async callCodexApi(
    token: string,
    accountId?: string,
    dispatcher?: Dispatcher,
  ): Promise<CodexUsageResponse | "NEEDS_AUTH"> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
    };
    if (accountId) headers["ChatGPT-Account-Id"] = accountId;

    const requestInit: RequestInitWithDispatcher = { headers };
    if (dispatcher) requestInit.dispatcher = dispatcher;
    const res = await fetchProviderApi(
      this.fetchApi,
      "https://chatgpt.com/backend-api/wham/usage",
      requestInit,
    );
    if (res.status === 401 || res.status === 403) return "NEEDS_AUTH";
    if (!res.ok) throw new Error(`Codex usage API returned ${res.status}`);
    const text = await res.text();
    if (text.trim().startsWith("<")) return "NEEDS_AUTH";
    return CodexUsageResponseSchema.parse(JSON.parse(text));
  }

  private async refreshCodexToken(
    refreshToken: string,
    dispatcher?: Dispatcher,
  ): Promise<CodexTokenRefresh | null> {
    const params = new URLSearchParams({
      grant_type: "refresh_token",
      client_id: CODEX_CLIENT_ID,
      refresh_token: refreshToken,
    });
    const requestInit: RequestInitWithDispatcher = {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    };
    if (dispatcher) requestInit.dispatcher = dispatcher;
    const res = await fetchProviderApi(
      this.fetchApi,
      "https://auth.openai.com/oauth/token",
      requestInit,
    );
    if (!res.ok) return null;
    return CodexTokenRefreshSchema.parse(await res.json());
  }

  private async saveCodexAuth(
    authPath: string,
    original: CodexAuth,
    refreshed: CodexTokenRefresh,
  ): Promise<void> {
    try {
      const updated: CodexAuth = {
        ...original,
        tokens: {
          ...original.tokens,
          access_token: refreshed.access_token ?? original.tokens?.access_token,
          refresh_token: refreshed.refresh_token ?? original.tokens?.refresh_token,
        },
      };
      await fs.writeFile(authPath, JSON.stringify(updated, null, 2), { mode: 0o600 });
    } catch {
      // Non-fatal; the next call can refresh again.
    }
  }
}
