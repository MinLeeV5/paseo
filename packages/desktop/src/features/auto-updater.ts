import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { app, autoUpdater as electronAutoUpdater } from "electron";
import { UUID } from "builder-util-runtime";
import { autoUpdater } from "electron-updater";
import {
  createAppUpdateService,
  type AppUpdateCheckResult,
  type AppUpdateDownloadError,
  type AppUpdateDownloadProgress,
  type AppUpdateInstallResult,
  type AppUpdateRuntime,
  type AppUpdateRuntimeConfiguration,
  type RuntimeUpdateCheckResult,
  type RuntimeUpdateInfo,
  type RuntimeUpdateProgress,
} from "./app-update-service.js";
import { createAppUpdateStateStore, type AppUpdateStateStore } from "./app-update-state.js";
import {
  bucketFromStagingUserId,
  rolloutManifestSchema,
  shouldAdmitAppUpdate,
  type AppReleaseChannel,
  type AppUpdateCheckIntent,
} from "./app-update-rollout.js";

export {
  bucketFromStagingUserId,
  rolloutManifestSchema,
  shouldAdmitAppUpdate,
  type AppReleaseChannel,
  type AppUpdateCheckIntent,
  type AppUpdateCheckResult,
  type AppUpdateInstallResult,
};

export const DESKTOP_APP_UPDATE_EVENT = "desktop-app-update";

export type DesktopAppUpdateEvent =
  | { type: "available"; version: string }
  | ({ type: "progress" } & AppUpdateDownloadProgress)
  | { type: "downloaded"; version: string }
  | ({ type: "error" } & AppUpdateDownloadError);

type DesktopAppUpdateEventListener = (event: DesktopAppUpdateEvent) => void;
const desktopAppUpdateEventListeners = new Set<DesktopAppUpdateEventListener>();

export function subscribeToDesktopAppUpdateEvents(
  listener: DesktopAppUpdateEventListener,
): () => void {
  desktopAppUpdateEventListeners.add(listener);
  return () => {
    desktopAppUpdateEventListeners.delete(listener);
  };
}

function emitDesktopAppUpdateEvent(event: DesktopAppUpdateEvent): void {
  for (const listener of desktopAppUpdateEventListeners) {
    listener(event);
  }
}

let cachedStagingUserIdPromise: Promise<string> | null = null;

const UPDATE_CHANNEL_NOT_PUBLISHED_CODE = "ERR_UPDATER_CHANNEL_FILE_NOT_FOUND";
const UPDATE_INSTALL_HANDOFF_TIMEOUT_MS = 15_000;
const DIRECT_MAC_UPDATE_MODE = "direct";

