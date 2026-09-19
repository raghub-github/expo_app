import React from "react";
import { Linking, Pressable, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

type SocialIcon = {
  id: string;
  label: string;
  url: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
};

/** Alphabetical A→Z: Facebook, Instagram, Telegram, WhatsApp, X */
const SOCIAL_LINKS: SocialIcon[] = [
  {
    id: "facebook",
    label: "Facebook",
    url: "https://www.facebook.com/GatiMitra",
    icon: "logo-facebook",
    color: "#1877F2",
  },
  {
    id: "instagram",
    label: "Instagram",
    url: "https://www.instagram.com/gatimitra_on_demand/",
    icon: "logo-instagram",
    color: "#E1306C",
  },
  {
    id: "telegram",
    label: "Telegram",
    url: "https://t.me/gatimitra",
    icon: "paper-plane",
    color: "#0088CC",
  },
  {
    id: "whatsapp",
    label: "WhatsApp",
    url: "https://whatsapp.com/channel/0029VbBydzu3mFY8rdcgfc1U",
    icon: "logo-whatsapp",
    color: "#25D366",
  },
  {
    id: "x",
    label: "X",
    url: "https://x.com/GatiMitratod",
    icon: "logo-twitter",
    color: "#111827",
  },
];

export function ProfileSocialIconsRow() {
  return (
    <View style={styles.row}>
      {SOCIAL_LINKS.map((item) => (
        <Pressable
          key={item.id}
          onPress={() => void Linking.openURL(item.url)}
          style={({ pressed }) => [styles.hit, pressed && styles.hitPressed]}
          accessibilityRole="link"
          accessibilityLabel={item.label}
          hitSlop={6}
        >
          <View style={[styles.iconCircle, { backgroundColor: item.color }]}>
            <Ionicons name={item.icon} size={20} color="#FFFFFF" />
          </View>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    width: "100%",
    alignSelf: "stretch",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginVertical: 14,
    paddingHorizontal: 16,
  },
  hit: {
    alignItems: "center",
    justifyContent: "center",
  },
  hitPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.96 }],
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
});
