import { useCallback, useEffect, useMemo, useState } from "react";
import { Modal, Pressable, Text, View } from "react-native";
import { Image as ExpoImage } from "expo-image";
import { X } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { isWeb } from "@/constants/platform";
import { inlineUnistylesStyle } from "@/styles/unistyles-inline-style";
import type { Theme } from "@/styles/theme";
import { WindowChromeRootRegion, WindowChromeSafeArea } from "@/utils/desktop-window";

interface ImageLightboxProps {
  visible: boolean;
  uri: string | null;
  onClose: () => void;
  testIDPrefix?: string;
}

const LIGHTBOX_CONTROL_INSET = 12;
const ThemedX = withUnistyles(X);
const foregroundMutedColorMapping = (theme: Theme) => ({
  color: theme.colors.foregroundMuted,
});

export function ImageLightbox({
  visible,
  uri,
  onClose,
  testIDPrefix = "image-lightbox",
}: ImageLightboxProps) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [errored, setErrored] = useState(false);

  useEffect(() => {
    setErrored(false);
  }, [uri, visible]);

  useEffect(() => {
    if (!isWeb || !visible) return;
    function handleKeydown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }
    window.addEventListener("keydown", handleKeydown);
    return () => {
      window.removeEventListener("keydown", handleKeydown);
    };
  }, [onClose, visible]);

  const closeButtonRowStyle = useMemo(
    () => [
      styles.closeButtonRow,
      inlineUnistylesStyle({
        top: insets.top + LIGHTBOX_CONTROL_INSET,
      }),
    ],
    [insets.top],
  );
  const closeButtonStyle = useMemo(
    () => [
      styles.closeButton,
      inlineUnistylesStyle({ marginRight: insets.right + LIGHTBOX_CONTROL_INSET }),
    ],
    [insets.right],
  );

  const handleImageError = useCallback(() => setErrored(true), []);
  const noopPress = useCallback(() => {}, []);
  const imageSource = useMemo(() => ({ uri: uri ?? "" }), [uri]);

  if (!visible) {
    return null;
  }

  const hasError = errored || !uri;

  return (
    <Modal transparent animationType="fade" statusBarTranslucent visible onRequestClose={onClose}>
      <WindowChromeRootRegion corners="both">
        <View style={styles.root}>
          <Pressable
            testID={`${testIDPrefix}-backdrop`}
            accessibilityRole="button"
            accessibilityLabel={t("message.attachments.dismissImage")}
            onPress={onClose}
            style={styles.backdrop}
          />
          <View style={styles.contentLayer}>
            <View style={styles.imageArea}>
              {hasError ? (
                <Text style={styles.errorText}>{t("message.attachments.imageLoadFailed")}</Text>
              ) : (
                <Pressable onPress={noopPress} style={styles.imagePressable}>
                  <ExpoImage
                    testID={`${testIDPrefix}-image`}
                    source={imageSource}
                    contentFit="contain"
                    onError={handleImageError}
                    style={imageFillStyle}
                  />
                </Pressable>
              )}
            </View>
            <WindowChromeSafeArea placement="inline" style={closeButtonRowStyle}>
              <Pressable
                testID={`${testIDPrefix}-close`}
                accessibilityRole="button"
                accessibilityLabel={t("message.attachments.closeImage")}
                hitSlop={8}
                onPress={onClose}
                style={closeButtonStyle}
              >
                <ThemedX size={16} uniProps={foregroundMutedColorMapping} />
              </Pressable>
            </WindowChromeSafeArea>
          </View>
        </View>
      </WindowChromeRootRegion>
    </Modal>
  );
}

const imageFillStyle = {
  position: "absolute",
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
} as const;

const styles = StyleSheet.create((theme) => ({
  root: {
    flex: 1,
  },
  backdrop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.9)",
  },
  contentLayer: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    pointerEvents: "box-none",
  },
  closeButtonRow: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "flex-end",
    pointerEvents: "box-none",
  },
  imageArea: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: theme.spacing[4],
    pointerEvents: "box-none",
  },
  imagePressable: {
    flex: 1,
    width: "100%",
    alignSelf: "center",
  },
  errorText: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: theme.colors.surface2,
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.border,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1,
  },
}));
