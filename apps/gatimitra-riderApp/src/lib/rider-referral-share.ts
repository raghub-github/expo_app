import { Alert, Share } from "react-native";
import {
  fetchRiderReferralConfig,
  type RiderReferralRewardSummary,
} from "@/src/services/referral.service";

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
  rewardSummary?: RiderReferralRewardSummary | null,
): string {
  const name = riderName?.trim() || "A GatiMitra partner";
  const code = referralCode.trim().toUpperCase();
  const url = buildRiderReferralShareUrl(code);
  const condition =
    rewardSummary?.conditionLine?.trim() ||
    "Complete your first delivery milestones and unlock referral rewards.";

  const lines: string[] = [
    `🎉 ${name} invited you to join GatiMitra as a delivery partner!`,
    "",
    condition,
    "",
  ];

  if (rewardSummary?.inviteeRewardLabel) {
    lines.push(`🎁 You Get: ${rewardSummary.inviteeRewardLabel}`);
  }
  if (rewardSummary?.referrerRewardLabel) {
    lines.push(`🎁 ${name} Gets: ${rewardSummary.referrerRewardLabel}`);
  }
  if (rewardSummary?.inviteeRewardLabel || rewardSummary?.referrerRewardLabel) {
    lines.push("");
  } else if (rewardSummary?.shareLines?.length) {
    for (const line of rewardSummary.shareLines) {
      if (line?.trim()) lines.push(`🎁 ${line.trim()}`);
    }
    lines.push("");
  }

  lines.push("Join Now:");
  lines.push(url);
  lines.push("");
  lines.push(`Referral Code: ${code}`);
  lines.push("");
  lines.push("*T&C Apply.");
  return lines.join("\n");
}

export async function shareRiderReferralCode(
  referralCode: string | null | undefined,
  riderName?: string | null,
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
    const config = await fetchRiderReferralConfig();
    await Share.share({
      message: buildRiderReferralShareMessage(
        code,
        riderName,
        config?.rewardSummary ?? null,
      ),
      url,
      title: "Refer & Earn on GatiMitra",
    });
    return true;
  } catch {
    return false;
  }
}
