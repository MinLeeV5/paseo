import { ChevronDown, ChevronUp, Search, X } from "lucide-react-native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  type NativeSyntheticEvent,
  Text,
  TextInput,
  type TextInputKeyPressEventData,
  View,
} from "react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { Button } from "@/components/ui/button";
import type { Theme } from "@/styles/theme";
import type { FileSearchController } from "./use-search";

const ThemedSearch = withUnistyles(Search);
const ThemedSearchInput = withUnistyles(TextInput, (theme) => ({
  placeholderTextColor: theme.colors.foregroundMuted,
  selectionColor: theme.colors.accent,
}));
const foregroundMutedColorMapping = (theme: Theme) => ({ color: theme.colors.foregroundMuted });
const foregroundColorMapping = (theme: Theme) => ({ color: theme.colors.foreground });

export function FileSearchToolbar({ search }: { search: FileSearchController }) {
  const { t } = useTranslation();
  const inputRef = useRef<TextInput>(null);
  const [isInputFocused, setIsInputFocused] = useState(false);

  useEffect(() => {
    inputRef.current?.focus();
  }, [search.focusRevision]);

  const previous = useCallback(() => search.navigate("previous"), [search]);
  const next = useCallback(() => search.navigate("next"), [search]);
  const close = useCallback(() => search.close(), [search]);
  const focusInput = useCallback(() => setIsInputFocused(true), []);
  const blurInput = useCallback(() => setIsInputFocused(false), []);
  const handleKeyPress = useCallback(
    (event: NativeSyntheticEvent<TextInputKeyPressEventData>) => {
      if (event.nativeEvent.key === "Escape") {
        close();
        return;
      }
      const isPreviousNavigation =
        event.nativeEvent.key === "Enter" && Reflect.get(event.nativeEvent, "shiftKey") === true;
      if (isPreviousNavigation) {
        event.preventDefault();
        previous();
      }
    },
    [close, previous],
  );
  const resultLabel = useMemo(() => {
    if (!search.query || search.matchCount === 0) {
      return t("panels.file.search.noMatches");
    }
    return t("panels.file.search.matchCount", {
      current: search.currentIndex + 1,
      total: search.matchCount,
    });
  }, [search.currentIndex, search.matchCount, search.query, t]);
  const navigationDisabled = search.matchCount === 0;

  return (
    <View style={styles.toolbar} testID="file-search-toolbar">
      <View style={styles.controls}>
        <View style={[styles.field, isInputFocused && styles.fieldFocused]}>
          <ThemedSearch
            size={16}
            uniProps={isInputFocused ? foregroundColorMapping : foregroundMutedColorMapping}
          />
          <ThemedSearchInput
            ref={inputRef}
            autoFocus
            value={search.query}
            onChangeText={search.setQuery}
            onFocus={focusInput}
            onBlur={blurInput}
            onKeyPress={handleKeyPress}
            onSubmitEditing={next}
            placeholder={t("panels.file.search.placeholder")}
            accessibilityLabel={t("panels.file.search.placeholder")}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            blurOnSubmit={false}
            style={styles.input}
            testID="file-search-input"
          />
          <Text
            style={styles.resultCount}
            accessibilityLiveRegion="polite"
            testID="file-search-result-count"
          >
            {resultLabel}
          </Text>
        </View>
        <Button
          variant="ghost"
          size="xs"
          leftIcon={ChevronUp}
          style={styles.iconButton}
          disabled={navigationDisabled}
          accessibilityLabel={t("panels.file.search.previous")}
          onPress={previous}
          testID="file-search-previous"
        />
        <Button
          variant="ghost"
          size="xs"
          leftIcon={ChevronDown}
          style={styles.iconButton}
          disabled={navigationDisabled}
          accessibilityLabel={t("panels.file.search.next")}
          onPress={next}
          testID="file-search-next"
        />
        <Button
          variant="ghost"
          size="xs"
          leftIcon={X}
          style={styles.iconButton}
          accessibilityLabel={t("panels.file.search.close")}
          onPress={close}
          testID="file-search-close"
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  toolbar: {
    width: "100%",
    maxWidth: 440,
    padding: theme.spacing[1],
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.lg,
    backgroundColor: theme.colors.surface0,
    ...theme.shadow.md,
  },
  controls: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
  },
  field: {
    flex: 1,
    minWidth: 0,
    height: 32,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
    paddingHorizontal: theme.spacing[2],
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.surface1,
  },
  fieldFocused: {
    backgroundColor: theme.colors.surface2,
  },
  input: {
    flex: 1,
    minWidth: 0,
    height: "100%",
    paddingVertical: 0,
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    outlineWidth: 0,
    outlineColor: "transparent",
  },
  resultCount: {
    flexShrink: 0,
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.xs,
    fontVariant: ["tabular-nums"],
  },
  iconButton: {
    width: 28,
    paddingHorizontal: 0,
  },
}));
