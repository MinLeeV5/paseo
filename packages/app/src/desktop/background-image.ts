import { getDesktopHost } from "@/desktop/host";
import { invokeDesktopCommand } from "@/desktop/electron/invoke";

export interface DesktopBackgroundImagePayload {
  base64: string;
  mimeType: string;
}

export async function pickDesktopBackgroundImagePath(input: {
  currentPath: string;
  title: string;
}): Promise<string | null> {
  const openDialog = getDesktopHost()?.dialog?.open;
  if (typeof openDialog !== "function") {
    throw new Error("Desktop dialog API is not available.");
  }

  const selection = await openDialog({
    title: input.title,
    defaultPath: input.currentPath || undefined,
    directory: false,
    multiple: false,
    filters: [
      {
        name: "Images",
        extensions: ["avif", "gif", "jpeg", "jpg", "png", "webp"],
      },
    ],
  });

  return typeof selection === "string" && selection.trim().length > 0 ? selection.trim() : null;
}

export async function readDesktopBackgroundImage(
  path: string,
): Promise<DesktopBackgroundImagePayload> {
  return await invokeDesktopCommand<DesktopBackgroundImagePayload>("read_background_image", {
    path,
  });
}
