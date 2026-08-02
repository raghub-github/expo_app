import React from "react";
import { Linking } from "react-native";
import { View, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { ProfilePromoCard } from "@/src/components/profile/ProfilePromoCard";

/** Same official channels the rider website links to (rider-web FloatingActions). */
const WHATSAPP_CHANNEL_URL =
  "https://whatsapp.com/channel/0029VbBydzu3mFY8rdcgfc1U";
const TELEGRAM_URL = "https://t.me/gatimitra";

export function ProfileCommunityCards() {
  const { t } = useTranslation();

  return (
    <View>
      <ProfilePromoCard
        colors={["#128C7E", "#25D366"]}
        shadowColor="#25D366"
        icon={<Ionicons name="logo-whatsapp" size={20} color="#FFFFFF" />}
        title={t("profile.joinWhatsApp", "Join our WhatsApp channel")}
        subtitle={t(
          "profile.joinWhatsAppSub",
          "Official updates, offers & rider announcements"
        )}
        onPress={() => void Linking.openURL(WHATSAPP_CHANNEL_URL)}
      />
      <View style={styles.spacer} />
      <ProfilePromoCard
        colors={["#0088CC", "#34AADC"]}
        shadowColor="#0088CC"
        icon={<Ionicons name="paper-plane" size={20} color="#FFFFFF" />}
        title={t("profile.joinTelegram", "Join us on Telegram")}
        subtitle={t(
          "profile.joinTelegramSub",
          "Real-time offers, service updates & community"
        )}
        onPress={() => void Linking.openURL(TELEGRAM_URL)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  spacer: {
    height: 14,
  },
});
