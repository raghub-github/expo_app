import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { colors } from "@/theme";
import { PermissionBottomSheetShell } from "@/components/permissions/PermissionBottomSheetShell";

export type PermissionPromptBottomSheetProps = {
  visible: boolean;
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  message: string;
  /** Shown in the mint “Note” box (old subtitle / hint). */
  note?: string;
  noteTitle?: string;
  allowLabel?: string;
  skipLabel?: string;
  loading?: boolean;
  /** When true, hide Skip. */
  mandatory?: boolean;
  onAllow: () => void | Promise<void>;
  onSkip?: () => void;
};

/**
 * Shared wave-header permission sheet (same design as SMS permission sheet).
 * Callers pass their own title / message / icon — design only is shared.
 */
export function PermissionPromptBottomSheet({
  visible,
  icon,
  title,
  message,
  note,
  noteTitle = "Note",
  allowLabel = "Allow",
  skipLabel = "Skip for now",
  loading = false,
  mandatory = false,
  onAllow,
  onSkip,
}: PermissionPromptBottomSheetProps) {
  const [pressing, setPressing] = useState(false);
  const busy = loading || pressing;

  const handleAllow = useCallback(async () => {
    if (busy) return;
    setPressing(true);
    try {
      await onAllow();
    } finally {
      setPressing(false);
    }
  }, [busy, onAllow]);

  return (
    <PermissionBottomSheetShell visible={visible} maxHeightRatio={0.82}>
      <View style={styles.content}>
        <View style={styles.iconWrap}>
          <Ionicons name={icon} size={32} color={colors.primary[700]} />
        </View>

        <Text style={styles.title}>{title}</Text>
        <Text style={styles.message}>{message}</Text>

        {note ? (
          <View style={styles.instructionsBox}>
            <Text style={styles.instructionsTitle}>{noteTitle}</Text>
            <Text style={styles.noteText}>{note}</Text>
          </View>
        ) : null}

        <Pressable
          onPress={() => void handleAllow()}
          disabled={busy}
          style={({ pressed }) => [
            styles.buttonContainer,
            busy && styles.buttonDisabled,
            pressed && !busy && styles.buttonPressed,
          ]}
        >
          <LinearGradient
            colors={
              busy
                ? [colors.gray[400], colors.gray[500]]
                : [colors.primary[500], colors.primary[600]]
            }
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.gradient}
          >
            {busy ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <Text style={styles.buttonText}>{allowLabel}</Text>
            )}
          </LinearGradient>
        </Pressable>

        {!mandatory && onSkip ? (
          <Pressable onPress={onSkip} style={styles.skipBtn} hitSlop={8} disabled={busy}>
            <Text style={styles.skipText}>{skipLabel}</Text>
          </Pressable>
        ) : null}
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
    fontSize: 22,
    fontWeight: "700",
    color: "#111827",
    textAlign: "center",
    marginBottom: 10,
  },
  message: {
    fontSize: 14,
    fontWeight: "600",
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
    fontSize: 13,
    fontWeight: "700",
    color: colors.primary[800],
    marginBottom: 12,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  noteText: {
    fontSize: 14,
    color: colors.gray[700],
    lineHeight: 21,
  },
  buttonContainer: {
    width: "100%",
    borderRadius: 14,
    overflow: "hidden",
    shadowColor: colors.primary[800],
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 8,
    elevation: 4,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonPressed: {
    opacity: 0.92,
    transform: [{ scale: 0.99 }],
  },
  gradient: {
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 20,
    minHeight: 52,
    justifyContent: "center",
    alignItems: "center",
  },
  buttonText: {
    fontSize: 16,
    fontWeight: "800",
    color: "#FFFFFF",
    letterSpacing: 0.4,
    textTransform: "uppercase",
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
