import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { readBackgroundImageFile } from "./background-image";

let testDirectory: string | null = null;

async function createTempDirectory(): Promise<string> {
  testDirectory = await mkdtemp(path.join(os.tmpdir(), "paseo-background-image-"));
  return testDirectory;
}

describe("desktop background image reader", () => {
  afterEach(async () => {
    if (testDirectory) {
      await rm(testDirectory, { recursive: true, force: true });
      testDirectory = null;
    }
  });

  it("returns a renderable payload for a supported local image", async () => {
    const directory = await createTempDirectory();
    const imagePath = path.join(directory, "earth.jpg");
    await writeFile(imagePath, Uint8Array.from([0xff, 0xd8, 0xff, 0xd9]));

    await expect(readBackgroundImageFile({ path: imagePath })).resolves.toEqual({
      base64: "/9j/2Q==",
      mimeType: "image/jpeg",
    });
  });

  it("rejects a non-image file even when it is readable", async () => {
    const directory = await createTempDirectory();
    const textPath = path.join(directory, "notes.txt");
    await writeFile(textPath, "not an image");

    await expect(readBackgroundImageFile({ path: textPath })).rejects.toThrow(
      "Background image format is not supported.",
    );
  });
});
