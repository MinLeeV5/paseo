import { ThemeProvider, useTheme } from "@react-navigation/native";
import type { NativeStackNavigationOptions } from "@react-navigation/native-stack";
import { Stack } from "expo-router";
import { type ReactNode, useMemo } from "react";
import { withUnistyles } from "react-native-unistyles";
import { isElectronRuntime } from "@/desktop/host";
import { useAppSettings } from "@/hooks/use-settings";

interface ThemedStackBaseProps {
  backgroundColor: string;
  children?: ReactNode;
  screenOptions?: NativeStackNavigationOptions;
}

function ThemedStackBase({ backgroundColor, children, screenOptions }: ThemedStackBaseProps) {
  const { settings } = useAppSettings();
  const navigationTheme = useTheme();
  const hasDesktopBackground = isElectronRuntime() && Boolean(settings.backgroundImagePath);
  const stackBackgroundColor = hasDesktopBackground ? "transparent" : backgroundColor;
  const stackNavigationTheme = useMemo(
    () =>
      hasDesktopBackground
        ? {
            ...navigationTheme,
            colors: { ...navigationTheme.colors, background: "transparent" },
          }
        : navigationTheme,
    [hasDesktopBackground, navigationTheme],
  );
  const themedScreenOptions = useMemo<NativeStackNavigationOptions>(
    () => ({
      ...screenOptions,
      contentStyle: [{ backgroundColor: stackBackgroundColor }, screenOptions?.contentStyle],
    }),
    [screenOptions, stackBackgroundColor],
  );

  return (
    <ThemeProvider value={stackNavigationTheme}>
      <Stack screenOptions={themedScreenOptions}>{children}</Stack>
    </ThemeProvider>
  );
}

export const ThemedStack = withUnistyles(ThemedStackBase, (theme) => ({
  backgroundColor: theme.colors.surface0,
}));
