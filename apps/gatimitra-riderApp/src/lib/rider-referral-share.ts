import { Alert, Share } from "react-native";
import { fetchRiderReferralConfig } from "@/src/services/referral.service";
import { presentReferralCopy, type ReferralPresentedCopy } from "@/src/lib/referralCopy";

/** Always share production domain — never localhost / LAN hosts. */
const PRODUCTION_BASE = "https://gatimitra.com";

function isDevOrLocalHost(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (host === "localhost" || host === "127.0.0.1" || host === "10.0.2.2") return true;
    if (/^192\.168\./.test(host) || /^10\./.test(host)) return true;
    if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return true;
    return false;
  } catch {
    return true;
  }
}

export function buildRiderReferralShareUrl(
  referralCode: string,
  shareUrlFromApi?: string | null,
): string {
  const code = referralCode.trim().toUpperCase();
  if (shareUrlFromApi?.trim() && !isDevOrLocalHost(shareUrlFromApi.trim())) {
    return shareUrlFromApi.trim();
  }
  return `${PRODUCTION_BASE}/rider-ref/${code}`;
}

export function buildRiderReferralShareMessage(
  referralCode: string,
  riderName?: string | null,
  presented?: ReferralPresentedCopy | null,
): string {
  const name = riderName?.trim() || "A GatiMitra partner";
  const code = referralCode.trim().toUpperCase();
  const url = buildRiderReferralShareUrl(code);
  if (presented) {
    return presented.shareMessage({ referrerName: name, referralCode: code, shareUrl: url });
  }
  return [
    `🎉 ${name} invited you to join GatiMitra as a delivery partner!`,
    "",
    "Join now:",
    url,
    "",
    `Referral code: ${code}`,
    "",
    "T&C apply.",
  ].join("\n");
}

export async function shareRiderReferralCode(
  referralCode: string | null | undefined,
  riderName?: string | null,
  presented?: ReferralPresentedCopy | null,
): Promise<boolean> {
  const code = referralCode?.trim();
  if (!code) {
    Alert.alert(
      "Referral code unavailable",
      "Your referral code is being generated. Please check again in a moment.",
    );
    return false;
  }
  try {
    const url = buildRiderReferralShareUrl(code);
    const config = presented ? null : await fetchRiderReferralConfig();
    const copy =
      presented ??
      presentReferralCopy({
        audience: "rider",
        referralEnabled: config?.referralEnabled,
        rewardEnabled: config?.rewardEnabled,
        rewardsPaused: config?.rewardSummary?.rewardsPaused,
        currency: config?.currency,
        requireKyc: config?.requireKyc,
        milestones: config?.milestones,
      });
    await Share.share({
      message: buildRiderReferralShareMessage(code, riderName, copy),
      url,
      title: "Refer & Earn on GatiMitra",
    });
    return true;
  } catch {
    return false;
  }
}
