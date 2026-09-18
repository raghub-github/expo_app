import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "@/src/theme";
import {
  onboardingTopBarHeightBelowSafeArea,
} from "@/src/components/onboarding/OnboardingTopBar";

const ACCENT = "#39d353";
const ACCENT_DARK = "#22a745";

/** Visible gap between floating top bar and the step pill on every onboarding screen. */
export const ONBOARDING_STEP_PILL_GAP_BELOW_TOP_BAR = 2;

/** Space below safe area until step pill (bar height + gap). */
export const ONBOARDING_HEADER_BAR_CLEARANCE =
  onboardingTopBarHeightBelowSafeArea() + ONBOARDING_STEP_PILL_GAP_BELOW_TOP_BAR;

export function onboardingHeaderPaddingTop(safeAreaTop: number): number {
  return Math.max(safeAreaTop, 0) + ONBOARDING_HEADER_BAR_CLEARANCE;
}

/** Bottom inset so sticky Continue never sits under the system nav gesture bar. */
export function onboardingStickyFooterBottomPad(safeAreaBottom: number): number {
  return Math.max(safeAreaBottom, 12) + 10;
}

/** Extra ScrollView padding so last content clears the sticky Continue bar. */
export function onboardingStickyScrollPadding(safeAreaBottom: number): number {
  // button (~54) + footer paddingTop (12) + bottom pad + breathing room
  return onboardingStickyFooterBottomPad(safeAreaBottom) + 54 + 12 + 16;
}

/**
 * Pins primary Continue/Next actions to the bottom of the viewport.
 * Parent SafeAreaView should use edges that omit "bottom" so padding is not doubled.
 */
export function OnboardingStickyFooter({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: object;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[
        stickyStyles.footer,
        { paddingBottom: onboardingStickyFooterBottomPad(insets.bottom) },
        style,
      ]}
      collapsable={false}
    >
      {children}
    </View>
  );
}

export function ContinueButton({
  label,
  onPress,
  disabled,
  loading,
  icon = "arrow-forward",
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
}) {
  const inactive = Boolean(disabled || loading);

  return (
    <TouchableOpacity
      activeOpacity={inactive ? 1 : 0.85}
      onPress={() => {
        if (!inactive) onPress();
      }}
      accessibilityRole="button"
      accessibilityState={{ disabled: inactive }}
      style={[styles.continueBtn, inactive && styles.continueBtnDisabled]}
    >
      {loading ? (
        <ActivityIndicator color="#ffffff" />
      ) : (
        <>
          <Text style={[styles.continueBtnText, inactive && styles.continueBtnTextDisabled]}>
            {label}
          </Text>
          <Ionicons name={icon} size={18} color="#ffffff" />
        </>
      )}
    </TouchableOpacity>
  );
}

