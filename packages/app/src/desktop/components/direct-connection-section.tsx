import * as Clipboard from "expo-clipboard";
import { Check, Copy, Eye, EyeOff, Smartphone } from "lucide-react-native";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Text, TextInput, View } from "react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { useFetchQuery } from "@/data/query";
import {
  configureDesktopDaemonDirectConnection,
  getDesktopDaemonDirectConnection,
  type DesktopDirectConnectionInfo,
  type DesktopDirectConnectionUnavailableReason,
} from "@/desktop/daemon/desktop-daemon";
import { getHostRuntimeStore } from "@/runtime/host-runtime";
import { settingsStyles } from "@/styles/settings";
import { ICON_SIZE, type Theme } from "@/styles/theme";

const QUERY_KEY = ["desktop-daemon-direct-connection"] as const;
const ThemedSmartphone = withUnistyles(Smartphone);
const ThemedLoadingSpinner = withUnistyles(LoadingSpinner);
const accentIconMapping = (theme: Theme) => ({ color: theme.colors.accent });
const mutedSpinnerMapping = (theme: Theme) => ({ color: theme.colors.foregroundMuted });

export function DirectConnectionSection() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [passwordDraft, setPasswordDraft] = useState("");
  const [passwordDraftVisible, setPasswordDraftVisible] = useState(false);
  const [credentialPasswordVisible, setCredentialPasswordVisible] = useState(false);
  const [copiedValue, setCopiedValue] = useState<string | null>(null);
  const hasSeededPassword = useRef(false);

  const query = useFetchQuery({
    queryKey: QUERY_KEY,
    queryFn: getDesktopDaemonDirectConnection,
    staleTimeMs: 30_000,
    dataShape: "value",
    retry: false,
  });

  useEffect(() => {
    if (!hasSeededPassword.current && query.data?.suggestedPassword) {
      hasSeededPassword.current = true;
      setPasswordDraft(query.data.suggestedPassword);
    }
  }, [query.data?.suggestedPassword]);

  const configureMutation = useMutation({
    mutationFn: configureDesktopDaemonDirectConnection,
    onSuccess: async (configuration) => {
      queryClient.setQueryData(QUERY_KEY, configuration.info);
      setPasswordDraftVisible(false);
      setCredentialPasswordVisible(false);
      const password = configuration.info.password ?? undefined;
      await getHostRuntimeStore().upsertConnectionFromListen({
        listenAddress: configuration.daemon.listen ?? `0.0.0.0:${configuration.info.port}`,
        serverId: configuration.daemon.serverId,
        hostname: configuration.daemon.hostname,
        ...(password ? { password } : {}),
      });
    },
  });

  const handleConfigure = useCallback(() => {
    const password = passwordDraft.trim();
    if (password.length < 8 || configureMutation.isPending) return;
    configureMutation.mutate(password);
  }, [configureMutation, passwordDraft]);

  const handleTogglePasswordDraft = useCallback(() => {
    setPasswordDraftVisible((current) => !current);
  }, []);

  const handleToggleCredentialPassword = useCallback(() => {
    setCredentialPasswordVisible((current) => !current);
  }, []);

  const handleRetry = useCallback(() => {
    void query.refetch();
  }, [query]);

  const handleCopy = useCallback(async (value: string) => {
    await Clipboard.setStringAsync(value);
    setCopiedValue(value);
    setTimeout(() => setCopiedValue((current) => (current === value ? null : current)), 2_000);
  }, []);

  let body: ReactNode = null;
  if (query.isPending) {
    body = (
      <View style={styles.loading}>
        <ThemedLoadingSpinner size="small" uniProps={mutedSpinnerMapping} />
      </View>
    );
  } else if (query.isError) {
    body = (
      <Alert
        variant="error"
        title={t("pairing.directSetup.loadFailed")}
        description={query.error instanceof Error ? query.error.message : undefined}
      >
        <Button variant="outline" size="sm" onPress={handleRetry}>
          {t("common.actions.retry")}
        </Button>
      </Alert>
    );
  } else if (query.data) {
    body = (
      <DirectConnectionContent
        info={query.data}
        passwordDraft={passwordDraft}
        passwordDraftVisible={passwordDraftVisible}
        credentialPasswordVisible={credentialPasswordVisible}
        copiedValue={copiedValue}
        configurePending={configureMutation.isPending}
        configureError={configureMutation.error}
        onPasswordChange={setPasswordDraft}
        onTogglePasswordDraft={handleTogglePasswordDraft}
        onToggleCredentialPassword={handleToggleCredentialPassword}
        onConfigure={handleConfigure}
        onCopy={handleCopy}
      />
    );
  }

  return (
    <View style={styles.section} testID="desktop-direct-connection-section">
      <View style={styles.headingRow}>
        <View style={styles.headingIcon}>
          <ThemedSmartphone size={ICON_SIZE.md} uniProps={accentIconMapping} />
        </View>
        <View style={styles.headingCopy}>
          <Text style={styles.title}>{t("pairing.directSetup.title")}</Text>
          <Text style={styles.description}>{t("pairing.directSetup.description")}</Text>
        </View>
      </View>

      {body}
    </View>
  );
}

