import type { QueryClient } from "@tanstack/react-query";
import { z } from "zod";

export const CHANGES_PREFERENCES_STORAGE_KEY = "@paseo:changes-preferences";
export const LEGACY_WRAP_LINES_STORAGE_KEY = "diff-wrap-lines";
export const CHANGES_PREFERENCES_QUERY_KEY = ["changes-preferences"];

const changesPreferencesSchema = z.object({
  layout: z.enum(["unified", "split"]).optional(),
  fileGrouping: z.enum(["flat", "directory", "submodule"]).optional(),
  // COMPAT(changesViewMode): added in v1.1.111, remove after 2027-01-17.
  viewMode: z.enum(["flat", "tree"]).optional(),
  wrapLines: z.boolean().optional(),
  hideWhitespace: z.boolean().optional(),
  commitsCollapsed: z.boolean().optional(),
  sessionDiffMode: z.enum(["working_tree", "session"]).optional(),
});

export interface ChangesPreferences {
  layout: "unified" | "split";
  fileGrouping: "flat" | "directory" | "submodule";
  wrapLines: boolean;
  hideWhitespace: boolean;
  commitsCollapsed: boolean;
  sessionDiffMode: "working_tree" | "session";
}

export const DEFAULT_CHANGES_PREFERENCES: ChangesPreferences = {
  layout: "unified",
  fileGrouping: "flat",
  wrapLines: false,
  hideWhitespace: false,
  commitsCollapsed: true,
  sessionDiffMode: "working_tree",
};

export interface KeyValueStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

async function loadLegacyWrapLinesPreference(storage: KeyValueStorage): Promise<boolean | null> {
  const legacyValue = await storage.getItem(LEGACY_WRAP_LINES_STORAGE_KEY);
  if (legacyValue === "true") {
    return true;
  }
  if (legacyValue === "false") {
    return false;
  }
  return null;
}

export async function loadChangesPreferencesFromStorage(
  storage: KeyValueStorage,
): Promise<ChangesPreferences> {
  const stored = await storage.getItem(CHANGES_PREFERENCES_STORAGE_KEY);
  if (stored) {
    const parsed = changesPreferencesSchema.safeParse(JSON.parse(stored));
    if (parsed.success) {
      const { viewMode, ...storedPreferences } = parsed.data;
      const next = {
        ...DEFAULT_CHANGES_PREFERENCES,
        ...storedPreferences,
        fileGrouping:
          storedPreferences.fileGrouping ?? (viewMode === "tree" ? "directory" : "flat"),
      } satisfies ChangesPreferences;
      if (viewMode !== undefined || storedPreferences.fileGrouping === undefined) {
        await storage.setItem(CHANGES_PREFERENCES_STORAGE_KEY, JSON.stringify(next));
      }
      return next;
    }
  }

  const legacyWrapLines = await loadLegacyWrapLinesPreference(storage);
  const next = {
    ...DEFAULT_CHANGES_PREFERENCES,
    ...(legacyWrapLines !== null ? { wrapLines: legacyWrapLines } : {}),
  } satisfies ChangesPreferences;
  await storage.setItem(CHANGES_PREFERENCES_STORAGE_KEY, JSON.stringify(next));
  return next;
}

export async function saveChangesPreferences(input: {
  queryClient: QueryClient;
  updates: Partial<ChangesPreferences>;
  storage: KeyValueStorage;
}): Promise<void> {
  const prev =
    input.queryClient.getQueryData<ChangesPreferences>(CHANGES_PREFERENCES_QUERY_KEY) ??
    DEFAULT_CHANGES_PREFERENCES;
  const next = { ...prev, ...input.updates };
  input.queryClient.setQueryData<ChangesPreferences>(CHANGES_PREFERENCES_QUERY_KEY, next);
  await input.storage.setItem(CHANGES_PREFERENCES_STORAGE_KEY, JSON.stringify(next));
}