export function SkipDocumentButton({
  label,
  onPress,
  disabled,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  const inactive = Boolean(disabled);

  return (
    <TouchableOpacity
      activeOpacity={inactive ? 1 : 0.85}
      onPress={() => {
        if (!inactive) onPress();
      }}
      accessibilityRole="button"
      accessibilityState={{ disabled: inactive }}
      style={[styles.skipBtn, inactive && styles.skipBtnDisabled]}
    >
      <Ionicons name="play-skip-forward-outline" size={18} color={colors.gray[700]} />
      <Text style={styles.skipBtnText}>{label}</Text>
    </TouchableOpacity>
  );
}

/** Top-right red Skip / green Skipped control — same pattern as PAN onboarding. */
export function HeaderSkipLink({
  label,
  onPress,
  disabled,
  hidden,
  skipped,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  /** Keep mounted (Fabric-safe) but invisible — avoids viewState crashes on skip show/hide. */
  hidden?: boolean;
  /** Already skipped — show green badge, not a faded Skip link. */
  skipped?: boolean;
}) {
  const inactive = Boolean(disabled) || Boolean(hidden) || Boolean(skipped);
  return (
    <TouchableOpacity
      activeOpacity={skipped || inactive ? 1 : 0.7}
      onPress={() => {
        if (!inactive) onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: inactive }}
      accessibilityElementsHidden={Boolean(hidden)}
      importantForAccessibility={hidden ? "no-hide-descendants" : "yes"}
      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      style={[
        onboardingFormStyles.headerSkipBtn,
        skipped && onboardingFormStyles.headerSkippedBadge,
        !skipped && inactive && onboardingFormStyles.headerSkipBtnDisabled,
        hidden && onboardingFormStyles.headerSkipHidden,
      ]}
    >
      <Text
        style={[
          onboardingFormStyles.headerSkipText,
          skipped && onboardingFormStyles.headerSkippedText,
        ]}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

export function FieldLabel({ label, required }: { label: string; required?: boolean }) {
  return (
    <Text style={styles.fieldLabel}>
      {label}
      {required ? <Text style={styles.requiredMark}> *</Text> : null}
    </Text>
  );
}

export function ChecklistItem({ done, label }: { done: boolean; label: string }) {
  return (
    <View style={styles.checkItem}>
      <View style={[styles.checkCircle, done && styles.checkCircleDone]}>
        {done ? (
          <Ionicons name="checkmark" size={12} color="#ffffff" />
        ) : (
          <View style={styles.checkDot} />
        )}
      </View>
      <Text
        style={[styles.checkLabel, done && styles.checkLabelDone]}
        numberOfLines={1}
        ellipsizeMode="clip"
        adjustsFontSizeToFit
        minimumFontScale={0.72}
      >
        {label}
      </Text>
    </View>
  );
}

export function ErrorBanner({ message }: { message: string }) {
  return (
    <View style={styles.errorBanner}>
      <Ionicons name="warning-outline" size={18} color={colors.error[600]} />
      <Text style={styles.errorText}>{message}</Text>
    </View>
  );
}

export function StepProgress({
  steps,
  currentIndex,
}: {
  steps: string[];
  currentIndex: number;
}) {
  return (
    <View style={styles.stepProgress} collapsable={false}>
      {steps.map((label, index) => {
        const isActive = index === currentIndex;
        const isDone = index < currentIndex;
        const isLast = index === steps.length - 1;

        return (
          <View key={label} style={styles.stepProgressSegment} collapsable={false}>
            <View style={styles.stepProgressItem}>
              <View
                style={[
                  styles.stepDot,
                  (isActive || isDone) && styles.stepDotActive,
                ]}
              >
                {isDone ? (
                  <Ionicons name="checkmark" size={12} color="#ffffff" />
                ) : (
                  <Text
                    style={[
                      styles.stepDotNum,
                      isActive && styles.stepDotNumActive,
                    ]}
                  >
                    {index + 1}
                  </Text>
                )}
              </View>
              <Text
                style={[
                  styles.stepProgressLabel,
                  (isActive || isDone) && styles.stepProgressLabelActive,
                ]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.75}
              >
                {label}
              </Text>
            </View>
            {!isLast ? (
              <View
                style={[
                  styles.stepLine,
                  index < currentIndex && styles.stepLineActive,
                ]}
              />
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

export const onboardingFormStyles = StyleSheet.create({
  root: {
    flex: 1,
    alignSelf: "stretch",
    backgroundColor: "#f4fbf6",
  },
  safeArea: {
    flex: 1,
    alignSelf: "stretch",
    backgroundColor: "#f4fbf6",
  },
  flex: {
    flex: 1,
    alignSelf: "stretch",
    minWidth: 0,
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: 28,
    backgroundColor: "#f4fbf6",
  },
  header: {
    alignSelf: "stretch",
    paddingHorizontal: 20,
    /** `paddingTop` set per screen via onboardingHeaderPaddingTop(insets.top). */
    paddingTop: 0,
    paddingBottom: 14,
    alignItems: "center",
  },
  headerTopRow: {
    alignSelf: "stretch",
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    marginBottom: 4,
    minHeight: 32,
  },
  backBtn: {
    alignSelf: "flex-start",
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.9)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.06)",
  },
  /** Back button inside headerTopRow (no extra bottom margin — Fabric-safe stable style). */
  headerBackBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.9)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.06)",
  },
  headerSkipBtn: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    minWidth: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 999,
  },
  headerSkipBtnDisabled: {
    opacity: 0.4,
  },
  headerSkippedBadge: {
    backgroundColor: "#fef2f2",
    borderWidth: 1,
    borderColor: "#fecaca",
    opacity: 1,
  },
  headerSkipHidden: {
    opacity: 0,
  },
  headerSkipText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#dc2626",
  },
  headerSkippedText: {
    color: "#dc2626",
    fontSize: 13,
  },
  /** Skip/Skipped overlays the header — does not push the step pill down. */
  headerSkipOverlay: {
    position: "absolute",
    right: 16,
    zIndex: 4,
  },
  headerSkipSpacer: {
    width: 48,
    height: 40,
  },
  stepPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(255,255,255,0.85)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(57, 211, 83, 0.25)",
    marginTop: 0,
    marginBottom: 0,
  },
  stepPillText: {
    fontSize: 12,
    fontWeight: "600",
    color: ACCENT_DARK,
    flexShrink: 1,
  },
  title: {
    fontSize: 24,
    fontWeight: "800",
    color: colors.gray[900],
    textAlign: "center",
    marginBottom: 6,
    letterSpacing: -0.3,
    alignSelf: "stretch",
    paddingHorizontal: 4,
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 20,
    color: colors.gray[600],
    textAlign: "center",
    alignSelf: "stretch",
    maxWidth: "100%",
    paddingHorizontal: 4,
  },
  formCard: {
    alignSelf: "stretch",
    marginHorizontal: 16,
    marginTop: 12,
    backgroundColor: "#ffffff",
    borderRadius: 20,
    padding: 20,
    gap: 20,
    borderWidth: 1,
    borderColor: "rgba(57, 211, 83, 0.15)",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.06,
        shadowRadius: 12,
      },
      android: { elevation: 3 },
    }),
  },
  fieldGroup: {
    gap: 8,
  },
  sectionHint: {
    fontSize: 12,
    color: colors.gray[500],
    lineHeight: 17,
    marginTop: -2,
  },
  inputWrap: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.gray[50],
    borderWidth: 1.5,
    borderColor: colors.gray[200],
    borderRadius: 14,
    paddingHorizontal: 14,
    minHeight: 52,
  },
  inputIcon: {
    marginRight: 10,
  },
  textInput: {
    flex: 1,
    fontSize: 16,
    fontFamily: "Lora_700Bold",
    fontWeight: "700",
    color: colors.gray[900],
    paddingVertical: Platform.OS === "ios" ? 14 : 10,
    letterSpacing: 0.5,
  },
  divider: {
    height: 1,
    backgroundColor: colors.gray[100],
    marginVertical: -4,
  },
  changePhotoLink: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 4,
  },
  changePhotoText: {
    fontSize: 13,
    fontWeight: "600",
    color: ACCENT_DARK,
  },
});

