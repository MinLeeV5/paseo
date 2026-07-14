import { useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Text, View } from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { Target } from "lucide-react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { useShallow } from "zustand/shallow";
import { MAX_CONTENT_WIDTH } from "@/constants/layout";
import { useRetainedPanelActive } from "@/components/retained-panel";
import { useSessionStore } from "@/stores/session-store";
import type { Theme } from "@/styles/theme";
import { buildAgentGoalStatusModel } from "@/panels/agent-goal-status-model";

const ThemedTarget = withUnistyles(Target);

const activeColorMapping = (theme: Theme) => ({ color: theme.colors.accentBright });
const mutedColorMapping = (theme: Theme) => ({ color: theme.colors.foregroundMuted });
const successColorMapping = (theme: Theme) => ({ color: theme.colors.statusSuccess });
const dangerColorMapping = (theme: Theme) => ({ color: theme.colors.statusDanger });
const warningColorMapping = (theme: Theme) => ({ color: theme.colors.statusWarning });

const iconColorMappings = {
  active: activeColorMapping,
  muted: mutedColorMapping,
  success: successColorMapping,
  danger: dangerColorMapping,
  warning: warningColorMapping,
} as const;

export function AgentGoalStatus({ serverId, agentId }: { serverId: string; agentId: string }) {
  const { t } = useTranslation();
  const panelActive = useRetainedPanelActive();
  const reduceMotion = useReducedMotion();
  const { supported, goal } = useSessionStore(
    useShallow((state) => {
      const session = state.sessions[serverId];
      const agent = session?.agents.get(agentId) ?? session?.agentDetails.get(agentId);
      return {
        supported: session?.serverInfo?.features?.agentGoalState === true,
        goal: agent?.goal ?? null,
      };
    }),
  );
  const model = buildAgentGoalStatusModel({ supported, goal });
  const pulseOpacity = useSharedValue(1);
  const shouldAnimate = model?.status === "active" && panelActive && !reduceMotion;

  useEffect(() => {
    cancelAnimation(pulseOpacity);
    pulseOpacity.value = 1;
    if (!shouldAnimate) {
      return;
    }
    pulseOpacity.value = withRepeat(
      withTiming(0.45, { duration: 900, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
    return () => {
      cancelAnimation(pulseOpacity);
    };
  }, [pulseOpacity, shouldAnimate]);

  const pulseStyle = useAnimatedStyle(() => ({ opacity: pulseOpacity.value }));
  const tone = model?.tone ?? "muted";
  const surfaceStyle = useMemo(() => [styles.surface, toneSurfaceStyles[tone]], [tone]);
  const statusStyle = useMemo(() => [styles.status, toneTextStyles[tone]], [tone]);

  if (!model) {
    return null;
  }

  const label = t(model.labelKey);
  return (
    <View
      accessibilityLabel={`${label}: ${model.objective}`}
      style={styles.outer}
      testID="agent-goal-status"
    >
      <View style={surfaceStyle}>
        <Animated.View style={pulseStyle}>
          <ThemedTarget size={14} strokeWidth={1.8} uniProps={iconColorMappings[model.tone]} />
        </Animated.View>
        <Text style={statusStyle} numberOfLines={1}>
          {label}
        </Text>
        <Text style={styles.objective} numberOfLines={1} ellipsizeMode="tail">
          {model.objective}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  outer: {
    width: "100%",
    alignItems: "center",
    paddingHorizontal: theme.spacing[4],
    marginBottom: theme.spacing[2],
  },
  surface: {
    width: "100%",
    maxWidth: MAX_CONTENT_WIDTH,
    minHeight: 34,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[2],
    backgroundColor: theme.colors.surface1,
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.borderAccent,
    borderRadius: theme.borderRadius.xl,
  },
  surfaceActive: {
    borderColor: theme.colors.accent,
  },
  surfaceMuted: {
    opacity: 0.72,
  },
  surfaceSuccess: {
    borderColor: theme.colors.statusSuccess,
  },
  surfaceDanger: {
    borderColor: theme.colors.statusDanger,
  },
  surfaceWarning: {
    borderColor: theme.colors.statusWarning,
  },
  status: {
    flexShrink: 0,
    fontSize: theme.fontSize.xs,
    fontWeight: theme.fontWeight.semibold,
  },
  statusActive: {
    color: theme.colors.accentBright,
  },
  statusMuted: {
    color: theme.colors.foregroundMuted,
  },
  statusSuccess: {
    color: theme.colors.statusSuccess,
  },
  statusDanger: {
    color: theme.colors.statusDanger,
  },
  statusWarning: {
    color: theme.colors.statusWarning,
  },
  objective: {
    flex: 1,
    minWidth: 0,
    fontSize: theme.fontSize.sm,
    color: theme.colors.foreground,
  },
}));

const toneSurfaceStyles = {
  active: styles.surfaceActive,
  muted: styles.surfaceMuted,
  success: styles.surfaceSuccess,
  danger: styles.surfaceDanger,
  warning: styles.surfaceWarning,
} as const;

const toneTextStyles = {
  active: styles.statusActive,
  muted: styles.statusMuted,
  success: styles.statusSuccess,
  danger: styles.statusDanger,
  warning: styles.statusWarning,
} as const;
