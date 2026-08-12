import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { createAppUpdateStateStore } from "./app-update-state";

describe("app update state", () => {
  it("persists the downloaded version and release channel across store instances", async () => {
    const userDataPath = await mkdtemp(path.join(os.tmpdir(), "paseo-app-update-state-"));

    try {
      const first = createAppUpdateStateStore({ userDataPath });
      await first.save({ version: "1.2.4", releaseChannel: "stable" });

      const raw = await readFile(path.join(userDataPath, "downloaded-app-update.json"), "utf8");
      expect(JSON.parse(raw)).toEqual({ version: "1.2.4", releaseChannel: "stable" });

      const second = createAppUpdateStateStore({ userDataPath });
      await expect(second.load()).resolves.toEqual({
        version: "1.2.4",
        releaseChannel: "stable",
      });

      await second.clear();
      await expect(first.load()).resolves.toBeNull();
    } finally {
      await rm(userDataPath, { force: true, recursive: true });
    }
  });

  it("ignores a malformed persisted state", async () => {
    const userDataPath = await mkdtemp(path.join(os.tmpdir(), "paseo-app-update-state-"));

    try {
      await writeFile(path.join(userDataPath, "downloaded-app-update.json"), "not json", "utf8");
      const store = createAppUpdateStateStore({ userDataPath });
      await expect(store.load()).resolves.toBeNull();
    } finally {
      await rm(userDataPath, { force: true, recursive: true });
    }
  });
});
