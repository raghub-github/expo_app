import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { colors } from "@/src/theme";
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

/**
 * Single bottom sheet for every permission step — replaces the full-screen card UI.
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
    : { title: step.title, message: step.description, instructions: null };

  return (
    <PermissionBottomSheetShell visible={visible} maxHeightRatio={0.82}>
      <View style={styles.content}>
        <Text style={styles.stepLabel}>
          Step {stepIndex + 1} of {totalSteps}
        </Text>

        <View style={styles.iconWrap}>
          <Text style={styles.icon}>{step.icon}</Text>
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
    paddingTop: 4,
    paddingBottom: 8,
  },
  stepLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.gray[500],
    textAlign: "center",
    marginBottom: 12,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  iconWrap: {
    alignSelf: "center",
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.primary[50],
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  icon: {
    fontSize: 36,
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
    color: colors.gray[900],
    textAlign: "center",
    marginBottom: 10,
  },
  message: {
    fontSize: 15,
    color: colors.gray[600],
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 20,
  },
  instructionsBox: {
    backgroundColor: colors.primary[50],
    borderRadius: 16,
    padding: 16,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: colors.primary[100],
  },
  instructionsTitle: {
    fontSize: 14,
    fontWeight: "700",
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
    backgroundColor: colors.primary[500],
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
    fontSize: 16,
    color: colors.gray[600],
    textDecorationLine: "underline",
  },
});
