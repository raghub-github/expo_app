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
                <Text style={styles.buttonText}>Allow</Text>
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
    maxWidth: 400,
    marginHorizontal: "auto",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonPressed: {
    transform: [{ scale: 0.98 }],
  },
  gradient: {
    borderRadius: 16,
    paddingVertical: 18,
    paddingHorizontal: 32,
    minHeight: 64,
    justifyContent: "center",
    alignItems: "center",
  },
  gradientPressed: {
    opacity: 0.9,
  },
  content: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  buttonText: {
    fontSize: 20,
    fontWeight: "700",
    color: "#FFFFFF",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  mandatoryIndicator: {
    backgroundColor: "rgba(255, 255, 255, 0.25)",
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  mandatoryText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#FFFFFF",
    letterSpacing: 0.5,
  },
});
