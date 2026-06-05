import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";

export const PROFILE_CARD_RADIUS = 20;

type ProfilePromoCardProps = {
  colors: readonly [string, string, ...string[]];
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  onPress: () => void;
  shadowColor?: string;
  trailing?: React.ReactNode;
};

export function ProfilePromoCard({
  colors: gradientColors,
  icon,
  title,
  subtitle,
  onPress,
  shadowColor = "#0F172A",
  trailing,
}: ProfilePromoCardProps) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.shell, pressed && styles.shellPressed]}
    >
      <LinearGradient
        colors={gradientColors}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={styles.gradient}
      >
        <View style={styles.iconWrap}>{icon}</View>
        <View style={styles.copy}>
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>
          <Text style={styles.subtitle} numberOfLines={2}>
            {subtitle}
          </Text>
        </View>
        {trailing ?? <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.92)" />}
      </LinearGradient>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  shell: {
    width: "100%",
    borderRadius: PROFILE_CARD_RADIUS,
    overflow: "hidden",
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  shellPressed: {
    opacity: 0.94,
    transform: [{ scale: 0.995 }],
  },
  gradient: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 64,
    paddingHorizontal: 14,
    paddingVertical: 13,
    borderRadius: PROFILE_CARD_RADIUS,
    gap: 12,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 11,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  copy: {
    flex: 1,
    minWidth: 0,
    justifyContent: "center",
  },
  title: {
    fontSize: 14,
    fontWeight: "800",
    color: "#FFFFFF",
    lineHeight: 18,
  },
  subtitle: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: "500",
    color: "rgba(255,255,255,0.9)",
    lineHeight: 16,
  },
});
