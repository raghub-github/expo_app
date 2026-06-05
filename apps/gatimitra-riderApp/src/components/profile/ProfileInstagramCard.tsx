import React from "react";
import { Linking } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { ProfilePromoCard } from "@/src/components/profile/ProfilePromoCard";

const INSTAGRAM_URL = "https://www.instagram.com/gatimitra_on_demand/";

export function ProfileInstagramCard() {
  const { t } = useTranslation();

  return (
    <ProfilePromoCard
      colors={["#833AB4", "#C13584", "#E1306C", "#F77737"]}
      shadowColor="#E1306C"
      icon={<Ionicons name="logo-instagram" size={20} color="#FFFFFF" />}
      title={t("profile.joinInstagram", "Join us on Instagram")}
      subtitle={t(
        "profile.joinInstagramSub",
        "Follow @gatimitra_on_demand for updates & offers"
      )}
      onPress={() => void Linking.openURL(INSTAGRAM_URL)}
    />
  );
}
