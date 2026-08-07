import { beforeEach, describe, expect, it } from "vitest";
import { useKeyboardShortcutsStore } from "./keyboard-shortcuts-store";

beforeEach(() => {
  useKeyboardShortcutsStore.setState({
    commandCenterOpen: false,
    shortcutsDialogOpen: false,
    capturingShortcut: false,
    altDown: false,
    cmdOrCtrlDown: false,
    showShortcutBadges: false,
    showTabShortcutBadges: false,
    sidebarShortcutWorkspaceTargets: [],
  });
});

describe("keyboard-shortcuts-store", () => {
  it("toggles command center open state", () => {
    expect(useKeyboardShortcutsStore.getState().commandCenterOpen).toBe(false);
    useKeyboardShortcutsStore.getState().setCommandCenterOpen(true);
    expect(useKeyboardShortcutsStore.getState().commandCenterOpen).toBe(true);
  });

  it("toggles shortcut capture state", () => {
    expect(useKeyboardShortcutsStore.getState().capturingShortcut).toBe(false);
    useKeyboardShortcutsStore.getState().setCapturingShortcut(true);
    expect(useKeyboardShortcutsStore.getState().capturingShortcut).toBe(true);
  });

  it("shows tab shortcut badges while Cmd is held", () => {
    useKeyboardShortcutsStore.getState().setShowTabShortcutBadges(true);
    expect(useKeyboardShortcutsStore.getState().showTabShortcutBadges).toBe(true);

    useKeyboardShortcutsStore.getState().resetModifiers();
    expect(useKeyboardShortcutsStore.getState().showTabShortcutBadges).toBe(false);
  });
});
