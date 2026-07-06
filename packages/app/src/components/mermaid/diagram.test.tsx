/**
 * @vitest-environment jsdom
 */
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MermaidDiagram } from "./diagram";

const { mermaidRender, theme } = vi.hoisted(() => {
  const testTheme = {
    spacing: { 2: 8, 3: 12, 4: 16 },
    borderWidth: { 1: 1 },
    borderRadius: { md: 6, full: 9999 },
    fontSize: { sm: 13, code: 12 },
    iconSize: { sm: 14 },
    colors: {
      surface0: "#ffffff",
      surface1: "#fafafa",
      surface2: "#f4f4f5",
      surface3: "#e4e4e7",
      foreground: "#18181b",
      foregroundMuted: "#71717a",
      border: "#e4e4e7",
      destructive: "#b04138",
    },
    fontFamily: {
      mono: "Menlo",
      ui: "Inter",
    },
  };
  return {
    theme: testTheme,
    mermaidRender: vi.fn(async () => ({
      svg: '<svg data-testid="rendered-mermaid-svg" viewBox="0 0 100 100"></svg>',
    })),
  };
});

vi.mock("mermaid", () => ({
  default: {
    initialize: vi.fn(),
    render: mermaidRender,
  },
}));

vi.mock("react-native-unistyles", () => ({
  StyleSheet: {
    create: (styles: unknown) => (typeof styles === "function" ? styles(theme) : styles),
  },
  useUnistyles: () => ({ theme }),
}));

vi.mock("lucide-react-native", () => ({
  Maximize2: () => null,
  X: () => null,
}));

afterEach(() => {
  cleanup();
  mermaidRender.mockClear();
});

describe("MermaidDiagram", () => {
  it("opens a fullscreen preview without rendering the diagram again", async () => {
    render(<MermaidDiagram diagram="flowchart TB\nA --> B" />);

    await screen.findByTestId("mermaid-diagram-svg");
    expect(mermaidRender).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByLabelText("Open Mermaid diagram fullscreen"));

    expect(screen.getByTestId("mermaid-fullscreen-preview")).not.toBeNull();
    expect(mermaidRender).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByLabelText("Close Mermaid diagram fullscreen"));

    await waitFor(() => {
      expect(screen.queryByTestId("mermaid-fullscreen-preview")).toBeNull();
    });
  });
});
