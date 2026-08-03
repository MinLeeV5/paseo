import { useCallback, useEffect, useMemo, useState } from "react";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import {
  Text,
  TextInput,
  View,
  type GestureResponderEvent,
  type LayoutChangeEvent,
  type PressableStateCallbackType,
} from "react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { ChevronDown, Monitor, Moon, Sun } from "lucide-react-native";
import {
  SYNTAX_THEME_OPTIONS,
  type SyntaxThemeId,
  type SyntaxThemeOption,
} from "@getpaseo/highlight";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";
import { SettingsSection } from "@/screens/settings/settings-section";
import {
  MAX_BACKGROUND_IMAGE_OPACITY,
  MAX_INTERFACE_OPACITY,
  MAX_CODE_FONT_SIZE,
  MAX_UI_FONT_SIZE,
  MIN_BACKGROUND_IMAGE_OPACITY,
  MIN_INTERFACE_OPACITY,
  MIN_CODE_FONT_SIZE,
  MIN_UI_FONT_SIZE,
  parseClampedFontSize,
  sanitizeFontFamily,
  useAppSettings,
  type AppSettings,
} from "@/hooks/use-settings";
import {
  DEFAULT_MONO_FONT_STACK,
  DEFAULT_UI_FONT_STACK,
  ICON_SIZE,
  THEME_SWATCHES,
  type Theme,
} from "@/styles/theme";
import { inlineUnistylesStyle } from "@/styles/unistyles-inline-style";
import { isNative, isWeb } from "@/constants/platform";
import { isElectronRuntime } from "@/desktop/host";
import {
  pickDesktopBackgroundImagePath,
  readDesktopBackgroundImage,
} from "@/desktop/background-image";
import { settingsStyles } from "@/styles/settings";
import { AppearancePreview } from "./appearance-preview";

// ---------------------------------------------------------------------------
// Theme-reactive leaf icons (withUnistyles + uniProps color mapping — no
// useUnistyles). Icon sizes read the static ICON_SIZE token; the appearance
// feature does not scale icons.
// ---------------------------------------------------------------------------

const ThemedSun = withUnistyles(Sun);
const ThemedMoon = withUnistyles(Moon);
const ThemedMonitor = withUnistyles(Monitor);
const ThemedChevronDown = withUnistyles(ChevronDown);

const mutedColorMapping = (theme: Theme) => ({ color: theme.colors.foregroundMuted });

function getThemeLabel(t: TFunction, value: AppSettings["theme"]): string {
  const labelKeys: Record<AppSettings["theme"], string> = {
    light: "settings.appearance.theme.options.light",
    dark: "settings.appearance.theme.options.dark",
    zinc: "settings.appearance.theme.options.zinc",
    midnight: "settings.appearance.theme.options.midnight",
    claude: "settings.appearance.theme.options.claude",
    ghostty: "settings.appearance.theme.options.ghostty",
    auto: "settings.appearance.theme.options.auto",
  };
  return t(labelKeys[value]);
}

const PRIMARY_THEMES: readonly AppSettings["theme"][] = ["light", "dark", "auto"];
const DARK_VARIANT_THEMES: readonly AppSettings["theme"][] = [
  "zinc",
  "midnight",
  "claude",
  "ghostty",
];

// Platform default stacks can be the bare native tokens ("normal"/"monospace");
// those read as a bug, so show a human label in the placeholder instead.
const BARE_DEFAULT_STACKS: ReadonlySet<string> = new Set(["normal", "monospace"]);

function resolveDefaultStackPlaceholder(t: TFunction, stack: string): string {
  return BARE_DEFAULT_STACKS.has(stack) ? t("settings.appearance.fonts.systemDefault") : stack;
}

