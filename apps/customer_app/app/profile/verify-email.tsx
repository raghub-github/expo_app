/**
 * Email verification — send OTP and confirm via backend API.
 */

import { useCallback, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { profileService } from "@/services/profile.service";
import { ProfileSubpageHeader } from "@/components/profile/ProfileSubpageHeader";
import { ProfileTheme } from "@/constants/profileTheme";
import {
  invalidateProfileCache,
  PROFILE_QUERY_KEY,
  writeCachedProfile,
} from "@/lib/profileCache";
import type { UserProfile } from "@/services/profile.service";

const { green: GREEN, greenDark: GREEN_DARK, text: TEXT, muted: MUTED, border: BORDER, pageBg: PAGE_BG } =
  ProfileTheme;

export default function VerifyEmailScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [maskedEmail, setMaskedEmail] = useState<string | null>(null);

  const { data: profile, isLoading: profileLoading } = useQuery({
    queryKey: ["me", "profile"],
    queryFn: () => profileService.getProfile(),
  });

  const sendMutation = useMutation({
    mutationFn: () => profileService.sendEmailVerificationCode(),
    onSuccess: (data) => {
      setSent(true);
      setMaskedEmail(data.email);
      Alert.alert("Code sent", `We sent a verification code to ${data.email}`);
    },
    onError: (err: Error) => {
      Alert.alert("Could not send code", err.message ?? "Try again.");
    },
  });

  const confirmMutation = useMutation({
    mutationFn: (otp: string) => profileService.confirmEmailVerification(otp),
    onSuccess: async (data) => {
      queryClient.setQueryData<UserProfile | undefined>(PROFILE_QUERY_KEY, (prev) =>
        prev
          ? {
              ...prev,
              is_email_verified: true,
              profile_image_url: data.profile_image_url ?? prev.profile_image_url,
            }
          : prev,
      );
      const cached = queryClient.getQueryData<UserProfile>(PROFILE_QUERY_KEY);
      if (cached) {
        await writeCachedProfile(cached);
      }
      await invalidateProfileCache(queryClient);
      Alert.alert("Email verified", "Your email has been verified successfully.", [
        { text: "Done", onPress: () => router.back() },
      ]);
    },
    onError: (err: Error & { status?: number }) => {
      const msg = err.message ?? "Invalid OTP. Please try again.";
      const title = msg.toLowerCase().includes("invalid otp") ? "Invalid OTP" : "Verification failed";
      Alert.alert(title, msg);
    },
  });

  const handleSendCode = useCallback(() => {
    if (!profile?.email?.trim()) {
      Alert.alert("No email", "Add your email in Edit profile first.", [
        { text: "Edit profile", onPress: () => router.push("/profile/edit") },
        { text: "Cancel", style: "cancel" },
      ]);
      return;
    }
    if (profile.is_email_verified) {
      Alert.alert("Already verified", "Your email is already verified.");
      return;
    }
    sendMutation.mutate();
  }, [profile, router, sendMutation]);

  const handleVerify = useCallback(() => {
    const trimmed = code.trim();
    if (trimmed.length < 4) return;
    confirmMutation.mutate(trimmed);
  }, [code, confirmMutation]);

  const emailDisplay = maskedEmail ?? profile?.email ?? null;
  const alreadyVerified = profile?.is_email_verified ?? false;

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <StatusBar style="dark" backgroundColor="#fff" />
      <ProfileSubpageHeader title="Verify email" onBack={() => router.back()} />

      <View style={styles.body}>
        {profileLoading ? (
          <ActivityIndicator color={GREEN} size="large" style={{ marginTop: 40 }} />
        ) : alreadyVerified ? (
          <View style={styles.card}>
            <View style={styles.successIcon}>
              <Ionicons name="checkmark-circle" size={48} color={GREEN} />
            </View>
            <Text style={styles.cardTitle}>Email verified</Text>
            <Text style={styles.cardSub}>{emailDisplay ?? "Your email is verified."}</Text>
            <TouchableOpacity style={styles.primaryBtn} onPress={() => router.back()}>
              <Text style={styles.primaryBtnText}>Back to profile</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.card}>
            <View style={styles.iconWrap}>
              <Ionicons name="mail-unread-outline" size={36} color={GREEN} />
            </View>
            <Text style={styles.cardTitle}>Verify your email</Text>
            <Text style={styles.cardSub}>
              {sent
                ? `Enter the 6-digit code sent to ${emailDisplay ?? "your email"}.`
                : "We'll send a verification code to your registered email."}
            </Text>

            {emailDisplay ? (
              <View style={styles.emailChip}>
                <Ionicons name="mail-outline" size={16} color={GREEN_DARK} />
                <Text style={styles.emailChipText} numberOfLines={1}>{emailDisplay}</Text>
              </View>
            ) : null}

            {!sent ? (
              <TouchableOpacity
                style={[styles.primaryBtn, sendMutation.isPending && styles.btnDisabled]}
                onPress={handleSendCode}
                disabled={sendMutation.isPending}
              >
                {sendMutation.isPending ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.primaryBtnText}>Send code</Text>
                )}
              </TouchableOpacity>
            ) : (
              <>
                <TextInput
                  style={styles.input}
                  placeholder="6-digit code"
                  placeholderTextColor={MUTED}
                  value={code}
                  onChangeText={(v) => setCode(v.replace(/\D/g, "").slice(0, 6))}
                  keyboardType="number-pad"
                  maxLength={6}
                  autoFocus
                />
                <TouchableOpacity
                  style={[
                    styles.primaryBtn,
                    (code.length < 4 || confirmMutation.isPending) && styles.btnDisabled,
                  ]}
                  onPress={handleVerify}
                  disabled={code.length < 4 || confirmMutation.isPending}
                >
                  {confirmMutation.isPending ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.primaryBtnText}>Verify email</Text>
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.linkBtn}
                  onPress={handleSendCode}
                  disabled={sendMutation.isPending}
                >
                  <Text style={styles.linkBtnText}>Resend code</Text>
                </TouchableOpacity>
              </>
            )}

            {!profile?.email ? (
              <TouchableOpacity style={styles.linkBtn} onPress={() => router.push("/profile/edit")}>
                <Text style={styles.linkBtnText}>Add email in profile</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: PAGE_BG },
  body: { flex: 1, padding: 16 },
  card: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 20,
    borderWidth: 1,
    borderColor: BORDER,
  },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: ProfileTheme.mintSoft,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
    marginBottom: 14,
  },
  successIcon: { alignItems: "center", marginBottom: 12 },
  cardTitle: { fontSize: 18, fontWeight: "800", color: TEXT, textAlign: "center" },
  cardSub: { fontSize: 14, color: MUTED, textAlign: "center", marginTop: 8, lineHeight: 20 },
  emailChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    alignSelf: "center",
    marginTop: 14,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "#ECFDF5",
  },
  emailChipText: { fontSize: 13, fontWeight: "600", color: GREEN_DARK, maxWidth: 240 },
  input: {
    marginTop: 18,
    backgroundColor: PAGE_BG,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 22,
    fontWeight: "700",
    textAlign: "center",
    letterSpacing: 8,
    color: TEXT,
  },
  primaryBtn: {
    marginTop: 16,
    backgroundColor: GREEN,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: "center",
  },
  btnDisabled: { opacity: 0.6 },
  primaryBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  linkBtn: { marginTop: 14, alignItems: "center", paddingVertical: 8 },
  linkBtnText: { fontSize: 14, fontWeight: "700", color: GREEN },
});