function DirectConnectionContent(props: {
  info: DesktopDirectConnectionInfo;
  passwordDraft: string;
  passwordDraftVisible: boolean;
  credentialPasswordVisible: boolean;
  copiedValue: string | null;
  configurePending: boolean;
  configureError: unknown;
  onPasswordChange: (value: string) => void;
  onTogglePasswordDraft: () => void;
  onToggleCredentialPassword: () => void;
  onConfigure: () => void;
  onCopy: (value: string) => Promise<void>;
}) {
  const { t } = useTranslation();
  const canConfigure = props.info.available && props.passwordDraft.trim().length >= 8;
  const displayedPassword = props.info.password ?? "";
  const hasReadyCredentials = props.info.enabled && displayedPassword.length > 0;
  let configureLabel = t("pairing.directSetup.enableAction");
  if (props.configurePending) {
    configureLabel = t("pairing.directSetup.configuring");
  } else if (props.info.enabled) {
    configureLabel = t("pairing.directSetup.updateAction");
  }

  if (!props.info.available) {
    return (
      <Alert
        variant="warning"
        title={t("pairing.directSetup.unavailableTitle")}
        description={unavailableReasonCopy(props.info.unavailableReason, t)}
      />
    );
  }

  return (
    <>
      {props.info.enabled && !hasReadyCredentials ? (
        <Alert
          variant="warning"
          title={t("pairing.directSetup.passwordUnavailableTitle")}
          description={t("pairing.directSetup.passwordUnavailableBody")}
        />
      ) : null}

      {hasReadyCredentials ? (
        <View style={styles.ticket} testID="desktop-direct-connection-ticket">
          <View style={styles.ticketHeader}>
            <View style={styles.readyDot} />
            <Text style={styles.ticketTitle}>{t("pairing.directSetup.ready")}</Text>
          </View>
          {props.info.endpoints.length > 0 ? (
            props.info.endpoints.map((endpoint) => (
              <CredentialRow
                key={`${endpoint.interfaceName}:${endpoint.address}`}
                label={t("pairing.directSetup.addressLabel", {
                  interfaceName: endpoint.interfaceName,
                })}
                value={endpoint.address}
                copied={props.copiedValue === endpoint.address}
                onCopy={props.onCopy}
              />
            ))
          ) : (
            <Text style={styles.noAddress}>{t("pairing.directSetup.noAddress")}</Text>
          )}
          <View style={styles.ticketDivider} />
          <CredentialRow
            label={t("pairing.direct.fields.port")}
            value={String(props.info.port)}
            copied={props.copiedValue === String(props.info.port)}
            onCopy={props.onCopy}
          />
          <View style={styles.ticketDivider} />
          <CredentialRow
            label={t("pairing.direct.fields.password")}
            value={displayedPassword}
            copied={props.copiedValue === displayedPassword}
            concealed
            visible={props.credentialPasswordVisible}
            onToggleVisibility={props.onToggleCredentialPassword}
            onCopy={props.onCopy}
          />
        </View>
      ) : null}

      <View style={settingsStyles.card}>
        <View style={styles.form}>
          <Text style={styles.formTitle}>
            {props.info.enabled
              ? t("pairing.directSetup.changePassword")
              : t("pairing.directSetup.configureTitle")}
          </Text>
          <Text style={styles.formHint}>{t("pairing.directSetup.passwordHint")}</Text>
          <View style={styles.passwordRow}>
            <TextInput
              value={props.passwordDraft}
              onChangeText={props.onPasswordChange}
              secureTextEntry={!props.passwordDraftVisible}
              autoCapitalize="none"
              autoCorrect={false}
              style={styles.passwordInput}
              accessibilityLabel={t("pairing.direct.fields.password")}
              testID="desktop-direct-connection-password"
            />
            <Button
              variant="outline"
              size="sm"
              leftIcon={props.passwordDraftVisible ? EyeOff : Eye}
              style={styles.visibilityButton}
              onPress={props.onTogglePasswordDraft}
              accessibilityLabel={t(
                props.passwordDraftVisible
                  ? "pairing.direct.passwordVisibility.hide"
                  : "pairing.direct.passwordVisibility.show",
              )}
            />
          </View>
          {props.configureError ? (
            <Text style={styles.errorText}>
              {props.configureError instanceof Error
                ? props.configureError.message
                : t("pairing.directSetup.configureFailed")}
            </Text>
          ) : null}
          <Button
            variant="default"
            size="sm"
            onPress={props.onConfigure}
            disabled={!canConfigure || props.configurePending}
            loading={props.configurePending}
            testID="desktop-direct-connection-configure"
          >
            {configureLabel}
          </Button>
        </View>
      </View>

      <Alert
        variant="warning"
        title={t("pairing.directSetup.securityTitle")}
        description={t("pairing.directSetup.securityBody")}
      />

      <View style={styles.tutorial}>
        <Text style={styles.tutorialTitle}>{t("pairing.directSetup.tutorialTitle")}</Text>
        <TutorialStep number="1" text={t("pairing.directSetup.tutorialStep1")} />
        <TutorialStep number="2" text={t("pairing.directSetup.tutorialStep2")} />
        <TutorialStep number="3" text={t("pairing.directSetup.tutorialStep3")} />
      </View>
    </>
  );
}