const MAC_DIRECT_UPDATE_WORKER_SCRIPT = String.raw`
"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn, spawnSync } = require("node:child_process");

const [parentPid, zipPath, appPath, userDataPath, executableName] = process.argv.slice(1);
const logPath = path.join(userDataPath, "mac-update.log");
const backupPath = appPath + ".paseo-update-backup";

function writeLog(message) {
  try {
    fs.appendFileSync(
      logPath,
      new Date().toISOString() + " " + message + String.fromCharCode(10),
    );
  } catch {}
}

function isRunning(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error && error.code === "EPERM";
  }
}

function waitForParentExit(pid) {
  const deadline = Date.now() + 60_000;
  const signal = new Int32Array(new SharedArrayBuffer(4));
  while (isRunning(pid)) {
    if (Date.now() >= deadline) {
      throw new Error("The previous Paseo process did not exit before the update timeout.");
    }
    Atomics.wait(signal, 0, 0, 100);
  }
}

function run(command, args) {
  const result = spawnSync(command, args, { encoding: "utf8" });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const output = String(result.stderr || result.stdout || "").trim();
    throw new Error(command + " failed" + (output ? ": " + output : ""));
  }
}

function isPermissionError(error) {
  return error && (error.code === "EACCES" || error.code === "EPERM");
}

function shellQuote(value) {
  return "'" + value.replaceAll("'", "'\\''") + "'";
}

function appleScriptQuote(value) {
  return JSON.stringify(value);
}

function replaceBundleWithPrivileges(nextApp) {
  const current = shellQuote(appPath);
  const backup = shellQuote(backupPath);
  const source = shellQuote(nextApp);
  const target = [
    "/bin/rm -rf " + backup,
    "/bin/mv " + current + " " + backup,
    "/usr/bin/ditto --rsrc --extattr " + source + " " + current,
    "/bin/rm -rf " + backup,
  ].join(" && ");
  const rollback = "/bin/rm -rf " + current + " && /bin/mv " + backup + " " + current;
  const command = "(" + target + ") || (" + rollback + "; exit 1)";
  const script = "do shell script " + appleScriptQuote(command) + " with administrator privileges";
  run("/usr/bin/osascript", ["-e", script]);
}

function replaceBundle(nextApp) {
  if (fs.existsSync(backupPath)) {
    if (!fs.existsSync(appPath)) fs.renameSync(backupPath, appPath);
    else fs.rmSync(backupPath, { recursive: true, force: true });
  }

  let moved = false;
  try {
    fs.renameSync(appPath, backupPath);
    moved = true;
    run("/usr/bin/ditto", ["--rsrc", "--extattr", nextApp, appPath]);
    fs.rmSync(backupPath, { recursive: true, force: true });
  } catch (error) {
    if (moved && !fs.existsSync(appPath) && fs.existsSync(backupPath)) {
      fs.renameSync(backupPath, appPath);
    }
    if (!isPermissionError(error)) throw error;
    replaceBundleWithPrivileges(nextApp);
  }
}

function main() {
  if (!parentPid || !zipPath || !appPath || !userDataPath || !executableName) {
    throw new Error("The direct macOS updater received incomplete arguments.");
  }
  if (!fs.existsSync(zipPath)) throw new Error("The downloaded update ZIP no longer exists.");
  if (!appPath.endsWith(".app")) throw new Error("The running application path is not a macOS app bundle.");

  writeLog("Starting direct update from " + zipPath);
  waitForParentExit(Number(parentPid));

  const extractionPath = fs.mkdtempSync(path.join(os.tmpdir(), "paseo-mac-update-"));
  try {
    run("/usr/bin/ditto", ["-x", "-k", zipPath, extractionPath]);
    const appBundles = fs
      .readdirSync(extractionPath, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && entry.name.endsWith(".app"));
    if (appBundles.length !== 1) {
      throw new Error("The downloaded update ZIP does not contain exactly one app bundle.");
    }
    const nextApp = path.join(extractionPath, appBundles[0].name);
    if (appBundles[0].name !== path.basename(appPath)) {
      throw new Error("The downloaded update is for a different application.");
    }
    if (!fs.existsSync(path.join(nextApp, "Contents", "MacOS", executableName))) {
      throw new Error("The downloaded update is missing its application executable.");
    }

    replaceBundle(nextApp);
    writeLog("Installed direct macOS update at " + appPath);
    const relaunch = spawn("/usr/bin/open", ["--background", appPath], {
      detached: true,
      stdio: "ignore",
    });
    relaunch.unref();
  } finally {
    fs.rmSync(extractionPath, { recursive: true, force: true });
  }
}

try {
  main();
} catch (error) {
  writeLog("Direct macOS update failed: " + String(error && error.stack ? error.stack : error));
  process.exitCode = 1;
}
`;

interface DownloadedUpdateHelperLike {
  file?: string | null;
}

interface ElectronUpdaterInternals {
  downloadedUpdateHelper?: DownloadedUpdateHelperLike | null;
  getOrCreateDownloadHelper?: () => Promise<DownloadedUpdateHelperLike>;
}

let appUpdateStateStore: AppUpdateStateStore | null = null;

function getAppUpdateStateStore(): AppUpdateStateStore {
  appUpdateStateStore ??= createAppUpdateStateStore({
    userDataPath: app.getPath("userData"),
  });
  return appUpdateStateStore;
}

function isUpdateChannelNotPublished(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === UPDATE_CHANNEL_NOT_PUBLISHED_CODE
  );
}

export function shouldAdmitToRollout(args: {
  channel: AppReleaseChannel;
  rolloutHours: number | undefined;
  releaseDate: string | undefined;
  now: number;
  bucket: number;
}): boolean {
  return shouldAdmitAppUpdate({ ...args, intent: "automatic" });
}

export async function resolveStagingUserId(filePath: string): Promise<string> {
  try {
    const id = (await readFile(filePath, "utf8")).trim();
    if (UUID.check(id)) {
      return id;
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      console.warn(`[auto-updater] Couldn't read staging user ID, creating a blank one: ${error}`);
    }
  }

  const id = UUID.v5(randomBytes(4096), UUID.OID);

  try {
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, id);
  } catch (error) {
    console.warn(`[auto-updater] Couldn't write out staging user ID: ${error}`);
  }

  return id;
}

export function getStagingUserId(): Promise<string> {
  if (cachedStagingUserIdPromise == null) {
    cachedStagingUserIdPromise = resolveStagingUserId(
      path.join(app.getPath("userData"), ".updaterId"),
    );
  }
  return cachedStagingUserIdPromise;
}

export function shouldInstallAppUpdateOnQuit(input: {
  platform: NodeJS.Platform;
  isAppImage: boolean;
}): boolean {
  // AppImage's no-relaunch install path blocks while launching the replacement
  // binary, which can hang after the running file has already been replaced.
  return !(input.platform === "linux" && input.isAppImage);
}

