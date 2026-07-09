import { describe, expect, it } from "vitest";
import { comboStringToShortcutKeys, chordStringToShortcutKeys } from "./shortcut-string";

describe("shortcut-string", () => {
  it("preserves canonical key labels when converting combo strings", () => {
    expect(comboStringToShortcutKeys("Ctrl+Tab")).toEqual(["ctrl", "Tab"]);
    expect(comboStringToShortcutKeys("Ctrl+Shift+ArrowLeft")).toEqual([
      "ctrl",
      "shift",
      "ArrowLeft",
    ]);
  });

  it("converts chord strings into shortcut key chords", () => {
    expect(chordStringToShortcutKeys("Ctrl+Tab Shift+ArrowRight")).toEqual([
      ["ctrl", "Tab"],
      ["shift", "ArrowRight"],
    ]);
  });
});