function CredentialRow(props: {
  label: string;
  value: string;
  copied: boolean;
  concealed?: boolean;
  visible?: boolean;
  onToggleVisibility?: () => void;
  onCopy: (value: string) => Promise<void>;
}) {
  const { t } = useTranslation();
  const { onCopy, value } = props;
  const displayValue = props.concealed && !props.visible ? "••••••••••••" : props.value;
  const handleCopy = useCallback(() => {
    void onCopy(value);
  }, [onCopy, value]);
  return (
    <View style={styles.credentialRow}>
      <View style={styles.credentialCopy}>
        <Text style={styles.credentialLabel}>{props.label}</Text>
        <Text style={styles.credentialValue} selectable={!props.concealed || props.visible}>
          {displayValue}
        </Text>
      </View>
      <View style={styles.credentialActions}>
        {props.concealed && props.onToggleVisibility ? (
          <Button
            variant="ghost"
            size="xs"
            leftIcon={props.visible ? EyeOff : Eye}
            onPress={props.onToggleVisibility}
            accessibilityLabel={t(
              props.visible
                ? "pairing.direct.passwordVisibility.hide"
                : "pairing.direct.passwordVisibility.show",
            )}
            testID="desktop-direct-connection-password-visibility-toggle"
          />
        ) : null}
        <Button
          variant="ghost"
          size="xs"
          leftIcon={props.copied ? Check : Copy}
          onPress={handleCopy}
        >
          {props.copied ? t("common.states.copied") : t("common.actions.copy")}
        </Button>
      </View>
    </View>
  );
}

function TutorialStep({ number, text }: { number: string; text: string }) {
  return (
    <View style={styles.tutorialStep}>
      <View style={styles.stepNumber}>
        <Text style={styles.stepNumberText}>{number}</Text>
      </View>
      <Text style={styles.stepText}>{text}</Text>
    </View>
  );
}

function unavailableReasonCopy(
  reason: DesktopDirectConnectionUnavailableReason | null,
  t: ReturnType<typeof useTranslation>["t"],
): string {
  if (reason === "external_daemon") return t("pairing.directSetup.externalDaemon");
  if (reason === "management_disabled") return t("pairing.directSetup.managementDisabled");
  return t("pairing.directSetup.secureStorageUnavailable");
}

const styles = StyleSheet.create((theme) => ({
  section: {
    gap: theme.spacing[3],
  },
  headingRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: theme.spacing[3],
  },
  headingIcon: {
    width: 36,
    height: 36,
    borderRadius: theme.borderRadius.lg,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.surface2,
  },
  headingCopy: {
    flex: 1,
    gap: theme.spacing[1],
  },
  title: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.base,
    fontWeight: theme.fontWeight.medium,
  },
  description: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
  },
  loading: {
    alignItems: "center",
    paddingVertical: theme.spacing[6],
  },
  ticket: {
    borderWidth: 1,
    borderColor: theme.colors.borderAccent,
    borderRadius: theme.borderRadius.xl,
    backgroundColor: theme.colors.surface2,
    padding: theme.spacing[4],
    gap: theme.spacing[3],
  },
  ticketHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
  },
  readyDot: {
    width: 8,
    height: 8,
    borderRadius: theme.borderRadius.full,
    backgroundColor: theme.colors.palette.green[400],
  },
  ticketTitle: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
  },
  ticketDivider: {
    height: 1,
    backgroundColor: theme.colors.border,
  },
  credentialRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[3],
  },
  credentialCopy: {
    flex: 1,
    minWidth: 0,
    gap: theme.spacing[1],
  },
  credentialLabel: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
  },
  credentialValue: {
    color: theme.colors.foreground,
    fontFamily: theme.fontFamily.mono,
    fontSize: theme.fontSize.sm,
  },
  credentialActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
  },
  noAddress: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
  },
  form: {
    padding: theme.spacing[4],
    gap: theme.spacing[3],
  },
  formTitle: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
  },
  formHint: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
  },
  passwordRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
  },
  passwordInput: {
    flex: 1,
    minWidth: 0,
    height: 40,
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface0,
    color: theme.colors.foreground,
    fontFamily: theme.fontFamily.mono,
    fontSize: theme.fontSize.sm,
    paddingHorizontal: theme.spacing[3],
    outlineStyle: "none",
  } as object,
  visibilityButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface0,
  },
  errorText: {
    color: theme.colors.destructive,
    fontSize: theme.fontSize.xs,
  },
  tutorial: {
    gap: theme.spacing[3],
    paddingTop: theme.spacing[1],
  },
  tutorialTitle: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
  },
  tutorialStep: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: theme.spacing[3],
  },
  stepNumber: {
    width: 22,
    height: 22,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.borderRadius.full,
    backgroundColor: theme.colors.surface3,
  },
  stepNumberText: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.xs,
    fontWeight: theme.fontWeight.medium,
  },
  stepText: {
    flex: 1,
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
    lineHeight: 18,
  },
}));
