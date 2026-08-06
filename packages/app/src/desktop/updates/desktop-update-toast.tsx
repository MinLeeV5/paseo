import { Check, X, XCircle } from "lucide-react-native";
import { useCallback, useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { useTranslation } from "react-i18next";
import {
  HEADER_INNER_HEIGHT,
  HEADER_INNER_HEIGHT_MOBILE,
  HEADER_TOP_PADDING_MOBILE,
  useIsCompactFormFactor,
} from "@/constants/layout";
import { listenToDesktopEvent } from "@/desktop/electron/events";
import {
  formatVersionWithPrefix,
  shouldShowDesktopUpdateSection,
} from "@/desktop/updates/desktop-updates";
import {
  DESKTOP_APP_UPDATE_EVENT,
  parseDesktopAppUpdateEvent,
  type DesktopAppUpdateEvent,
} from "@/desktop/updates/desktop-update-events";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { inlineUnistylesStyle } from "@/styles/unistyles-inline-style";
import { SPACING, type Theme } from "@/styles/theme";

const ThemedLoadingSpinner = withUnistyles(LoadingSpinner);
const ThemedCheck = withUnistyles(Check);
const ThemedX = withUnistyles(X);
const ThemedXCircle = withUnistyles(XCircle);

const foregroundMutedColorMapping = (theme: Theme) => ({
  color: theme.colors.foregroundMuted,
});
const primaryColorMapping = (theme: Theme) => ({ color: theme.colors.primary });
const destructiveColorMapping = (theme: Theme) => ({ color: theme.colors.destructive });

type DesktopUpdateToastState =
  | { status: "downloading"; version: string | null; percent: number | null }
  | { status: "ready"; version: string }
  | { status: "error"; version: string | null; message: string };

export function DesktopUpdateToast() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const isCompact = useIsCompactFormFactor();
  const [state, setState] = useState<DesktopUpdateToastState | null>(null);

  useEffect(() => {
    if (!shouldShowDesktopUpdateSection()) {
      return undefined;
    }

    let disposed = false;
    let unlisten: (() => void) | null = null;

    const handleEvent = (rawEvent: unknown) => {
      const event = parseDesktopAppUpdateEvent(rawEvent);
      if (event) {
        setState((current) => reduceDesktopUpdateToastState(current, event));
      }
    };

    void listenToDesktopEvent<unknown>(DESKTOP_APP_UPDATE_EVENT, handleEvent)
      .then((dispose) => {
        if (disposed) {
          dispose();
        } else {
          unlisten = dispose;
        }
        return undefined;
      })
      .catch((error) => {
        if (!disposed) {
          console.warn("[DesktopUpdateToast] Failed to subscribe to update events", error);
        }
      });

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);

  const dismiss = useCallback(() => setState(null), []);

  if (!state) {
    return null;
  }

  const topOffset =
    insets.top +
    (isCompact ? HEADER_TOP_PADDING_MOBILE + HEADER_INNER_HEIGHT_MOBILE : HEADER_INNER_HEIGHT) +
    SPACING[2];
  const versionLabel = state.version ? formatVersionWithPrefix(state.version) : null;
  const progressWidth: `${number}%` =
    state.status === "downloading" ? `${Math.round(state.percent ?? 0)}%` : "0%";
  const isError = state.status === "error";
  const title = isError
    ? t("desktop.updates.callout.failedTitle")
    : t("desktop.updates.callout.availableTitle");
  const message = getToastMessage(state, versionLabel, t);

  return (
    <View
      pointerEvents="box-none"
      style={[styles.container, inlineUnistylesStyle({ top: topOffset })]}
    >
      <View
        testID="desktop-update-toast"
        accessibilityRole="alert"
        style={[styles.toast, isError ? styles.toastError : null]}
      >
        <View style={styles.iconSlot}>
          {state.status === "downloading" ? (
            <ThemedLoadingSpinner size="small" uniProps={foregroundMutedColorMapping} />
          ) : null}
          {state.status === "ready" ? (
            <ThemedCheck size={18} uniProps={primaryColorMapping} />
          ) : null}
          {isError ? <ThemedXCircle size={18} uniProps={destructiveColorMapping} /> : null}
        </View>
        <View style={styles.textContainer}>
          <Text style={styles.title}>{title}</Text>
          <Text testID="desktop-update-toast-message" style={styles.message}>
            {message}
          </Text>
          {state.status === "downloading" && state.percent !== null ? (
            <View
              testID="desktop-update-toast-progress"
              accessibilityLabel={`${Math.round(state.percent)}%`}
              style={styles.progressBar}
            >
              <View style={[styles.progressFill, inlineUnistylesStyle({ width: progressWidth })]} />
            </View>
          ) : null}
        </View>
        <Pressable
          onPress={dismiss}
          hitSlop={8}
          style={styles.dismiss}
          accessibilityRole="button"
          accessibilityLabel={t("common.actions.dismiss")}
          testID="desktop-update-toast-dismiss"
        >
          <ThemedX size={16} uniProps={foregroundMutedColorMapping} />
        </Pressable>
      </View>
    </View>
  );
}

function reduceDesktopUpdateToastState(
  current: DesktopUpdateToastState | null,
  event: DesktopAppUpdateEvent,
): DesktopUpdateToastState {
  if (event.type === "available") {
    return { status: "downloading", version: event.version, percent: null };
  }
  if (event.type === "progress") {
    return {
      status: "downloading",
      version: event.version ?? current?.version ?? null,
      percent: event.percent,
    };
  }
  if (event.type === "downloaded") {
    return { status: "ready", version: event.version };
  }
  return {
    status: "error",
    version: event.version ?? current?.version ?? null,
    message: event.message,
  };
}

function getToastMessage(
  state: DesktopUpdateToastState,
  versionLabel: string | null,
  t: ReturnType<typeof useTranslation>["t"],
): string {
  if (state.status === "error") {
    return state.message;
  }
  if (state.status === "ready") {
    return versionLabel
      ? t("desktop.updates.callout.versionReady", { version: versionLabel })
      : t("desktop.updates.callout.newVersionReady");
  }
  if (state.percent !== null) {
    const progress = `${Math.round(state.percent)}%`;
    return versionLabel
      ? `${t("desktop.updates.status.pendingWithVersion", { version: versionLabel })} ${progress}`
      : `${t("desktop.updates.status.pending")} ${progress}`;
  }
  return versionLabel
    ? t("desktop.updates.status.pendingWithVersion", { version: versionLabel })
    : t("desktop.updates.status.pending");
}

const styles = StyleSheet.create((theme) => ({
  container: {
    position: "absolute",
    left: theme.spacing[4],
    right: theme.spacing[4],
    zIndex: 1000,
    alignItems: "center",
  },
  toast: {
    width: "100%",
    maxWidth: 440,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[3],
    backgroundColor: theme.colors.surface2,
    borderRadius: theme.borderRadius.lg,
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.border,
    paddingVertical: theme.spacing[3],
    paddingHorizontal: theme.spacing[4],
    ...theme.shadow.md,
  },
  toastError: {
    borderColor: theme.colors.destructive,
  },
  iconSlot: {
    alignItems: "center",
    justifyContent: "center",
  },
  textContainer: {
    flex: 1,
    minWidth: 0,
    gap: theme.spacing[1],
  },
  title: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
  },
  message: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
  },
  progressBar: {
    height: 3,
    marginTop: theme.spacing[1],
    overflow: "hidden",
    borderRadius: theme.borderRadius.full,
    backgroundColor: theme.colors.surface0,
  },
  progressFill: {
    height: "100%",
    borderRadius: theme.borderRadius.full,
    backgroundColor: theme.colors.primary,
  },
  dismiss: {
    padding: theme.spacing[1],
  },
}));
