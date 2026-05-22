import { Alert, Share } from "react-native";
import * as Clipboard from "expo-clipboard";

export function buildReferralShareMessage(referralCode: string, userName?: string | null): string {
  const inviter = userName?.trim() ? userName.trim() : "Your friend";
  return (
    `${inviter} invited you to GatiMitra! 🎁\n\n` +
    `Use referral code: ${referralCode}\n\n` +
    `Download GatiMitra, sign up, and enter this code to unlock rewards for both of you.`
  );
}

export async function shareReferralCode(
  referralCode: string | null | undefined,
  userName?: string | null
): Promise<boolean> {
  const code = referralCode?.trim();
  if (!code) {
    Alert.alert(
      "Referral code unavailable",
      "Complete your profile to generate your referral code, then come back to refer friends."
    );
    return false;
  }
  try {
    await Share.share({
      message: buildReferralShareMessage(code, userName),
      title: "Refer & Earn on GatiMitra",
    });
    return true;
  } catch {
    return false;
  }
}

export async function copyReferralCode(referralCode: string | null | undefined): Promise<boolean> {
  const code = referralCode?.trim();
  if (!code) {
    Alert.alert("Referral code unavailable", "Complete your profile to get your referral code.");
    return false;
  }
  try {
    await Clipboard.setStringAsync(code);
    Alert.alert("Copied", "Referral code copied to clipboard");
    return true;
  } catch {
    Alert.alert("Error", "Could not copy referral code");
    return false;
  }
}
