import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "@/src/theme";
import { LORA_BOLD, LORA_SEMIBOLD } from "@/src/theme/headerFonts";
import { PremiumAllowButton } from "./PremiumAllowButton";
import { PermissionBottomSheetShell } from "./PermissionBottomSheetShell";
import type { PermissionStepKey } from "@/src/services/permissions/smartPermissionHandler";

export type LocationBlockingReason = "denied" | "gps_off" | "background_denied";

export type PermissionStepContent = {
  key: PermissionStepKey;
  title: string;
  description: string;
  microText: string;
  icon: string;
};

type PermissionStepSheetProps = {
  visible: boolean;
  step: PermissionStepContent;
  stepIndex: number;
  totalSteps: number;
  loading?: boolean;
  /** Refines copy when location still needs action after Allow. */
  locationIssue?: LocationBlockingReason | null;
  onAllow: () => void | Promise<void>;
  onSkip?: () => void;
};

function locationCopy(issue: LocationBlockingReason | null | undefined, step: PermissionStepContent) {
  if (step.key === "location_services" || issue === "gps_off") {
    return {
      title: "Turn on Location Services",
      message:
        "GPS must be enabled so we can match you with nearby orders and track deliveries accurately.",
      instructions: [
        "Tap Allow below",
        "Turn on device location / GPS",
        "Come back to GatiMitra",
      ],
    };
  }

  if (issue === "background_denied") {
    return {
      title: "Allow location all the time",
      message:
        "Select “Allow all the time” in app settings. Background location keeps you online for new orders even when the app is minimized.",
      instructions: [
        "Tap Allow below",
        "Open Permissions → Location",
        "Choose “Allow all the time”",
      ],
    };
  }

  if (issue === "denied" || step.key === "location") {
    return {
      title: step.title,
      message: step.description,
      instructions: [
        "Tap Allow below",
        "Allow location when prompted",
        "If needed, choose “Allow all the time” in settings",
      ],
    };
  }

  return {
    title: step.title,
    message: step.description,
    instructions: null as string[] | null,
  };
}

function batteryOptimizationCopy(step: PermissionStepContent) {
  return {
    title: step.title,
    message: step.description,
    instructions: [
      "Tap Allow below",
      "On Android: choose Allow / Don’t optimize when prompted",
      "If needed: App info → Battery → Unrestricted (OEM: Auto-start / Background)",
    ],
  };
}

function backgroundRunningCopy(step: PermissionStepContent) {
  return {
    title: step.title,
    message: step.description,
    instructions: [
      "Tap Allow below",
      "Enable Autostart / Background activity if your phone shows it",
      "Or set App info → Battery → Unrestricted, then return here",
    ],
  };
}

function stepIconName(step: PermissionStepContent): keyof typeof Ionicons.glyphMap {
  if (step.key === "location" || step.key === "location_services") return "location";
  if (step.key === "notifications") return "notifications";
  if (step.key === "battery_optimization") return "battery-charging";
  if (step.key === "background_running") return "phone-portrait-outline";
  if (step.key === "display_over_apps") return "layers-outline";
  return "shield-checkmark-outline";
}

/**
 * Single bottom sheet for every permission step — Customer-style wave header + Rider copy.
 */
export function PermissionStepSheet({
  visible,
  step,
  stepIndex,
  totalSteps,
  loading = false,
  locationIssue = null,
  onAllow,
  onSkip,
}: PermissionStepSheetProps) {
  const isLocationStep = step.key === "location" || step.key === "location_services";
  const copy = isLocationStep
    ? locationCopy(locationIssue ?? (step.key === "location_services" ? "gps_off" : null), step)
    : step.key === "battery_optimization"
      ? batteryOptimizationCopy(step)
      : step.key === "background_running"
        ? backgroundRunningCopy(step)
        : { title: step.title, message: step.description, instructions: null };

  return (
    <PermissionBottomSheetShell visible={visible} maxHeightRatio={0.82}>
      <View style={styles.content}>
        <Text style={styles.stepLabel}>
          Step {stepIndex + 1} of {totalSteps}
        </Text>

        <View style={styles.iconWrap}>
          <Ionicons name={stepIconName(step)} size={32} color={colors.primary[700]} />
        </View>

        <Text style={styles.title}>{copy.title}</Text>
        <Text style={styles.message}>{copy.message}</Text>

        <View style={styles.instructionsBox}>
          {copy.instructions ? (
            <>
              <Text style={styles.instructionsTitle}>What to do</Text>
              {copy.instructions.map((line, index) => (
                <View key={line} style={styles.instructionRow}>
                  <View style={styles.stepBadge}>
                    <Text style={styles.stepBadgeText}>{index + 1}</Text>
                  </View>
                  <Text style={styles.instructionText}>{line}</Text>
                </View>
              ))}
            </>
          ) : (
            <>
              <Text style={styles.instructionsTitle}>Note</Text>
              <Text style={styles.noteText}>{step.microText}</Text>
            </>
          )}
        </View>

        <View style={styles.buttonWrap}>
          <PremiumAllowButton
            onPress={onAllow}
            loading={loading}
            disabled={loading}
            mandatory={false}
          />
          {onSkip ? (
            <Pressable onPress={onSkip} style={styles.skipBtn} hitSlop={8}>
              <Text style={styles.skipText}>Skip for now</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </PermissionBottomSheetShell>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 8,
  },
  stepLabel: {
    fontFamily: LORA_SEMIBOLD,
    fontSize: 12,
    color: colors.gray[500],
    textAlign: "center",
    marginBottom: 14,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  iconWrap: {
    alignSelf: "center",
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: colors.primary[50],
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.primary[100],
  },
  title: {
    fontFamily: LORA_BOLD,
    fontSize: 22,
    color: "#111827",
    textAlign: "center",
    marginBottom: 10,
  },
  message: {
    fontFamily: LORA_SEMIBOLD,
    fontSize: 14,
    color: "#6B7280",
    textAlign: "center",
    lineHeight: 21,
    marginBottom: 20,
    paddingHorizontal: 4,
  },
  instructionsBox: {
    backgroundColor: colors.primary[50],
    borderRadius: 16,
    padding: 16,
    marginBottom: 22,
    borderWidth: 1,
    borderColor: colors.primary[100],
  },
  instructionsTitle: {
    fontFamily: LORA_BOLD,
    fontSize: 13,
    color: colors.primary[800],
    marginBottom: 12,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  instructionRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
    gap: 12,
  },
  stepBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.primary[600],
    alignItems: "center",
    justifyContent: "center",
  },
  stepBadgeText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#ffffff",
  },
  instructionText: {
    flex: 1,
    fontSize: 14,
    color: colors.gray[700],
    lineHeight: 20,
  },
  noteText: {
    fontSize: 14,
    color: colors.gray[700],
    lineHeight: 21,
  },
  buttonWrap: {
    width: "100%",
  },
  skipBtn: {
    marginTop: 16,
    alignItems: "center",
    paddingVertical: 8,
  },
  skipText: {
    fontSize: 15,
    color: colors.gray[600],
    textDecorationLine: "underline",
  },
});
