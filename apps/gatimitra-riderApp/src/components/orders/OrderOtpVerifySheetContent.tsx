import React, { useEffect, useRef, useState, type ReactNode } from "react";
import { View, Text, StyleSheet, ScrollView, Keyboard, Platform } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useSheetKeyboardState } from "@/src/components/language/DismissibleBottomSheetShell";
import { RidePickupOtpEntry } from "@/src/components/orders/RidePickupOtpEntry";
import { colors } from "@/src/theme";

type Props = {
  title: string;
  subtitle: string;
  compactSubtitle?: string;
  iconName: keyof typeof Ionicons.glyphMap;
  headerGradient: [string, string];
  badgeGradient: [string, string];
  error?: string | null;
  loading?: boolean;
  resetKey?: number;
  otpMode: "food" | "ride" | "delivery";
  autoSubmit?: boolean;
  autoFocus?: boolean;
  inputMode?: "system" | "keypad";
  onSubmit: (otp: string) => void;
  onClearError?: () => void;
  prependContent?: ReactNode;
};

export function OrderOtpVerifySheetContent({
  title,
  subtitle,
  compactSubtitle,
  iconName,
  headerGradient,
  badgeGradient,
  error,
  loading = false,
  resetKey = 0,
  otpMode,
  autoSubmit = true,
  autoFocus = true,
  inputMode = "system",
  onSubmit,
  onClearError,
  prependContent,
}: Props) {
  const { keyboardOpen, availableHeight } = useSheetKeyboardState();
  const usesKeypad = inputMode === "keypad";
  const [systemKeyboardVisible, setSystemKeyboardVisible] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    if (usesKeypad) {
      setSystemKeyboardVisible(false);
      return;
    }

    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const showSub = Keyboard.addListener(showEvent, () => setSystemKeyboardVisible(true));
    const hideSub = Keyboard.addListener(hideEvent, () => setSystemKeyboardVisible(false));

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [usesKeypad]);

  const keyboardUiOpen = (keyboardOpen || systemKeyboardVisible) && !usesKeypad;

  useEffect(() => {
    if (!keyboardUiOpen) return;
    const timer = setTimeout(() => {
      scrollRef.current?.scrollToEnd({ animated: false });
    }, 60);
    return () => clearTimeout(timer);
  }, [keyboardUiOpen, resetKey]);

  const headerSubtitle = keyboardUiOpen
    ? compactSubtitle ?? subtitle
    : subtitle;

  return (
    <View
      style={[
        styles.root,
        availableHeight != null && { maxHeight: availableHeight },
      ]}
    >
      <View
        style={[styles.fullHeaderWrap, keyboardUiOpen && styles.sectionHidden]}
        pointerEvents={keyboardUiOpen ? "none" : "auto"}
        accessibilityElementsHidden={keyboardUiOpen}
        importantForAccessibility={keyboardUiOpen ? "no-hide-descendants" : "auto"}
      >
        <LinearGradient
          colors={headerGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={styles.headerGradient}
        >
          <View style={styles.handle} />

          <View style={styles.headerRow}>
            <LinearGradient
              colors={badgeGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.iconBadge}
            >
              <Ionicons name={iconName} size={22} color="#ffffff" />
            </LinearGradient>

            <View style={styles.headerCopy}>
              <Text style={styles.title} numberOfLines={2}>
                {title}
              </Text>
              <Text style={styles.subtitle}>{subtitle}</Text>
            </View>
          </View>
        </LinearGradient>
      </View>

      <View
        style={[styles.compactHeaderWrap, !keyboardUiOpen && styles.sectionHidden]}
        pointerEvents={keyboardUiOpen ? "auto" : "none"}
        accessibilityElementsHidden={!keyboardUiOpen}
        importantForAccessibility={!keyboardUiOpen ? "no-hide-descendants" : "auto"}
      >
        <View style={styles.keyboardHandle} />
        <Text style={styles.keyboardHint} numberOfLines={2}>
          {headerSubtitle}
        </Text>
      </View>

      {error && !keyboardUiOpen ? (
        <View style={styles.errorRow}>
          <Ionicons name="alert-circle" size={18} color={colors.error[600]} />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      <ScrollView
        ref={scrollRef}
        style={[styles.scroll, keyboardUiOpen && styles.scrollKeyboard]}
        contentContainerStyle={[
          styles.scrollContent,
          keyboardUiOpen && styles.scrollContentKeyboard,
        ]}
        keyboardShouldPersistTaps="always"
        keyboardDismissMode="none"
        showsVerticalScrollIndicator={false}
        bounces={false}
        nestedScrollEnabled
        scrollEnabled={keyboardUiOpen}
      >
        <View
          style={[styles.prependWrap, keyboardUiOpen && styles.sectionHidden]}
          pointerEvents={keyboardUiOpen ? "none" : "auto"}
        >
          {prependContent}
        </View>

        <RidePickupOtpEntry
          loading={loading}
          error={error}
          resetKey={resetKey}
          mode={otpMode}
          autoSubmit={autoSubmit}
          inputMode={inputMode}
          hideSectionCopy
          onSubmit={onSubmit}
          onErrorClear={onClearError}
        />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    width: "100%",
    flexShrink: 1,
    minHeight: 0,
  },
  sectionHidden: {
    height: 0,
    overflow: "hidden",
    opacity: 0,
  },
  fullHeaderWrap: {
    width: "100%",
  },
  compactHeaderWrap: {
    width: "100%",
    paddingTop: 8,
  },
  keyboardHandle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 999,
    backgroundColor: colors.gray[300],
    marginBottom: 10,
  },
  keyboardHint: {
    marginHorizontal: 20,
    marginBottom: 8,
    fontSize: 13,
    fontWeight: "600",
    color: colors.gray[600],
    lineHeight: 18,
    textAlign: "center",
  },
  headerGradient: {
    paddingTop: 8,
    paddingBottom: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.gray[100],
  },
  handle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 999,
    backgroundColor: colors.gray[300],
    marginBottom: 14,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 14,
    paddingHorizontal: 20,
  },
  iconBadge: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  headerCopy: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: 20,
    fontWeight: "800",
    color: colors.gray[900],
    letterSpacing: -0.35,
    lineHeight: 26,
  },
  subtitle: {
    marginTop: 6,
    fontSize: 13,
    fontWeight: "500",
    color: colors.gray[500],
    lineHeight: 19,
  },
  scroll: {
    width: "100%",
  },
  scrollKeyboard: {
    flexShrink: 1,
    minHeight: 0,
  },
  scrollContent: {
    paddingTop: 12,
    paddingBottom: 12,
  },
  scrollContentKeyboard: {
    paddingTop: 4,
    paddingBottom: 4,
  },
  prependWrap: {
    width: "100%",
  },
  errorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: 20,
    marginBottom: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: colors.error[50],
    borderWidth: 1,
    borderColor: colors.error[100],
  },
  errorText: {
    flex: 1,
    fontSize: 13,
    fontWeight: "600",
    color: colors.error[700],
    lineHeight: 18,
  },
});
