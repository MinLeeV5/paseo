/**
 * @vitest-environment jsdom
 */
import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { lightTheme, type Theme } from "@/styles/theme";
import { useMermaidThemePayload } from "./theme";

function cloneTheme(theme: Theme): Theme {
  return {
    ...theme,
    colors: { ...theme.colors },
    fontFamily: { ...theme.fontFamily },
  } as Theme;
}

describe("useMermaidThemePayload", () => {
  it("keeps the same payload reference when relevant theme tokens are unchanged", () => {
    const { result, rerender } = renderHook(({ theme }) => useMermaidThemePayload(theme), {
      initialProps: { theme: cloneTheme(lightTheme) },
    });
    const firstPayload = result.current;

    rerender({ theme: cloneTheme(lightTheme) });

    expect(result.current).toBe(firstPayload);
  });

  it("updates the payload when a relevant theme token changes", () => {
    const { result, rerender } = renderHook(({ theme }) => useMermaidThemePayload(theme), {
      initialProps: { theme: cloneTheme(lightTheme) },
    });
    const firstPayload = result.current;
    const changedTheme = {
      ...cloneTheme(lightTheme),
      colors: {
        ...lightTheme.colors,
        surface0: "#123456",
      },
    } as Theme;

    rerender({ theme: changedTheme });

    expect(result.current).not.toBe(firstPayload);
    expect(result.current.background).toBe("#123456");
  });
});
