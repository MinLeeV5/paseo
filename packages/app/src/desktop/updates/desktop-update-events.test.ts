import { describe, expect, it } from "vitest";
import { parseDesktopAppUpdateEvent } from "./desktop-update-events";

describe("parseDesktopAppUpdateEvent", () => {
  it("parses update progress and clamps the percentage for the progress bar", () => {
    expect(
      parseDesktopAppUpdateEvent({
        type: "progress",
        version: "1.2.4",
        percent: 104,
        bytesPerSecond: 128,
        transferred: 10,
        total: 20,
      }),
    ).toEqual({
      type: "progress",
      version: "1.2.4",
      percent: 100,
      bytesPerSecond: 128,
      transferred: 10,
      total: 20,
    });
  });

  it("rejects malformed update events", () => {
    expect(parseDesktopAppUpdateEvent({ type: "available", version: "" })).toBeNull();
    expect(parseDesktopAppUpdateEvent({ type: "progress", percent: "50" })).toBeNull();
    expect(parseDesktopAppUpdateEvent({ type: "unexpected" })).toBeNull();
  });

  it("keeps a useful fallback when an error message is blank", () => {
    expect(parseDesktopAppUpdateEvent({ type: "error", version: "1.2.4", message: "  " })).toEqual({
      type: "error",
      version: "1.2.4",
      message: "Update download failed.",
    });
  });
});
