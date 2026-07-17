import { describe, expect, it } from "vitest";
import {
  chordStringToShortcutKeys,
  comboStringToShortcutKeys,
  keyComboToString,
  keyboardEventToComboString,
  parseShortcutString,
} from "./shortcut-string";

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

function keyboardEvent(overrides: Partial<KeyboardEvent>): KeyboardEvent {
  return {
    key: "",
    code: "",
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    repeat: false,
    ...overrides,
  } as KeyboardEvent;
}

describe("keyboardEventToComboString", () => {
  it("captures the minus key (regression: previously returned null)", () => {
    expect(keyboardEventToComboString(keyboardEvent({ key: "-", code: "Minus" }))).toBe("-");
  });

  it("captures minus with modifiers", () => {
    expect(
      keyboardEventToComboString(keyboardEvent({ key: "-", code: "Minus", metaKey: true })),
    ).toBe("Cmd+-");
    expect(
      keyboardEventToComboString(keyboardEvent({ key: "_", code: "Minus", shiftKey: true })),
    ).toBe("Shift+-");
  });

  it("captures equal, semicolon, and quote", () => {
    expect(keyboardEventToComboString(keyboardEvent({ key: "=", code: "Equal" }))).toBe("=");
    expect(keyboardEventToComboString(keyboardEvent({ key: ";", code: "Semicolon" }))).toBe(";");
    expect(keyboardEventToComboString(keyboardEvent({ key: "'", code: "Quote" }))).toBe("'");
  });

  it("still returns null for modifier-only presses", () => {
    expect(keyboardEventToComboString(keyboardEvent({ code: "ShiftLeft" }))).toBeNull();
  });
});

describe("parseShortcutString round-trips punctuation keys", () => {
  const cases: ReadonlyArray<[string, string, string, string]> = [
    ["-", "Minus", "-", "_"],
    ["=", "Equal", "=", "+"],
    [";", "Semicolon", ";", ":"],
    ["'", "Quote", "'", '"'],
  ];

  for (const [humanKey, code, key, shiftedKey] of cases) {
    it(`round-trips ${humanKey}`, () => {
      const combo = parseShortcutString(humanKey);
      expect(combo.code).toBe(code);
      expect(combo.key).toBe(key);
      expect(combo.shiftedKey).toBe(shiftedKey);
      expect(keyComboToString(combo)).toBe(humanKey);
    });
  }

  it("round-trips a modifier combo with minus", () => {
    const combo = parseShortcutString("Cmd+-");
    expect(combo.meta).toBe(true);
    expect(combo.code).toBe("Minus");
    expect(keyComboToString(combo)).toBe("Cmd+-");
  });
});
