export const DESKTOP_APP_UPDATE_EVENT = "desktop-app-update";

export type DesktopAppUpdateEvent =
  | { type: "available"; version: string }
  | {
      type: "progress";
      version: string | null;
      percent: number;
      bytesPerSecond: number;
      transferred: number;
      total: number;
    }
  | { type: "downloaded"; version: string }
  | { type: "error"; version: string | null; message: string };

export function parseDesktopAppUpdateEvent(raw: unknown): DesktopAppUpdateEvent | null {
  if (!isRecord(raw) || typeof raw.type !== "string") {
    return null;
  }

  if (raw.type === "available" || raw.type === "downloaded") {
    const version = readVersion(raw.version);
    return version ? { type: raw.type, version } : null;
  }

  if (raw.type === "progress") {
    const percent = readFiniteNumber(raw.percent);
    if (percent === null) {
      return null;
    }

    return {
      type: "progress",
      version: readVersion(raw.version),
      percent: Math.min(100, Math.max(0, percent)),
      bytesPerSecond: readFiniteNumber(raw.bytesPerSecond) ?? 0,
      transferred: readFiniteNumber(raw.transferred) ?? 0,
      total: readFiniteNumber(raw.total) ?? 0,
    };
  }

  if (raw.type === "error" && typeof raw.message === "string") {
    return {
      type: "error",
      version: readVersion(raw.version),
      message: raw.message.trim() || "Update download failed.",
    };
  }

  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readVersion(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const version = value.trim();
  return version.length > 0 ? version : null;
}

function readFiniteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
