import React, { type ComponentType } from "react";
import { Pressable } from "react-native";
import { StyleSheet } from "react-native-unistyles";

interface DiagramControlButtonProps {
  icon: ComponentType<{ size?: number; color?: string }>;
  label: string;
  onPress: () => void;
  visible: boolean;
  plain?: boolean;
}

export const DiagramControlButton = React.memo(function DiagramControlButton({
  icon: Icon,
  label,
  onPress,
  visible,
  plain = false,
}: DiagramControlButtonProps) {
  const pillStyle = visible ? controlStyles.button : controlStyles.buttonHidden;
  const plainStyle = visible ? controlStyles.plainButton : controlStyles.plainButtonHidden;
  return (
    <Pressable
      onPress={onPress}
      style={plain ? plainStyle : pillStyle}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={4}
    >
      {({ hovered }) => (
        <Icon
          size={14}
          color={hovered ? controlStyles.iconHovered.color : controlStyles.icon.color}
        />
      )}
    </Pressable>
  );
});

export const controlStyles = StyleSheet.create((theme) => ({
  cluster: {
    position: "absolute",
    top: theme.spacing[2],
    right: theme.spacing[2],
    flexDirection: "row",
    gap: theme.spacing[1],
  },
  clusterSourceOffset: { right: 40 },
  button: {
    padding: theme.spacing[1],
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.surface2,
    opacity: 1,
    pointerEvents: "auto",
  },
  buttonHidden: {
    padding: theme.spacing[1],
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.surface2,
    opacity: 0,
    pointerEvents: "none",
  },
  plainButton: { padding: theme.spacing[1], opacity: 1, pointerEvents: "auto" },
  plainButtonHidden: { padding: theme.spacing[1], opacity: 0, pointerEvents: "none" },
  icon: { color: theme.colors.foregroundMuted },
  iconHovered: { color: theme.colors.foreground },
}));
