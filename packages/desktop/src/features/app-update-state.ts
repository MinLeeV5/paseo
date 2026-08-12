import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import type { AppReleaseChannel } from "./app-update-rollout.js";

export interface DownloadedAppUpdateState {
  version: string;
  releaseChannel: AppReleaseChannel;
}

export interface AppUpdateStateStore {
  load(): Promise<DownloadedAppUpdateState | null>;
  save(state: DownloadedAppUpdateState): Promise<void>;
  clear(): Promise<void>;
}

const APP_UPDATE_STATE_FILENAME = "downloaded-app-update.json";

function parseDownloadedAppUpdateState(value: unknown): DownloadedAppUpdateState | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  if (typeof record.version !== "string" || record.version.trim().length === 0) {
    return null;
  }
  if (record.releaseChannel !== "stable" && record.releaseChannel !== "beta") {
    return null;
  }

  return {
    version: record.version,
    releaseChannel: record.releaseChannel,
  };
}

export function createAppUpdateStateStore({
  userDataPath,
}: {
  userDataPath: string;
}): AppUpdateStateStore {
  const filePath = path.join(userDataPath, APP_UPDATE_STATE_FILENAME);
  let writeQueue: Promise<void> = Promise.resolve();

  function queueWrite(operation: () => Promise<void>): Promise<void> {
    const queued = writeQueue.then(operation, operation);
    writeQueue = queued.catch(() => undefined);
    return queued;
  }

  return {
    async load(): Promise<DownloadedAppUpdateState | null> {
      let raw: string;
      try {
        raw = await readFile(filePath, "utf8");
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
          return null;
        }
        throw error;
      }

      try {
        return parseDownloadedAppUpdateState(JSON.parse(raw));
      } catch {
        return null;
      }
    },

    async save(state: DownloadedAppUpdateState): Promise<void> {
      await queueWrite(async () => {
        await mkdir(userDataPath, { recursive: true });
        const tempFilePath = `${filePath}.tmp.${process.pid}.${randomUUID()}`;
        await writeFile(tempFilePath, `${JSON.stringify(state)}\n`, "utf8");
        await rename(tempFilePath, filePath);
      });
    },

    async clear(): Promise<void> {
      await queueWrite(async () => {
        await rm(filePath, { force: true });
      });
    },
  };
}
