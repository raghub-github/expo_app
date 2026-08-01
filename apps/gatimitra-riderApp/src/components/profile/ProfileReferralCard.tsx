import React, { useEffect, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { router } from "expo-router";
import { ProfilePromoCard } from "@/src/components/profile/ProfilePromoCard";
import { fetchRiderReferralConfig } from "@/src/services/referral.service";

type ProfileReferralCardProps = {
  referralCode: string | null;
  riderName: string;
};

export function ProfileReferralCard({ referralCode: _referralCode, riderName: _riderName }: ProfileReferralCardProps) {
  const { t } = useTranslation();
  // Subtitle mirrors the live Super Admin amounts instead of generic copy.
  const [liveSubtitle, setLiveSubtitle] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void fetchRiderReferralConfig(controller.signal).then((config) => {
      const headline = config?.rewardSummary?.headline?.trim();
      if (headline && !config?.rewardSummary?.rewardsPaused) {
        setLiveSubtitle(headline);
      }
    });
    return () => controller.abort();
  }, []);

  return (
    <ProfilePromoCard
      colors={["#0F766E", "#0D9488", "#14B8A6"]}
      icon={<Ionicons name="gift-outline" size={20} color="#FFFFFF" />}
      title={t("profile.referAndEarn", "Refer & Earn")}
      subtitle={
        liveSubtitle ??
        t("profile.referAndEarnSub", "Share your referral code and earn rewards")
      }
      onPress={() => router.push("/referrals")}
    />
  );
}