const styles = StyleSheet.create({
  continueBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: ACCENT,
    borderRadius: 14,
    paddingVertical: 16,
    marginTop: 0,
  },
  continueBtnDisabled: {
    backgroundColor: "#16a34a",
    borderWidth: 0,
    opacity: 0.45,
  },
  continueBtnText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#ffffff",
  },
  continueBtnTextDisabled: {
    color: "#ffffff",
  },
  skipBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 0,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: colors.gray[300],
    backgroundColor: "#fff",
  },
  skipBtnDisabled: {
    opacity: 0.6,
  },
  skipBtnText: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.gray[700],
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.gray[700],
    letterSpacing: 0.2,
  },
  requiredMark: {
    color: colors.error[500],
  },
  checkItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minWidth: 0,
  },
  checkCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: colors.gray[300],
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.gray[50],
    flexShrink: 0,
  },
  checkCircleDone: {
    backgroundColor: ACCENT,
    borderColor: ACCENT,
  },
  checkDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.gray[300],
  },
  checkLabel: {
    flexShrink: 1,
    minWidth: 0,
    fontSize: 12,
    color: colors.gray[500],
    fontWeight: "500",
  },
  checkLabelDone: {
    color: colors.gray[800],
    fontWeight: "600",
  },
  errorBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    padding: 12,
    backgroundColor: colors.error[50],
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.error[200],
  },
  errorText: {
    flex: 1,
    fontSize: 13,
    color: colors.error[600],
    lineHeight: 18,
  },
  stepProgress: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "stretch",
    paddingVertical: 4,
  },
  stepProgressSegment: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    minWidth: 0,
  },
  stepProgressItem: {
    alignItems: "center",
    gap: 6,
    flex: 1,
    minWidth: 0,
  },
  stepDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: colors.gray[300],
    backgroundColor: colors.gray[50],
    alignItems: "center",
    justifyContent: "center",
  },
  stepDotActive: {
    backgroundColor: ACCENT,
    borderColor: ACCENT,
  },
  stepDotNum: {
    fontSize: 12,
    fontWeight: "800",
    color: colors.gray[500],
  },
  stepDotNumActive: {
    color: "#ffffff",
  },
  stepProgressLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: colors.gray[400],
    textAlign: "center",
    maxWidth: "100%",
  },
  stepProgressLabelActive: {
    color: ACCENT_DARK,
  },
  stepLine: {
    flex: 1,
    height: 2,
    backgroundColor: colors.gray[200],
    marginHorizontal: 8,
    marginBottom: 18,
    maxWidth: 80,
    minWidth: 12,
  },
  stepLineActive: {
    backgroundColor: ACCENT,
  },
});

const stickyStyles = StyleSheet.create({
  footer: {
    alignSelf: "stretch",
    backgroundColor: "#f4fbf6",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#d1e7d8",
    paddingHorizontal: 20,
    paddingTop: 12,
    gap: 10,
  },
});
