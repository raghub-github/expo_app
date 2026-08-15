import React, { useCallback, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { router, useFocusEffect } from "expo-router";
import { ProfilePromoCard } from "@/src/components/profile/ProfilePromoCard";
import { fetchRiderReferralConfig } from "@/src/services/referral.service";
import { presentReferralCopy } from "@/src/lib/referralCopy";

type ProfileReferralCardProps = {
  referralCode: string | null;
  riderName: string;
};

export function ProfileReferralCard({ referralCode: _referralCode, riderName: _riderName }: ProfileReferralCardProps) {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);
  const [liveSubtitle, setLiveSubtitle] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      const controller = new AbortController();
      void fetchRiderReferralConfig(controller.signal).then((config) => {
        if (config?.referralEnabled !== true) {
          setVisible(false);
          return;
        }
        setVisible(true);
        const presented = presentReferralCopy({
          audience: "rider",
          referralEnabled: config.referralEnabled,
          rewardEnabled: config.rewardEnabled,
          rewardsPaused: config.rewardSummary?.rewardsPaused,
          currency: config.currency,
          requireKyc: config.requireKyc,
          milestones: config.milestones,
        });
        setLiveSubtitle(presented.hasActiveReward ? presented.headline : presented.subtitle);
      });
      return () => controller.abort();
    }, []),
  );

  if (!visible) return null;

  return (
    <ProfilePromoCard
      colors={["#0F766E", "#0D9488", "#14B8A6"]}
      icon={<Ionicons name="gift-outline" size={20} color="#FFFFFF" />}
      title={t("profile.referAndEarn", "Refer & Earn")}
      subtitle={
        liveSubtitle ??
        t("profile.referAndEarnSub", "Invite another rider and earn rewards when they complete the required milestones.")
      }
      onPress={() => router.push("/referrals")}
    />
  );
}
