import { useEffect, useMemo, useState } from "react";
import { View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { createBrowserObjectUrlMinter } from "@/desktop/attachments/desktop-preview-url";
import { readDesktopBackgroundImage } from "@/desktop/background-image";
import { useAppSettings } from "@/hooks/use-settings";

export function GlobalBackground() {
  const { settings } = useAppSettings();
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const objectUrls = useMemo(() => createBrowserObjectUrlMinter(), []);

  useEffect(() => {
    let cancelled = false;
    let ownedUrl: string | null = null;
    setImageUrl(null);

    if (!settings.backgroundImagePath) {
      return;
    }

    void readDesktopBackgroundImage(settings.backgroundImagePath)
      .then((payload) => {
        const url =
          objectUrls.tryCreate(payload) ?? `data:${payload.mimeType};base64,${payload.base64}`;
        if (cancelled) {
          objectUrls.revoke(url);
          return;
        }
        ownedUrl = url;
        setImageUrl(url);
        return;
      })
      .catch((error) => {
        if (!cancelled) {
          console.warn("[GlobalBackground] Unable to load background image", error);
        }
      });

    return () => {
      cancelled = true;
      if (ownedUrl) {
        objectUrls.revoke(ownedUrl);
      }
    };
  }, [objectUrls, settings.backgroundImagePath]);

  if (!imageUrl) {
    return null;
  }

  return (
    <View pointerEvents="none" style={styles.container}>
      <img src={imageUrl} alt="" aria-hidden draggable={false} style={imageStyle} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 0,
  },
});

// The image is composited below app content. Theme surfaces own transparency,
// so changing background visibility never changes text or icon opacity.
const imageStyle = {
  width: "100%",
  height: "100%",
  display: "block",
  objectFit: "cover",
} as const;
