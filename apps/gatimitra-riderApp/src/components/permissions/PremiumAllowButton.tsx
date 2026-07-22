import React from "react";
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from "react-native";
import { colors } from "@/src/theme";
import { LinearGradient } from "expo-linear-gradient";
import { Platform } from "react-native";

interface PremiumAllowButtonProps {
  onPress: () => void | Promise<void>;
  loading?: boolean;
  disabled?: boolean;
  mandatory?: boolean;
  /** Defaults to "Allow". */
  label?: string;
}

/**
 * Premium Allow Button Component
 * 
 * ALWAYS shows "Allow" text - the logic happens behind the button.
 * Premium styling: full-width, high contrast, rounded, with shadow.
 * Communicates "This is mandatory to continue" visually.
 */
export function PremiumAllowButton({
  onPress,
  loading = false,
  disabled = false,
  mandatory = false,
  label = "Allow",
}: PremiumAllowButtonProps) {
  const isDisabled = disabled || loading;

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.buttonContainer,
        isDisabled && styles.buttonDisabled,
        pressed && !isDisabled && styles.buttonPressed,
      ]}
    >
      {({ pressed }) => (
        <LinearGradient
          colors={
            isDisabled
              ? [colors.gray[400], colors.gray[500]]
              : mandatory
              ? [colors.primary[500], colors.primary[600]]
              : [colors.primary[500], colors.primary[600]]
          }
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={[
            styles.gradient,
            pressed && !isDisabled && styles.gradientPressed,
          ]}
        >
          <View style={styles.content}>
            {loading ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <>
                <Text style={styles.buttonText}>{label}</Text>
                {mandatory && (
                  <View style={styles.mandatoryIndicator}>
                    <Text style={styles.mandatoryText}>Required</Text>
                  </View>
                )}
              </>
            )}
          </View>
        </LinearGradient>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
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
  gradientPressed: {
    opacity: 0.95,
  },
  content: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: "800",
    color: "#FFFFFF",
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  mandatoryIndicator: {
    backgroundColor: "rgba(255, 255, 255, 0.22)",
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  mandatoryText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#FFFFFF",
  },
});
