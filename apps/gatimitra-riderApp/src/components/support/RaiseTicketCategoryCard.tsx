import React from "react";
import { View, Text, Pressable, StyleSheet, Platform } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";

type Props = {
  title: string;
  description?: string | null;
  icon: keyof typeof Ionicons.glyphMap;
  gradient: readonly [string, string];
  onPress: () => void;
  /** Smaller padding for inner flow lists */
  compact?: boolean;
};

/**
 * Premium category card — separate elevated card (not a row inside one parent list).
 * Fixes broken row layout from nesting Pressables inside overflow:hidden list containers.
 */
export function RaiseTicketCategoryCard({
  title,
  description,
  icon,
  gradient,
  onPress,
  compact,
}: Props) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.shell, compact && styles.shellCompact, pressed && styles.shellPressed]}
    >
      <View style={[styles.card, compact && styles.cardCompact]}>
        <LinearGradient colors={gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.iconGradient}>
          <Ionicons name={icon} size={compact ? 22 : 26} color="#FFFFFF" />
        </LinearGradient>

        <View style={styles.copy}>
          <Text style={[styles.title, compact && styles.titleCompact]} numberOfLines={2}>
            {title}
          </Text>
          {description?.trim() ? (
            <Text style={[styles.description, compact && styles.descriptionCompact]} numberOfLines={3}>
              {description.trim()}
            </Text>
          ) : null}
        </View>

        <View style={styles.chevronWrap}>
          <Ionicons name="chevron-forward" size={22} color="#94A3B8" />
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  shell: {
    width: "100%",
    marginBottom: 12,
    borderRadius: 22,
    ...Platform.select({
      ios: {
        shadowColor: "#0F172A",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.08,
        shadowRadius: 12,
      },
      android: { elevation: 3 },
      default: {},
    }),
  },
  shellCompact: {
    marginBottom: 10,
    borderRadius: 18,
  },
  shellPressed: {
    opacity: 0.92,
    transform: [{ scale: 0.985 }],
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "#E8EDF2",
    paddingHorizontal: 16,
    paddingVertical: 16,
    minHeight: 88,
  },
  cardCompact: {
    borderRadius: 18,
    paddingVertical: 14,
    minHeight: 76,
  },
  iconGradient: {
    width: 52,
    height: 52,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 14,
    flexShrink: 0,
  },
  copy: {
    flex: 1,
    minWidth: 0,
    paddingRight: 8,
    justifyContent: "center",
  },
  title: {
    fontSize: 16,
    fontWeight: "800",
    color: "#0F172A",
    letterSpacing: -0.2,
    lineHeight: 21,
  },
  titleCompact: {
    fontSize: 15,
    lineHeight: 20,
  },
  description: {
    marginTop: 4,
    fontSize: 13,
    fontWeight: "500",
    color: "#64748B",
    lineHeight: 18,
  },
  descriptionCompact: {
    fontSize: 12,
    lineHeight: 17,
  },
  chevronWrap: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
});
