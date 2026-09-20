/**
 * Email verification — change email (replaces DB), send OTP, confirm.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { AppText } from "@/components/AppText";

import {
  View,
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

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function VerifyEmailScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [maskedEmail, setMaskedEmail] = useState<string | null>(null);
  const [editingEmail, setEditingEmail] = useState(false);
  const [emailDraft, setEmailDraft] = useState("");
  const [emailError, setEmailError] = useState("");
  const [emailAvailable, setEmailAvailable] = useState(false);
  const [emailChecking, setEmailChecking] = useState(false);
  const [savingEmail, setSavingEmail] = useState(false);
  const emailCheckSeqRef = useRef(0);
  const emailDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastEmailResultRef = useRef<{ email: string; available: boolean } | null>(null);

  const { data: profile, isLoading: profileLoading } = useQuery({
    queryKey: PROFILE_QUERY_KEY,
    queryFn: async () => {
      const p = await profileService.getProfile();
      await writeCachedProfile(p);
      return p;
    },
  });

  useEffect(() => {
    if (profile?.email && !editingEmail) {
      setEmailDraft(profile.email);
    }
  }, [profile?.email, editingEmail]);

  useEffect(() => {
    return () => {
      if (emailDebounceRef.current) clearTimeout(emailDebounceRef.current);
    };
  }, []);

  const checkEmailDuplicate = async (raw: string): Promise<boolean> => {
    const value = raw.trim().toLowerCase();
    if (!value) {
      setEmailAvailable(false);
      setEmailError("");
      lastEmailResultRef.current = null;
      return false;
    }
    if (!EMAIL_REGEX.test(value)) {
      setEmailAvailable(false);
      setEmailError("");
      return false;
    }
    const current = profile?.email?.trim().toLowerCase() ?? "";
    if (value === current) {
      setEmailAvailable(true);
      setEmailError("");
      lastEmailResultRef.current = { email: value, available: true };
      return true;
    }
    const cached = lastEmailResultRef.current;
    if (cached?.email === value) {
      setEmailAvailable(cached.available);
      if (!cached.available) {
        setEmailError(
          "This email is already registered. Use a different email."
        );
      }
      return cached.available;
    }
    const seq = ++emailCheckSeqRef.current;
    setEmailChecking(true);
    try {
      const result = await profileService.checkEmailAvailability(value);
      if (seq !== emailCheckSeqRef.current) return true;
      const available = result.available !== false;
      lastEmailResultRef.current = { email: value, available };
      if (!available) {
        setEmailAvailable(false);
        setEmailError(
          result.message || "This email is already registered. Use a different email."
        );
        return false;
      }
      setEmailAvailable(true);
      setEmailError("");
      return true;
    } catch {
      if (seq !== emailCheckSeqRef.current) return true;
      // Network failure: don't hard-block save; backend will re-check.
      setEmailAvailable(false);
      setEmailError("");
      return true;
    } finally {
      if (seq === emailCheckSeqRef.current) setEmailChecking(false);
    }
  };

  const scheduleEmailCheck = (raw: string) => {
    if (emailDebounceRef.current) clearTimeout(emailDebounceRef.current);
    const value = raw.trim();
    if (!EMAIL_REGEX.test(value)) {
      setEmailAvailable(false);
      setEmailError("");
      return;
    }
    emailDebounceRef.current = setTimeout(() => {
      void checkEmailDuplicate(value);
    }, 120);
  };

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

  const resetOtpFlow = useCallback(() => {
    setSent(false);
    setCode("");
    setMaskedEmail(null);
  }, []);

  const startEditEmail = useCallback(() => {
    setEmailDraft(profile?.email?.trim() ?? "");
    setEmailError("");
    setEmailAvailable(!!profile?.email?.trim());
    setEditingEmail(true);
  }, [profile?.email]);

  const cancelEditEmail = useCallback(() => {
    setEditingEmail(false);
    setEmailDraft(profile?.email?.trim() ?? "");
    setEmailError("");
    setEmailAvailable(false);
  }, [profile?.email]);

  const saveEmail = useCallback(async (): Promise<boolean> => {
    const next = emailDraft.trim().toLowerCase();
    if (!next || !EMAIL_REGEX.test(next)) {
      setEmailError("Enter a valid email");
      return false;
    }
    const current = profile?.email?.trim().toLowerCase() ?? "";
    if (next === current) {
      setEditingEmail(false);
      return true;
    }
    if (emailChecking) return false;
    const ok = await checkEmailDuplicate(next);
    if (!ok) return false;

    setSavingEmail(true);
    try {
      const updated = await profileService.updateProfile({ email: next });
      const merged = { ...updated, email: next, is_email_verified: false };
      await writeCachedProfile(merged);
      queryClient.setQueryData(PROFILE_QUERY_KEY, merged);
      resetOtpFlow();
      setEditingEmail(false);
      setEmailError("");
      return true;
    } catch (err: unknown) {
      const ax = err as { response?: { data?: { message?: string } }; message?: string };
      const msg =
        ax?.response?.data?.message ||
        (err instanceof Error ? err.message : null) ||
        "Could not update email. Try again.";
      setEmailError(msg);
      Alert.alert("Could not change email", msg);
      return false;
    } finally {
      setSavingEmail(false);
    }
  }, [
    emailDraft,
    profile?.email,
    emailChecking,
    queryClient,
    resetOtpFlow,
  ]);

  const handleSendCode = useCallback(async () => {
    if (editingEmail) {
      const saved = await saveEmail();
      if (!saved) return;
    }
    const email = (
      queryClient.getQueryData<UserProfile>(PROFILE_QUERY_KEY)?.email ??
      profile?.email ??
      ""
    ).trim();
    if (!email) {
      Alert.alert("No email", "Add your email first, then send a code.");
      setEditingEmail(true);
      return;
    }
    if (profile?.is_email_verified) {
      Alert.alert("Already verified", "Your email is already verified.");
      return;
    }
    sendMutation.mutate();
  }, [editingEmail, saveEmail, queryClient, profile, sendMutation]);

  const handleVerify = useCallback(() => {
    const trimmed = code.trim();
    if (trimmed.length < 4) return;
    confirmMutation.mutate(trimmed);
  }, [code, confirmMutation]);

  const emailDisplay = maskedEmail ?? profile?.email ?? null;
  const alreadyVerified = profile?.is_email_verified ?? false;
  const draftLooksValid = EMAIL_REGEX.test(emailDraft.trim());
  const canSaveEmail =
    draftLooksValid &&
    !emailChecking &&
    !savingEmail &&
    (emailAvailable ||
      emailDraft.trim().toLowerCase() === (profile?.email?.trim().toLowerCase() ?? ""));

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
            <AppText style={styles.cardTitle}>Email verified</AppText>
            <AppText style={styles.cardSub}>{emailDisplay ?? "Your email is verified."}</AppText>
            <TouchableOpacity style={styles.primaryBtn} onPress={() => router.back()}>
              <AppText style={styles.primaryBtnText}>Back to profile</AppText>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.card}>
            <View style={styles.iconWrap}>
              <Ionicons name="mail-unread-outline" size={36} color={GREEN} />
            </View>
            <AppText style={styles.cardTitle}>Verify your email</AppText>
            <AppText style={styles.cardSub}>
              {editingEmail
                ? "Update your email. The new address replaces the old one, then you can verify it."
                : sent
                  ? `Enter the 6-digit code sent to ${emailDisplay ?? "your email"}.`
                  : "We'll send a verification code to your registered email."}
            </AppText>

            {editingEmail ? (
              <View style={styles.editBlock}>
                <View style={styles.emailInputRow}>
                  <Ionicons name="mail-outline" size={18} color={GREEN_DARK} />
                  <TextInput
                    style={styles.emailInput}
                    value={emailDraft}
                    onChangeText={(v) => {
                      setEmailDraft(v);
                      setEmailError("");
                      setEmailAvailable(false);
                      scheduleEmailCheck(v);
                    }}
                    placeholder="you@example.com"
                    placeholderTextColor={MUTED}
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="email-address"
                    textContentType="emailAddress"
                    autoFocus
                  />
                  {emailChecking ? (
                    <ActivityIndicator size="small" color={GREEN} />
                  ) : emailAvailable && draftLooksValid ? (
                    <Ionicons name="checkmark-circle" size={20} color={GREEN} />
                  ) : emailError ? (
                    <Ionicons name="warning" size={20} color="#D97706" />
                  ) : null}
                </View>
                {emailError ? <AppText style={styles.emailError}>{emailError}</AppText> : null}
                <View style={styles.editActions}>
                  <TouchableOpacity
                    style={styles.secondaryBtn}
                    onPress={cancelEditEmail}
                    disabled={savingEmail}
                  >
                    <AppText style={styles.secondaryBtnText}>Cancel</AppText>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.saveBtn, !canSaveEmail && styles.btnDisabled]}
                    onPress={() => void saveEmail()}
                    disabled={!canSaveEmail}
                  >
                    {savingEmail ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <AppText style={styles.primaryBtnText}>Save email</AppText>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            ) : emailDisplay ? (
              <>
                <View style={styles.emailChip}>
                  <Ionicons name="mail-outline" size={16} color={GREEN_DARK} />
                  <AppText style={styles.emailChipText} numberOfLines={1}>
                    {emailDisplay}
                  </AppText>
                </View>
                <TouchableOpacity style={styles.linkBtn} onPress={startEditEmail}>
                  <AppText style={styles.linkBtnText}>Change email</AppText>
                </TouchableOpacity>
              </>
            ) : (
              <TouchableOpacity style={styles.linkBtn} onPress={startEditEmail}>
                <AppText style={styles.linkBtnText}>Add email</AppText>
              </TouchableOpacity>
            )}

            {!editingEmail && !sent ? (
              <TouchableOpacity
                style={[styles.primaryBtn, sendMutation.isPending && styles.btnDisabled]}
                onPress={() => void handleSendCode()}
                disabled={sendMutation.isPending || !emailDisplay}
              >
                {sendMutation.isPending ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <AppText style={styles.primaryBtnText}>Send code</AppText>
                )}
              </TouchableOpacity>
            ) : null}

            {!editingEmail && sent ? (
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
                    <AppText style={styles.primaryBtnText}>Verify email</AppText>
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.linkBtn}
                  onPress={() => void handleSendCode()}
                  disabled={sendMutation.isPending}
                >
                  <AppText style={styles.linkBtnText}>Resend code</AppText>
                </TouchableOpacity>
              </>
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
  editBlock: { marginTop: 16, width: "100%" },
  emailInputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === "ios" ? 12 : 4,
    backgroundColor: PAGE_BG,
  },
  emailInput: {
    flex: 1,
    fontSize: 15,
    fontWeight: "600",
    color: TEXT,
    paddingVertical: Platform.OS === "ios" ? 0 : 10,
  },
  emailError: {
    marginTop: 8,
    fontSize: 13,
    color: "#B45309",
    textAlign: "center",
  },
  editActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 12,
  },
  secondaryBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: "center",
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: "#fff",
  },
  secondaryBtnText: { fontSize: 15, fontWeight: "700", color: TEXT },
  saveBtn: {
    flex: 1,
    backgroundColor: GREEN,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: "center",
  },
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
