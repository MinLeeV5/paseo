import { useCallback, useMemo, useState } from "react";
import { Image, Pressable, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { useTranslation } from "react-i18next";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import type { DaemonClient } from "@getpaseo/client/internal/daemon-client";
import { useAssistantImage } from "@/assistant-image/use-assistant-image";
import { ImageLightbox } from "@/components/image-lightbox";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { isWeb } from "@/constants/platform";
import type { Theme } from "@/styles/theme";

interface AssistantMarkdownImageProps {
  source: string;
  occurrenceKey: string;
  alt?: string;
  hasLeadingContent: boolean;
  client?: DaemonClient | null;
  workspaceRoot?: string;
  serverId?: string;
}

const ASSISTANT_IMAGE_MIN_HEIGHT = 160;

const ThemedLoadingSpinner = withUnistyles(LoadingSpinner);
const foregroundMutedColorMapping = (theme: Theme) => ({
  color: theme.colors.foregroundMuted,
});

export function AssistantMarkdownImage({
  source,
  occurrenceKey,
  alt,
  hasLeadingContent,
  client,
  workspaceRoot,
  serverId,
}: AssistantMarkdownImageProps) {
  const { t } = useTranslation();
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);
  const containerStyle = useMemo<StyleProp<ViewStyle>>(
    () => ({
      marginTop: hasLeadingContent ? 16 : 0,
      marginBottom: 0,
    }),
    [hasLeadingContent],
  );
  const image = useAssistantImage({
    source,
    occurrenceKey,
    client,
    workspaceRoot,
    serverId,
  });
  const binding = image.status === "failed" ? null : image.binding;
  const aspectRatio = image.status === "failed" ? null : image.aspectRatio;
  const imageUri = binding?.uri ?? "";
  const imageSource = useMemo(() => ({ uri: imageUri }), [imageUri]);
  const frameStyle = useMemo<StyleProp<ViewStyle>>(
    () => [styles.imageFrame, containerStyle],
    [containerStyle],
  );
  const imageSizeStyle = useMemo<ViewStyle>(() => {
    if (aspectRatio) {
      return { aspectRatio };
    }
    return { height: ASSISTANT_IMAGE_MIN_HEIGHT };
  }, [aspectRatio]);
  const surfaceStyle = useMemo<StyleProp<ViewStyle>>(
    () => [styles.imageSurface, imageSizeStyle],
    [imageSizeStyle],
  );
  const stateFrameStyle = useMemo<StyleProp<ViewStyle>>(
    () => [
      styles.imageFrame,
      containerStyle,
      { height: ASSISTANT_IMAGE_MIN_HEIGHT },
      styles.imageState,
    ],
    [containerStyle],
  );
  const handleOpen = useCallback(() => setIsLightboxOpen(true), []);
  const handleClose = useCallback(() => setIsLightboxOpen(false), []);

  if (image.status === "failed") {
    return (
      <View style={stateFrameStyle}>
        <Text style={styles.imageErrorText}>{image.message}</Text>
      </View>
    );
  }

  if (!binding) {
    return (
      <View style={stateFrameStyle}>
        <ThemedLoadingSpinner size="small" uniProps={foregroundMutedColorMapping} />
      </View>
    );
  }

  return (
    <>
      <View style={frameStyle}>
        <Pressable
          testID="assistant-markdown-image"
          accessibilityRole="button"
          accessibilityLabel={t("message.attachments.openImage")}
          accessibilityHint={alt}
          onPress={handleOpen}
          style={surfaceStyle}
        >
          <Image
            ref={binding.onRef}
            source={imageSource}
            style={styles.image}
            resizeMode="contain"
            accessibilityLabel={alt}
            onLoad={binding.onLoad}
            onError={binding.onError}
          />
          {image.status === "loading" ? (
            <View pointerEvents="none" style={styles.imageLoadingOverlay}>
              <ThemedLoadingSpinner size="small" uniProps={foregroundMutedColorMapping} />
            </View>
          ) : null}
        </Pressable>
      </View>
      <ImageLightbox
        visible={isLightboxOpen}
        uri={imageUri}
        onClose={handleClose}
        testIDPrefix="assistant-image-lightbox"
      />
    </>
  );
}

const styles = StyleSheet.create((theme) => ({
  imageFrame: {
    width: "100%",
    minHeight: ASSISTANT_IMAGE_MIN_HEIGHT,
    marginHorizontal: -theme.spacing[1],
  },
  imageSurface: {
    width: "100%",
    overflow: "hidden",
    position: "relative",
    ...(isWeb ? { cursor: "pointer" } : null),
  },
  image: {
    width: "100%",
    height: "100%",
  },
  imageLoadingOverlay: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  imageState: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: theme.spacing[4],
    paddingVertical: theme.spacing[6],
    gap: theme.spacing[2],
  },
  imageErrorText: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
    textAlign: "center",
  },
}));
