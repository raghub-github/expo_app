import { Alert, Share } from "react-native";

export function buildRiderReferralShareMessage(
  referralCode: string,
  riderName?: string | null
): string {
  const inviter = riderName?.trim() ? riderName.trim() : "A GatiMitra partner";
  return (
    `${inviter} invited you to join GatiMitra as a delivery partner!\n\n` +
    `Use referral code: ${referralCode}\n\n` +
    `Download the GatiMitra Rider app and enter this code during signup.`
  );
}

export async function shareRiderReferralCode(
  referralCode: string | null | undefined,
  riderName?: string | null
): Promise<boolean> {
  const code = referralCode?.trim();
  if (!code) {
    Alert.alert(
      "Referral code unavailable",
      "Your referral code is being generated. Please check again in a moment."
    );
    return false;
  }
  try {
    await Share.share({
      message: buildRiderReferralShareMessage(code, riderName),
      title: "Refer & Earn on GatiMitra",
    });
    return true;
  } catch {
    return false;
  }
}
