import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import {
  MAX_BACKGROUND_IMAGE_OPACITY,
  MAX_INTERFACE_OPACITY,
  MIN_BACKGROUND_IMAGE_OPACITY,
  MIN_INTERFACE_OPACITY,
  useAppSettings,
} from "@/hooks/use-settings";

type BackgroundSurfaceStyle = CSSProperties & {
  "--colors-background": string;
  "--colors-surface-sidebar": string;
  "--colors-surface-workspace": string;
  "--colors-surface0": string;
};

const baseStyle: CSSProperties = {
  display: "flex",
  flex: 1,
  minWidth: 0,
  minHeight: 0,
  position: "relative",
  zIndex: 1,
};

function resolveBackgroundStyle(
  imageVisibility: number,
  interfaceOpacity: number,
): BackgroundSurfaceStyle | null {
  const rootStyle = getComputedStyle(document.documentElement);
  const surface0 = rootStyle.getPropertyValue("--colors-surface0").trim();
  if (!surface0) {
    return null;
  }

  const sidebar = rootStyle.getPropertyValue("--colors-surface-sidebar").trim() || surface0;
  const safeVisibility = Math.min(
    MAX_BACKGROUND_IMAGE_OPACITY,
    Math.max(MIN_BACKGROUND_IMAGE_OPACITY, imageVisibility),
  );
  const surfacePercentage = (1 - safeVisibility) * 100;
  const translucent = (color: string, percentage: number) =>
    `color-mix(in srgb, ${color} ${percentage}%, transparent)`;

  return {
    ...baseStyle,
    opacity: Math.min(MAX_INTERFACE_OPACITY, Math.max(MIN_INTERFACE_OPACITY, interfaceOpacity)),
    backgroundColor: translucent(surface0, surfacePercentage),
    "--colors-background": "transparent",
    "--colors-surface-sidebar": translucent(sidebar, 15),
    "--colors-surface-workspace": "transparent",
    "--colors-surface0": "transparent",
  };
}

export function GlobalBackgroundSurface({ children }: { children: ReactNode }) {
  const { settings } = useAppSettings();
  const [backgroundStyle, setBackgroundStyle] = useState<BackgroundSurfaceStyle | null>(null);

  useEffect(() => {
    if (!settings.backgroundImagePath) {
      setBackgroundStyle(null);
      return;
    }

    const updateStyle = () => {
      setBackgroundStyle(
        resolveBackgroundStyle(settings.backgroundImageOpacity, settings.interfaceOpacity),
      );
    };
    updateStyle();
    const animationFrame = requestAnimationFrame(updateStyle);
    return () => cancelAnimationFrame(animationFrame);
  }, [
    settings.backgroundImageOpacity,
    settings.backgroundImagePath,
    settings.interfaceOpacity,
    settings.theme,
  ]);

  return <div style={backgroundStyle ?? baseStyle}>{children}</div>;
}