// Local size string (digits only) -> preview override number. Empty/invalid
// yields undefined so the preview falls back to the committed theme value.
function sizeDraftToOverride(value: string): number | undefined {
  if (value.length === 0) return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function dropdownTriggerStyle({ pressed }: PressableStateCallbackType) {
  return [styles.trigger, pressed ? styles.triggerPressed : null];
}

// ---------------------------------------------------------------------------
// Theme picker
// ---------------------------------------------------------------------------

interface ThemeLeadingProps {
  themeValue: AppSettings["theme"];
}

function ThemeLeading({ themeValue }: ThemeLeadingProps) {
  switch (themeValue) {
    case "light":
      return <ThemedSun size={ICON_SIZE.md} uniProps={mutedColorMapping} />;
    case "dark":
      return <ThemedMoon size={ICON_SIZE.md} uniProps={mutedColorMapping} />;
    case "auto":
      return <ThemedMonitor size={ICON_SIZE.md} uniProps={mutedColorMapping} />;
    default:
      return <ThemeSwatch color={THEME_SWATCHES[themeValue]} />;
  }
}

interface ThemeSwatchProps {
  color: string;
}

function ThemeSwatch({ color }: ThemeSwatchProps) {
  const swatchStyle = useMemo(() => [styles.swatch, { backgroundColor: color }], [color]);
  return <View style={swatchStyle} />;
}

interface ThemeMenuItemProps {
  themeValue: AppSettings["theme"];
  selected: boolean;
  onChange: (theme: AppSettings["theme"]) => void;
}

function ThemeMenuItem({ themeValue, selected, onChange }: ThemeMenuItemProps) {
  const { t } = useTranslation();
  const handleSelect = useCallback(() => {
    onChange(themeValue);
  }, [onChange, themeValue]);
  const leading = useMemo(() => <ThemeLeading themeValue={themeValue} />, [themeValue]);
  return (
    <DropdownMenuItem selected={selected} onSelect={handleSelect} leading={leading}>
      {getThemeLabel(t, themeValue)}
    </DropdownMenuItem>
  );
}

interface ThemeRowProps {
  value: AppSettings["theme"];
  onChange: (theme: AppSettings["theme"]) => void;
}

function ThemeRow({ value, onChange }: ThemeRowProps) {
  const { t } = useTranslation();
  const selectedLabel = getThemeLabel(t, value);
  return (
    <View style={settingsStyles.row}>
      <View style={settingsStyles.rowContent}>
        <Text style={settingsStyles.rowTitle}>{t("settings.appearance.theme.title")}</Text>
      </View>
      <DropdownMenu>
        <DropdownMenuTrigger
          style={dropdownTriggerStyle}
          accessibilityLabel={t("settings.appearance.theme.accessibilityLabel", {
            value: selectedLabel,
          })}
        >
          <ThemeLeading themeValue={value} />
          <Text style={styles.triggerText}>{selectedLabel}</Text>
          <ThemedChevronDown size={ICON_SIZE.sm} uniProps={mutedColorMapping} />
        </DropdownMenuTrigger>
        <DropdownMenuContent side="bottom" align="end" width={200}>
          {PRIMARY_THEMES.map((themeValue) => (
            <ThemeMenuItem
              key={themeValue}
              themeValue={themeValue}
              selected={value === themeValue}
              onChange={onChange}
            />
          ))}
          <DropdownMenuSeparator />
          {DARK_VARIANT_THEMES.map((themeValue) => (
            <ThemeMenuItem
              key={themeValue}
              themeValue={themeValue}
              selected={value === themeValue}
              onChange={onChange}
            />
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Desktop background image
// ---------------------------------------------------------------------------

interface BackgroundImageRowProps {
  path: string;
  error: string | null;
  pendingAction: "choose" | "clear" | null;
  onChoose: () => void;
  onClear: () => void;
}

function BackgroundImageRow({
  path,
  error,
  pendingAction,
  onChoose,
  onClear,
}: BackgroundImageRowProps) {
  const { t } = useTranslation();
  const isPending = pendingAction !== null;
  return (
    <View style={settingsStyles.row}>
      <View style={settingsStyles.rowContent}>
        <Text style={settingsStyles.rowTitle}>{t("settings.appearance.background.image")}</Text>
        <Text style={settingsStyles.rowHint} numberOfLines={2}>
          {path || t("settings.appearance.background.imageHint")}
        </Text>
        {error ? <Text style={settingsStyles.rowError}>{error}</Text> : null}
      </View>
      <View style={styles.backgroundActions}>
        {path ? (
          <Button
            variant="ghost"
            size="sm"
            loading={pendingAction === "clear"}
            disabled={isPending && pendingAction !== "clear"}
            onPress={onClear}
            accessibilityLabel={t("settings.appearance.background.remove")}
          >
            {t("settings.appearance.background.remove")}
          </Button>
        ) : null}
        <Button
          variant="outline"
          size="sm"
          loading={pendingAction === "choose"}
          disabled={isPending && pendingAction !== "choose"}
          onPress={onChoose}
          accessibilityLabel={t("settings.appearance.background.choose")}
        >
          {path
            ? t("settings.appearance.background.change")
            : t("settings.appearance.background.choose")}
        </Button>
      </View>
    </View>
  );
}

interface OpacityRowProps {
  value: number;
  disabled: boolean;
  min: number;
  max: number;
  title: string;
  hint: string;
  accessibilityLabel: string;
  onCommit: (value: number) => void;
}

const OPACITY_STEP = 0.05;
const OPACITY_ACCESSIBILITY_ACTIONS = [
  { name: "increment" as const },
  { name: "decrement" as const },
];

function getOpacityCursor(disabled: boolean, isDragging: boolean): string {
  if (disabled) return "default";
  if (isDragging) return "grabbing";
  return "grab";
}

function OpacityRow({
  value,
  disabled,
  min,
  max,
  title,
  hint,
  accessibilityLabel,
  onCommit,
}: OpacityRowProps) {
  const clampedValue = Math.min(max, Math.max(min, value));
  const [draft, setDraft] = useState(clampedValue);
  const [trackWidth, setTrackWidth] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    setDraft(clampedValue);
  }, [clampedValue]);

  const valueFromEvent = useCallback(
    (event: GestureResponderEvent): number | null => {
      if (disabled || trackWidth <= 0) return null;
      const ratio = Math.min(1, Math.max(0, event.nativeEvent.locationX / trackWidth));
      const range = max - min;
      const rawValue = min + ratio * range;
      const steppedValue = Math.round(rawValue / OPACITY_STEP) * OPACITY_STEP;
      return Math.min(max, Math.max(min, steppedValue));
    },
    [disabled, max, min, trackWidth],
  );

  const updateDraftFromEvent = useCallback(
    (event: GestureResponderEvent) => {
      const next = valueFromEvent(event);
      if (next !== null) setDraft(next);
    },
    [valueFromEvent],
  );

  const handleResponderGrant = useCallback(
    (event: GestureResponderEvent) => {
      setIsDragging(true);
      updateDraftFromEvent(event);
    },
    [updateDraftFromEvent],
  );

  const commitDraftFromEvent = useCallback(
    (event: GestureResponderEvent) => {
      setIsDragging(false);
      const next = valueFromEvent(event) ?? draft;
      setDraft(next);
      onCommit(next);
    },
    [draft, onCommit, valueFromEvent],
  );

  const handleResponderTerminate = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleLayout = useCallback((event: LayoutChangeEvent) => {
    setTrackWidth(event.nativeEvent.layout.width);
  }, []);

  const handleShouldSetResponder = useCallback(() => !disabled, [disabled]);

  const handleAccessibilityAction = useCallback(
    (event: { nativeEvent: { actionName: string } }) => {
      const direction = event.nativeEvent.actionName === "increment" ? 1 : -1;
      const next = Math.min(max, Math.max(min, draft + direction * OPACITY_STEP));
      setDraft(next);
      onCommit(next);
    },
    [draft, max, min, onCommit],
  );

  const progress = (draft - min) / (max - min);
  const progressStyle = inlineUnistylesStyle({ width: progress * trackWidth });
  const thumbStyle = inlineUnistylesStyle({ left: progress * trackWidth });
  const accessibilityValue = useMemo(
    () => ({
      min: Math.round(min * 100),
      max: Math.round(max * 100),
      now: Math.round(draft * 100),
    }),
    [draft, max, min],
  );
  const cursorStyle = useMemo(
    () => (isWeb ? ({ cursor: getOpacityCursor(disabled, isDragging) } as object) : null),
    [disabled, isDragging],
  );

  return (
    <View style={[settingsStyles.row, settingsStyles.rowBorder, disabled ? styles.disabled : null]}>
      <View style={settingsStyles.rowContent}>
        <Text style={settingsStyles.rowTitle}>{title}</Text>
        <Text style={settingsStyles.rowHint}>{hint}</Text>
      </View>
      <View style={styles.opacityControl}>
        <View
          accessible
          accessibilityRole="adjustable"
          accessibilityLabel={accessibilityLabel}
          accessibilityValue={accessibilityValue}
          accessibilityActions={OPACITY_ACCESSIBILITY_ACTIONS}
          onAccessibilityAction={handleAccessibilityAction}
          onLayout={handleLayout}
          onStartShouldSetResponder={handleShouldSetResponder}
          onMoveShouldSetResponder={handleShouldSetResponder}
          onResponderGrant={handleResponderGrant}
          onResponderMove={updateDraftFromEvent}
          onResponderRelease={commitDraftFromEvent}
          onResponderTerminate={handleResponderTerminate}
          style={[styles.opacityTrackHitArea, cursorStyle]}
        >
          <View style={styles.opacityTrack}>
            <View style={[styles.opacityTrackFill, progressStyle]} />
            <View style={[styles.opacityThumb, thumbStyle]} />
          </View>
        </View>
        <Text style={styles.opacityValue} numberOfLines={1}>
          {Math.round(draft * 100)}%
        </Text>
      </View>
    </View>
  );
}

interface AutoExpandReasoningRowProps {
  value: boolean;
  onChange: (value: boolean) => void;
}

function AutoExpandReasoningRow({ value, onChange }: AutoExpandReasoningRowProps) {
  const { t } = useTranslation();
  return (
    <View style={settingsStyles.row}>
      <View style={settingsStyles.rowContent}>
        <Text style={settingsStyles.rowTitle}>
          {t("settings.general.autoExpandReasoning.label")}
        </Text>
        <Text style={settingsStyles.rowHint}>
          {t("settings.general.autoExpandReasoning.description")}
        </Text>
      </View>
      <Switch value={value} onValueChange={onChange} />
    </View>
  );
}

interface ChatOutlineRowProps {
  value: boolean;
  onChange: (value: boolean) => void;
}

function ChatOutlineRow({ value, onChange }: ChatOutlineRowProps) {
  const { t } = useTranslation();
  return (
    <View style={[settingsStyles.row, settingsStyles.rowBorder]}>
      <View style={settingsStyles.rowContent}>
        <Text style={settingsStyles.rowTitle}>{t("settings.appearance.chatOutline.title")}</Text>
        <Text style={settingsStyles.rowHint}>
          {t("settings.appearance.chatOutline.description")}
        </Text>
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        accessibilityLabel={t("settings.appearance.chatOutline.title")}
      />
    </View>
  );
}

const TOOL_CALL_DETAIL_LEVELS: readonly AppSettings["toolCallDetailLevel"][] = [
  "detailed",
  "overview",
];

function getToolCallDetailLevelLabel(
  t: TFunction,
  value: AppSettings["toolCallDetailLevel"],
): string {
  return t(`settings.general.toolCallDetail.options.${value}`);
}

interface ToolCallDetailMenuItemProps {
  value: AppSettings["toolCallDetailLevel"];
  selected: boolean;
  onChange: (value: AppSettings["toolCallDetailLevel"]) => void;
}

function ToolCallDetailMenuItem({ value, selected, onChange }: ToolCallDetailMenuItemProps) {
  const { t } = useTranslation();
  const handleSelect = useCallback(() => onChange(value), [onChange, value]);
  return (
    <DropdownMenuItem selected={selected} onSelect={handleSelect}>
      {getToolCallDetailLevelLabel(t, value)}
    </DropdownMenuItem>
  );
}

interface ToolCallDetailRowProps {
  value: AppSettings["toolCallDetailLevel"];
  onChange: (value: AppSettings["toolCallDetailLevel"]) => void;
}

function ToolCallDetailRow({ value, onChange }: ToolCallDetailRowProps) {
  const { t } = useTranslation();
  const selectedLabel = getToolCallDetailLevelLabel(t, value);
  return (
    <View style={[settingsStyles.row, settingsStyles.rowBorder]}>
      <View style={settingsStyles.rowContent}>
        <Text style={settingsStyles.rowTitle}>{t("settings.general.toolCallDetail.label")}</Text>
        <Text style={settingsStyles.rowHint}>
          {t("settings.general.toolCallDetail.description")}
        </Text>
      </View>
      <DropdownMenu>
        <DropdownMenuTrigger
          style={dropdownTriggerStyle}
          accessibilityLabel={t("settings.general.toolCallDetail.accessibilityLabel", {
            value: selectedLabel,
          })}
        >
          <Text style={styles.triggerText}>{selectedLabel}</Text>
          <ThemedChevronDown size={ICON_SIZE.sm} uniProps={mutedColorMapping} />
        </DropdownMenuTrigger>
        <DropdownMenuContent side="bottom" align="end" width={200}>
          {TOOL_CALL_DETAIL_LEVELS.map((option) => (
            <ToolCallDetailMenuItem
              key={option}
              value={option}
              selected={value === option}
              onChange={onChange}
            />
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Fonts: family text fields + numeric size fields (commit on blur/submit)
// ---------------------------------------------------------------------------

interface FontFamilyRowProps {
  title: string;
  hint: string;
  accessibilityLabel: string;
  placeholder: string;
  value: string;
  draft: string;
  withBorder: boolean;
  onChangeDraft: (value: string) => void;
  onCommit: (value: string) => void;
}

function FontFamilyRow({
  title,
  hint,
  accessibilityLabel,
  placeholder,
  value,
  draft,
  withBorder,
  onChangeDraft,
  onCommit,
}: FontFamilyRowProps) {
  const handleCommit = useCallback(() => {
    onCommit(draft);
  }, [draft, onCommit]);

  // Resync from the committed value when it changes elsewhere.
  useEffect(() => {
    onChangeDraft(value);
    // Only resync on external value changes, not on local keystrokes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <View style={withBorder ? styles.rowWithBorder : settingsStyles.row}>
      <View style={settingsStyles.rowContent}>
        <Text style={settingsStyles.rowTitle}>{title}</Text>
        <Text style={settingsStyles.rowHint}>{hint}</Text>
      </View>
      <TextInput
        value={draft}
        onChangeText={onChangeDraft}
        onBlur={handleCommit}
        onSubmitEditing={handleCommit}
        placeholder={placeholder}
        placeholderTextColor={styles.placeholderColor.color}
        autoCapitalize="none"
        autoCorrect={false}
        spellCheck={false}
        style={styles.fontFamilyInput}
        accessibilityLabel={accessibilityLabel}
      />
    </View>
  );
}

interface FontSizeRowProps {
  title: string;
  accessibilityLabel: string;
  draft: string;
  withBorder?: boolean;
  onChangeDraft: (value: string) => void;
  onCommit: () => void;
}

function FontSizeRow({
  title,
  accessibilityLabel,
  draft,
  withBorder = true,
  onChangeDraft,
  onCommit,
}: FontSizeRowProps) {
  return (
    <View style={withBorder ? styles.rowWithBorder : settingsStyles.row}>
      <View style={settingsStyles.rowContent}>
        <Text style={settingsStyles.rowTitle}>{title}</Text>
      </View>
      <View style={styles.sizeField}>
        <TextInput
          value={draft}
          onChangeText={onChangeDraft}
          onBlur={onCommit}
          onSubmitEditing={onCommit}
          keyboardType="number-pad"
          inputMode="numeric"
          selectTextOnFocus
          style={styles.sizeInput}
          accessibilityLabel={accessibilityLabel}
        />
        <Text style={styles.unit}>px</Text>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Syntax highlight theme picker (commits immediately)
// ---------------------------------------------------------------------------

function syntaxLabelForId(id: SyntaxThemeId): string {
  const option = SYNTAX_THEME_OPTIONS.find((entry) => entry.id === id);
  return option ? option.label : id;
}

interface SyntaxMenuItemProps {
  option: SyntaxThemeOption;
  selected: boolean;
  onChange: (id: SyntaxThemeId) => void;
}

function SyntaxMenuItem({ option, selected, onChange }: SyntaxMenuItemProps) {
  const handleSelect = useCallback(() => {
    onChange(option.id);
  }, [onChange, option.id]);
  return (
    <DropdownMenuItem selected={selected} onSelect={handleSelect}>
      {option.label}
    </DropdownMenuItem>
  );
}

interface SyntaxRowProps {
  value: SyntaxThemeId;
  onChange: (id: SyntaxThemeId) => void;
}

function SyntaxRow({ value, onChange }: SyntaxRowProps) {
  const { t } = useTranslation();
  const selectedLabel = syntaxLabelForId(value);
  return (
    <View style={settingsStyles.row}>
      <View style={settingsStyles.rowContent}>
        <Text style={settingsStyles.rowTitle}>
          {t("settings.appearance.syntax.highlightTheme")}
        </Text>
        <Text style={settingsStyles.rowHint}>
          {t("settings.appearance.syntax.highlightThemeHint")}
        </Text>
      </View>
      <DropdownMenu>
        <DropdownMenuTrigger
          style={dropdownTriggerStyle}
          accessibilityLabel={t("settings.appearance.syntax.highlightThemeAccessibility", {
            value: selectedLabel,
          })}
        >
          <Text style={styles.triggerText}>{selectedLabel}</Text>
          <ThemedChevronDown size={ICON_SIZE.sm} uniProps={mutedColorMapping} />
        </DropdownMenuTrigger>
        <DropdownMenuContent side="bottom" align="end" width={200}>
          {SYNTAX_THEME_OPTIONS.map((option) => (
            <SyntaxMenuItem
              key={option.id}
              option={option}
              selected={value === option.id}
              onChange={onChange}
            />
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function AppearanceSection() {
  const { t } = useTranslation();
  const { settings, updateSettings } = useAppSettings();
  const showFontFamilyRows = !isNative;
  const showBackgroundSettings = isElectronRuntime();
  const uiFontPlaceholder = resolveDefaultStackPlaceholder(t, DEFAULT_UI_FONT_STACK);
  const monoFontPlaceholder = resolveDefaultStackPlaceholder(t, DEFAULT_MONO_FONT_STACK);

  const [uiFontDraft, setUiFontDraft] = useState(settings.uiFontFamily);
  const [monoFontDraft, setMonoFontDraft] = useState(settings.monoFontFamily);
  const [uiSizeDraft, setUiSizeDraft] = useState(String(settings.uiFontSize));
  const [codeSizeDraft, setCodeSizeDraft] = useState(String(settings.codeFontSize));
  const [backgroundAction, setBackgroundAction] = useState<"choose" | "clear" | null>(null);
  const [backgroundError, setBackgroundError] = useState<string | null>(null);

  // Resync numeric drafts when the committed value changes elsewhere.
  useEffect(() => {
    setUiSizeDraft(String(settings.uiFontSize));
  }, [settings.uiFontSize]);
  useEffect(() => {
    setCodeSizeDraft(String(settings.codeFontSize));
  }, [settings.codeFontSize]);

  const handleThemeChange = useCallback(
    (theme: AppSettings["theme"]) => {
      void updateSettings({ theme });
    },
    [updateSettings],
  );

  const handleSyntaxThemeChange = useCallback(
    (syntaxTheme: SyntaxThemeId) => {
      void updateSettings({ syntaxTheme });
    },
    [updateSettings],
  );

  const handleAutoExpandReasoningChange = useCallback(
    (autoExpandReasoning: boolean) => {
      void updateSettings({ autoExpandReasoning });
    },
    [updateSettings],
  );

  const handleToolCallDetailLevelChange = useCallback(
    (toolCallDetailLevel: AppSettings["toolCallDetailLevel"]) => {
      void updateSettings({ toolCallDetailLevel });
    },
    [updateSettings],
  );

  const handleChooseBackground = useCallback(async () => {
    setBackgroundAction("choose");
    setBackgroundError(null);
    try {
      const path = await pickDesktopBackgroundImagePath({
        currentPath: settings.backgroundImagePath,
        title: t("settings.appearance.background.dialogTitle"),
      });
      if (!path) {
        return;
      }
      await readDesktopBackgroundImage(path);
      await updateSettings({ backgroundImagePath: path });
    } catch {
      setBackgroundError(t("settings.appearance.background.loadError"));
    } finally {
      setBackgroundAction(null);
    }
  }, [settings.backgroundImagePath, t, updateSettings]);

  const handleClearBackground = useCallback(async () => {
    setBackgroundAction("clear");
    setBackgroundError(null);
    try {
      await updateSettings({ backgroundImagePath: "" });
    } catch {
      setBackgroundError(t("settings.appearance.background.saveError"));
    } finally {
      setBackgroundAction(null);
    }
  }, [t, updateSettings]);

  const handleBackgroundOpacityChange = useCallback(
    (backgroundImageOpacity: number) => {
      setBackgroundError(null);
      void updateSettings({ backgroundImageOpacity }).catch(() => {
        setBackgroundError(t("settings.appearance.background.saveError"));
      });
    },
    [t, updateSettings],
  );

  const handleInterfaceOpacityChange = useCallback(
    (interfaceOpacity: number) => {
      setBackgroundError(null);
      void updateSettings({ interfaceOpacity }).catch(() => {
        setBackgroundError(t("settings.appearance.background.saveError"));
      });
    },
    [t, updateSettings],
  );

  const handleChatOutlineChange = useCallback(
    (chatOutlineEnabled: boolean) => {
      void updateSettings({ chatOutlineEnabled });
    },
    [updateSettings],
  );

  const commitUiFontFamily = useCallback(
    (value: string) => {
      const sanitized = sanitizeFontFamily(value);
      if (sanitized === null) {
        setUiFontDraft(settings.uiFontFamily);
        return;
      }
      setUiFontDraft(sanitized);
      if (sanitized !== settings.uiFontFamily) {
        void updateSettings({ uiFontFamily: sanitized });
      }
    },
    [settings.uiFontFamily, updateSettings],
  );

  const commitMonoFontFamily = useCallback(
    (value: string) => {
      const sanitized = sanitizeFontFamily(value);
      if (sanitized === null) {
        setMonoFontDraft(settings.monoFontFamily);
        return;
      }
      setMonoFontDraft(sanitized);
      if (sanitized !== settings.monoFontFamily) {
        void updateSettings({ monoFontFamily: sanitized });
      }
    },
    [settings.monoFontFamily, updateSettings],
  );

  const handleUiSizeChange = useCallback((value: string) => {
    setUiSizeDraft(value.replace(/[^\d]/g, ""));
  }, []);

  const handleCodeSizeChange = useCallback((value: string) => {
    setCodeSizeDraft(value.replace(/[^\d]/g, ""));
  }, []);

  const commitUiSize = useCallback(() => {
    const parsed = parseClampedFontSize(uiSizeDraft, {
      min: MIN_UI_FONT_SIZE,
      max: MAX_UI_FONT_SIZE,
    });
    const next = parsed ?? settings.uiFontSize;
    setUiSizeDraft(String(next));
    if (next !== settings.uiFontSize) {
      void updateSettings({ uiFontSize: next });
    }
  }, [settings.uiFontSize, uiSizeDraft, updateSettings]);

  const commitCodeSize = useCallback(() => {
    const parsed = parseClampedFontSize(codeSizeDraft, {
      min: MIN_CODE_FONT_SIZE,
      max: MAX_CODE_FONT_SIZE,
    });
    const next = parsed ?? settings.codeFontSize;
    setCodeSizeDraft(String(next));
    if (next !== settings.codeFontSize) {
      void updateSettings({ codeFontSize: next });
    }
  }, [codeSizeDraft, settings.codeFontSize, updateSettings]);

  // Live-while-typing: the in-progress drafts drive the preview without
  // committing to the global theme. Empty/invalid fields fall back to the
  // theme value inside the preview.
  const previewOverrides = useMemo(
    () => ({
      monoFontFamily: monoFontDraft,
      codeFontSize: sizeDraftToOverride(codeSizeDraft),
    }),
    [codeSizeDraft, monoFontDraft],
  );

  return (
    <View>
      <SettingsSection title={t("settings.appearance.theme.title")}>
        <View style={settingsStyles.card}>
          <ThemeRow value={settings.theme} onChange={handleThemeChange} />
        </View>
      </SettingsSection>
      {showBackgroundSettings ? (
        <SettingsSection title={t("settings.appearance.background.title")}>
          <View style={settingsStyles.card}>
            <BackgroundImageRow
              path={settings.backgroundImagePath}
              error={backgroundError}
              pendingAction={backgroundAction}
              onChoose={handleChooseBackground}
              onClear={handleClearBackground}
            />
            <OpacityRow
              value={settings.backgroundImageOpacity}
              disabled={!settings.backgroundImagePath || backgroundAction !== null}
              min={MIN_BACKGROUND_IMAGE_OPACITY}
              max={MAX_BACKGROUND_IMAGE_OPACITY}
              title={t("settings.appearance.background.imageOpacity")}
              hint={t("settings.appearance.background.imageOpacityHint")}
              accessibilityLabel={t("settings.appearance.background.imageOpacityAccessibility")}
              onCommit={handleBackgroundOpacityChange}
            />
            <OpacityRow
              value={settings.interfaceOpacity}
              disabled={!settings.backgroundImagePath || backgroundAction !== null}
              min={MIN_INTERFACE_OPACITY}
              max={MAX_INTERFACE_OPACITY}
              title={t("settings.appearance.background.interfaceOpacity")}
              hint={t("settings.appearance.background.interfaceOpacityHint")}
              accessibilityLabel={t("settings.appearance.background.interfaceOpacityAccessibility")}
              onCommit={handleInterfaceOpacityChange}
            />
          </View>
        </SettingsSection>
      ) : null}
      <SettingsSection title={t("settings.appearance.detailLevel.title")}>
        <View style={settingsStyles.card}>
          <AutoExpandReasoningRow
            value={settings.autoExpandReasoning}
            onChange={handleAutoExpandReasoningChange}
          />
          <ToolCallDetailRow
            value={settings.toolCallDetailLevel}
            onChange={handleToolCallDetailLevelChange}
          />
          {!isNative ? (
            <ChatOutlineRow
              value={settings.chatOutlineEnabled}
              onChange={handleChatOutlineChange}
            />
          ) : null}
        </View>
      </SettingsSection>
      <SettingsSection title={t("settings.appearance.fonts.title")}>
        <View style={settingsStyles.card}>
          {showFontFamilyRows ? (
            <FontFamilyRow
              title={t("settings.appearance.fonts.interfaceFont")}
              hint={t("settings.appearance.fonts.interfaceFontHint")}
              accessibilityLabel={t("settings.appearance.fonts.interfaceFontAccessibility")}
              placeholder={uiFontPlaceholder}
              value={settings.uiFontFamily}
              draft={uiFontDraft}
              withBorder={false}
              onChangeDraft={setUiFontDraft}
              onCommit={commitUiFontFamily}
            />
          ) : null}
          <FontSizeRow
            title={t("settings.appearance.fonts.interfaceSize")}
            accessibilityLabel={t("settings.appearance.fonts.interfaceSizeAccessibility")}
            draft={uiSizeDraft}
            withBorder={showFontFamilyRows}
            onChangeDraft={handleUiSizeChange}
            onCommit={commitUiSize}
          />
          {showFontFamilyRows ? (
            <FontFamilyRow
              title={t("settings.appearance.fonts.codeFont")}
              hint={t("settings.appearance.fonts.codeFontHint")}
              accessibilityLabel={t("settings.appearance.fonts.codeFontAccessibility")}
              placeholder={monoFontPlaceholder}
              value={settings.monoFontFamily}
              draft={monoFontDraft}
              withBorder
              onChangeDraft={setMonoFontDraft}
              onCommit={commitMonoFontFamily}
            />
          ) : null}
          <FontSizeRow
            title={t("settings.appearance.fonts.codeSize")}
            accessibilityLabel={t("settings.appearance.fonts.codeSizeAccessibility")}
            draft={codeSizeDraft}
            onChangeDraft={handleCodeSizeChange}
            onCommit={commitCodeSize}
          />
        </View>
      </SettingsSection>
      <SettingsSection title={t("settings.appearance.syntax.title")}>
        <View style={settingsStyles.card}>
          <SyntaxRow value={settings.syntaxTheme} onChange={handleSyntaxThemeChange} />
        </View>
        <View style={styles.preview}>
          <AppearancePreview overrides={previewOverrides} />
        </View>
      </SettingsSection>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  preview: {
    marginTop: theme.spacing[4],
  },
  rowWithBorder: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: theme.spacing[4],
    paddingHorizontal: theme.spacing[4],
    borderTopWidth: theme.borderWidth[1],
    borderTopColor: theme.colors.border,
  },
  trigger: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
    paddingVertical: theme.spacing[1],
    paddingHorizontal: theme.spacing[2],
    borderRadius: theme.borderRadius.md,
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.border,
  },
  triggerPressed: {
    opacity: 0.85,
  },
  triggerText: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
  },
  swatch: {
    width: ICON_SIZE.md,
    height: ICON_SIZE.md,
    borderRadius: ICON_SIZE.md / 2,
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.border,
  },
  fontFamilyInput: {
    flexGrow: 1,
    flexShrink: 1,
    maxWidth: 280,
    minHeight: 36,
    paddingVertical: theme.spacing[2],
    paddingHorizontal: theme.spacing[3],
    borderRadius: theme.borderRadius.md,
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface2,
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    textAlign: "left",
  },
  sizeField: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
  },
  sizeInput: {
    width: 64,
    minHeight: 36,
    paddingVertical: theme.spacing[2],
    paddingHorizontal: theme.spacing[3],
    borderRadius: theme.borderRadius.md,
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface2,
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    textAlign: "right",
  },
  unit: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
  backgroundActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
  },
  opacityControl: {
    width: 220,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[3],
  },
  opacityTrackHitArea: {
    flex: 1,
    height: 36,
    justifyContent: "center",
  },
  opacityTrack: {
    height: 6,
    borderRadius: theme.borderRadius.full,
    backgroundColor: theme.colors.surface3,
  },
  opacityTrackFill: {
    height: 6,
    borderRadius: theme.borderRadius.full,
    backgroundColor: theme.colors.accent,
  },
  opacityThumb: {
    position: "absolute",
    top: -5,
    width: 16,
    height: 16,
    marginLeft: -8,
    borderRadius: theme.borderRadius.full,
    borderWidth: theme.borderWidth[2],
    borderColor: theme.colors.surface0,
    backgroundColor: theme.colors.accent,
  },
  opacityValue: {
    width: 44,
    flexShrink: 0,
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    textAlign: "right",
  },
  disabled: {
    opacity: theme.opacity[50],
  },
  placeholderColor: {
    color: theme.colors.foregroundMuted,
  },
}));
