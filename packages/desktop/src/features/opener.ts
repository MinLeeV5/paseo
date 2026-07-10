import { shell, ipcMain } from "electron";

const ALLOWED_EXTERNAL_URL_PROTOCOLS = new Set(["http:", "https:"]);
const LOCAL_HTML_FILE_EXTENSIONS = [".html", ".htm"] as const;

function isAllowedFileUrl(url: URL): boolean {
  if (url.protocol !== "file:") {
    return false;
  }
  const pathname = url.pathname.toLowerCase();
  return LOCAL_HTML_FILE_EXTENSIONS.some((extension) => pathname.endsWith(extension));
}

export function isAllowedExternalUrl(value: unknown): value is string {
  if (typeof value !== "string") {
    return false;
  }

  try {
    const url = new URL(value);
    return ALLOWED_EXTERNAL_URL_PROTOCOLS.has(url.protocol) || isAllowedFileUrl(url);
  } catch {
    return false;
  }
}

export function registerOpenerHandlers(): void {
  ipcMain.handle("paseo:opener:openUrl", async (_event, url: unknown) => {
    if (!isAllowedExternalUrl(url)) {
      throw new Error("Unsupported external URL");
    }
    await shell.openExternal(url);
  });
}