export function shouldUseAppQuitHandoff(input: {
  platform: NodeJS.Platform;
  isForceRunAfter: boolean;
}): boolean {
  // MacUpdater calls app.quit() for a no-relaunch install instead of emitting
  // Electron's before-quit-for-update event.
  return input.platform === "darwin" && !input.isForceRunAfter;
}

export function shouldUseDirectMacUpdate(input: {
  platform: NodeJS.Platform;
  updateMode: unknown;
}): boolean {
  return input.platform === "darwin" && input.updateMode === DIRECT_MAC_UPDATE_MODE;
}

async function resolveDownloadedUpdatePath(): Promise<string> {
  const updater = autoUpdater as unknown as ElectronUpdaterInternals;
  let helper = updater.downloadedUpdateHelper ?? null;
  if (!helper && updater.getOrCreateDownloadHelper) {
    helper = await updater.getOrCreateDownloadHelper();
  }

  if (!helper?.file) {
    // A download restored from a previous launch is only hydrated into the
    // updater helper when electron-updater validates it during downloadUpdate.
    await autoUpdater.downloadUpdate();
    helper = updater.downloadedUpdateHelper ?? null;
  }

  const updatePath = helper?.file;
  if (!updatePath) {
    throw new Error("The downloaded macOS update ZIP is not available.");
  }
  return updatePath;
}

async function handoffToDirectMacInstaller(): Promise<void> {
  const updatePath = await resolveDownloadedUpdatePath();
  const appPath = path.resolve(process.execPath, "..", "..", "..");
  if (!appPath.endsWith(".app")) {
    throw new Error(`Cannot resolve the packaged macOS app bundle from ${process.execPath}.`);
  }

  const worker = spawn(
    process.execPath,
    [
      "-e",
      MAC_DIRECT_UPDATE_WORKER_SCRIPT,
      "--",
      String(process.pid),
      updatePath,
      appPath,
      app.getPath("userData"),
      path.basename(process.execPath),
    ],
    {
      detached: true,
      env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
      stdio: "ignore",
    },
  );
  worker.unref();
}

class ElectronAppUpdateRuntime implements AppUpdateRuntime {
  private configured = false;

  configure(input: AppUpdateRuntimeConfiguration): void {
    autoUpdater.autoDownload = true;
    autoUpdater.autoRunAppAfterInstall = true;
    // Paseo revalidates the current manifest before explicitly installing on quit.
    // Electron's built-in handler would install an older download without checking
    // whether a newer release has superseded it.
    autoUpdater.autoInstallOnAppQuit = false;
    autoUpdater.allowPrerelease = input.releaseChannel === "beta";
    autoUpdater.channel = input.releaseChannel === "beta" ? "beta" : "latest";
    autoUpdater.allowDowngrade = false;
    autoUpdater.isUserWithinRollout = async (info) => {
      try {
        return await input.shouldAdmitUpdate(info as RuntimeUpdateInfo);
      } catch {
        return true;
      }
    };

    if (this.configured) return;
    this.configured = true;

    // electron-updater logs every emitted error before consumers can classify it.
    // Paseo reports genuine check, runtime, and install failures through the
    // callbacks below, so leave internal error logging disabled to avoid both
    // duplicate logs and expected missing-channel noise.
    const updaterLogger = autoUpdater.logger;
    autoUpdater.logger = {
      debug: updaterLogger?.debug ? (message) => updaterLogger.debug?.(message) : undefined,
      error: () => undefined,
      info: (message) => updaterLogger?.info(message),
      warn: (message) => updaterLogger?.warn(message),
    };

    autoUpdater.on("update-available", (info) => {
      input.onUpdateAvailable(info as RuntimeUpdateInfo);
    });
    autoUpdater.on("download-progress", (progress) => {
      input.onDownloadProgress(progress as RuntimeUpdateProgress);
    });
    autoUpdater.on("update-downloaded", (info) => {
      input.onUpdateDownloaded(info as RuntimeUpdateInfo);
    });
    autoUpdater.on("update-not-available", () => {
      input.onUpdateNotAvailable();
    });
    autoUpdater.on("error", (error) => {
      if (isUpdateChannelNotPublished(error)) return;
      input.onError(error);
    });
  }

  async checkForUpdates(): Promise<RuntimeUpdateCheckResult | null> {
    try {
      const result = await autoUpdater.checkForUpdates();
      if (!result) return null;
      return {
        isUpdateAvailable: result.isUpdateAvailable,
        updateInfo: result.updateInfo as RuntimeUpdateInfo,
      };
    } catch (error) {
      if (isUpdateChannelNotPublished(error)) return null;
      throw error;
    }
  }

