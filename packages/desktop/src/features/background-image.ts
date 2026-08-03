import { readFile, stat } from "node:fs/promises";
import path from "node:path";

const MAX_BACKGROUND_IMAGE_BYTES = 50 * 1024 * 1024;
const IMAGE_MIME_TYPES = new Map<string, string>([
  [".avif", "image/avif"],
  [".gif", "image/gif"],
  [".jpeg", "image/jpeg"],
  [".jpg", "image/jpeg"],
  [".png", "image/png"],
  [".webp", "image/webp"],
]);

export interface BackgroundImagePayload {
  base64: string;
  mimeType: string;
}

export async function readBackgroundImageFile(input: {
  path?: unknown;
}): Promise<BackgroundImagePayload> {
  if (typeof input.path !== "string" || input.path.trim().length === 0) {
    throw new Error("Background image path is required.");
  }

  const imagePath = path.resolve(input.path.trim());
  const mimeType = IMAGE_MIME_TYPES.get(path.extname(imagePath).toLowerCase());
  if (!mimeType) {
    throw new Error("Background image format is not supported.");
  }

  const fileInfo = await stat(imagePath);
  if (!fileInfo.isFile()) {
    throw new Error("Background image path must point to a file.");
  }
  if (fileInfo.size > MAX_BACKGROUND_IMAGE_BYTES) {
    throw new Error("Background image must be 50 MB or smaller.");
  }

  const bytes = await readFile(imagePath);
  return { base64: bytes.toString("base64"), mimeType };
}
