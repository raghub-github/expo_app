import React from "react";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { ProfilePromoCard } from "@/src/components/profile/ProfilePromoCard";
import { shareRiderReferralCode } from "@/src/lib/rider-referral-share";

type ProfileReferralCardProps = {
  referralCode: string | null;
  riderName: string;
};

export function ProfileReferralCard({ referralCode, riderName }: ProfileReferralCardProps) {
  const { t } = useTranslation();

  return (
    <ProfilePromoCard
      colors={["#0F766E", "#0D9488", "#14B8A6"]}
      icon={<Ionicons name="gift-outline" size={20} color="#FFFFFF" />}
      title={t("profile.referAndEarn", "Refer & Earn")}
      subtitle={t(
        "profile.referAndEarnSub",
        "Share your referral code and earn rewards"
      )}
      onPress={() => void shareRiderReferralCode(referralCode, riderName)}
    />
  );
}
