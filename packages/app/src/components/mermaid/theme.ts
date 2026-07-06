import { useRef } from "react";
import type { Theme } from "@/styles/theme";

export interface MermaidThemePayload {
  background: string;
  variables: Record<string, string>;
}

export function createMermaidThemePayload(theme: Theme): MermaidThemePayload {
  return {
    background: theme.colors.surface0,
    variables: {
      background: theme.colors.surface0,
      mainBkg: theme.colors.surface1,
      secondBkg: theme.colors.surface2,
      tertiaryColor: theme.colors.surface3,
      primaryColor: theme.colors.surface1,
      primaryTextColor: theme.colors.foreground,
      primaryBorderColor: theme.colors.border,
      lineColor: theme.colors.foregroundMuted,
      secondaryColor: theme.colors.surface2,
      secondaryTextColor: theme.colors.foreground,
      secondaryBorderColor: theme.colors.border,
      tertiaryTextColor: theme.colors.foreground,
      tertiaryBorderColor: theme.colors.border,
      noteBkgColor: theme.colors.surface2,
      noteTextColor: theme.colors.foreground,
      noteBorderColor: theme.colors.border,
      actorBkg: theme.colors.surface1,
      actorTextColor: theme.colors.foreground,
      actorBorder: theme.colors.border,
      signalColor: theme.colors.foregroundMuted,
      signalTextColor: theme.colors.foreground,
      labelBoxBkgColor: theme.colors.surface1,
      labelBoxBorderColor: theme.colors.border,
      labelTextColor: theme.colors.foreground,
      edgeLabelBackground: theme.colors.surface0,
      clusterBkg: theme.colors.surface1,
      clusterBorder: theme.colors.border,
      defaultLinkColor: theme.colors.foregroundMuted,
      titleColor: theme.colors.foreground,
      errorBkgColor: theme.colors.surface2,
      errorTextColor: theme.colors.destructive,
      fontFamily: theme.fontFamily.ui,
    },
  };
}

function createMermaidThemeSignature(theme: Theme): string {
  return [
    theme.colors.surface0,
    theme.colors.surface1,
    theme.colors.surface2,
    theme.colors.surface3,
    theme.colors.foreground,
    theme.colors.foregroundMuted,
    theme.colors.border,
    theme.colors.destructive,
    theme.fontFamily.ui,
  ].join("\0");
}

export function useMermaidThemePayload(theme: Theme): MermaidThemePayload {
  const signature = createMermaidThemeSignature(theme);
  const payloadRef = useRef<{
    signature: string;
    payload: MermaidThemePayload;
  } | null>(null);

  if (payloadRef.current?.signature !== signature) {
    payloadRef.current = {
      signature,
      payload: createMermaidThemePayload(theme),
    };
  }

  return payloadRef.current.payload;
}
