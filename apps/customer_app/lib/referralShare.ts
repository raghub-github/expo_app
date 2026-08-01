import { Alert, Share, Linking } from "react-native";
import * as Clipboard from "expo-clipboard";
import type { ReferralRewardSummary } from "@/services/referral.service";

/** Always share production domain — never localhost / LAN / temporary hosts. */
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

export function buildReferralShareUrl(
  referralCode: string,
  shareUrlFromApi?: string | null,
): string {
  const code = referralCode.trim().toUpperCase();
  if (shareUrlFromApi?.trim() && !isDevOrLocalHost(shareUrlFromApi.trim())) {
    return shareUrlFromApi.trim();
  }
  return `${PRODUCTION_BASE}/ref/${code}`;
}

/**
 * Personalized WhatsApp/Telegram/SMS share message.
 * Amounts come from live config — never hardcode reward values.
 */
export function buildReferralShareMessage(
  referralCode: string,
  userName?: string | null,
  shareUrl?: string | null,
  rewardSummary?: ReferralRewardSummary | null,
): string {
  const name = userName?.trim() || "Your friend";
  const code = referralCode.trim().toUpperCase();
  const url = buildReferralShareUrl(code, shareUrl);
  const condition =
    rewardSummary?.conditionLine?.trim() ||
    "Complete your first eligible delivered order and unlock your referral rewards.";

  const lines: string[] = [
    `🎉 ${name} invited you to join GatiMitra!`,
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
  }

  // Fallback when structured labels are missing but shareLines exist.
  if (
    !rewardSummary?.inviteeRewardLabel &&
    !rewardSummary?.referrerRewardLabel &&
    rewardSummary?.shareLines?.length
  ) {
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

export async function shareReferralCode(
  referralCode: string | null | undefined,
  userName?: string | null,
  shareUrl?: string | null,
  rewardSummary?: ReferralRewardSummary | null,
): Promise<boolean> {
  const code = referralCode?.trim();
  if (!code) {
    Alert.alert(
      "Referral code unavailable",
      "Complete your profile to generate your referral code, then come back to refer friends.",
    );
    return false;
  }
  try {
    const url = buildReferralShareUrl(code, shareUrl);
    await Share.share({
      message: buildReferralShareMessage(code, userName, url, rewardSummary),
      url,
      title: "Refer & Earn on GatiMitra",
    });
    return true;
  } catch {
    return false;
  }
}

export async function copyReferralCode(
  referralCode: string | null | undefined,
  shareUrl?: string | null,
): Promise<boolean> {
  const code = referralCode?.trim();
  if (!code) {
    Alert.alert("Referral code unavailable", "Complete your profile to get your referral code.");
    return false;
  }
  try {
    const url = buildReferralShareUrl(code, shareUrl);
    await Clipboard.setStringAsync(url);
    return true;
  } catch {
    Alert.alert("Error", "Could not copy referral link");
    return false;
  }
}

export async function openReferralWhatsApp(
  referralCode: string | null | undefined,
  userName?: string | null,
  shareUrl?: string | null,
  rewardSummary?: ReferralRewardSummary | null,
): Promise<void> {
  const code = referralCode?.trim();
  if (!code) return;
  const text = encodeURIComponent(
    buildReferralShareMessage(code, userName, shareUrl, rewardSummary),
  );
  await Linking.openURL(`https://wa.me/?text=${text}`).catch(() => undefined);
}
