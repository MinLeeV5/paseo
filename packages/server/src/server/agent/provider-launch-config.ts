import { execFileSync } from "node:child_process";
import path from "node:path";
import { isCommandAvailable } from "../../utils/executable.js";
import { createExternalProcessEnv, type ProcessEnvRecord } from "../paseo-env.js";
export {
  AgentProviderRuntimeSettingsMapSchema,
  ProviderCommandSchema,
  ProviderOverrideSchema,
  ProviderOverridesSchema,
  ProviderProfileModelSchema,
  ProviderRuntimeSettingsSchema,
  type AgentProviderRuntimeSettingsMap,
  type ProviderCommand,
  type ProviderOverride,
  type ProviderOverrides,
  type ProviderProfileModel,
  type ProviderRuntimeSettings,
} from "@getpaseo/protocol/provider-config";
import {
  ProviderOverrideSchema,
  ProviderOverridesSchema,
  ProviderRuntimeSettingsSchema,
  type ProviderCommand,
  type ProviderOverride,
  type ProviderOverrides,
  type ProviderRuntimeSettings,
} from "@getpaseo/protocol/provider-config";

export interface ProviderCommandPrefix {
  command: string;
  args: string[];
}

export async function resolveProviderCommandPrefix(
  commandConfig: ProviderCommand | undefined,
  resolveDefaultCommand: () => string | Promise<string>,
): Promise<ProviderCommandPrefix> {
  if (!commandConfig || commandConfig.mode === "default") {
    return {
      command: await resolveDefaultCommand(),
      args: [],
    };
  }

  if (commandConfig.mode === "append") {
    return {
      command: await resolveDefaultCommand(),
      args: [...(commandConfig.args ?? [])],
    };
  }

  return {
    command: commandConfig.argv[0],
    args: commandConfig.argv.slice(1),
  };
}

let cachedShellEnv: Record<string, string> | null = null;

export function resolveShellEnv(): Record<string, string> {
  if (cachedShellEnv) {
    return cachedShellEnv;
  }
  cachedShellEnv = { ...process.env } as Record<string, string>;
  return cachedShellEnv;
}

export function migrateProviderSettings(
  raw: Record<string, unknown>,
  builtinProviderIds: string[],
): ProviderOverrides {
  const migrated: Record<string, ProviderOverride> = {};
  const builtinProviderIdSet = new Set(builtinProviderIds);

  for (const [providerId, value] of Object.entries(raw)) {
    const parsedNew = ProviderOverrideSchema.safeParse(value);
    if (parsedNew.success) {
      migrated[providerId] = parsedNew.data;
      continue;
    }

    const parsedOld = ProviderRuntimeSettingsSchema.safeParse(value);
    if (!parsedOld.success) {
      continue;
    }

    const nextEntry: ProviderOverride = {};
    const command = parsedOld.data.command;
    if (command?.mode === "append") {
      continue;
    }
    if (command?.mode === "replace") {
      nextEntry.command = command.argv;
    }
    if (parsedOld.data.env) {
      nextEntry.env = parsedOld.data.env;
    }
    if (!builtinProviderIdSet.has(providerId) && nextEntry.extends === undefined) {
      delete nextEntry.extends;
    }
    migrated[providerId] = nextEntry;
  }

  return ProviderOverridesSchema.parse(migrated);
}

// Env vars that indicate a running Claude Code session. If the daemon itself is
// launched from inside Claude Code (e.g. by a Paseo agent), these leak into
// child processes and cause "cannot be launched inside another session" errors.
const PARENT_SESSION_ENV_VARS = [
  "CLAUDECODE",
  "CLAUDE_CODE_ENTRYPOINT",
  "CLAUDE_CODE_SSE_PORT",
  "CLAUDE_AGENT_SDK_VERSION",
  "CLAUDE_CODE_ENABLE_SDK_FILE_CHECKPOINTING",
];

export interface ProviderEnvOptions {
  baseEnv?: ProcessEnvRecord;
  runtimeSettings?: ProviderRuntimeSettings;
  overlays?: Array<ProcessEnvRecord | undefined>;
}

export interface ProviderEnvSpec {
  baseEnv?: ProcessEnvRecord;
  envOverlay: ProcessEnvRecord;
}

function collectProviderEnvOverlays(
  runtimeSettings: ProviderRuntimeSettings | undefined,
  overlays: Array<ProcessEnvRecord | undefined>,
): ProcessEnvRecord[] {
  return [runtimeSettings?.env, ...overlays].filter(
    (overlay): overlay is ProcessEnvRecord => !!overlay,
  );
}

export function createProviderEnvSpec(options: ProviderEnvOptions = {}): ProviderEnvSpec {
  const overlays = collectProviderEnvOverlays(options.runtimeSettings, options.overlays ?? []);
  const envOverlay: ProcessEnvRecord = Object.assign({}, ...overlays);
  for (const key of PARENT_SESSION_ENV_VARS) {
    envOverlay[key] = undefined;
  }
  return {
    ...(options.baseEnv ? { baseEnv: options.baseEnv } : {}),
    envOverlay,
  };
}

export function createProviderEnv(options: ProviderEnvOptions = {}): NodeJS.ProcessEnv {
  const spec = createProviderEnvSpec(options);
  return createExternalProcessEnv(spec.baseEnv ?? process.env, spec.envOverlay);
}

export function findExecutable(name: string): string | null {
  const trimmed = name.trim();
  if (!trimmed) return null;
  if (trimmed.includes("/") || trimmed.includes("\\")) {
    try {
      const { existsSync } = require("node:fs");
      return existsSync(trimmed) ? trimmed : null;
    } catch {
      return null;
    }
  }
  try {
    const cmd = process.platform === "win32" ? "where.exe" : "which";
    const result = execFileSync(cmd, [trimmed], {
      encoding: "utf8",
      env: createProviderEnv({ baseEnv: process.env }),
      windowsHide: true,
    }).trim();
    const lines = result.split(/\r?\n/).filter((l: string) => l.trim());
    const candidate = lines.at(-1)?.trim() ?? null;
    return candidate && path.isAbsolute(candidate) ? candidate : null;
  } catch {
    return null;
  }
}

export async function isProviderCommandAvailable(
  commandConfig: ProviderCommand | undefined,
  resolveDefaultCommand: () => string | Promise<string>,
): Promise<boolean> {
  try {
    const prefix = await resolveProviderCommandPrefix(commandConfig, resolveDefaultCommand);
    return isCommandAvailable(prefix.command);
  } catch {
    return false;
  }
}