  downloadUpdate(): Promise<unknown> {
    return autoUpdater.downloadUpdate();
  }

  quitAndInstall(
    isSilent: boolean,
    isForceRunAfter: boolean,
    updateInfo?: RuntimeUpdateInfo,
  ): Promise<void> {
    autoUpdater.autoRunAppAfterInstall = isForceRunAfter;
    return new Promise((resolve, reject) => {
      let settled = false;
      const usesAppQuitHandoff = shouldUseAppQuitHandoff({
        platform: process.platform,
        isForceRunAfter,
      });
      const usesDirectMacUpdate = shouldUseDirectMacUpdate({
        platform: process.platform,
        updateMode: updateInfo?.paseoMacUpdateMode,
      });
      const timeout = setTimeout(() => {
        settle(new Error("Update installer did not take over before the timeout."));
      }, UPDATE_INSTALL_HANDOFF_TIMEOUT_MS);

      const settle = (error?: Error): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        electronAutoUpdater.removeListener("before-quit-for-update", onHandoff);
        app.removeListener("before-quit", onHandoff);
        autoUpdater.removeListener("error", onError);
        if (error) {
          reject(error);
          return;
        }
        resolve();
      };
      const onHandoff = (): void => settle();
      const onError = (error: Error): void => settle(error);

      if (usesDirectMacUpdate) {
        electronAutoUpdater.once("before-quit-for-update", onHandoff);
      } else if (usesAppQuitHandoff) {
        app.once("before-quit", onHandoff);
      } else {
        electronAutoUpdater.once("before-quit-for-update", onHandoff);
      }
      autoUpdater.once("error", onError);
      if (usesDirectMacUpdate) {
        void handoffToDirectMacInstaller()
          .then(() => {
            electronAutoUpdater.emit("before-quit-for-update");
            app.quit();
            return undefined;
          })
          .catch((error: unknown) => {
            settle(error instanceof Error ? error : new Error(String(error)));
          });
        return;
      }

      try {
        autoUpdater.quitAndInstall(isSilent, isForceRunAfter);
      } catch (error) {
        settle(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }
}

const appUpdateService = createAppUpdateService({
  runtime: new ElectronAppUpdateRuntime(),
  isPackaged: () => app.isPackaged,
  now: () => Date.now(),
  bucket: async () => bucketFromStagingUserId(await getStagingUserId()),
  downloadedUpdateStore: {
    load: async () => getAppUpdateStateStore().load(),
    save: async (state) => getAppUpdateStateStore().save(state),
    clear: async () => getAppUpdateStateStore().clear(),
  },
  reportCheckError: (error) => {
    console.error("[auto-updater] Failed to check for updates:", error);
  },
  reportRuntimeError: (error) => {
    console.error("[auto-updater] Updater event failed:", error);
  },
  reportInstallError: (message) => {
    console.error("[auto-updater] Failed to download/install update:", message);
  },
  onUpdateAvailable: (info) => {
    emitDesktopAppUpdateEvent({ type: "available", version: info.version });
  },
  onUpdateProgress: (progress) => {
    emitDesktopAppUpdateEvent({ type: "progress", ...progress });
  },
  onUpdateDownloaded: (info) => {
    emitDesktopAppUpdateEvent({ type: "downloaded", version: info.version });
  },
  onUpdateError: (error) => {
    emitDesktopAppUpdateEvent({ type: "error", ...error });
  },
});

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function checkForAppUpdate({
  currentVersion,
  releaseChannel,
  intent,
}: {
  currentVersion: string;
  releaseChannel: AppReleaseChannel;
  intent: AppUpdateCheckIntent;
}): Promise<AppUpdateCheckResult> {
  return appUpdateService.checkForAppUpdate({ currentVersion, releaseChannel, intent });
}

export async function downloadAndInstallUpdate(
  {
    currentVersion,
    releaseChannel,
  }: {
    currentVersion: string;
    releaseChannel: AppReleaseChannel;
  },
  onBeforeQuit?: (updateInfo: RuntimeUpdateInfo) => Promise<void>,
): Promise<AppUpdateInstallResult> {
  return appUpdateService.downloadAndInstallUpdate(
    { currentVersion, releaseChannel },
    onBeforeQuit,
  );
}

export async function installAppUpdateOnQuit({
  currentVersion,
  releaseChannel,
  signal,
}: {
  currentVersion: string;
  releaseChannel: AppReleaseChannel;
  signal: AbortSignal;
}): Promise<boolean> {
  if (
    !shouldInstallAppUpdateOnQuit({
      platform: process.platform,
      isAppImage: Boolean(process.env.APPIMAGE),
    })
  ) {
    return false;
  }

  return appUpdateService.installUpdateOnQuit({ currentVersion, releaseChannel, signal });
}
