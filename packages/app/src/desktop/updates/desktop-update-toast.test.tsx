/**
 * @vitest-environment jsdom
 */
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  installDesktopAppUpdate: vi.fn(),
  updateEventHandler: null as ((payload: unknown) => void) | null,
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({ children, onPress, testID, ...props }: ButtonMockProps) =>
    React.createElement(
      "button",
      { ...props, type: "button", "data-testid": testID, onClick: onPress },
      children as React.ReactNode,
    ),
}));

vi.mock("@/components/ui/loading-spinner", () => ({
  LoadingSpinner: () => React.createElement("span", { "data-testid": "loading-spinner" }),
}));

vi.mock("@/constants/layout", () => ({
  HEADER_INNER_HEIGHT: 40,
  HEADER_INNER_HEIGHT_MOBILE: 40,
  HEADER_TOP_PADDING_MOBILE: 0,
  useIsCompactFormFactor: () => false,
}));

vi.mock("@/desktop/electron/events", () => ({
  listenToDesktopEvent: vi.fn(async (_event, handler) => {
    mocks.updateEventHandler = handler;
    return () => {};
  }),
}));

vi.mock("@/desktop/settings/desktop-settings", () => ({
  useDesktopSettings: () => ({ settings: { releaseChannel: "stable" } }),
}));

vi.mock("@/desktop/updates/desktop-updates", () => ({
  formatVersionWithPrefix: (version: string | null | undefined) =>
    version ? `v${version.replace(/^v/i, "")}` : "—",
  installDesktopAppUpdate: mocks.installDesktopAppUpdate,
  shouldShowDesktopUpdateSection: () => true,
}));

vi.mock("@/desktop/updates/desktop-update-events", () => ({
  DESKTOP_APP_UPDATE_EVENT: "desktop-app-update",
  parseDesktopAppUpdateEvent: (raw: unknown) => raw,
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) =>
      ({
        "desktop.updates.callout.availableTitle": "Update available",
        "desktop.updates.callout.versionReady": "Update ready",
        "desktop.updates.callout.installAndRestart": "Install & restart",
        "desktop.updates.callout.installingAction": "Installing...",
        "desktop.updates.callout.installingTitle": "Installing update",
        "desktop.updates.callout.installingDescription": "Installing and restarting...",
      })[key] ?? key,
  }),
}));

vi.mock("@/styles/unistyles-inline-style", () => ({
  inlineUnistylesStyle: (style: unknown) => style,
}));

vi.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

vi.mock("react-native-unistyles", () => {
  const theme = {
    spacing: [0, 4, 8, 12, 16],
    borderWidth: { 1: 1 },
    borderRadius: { lg: 8, full: 999 },
    colors: {
      foreground: "#111",
      foregroundMuted: "#666",
      surface0: "#fff",
      surface2: "#f4f4f5",
      border: "#ddd",
      primary: "#06f",
      destructive: "#c00",
    },
    fontSize: { xs: 12, sm: 14 },
    fontWeight: { medium: "500" },
    shadow: { md: {} },
  };

  return {
    StyleSheet: {
      create: (factory: (value: object) => unknown) => factory(theme),
    },
    withUnistyles: (component: unknown) => component,
  };
});

vi.stubGlobal("React", React);
vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);

import { DesktopUpdateToast } from "./desktop-update-toast";

interface ButtonMockProps {
  children?: React.ReactNode;
  onPress?: () => void;
  testID?: string;
  [key: string]: unknown;
}

describe("DesktopUpdateToast", () => {
  let root: Root | null = null;
  let container: HTMLElement | null = null;

  beforeEach(() => {
    mocks.installDesktopAppUpdate.mockReset();
    mocks.updateEventHandler = null;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    if (root) {
      act(() => {
        root?.unmount();
      });
    }
    root = null;
    container?.remove();
    container = null;
  });

  it("shows an install button after the update finishes downloading", async () => {
    mocks.installDesktopAppUpdate.mockResolvedValue({
      installed: true,
      version: "1.4.5",
      message: "Update downloaded.",
    });

    await act(async () => {
      root?.render(<DesktopUpdateToast />);
      await Promise.resolve();
    });

    await act(async () => {
      mocks.updateEventHandler?.({ type: "downloaded", version: "1.4.5" });
    });

    const installButton = container?.querySelector(
      '[data-testid="desktop-update-toast-install"]',
    ) as HTMLButtonElement | null;
    expect(installButton?.textContent).toContain("Install & restart");

    await act(async () => {
      installButton?.click();
      await Promise.resolve();
    });

    expect(mocks.installDesktopAppUpdate).toHaveBeenCalledWith({ releaseChannel: "stable" });
    expect(installButton?.textContent).toContain("Installing...");
  });
});
