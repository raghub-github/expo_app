/**
 * Onboarding Step 1 – Complete profile (full name, email optional, age group, gender).
 * Clean, modern UI. Referral code hidden behind "I have a referral code" toggle.
 */

import { useState, useEffect } from "react";
import { AppText } from "@/components/AppText";

import { View, TextInput, TouchableOpacity, ActivityIndicator, KeyboardAvoidingView, Platform, StyleSheet, ScrollView, Pressable, Image, Keyboard, Switch } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { STORAGE_KEYS } from "@/constants";
import { profileService, GENDERS, AGE_GROUPS, type Gender } from "@/services/profile.service";
import { referralService } from "@/services/referral.service";
import {
  REFERRAL_CODE_UNAVAILABLE_USER_MESSAGE,
  userMessageForReferralApplyError,
} from "@/lib/referralCopy";
import { storePendingReferral } from "@/lib/pendingReferral";
import { setItem } from "@/utils/storage";
import { useAppAssetSource } from "@/components/AppAssetImage";
import { CX } from "@/lib/appAssetKeys";

const PROFILE_GENDERS = GENDERS.filter((g) => g.value !== "others");
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Modern palette
const BG = "#F8FAFC";
const CARD_BG = "#FFFFFF";
const ACCENT = "#0D9488";
const ACCENT_LIGHT = "#CCFBF1";
const TITLE = "#0F172A";
const BODY = "#475569";
const BORDER = "#E2E8F0";
const PLACEHOLDER = "#94A3B8";
const ERROR = "#DC2626";

export default function OnboardingProfileScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [ageGroup, setAgeGroup] = useState("");
  const [gender, setGender] = useState<Gender | "">("");
  const [hasReferralCode, setHasReferralCode] = useState(false);
  const [referralId, setReferralId] = useState("");
  const [showAgePicker, setShowAgePicker] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const logoSource = useAppAssetSource(CX.auth.logo);

  const { data: profile, isLoading } = useQuery({
    queryKey: ["me", "profile"],
    queryFn: () => profileService.getProfile(),
    retry: false,
  });
  const { data: referralConfig } = useQuery({
    queryKey: ["referral", "config", "customer"],
    queryFn: () => referralService.getConfig(),
    retry: false,
  });
  const customerReferralOn = referralConfig?.referralEnabled === true;

  useEffect(() => {
    if (profile?.profile_completed === true) {
      router.replace("/(tabs)/");
      return;
    }
    if (profile) {
      const name = profile.full_name?.trim();
      if (name && name.toLowerCase() !== "pending") setFullName(profile.full_name!);
      if (profile.email) setEmail(profile.email);
      if (profile.age_group) setAgeGroup(profile.age_group);
      if (profile.gender) setGender(profile.gender);
      if (customerReferralOn && profile.referred_by) {
        setReferralId(profile.referred_by);
        setHasReferralCode(true);
      }
    }
  }, [profile, router, customerReferralOn]);

  const validate = (): boolean => {
    const e: Record<string, string> = {};
    if (fullName.trim().length < 2) e.fullName = "At least 2 characters required";
    if (email.trim() && !EMAIL_REGEX.test(email.trim())) e.email = "Enter a valid email";
    // Age group and gender are optional for sign-up; user can skip now and fill later.
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate() || submitting) return;
    setSubmitting(true);
    try {
      let referredBy: string | undefined;
      if (customerReferralOn && hasReferralCode && referralId.trim()) {
        const preview = await referralService.preview(referralId.trim());
        if (!preview.ok) {
          setErrors({
            referral:
              preview.userMessage ||
              preview.message ||
              userMessageForReferralApplyError(preview.error),
          });
          return;
        }
        const code = (preview.code || referralId).trim().toUpperCase();
        const applied = await referralService.apply({
          referralCode: code,
          source: "manual",
        });
        if (!applied.ok && !applied.alreadyApplied) {
          if (applied.error === "REFERRAL_SERVICE_DISABLED") {
            setErrors({ referral: userMessageForReferralApplyError(applied.error) });
            return;
          }
          await storePendingReferral({ code, source: "manual" });
        }
        referredBy = code;
      }
      await profileService.updateProfile({
        full_name: fullName.trim(),
        email: email.trim() ? email.trim().toLowerCase() : undefined,
        age_group: ageGroup || undefined,
        gender: (gender as Gender) || undefined,
        profile_completed: true,
        referred_by: referredBy,
      });
      router.push("/(onboarding)/address");
    } catch (err: unknown) {
      const ax = err as { response?: { data?: { message?: string }; status?: number }; message?: string; code?: string };
      const isNetworkError =
        ax?.code === "ECONNABORTED" || ax?.message?.toLowerCase?.().includes("network");
      if (__DEV__ && isNetworkError) {
        try {
          await setItem(
            STORAGE_KEYS.PROFILE_OFFLINE,
            JSON.stringify({
              full_name: fullName.trim(),
              email: email.trim() ? email.trim().toLowerCase() : undefined,
              age_group: ageGroup,
              gender,
              profile_completed: true,
              referred_by:
                customerReferralOn && hasReferralCode && referralId.trim() ? referralId.trim() : undefined,
            })
          );
          router.push("/(onboarding)/address");
          return;
        } catch {
          // fall through
        }
      }
      const msg =
        ax?.response?.data?.message ??
        (isNetworkError ? "Unable to connect. Check your internet and try again." : "Could not save. Try again.");
      setErrors({ submit: msg });
    } finally {
      setSubmitting(false);
    }
  };

  if (isLoading && !profile) {
    return (
      <View style={[styles.center, { paddingBottom: insets.bottom }]}>
        <ActivityIndicator size="large" color={ACCENT} />
        <AppText style={styles.loadingText}>Loading…</AppText>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={[styles.container, { paddingBottom: insets.bottom }]}
    >
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.progressWrap}>
          <View style={styles.progressBar}>
            <View style={[styles.progressFill, { width: "50%" }]} />
          </View>
          <AppText style={styles.progressLabel}>Step 1 of 2</AppText>
        </View>

        <View style={styles.logoWrap}>
          {logoSource ? (
            <Image
              source={logoSource}
              style={styles.logoImage}
              resizeMode="contain"
              accessibilityLabel="GatiMitra logo"
            />
          ) : null}
        </View>

        <View style={styles.card}>
          <AppText style={styles.title}>Complete your profile</AppText>
          <AppText style={styles.subtitle}>Just a couple of details so we can personalize your experience.</AppText>

          <AppText style={styles.label}>Full name *</AppText>
          <TextInput
            style={[styles.input, errors.fullName && styles.inputError]}
            placeholder="Enter your full name"
            placeholderTextColor={PLACEHOLDER}
            value={fullName}
            onChangeText={(t) => { setFullName(t); setErrors((e) => ({ ...e, fullName: "" })); }}
            autoCapitalize="words"
            editable={!submitting}
          />
          {errors.fullName ? <AppText style={styles.errorText}>{errors.fullName}</AppText> : null}

          <AppText style={styles.label}>Email (optional)</AppText>
          <TextInput
            style={[styles.input, errors.email && styles.inputError]}
            placeholder="your@email.com"
            placeholderTextColor={PLACEHOLDER}
            keyboardType="email-address"
            autoCapitalize="none"
            value={email}
            onChangeText={(t) => { setEmail(t); setErrors((e) => ({ ...e, email: "" })); }}
            editable={!submitting}
          />
          {errors.email ? <AppText style={styles.errorText}>{errors.email}</AppText> : null}

          <AppText style={styles.label}>Age group (optional)</AppText>
          <TouchableOpacity
            style={[styles.input, styles.selectTrigger, errors.ageGroup && styles.inputError]}
            onPress={() => { Keyboard.dismiss(); setShowAgePicker(true); }}
            disabled={submitting}
          >
            <AppText style={ageGroup ? styles.selectText : styles.selectPlaceholder}>
              {ageGroup || "Select age range"}
            </AppText>
            <Ionicons name="chevron-down" size={20} color={BODY} />
          </TouchableOpacity>
          {errors.ageGroup ? <AppText style={styles.errorText}>{errors.ageGroup}</AppText> : null}

          <AppText style={styles.label}>Gender (optional)</AppText>
          <View style={styles.genderRow}>
            {PROFILE_GENDERS.map((g) => (
              <TouchableOpacity
                key={g.value}
                style={[styles.genderChip, gender === g.value && styles.genderChipActive]}
                onPress={() => { setGender(g.value); setErrors((e) => ({ ...e, gender: "" })); }}
                disabled={submitting}
              >
                <AppText style={[styles.genderText, gender === g.value && styles.genderTextActive]}>{g.label}</AppText>
              </TouchableOpacity>
            ))}
          </View>
          {errors.gender ? <AppText style={styles.errorText}>{errors.gender}</AppText> : null}

          {referralConfig && !customerReferralOn ? (
            <AppText style={styles.referralOffHint}>{REFERRAL_CODE_UNAVAILABLE_USER_MESSAGE}</AppText>
          ) : (
            <>
          <View style={styles.referralToggleRow}>
            <AppText style={styles.referralToggleLabel}>I have a referral code</AppText>
            <Switch
              value={hasReferralCode}
              onValueChange={setHasReferralCode}
              trackColor={{ false: BORDER, true: ACCENT_LIGHT }}
              thumbColor={hasReferralCode ? ACCENT : "#f1f5f9"}
            />
          </View>
          {hasReferralCode && (
            <>
              <AppText style={styles.label}>Referral code</AppText>
              <TextInput
                style={styles.input}
                placeholder="Enter referrer's code"
                placeholderTextColor={PLACEHOLDER}
                value={referralId}
                onChangeText={(v) => {
                  setReferralId(v);
                  if (errors.referral) setErrors((e) => ({ ...e, referral: "" }));
                }}
                onBlur={() => {
                  const code = referralId.trim();
                  if (!code) return;
                  void (async () => {
                    const preview = await referralService.preview(code);
                    if (!preview.ok) {
                      setErrors((e) => ({
                        ...e,
                        referral:
                          preview.userMessage ||
                          preview.message ||
                          "Invalid referral code. Please check the code and try again.",
                      }));
                    }
                  })();
                }}
                autoCapitalize="characters"
                editable={!submitting}
              />
              {errors.referral ? <AppText style={styles.errorText}>{errors.referral}</AppText> : null}
            </>
          )}
            </>
          )}

          {errors.submit ? <AppText style={styles.errorText}>{errors.submit}</AppText> : null}

          <TouchableOpacity
            onPress={handleSubmit}
            disabled={submitting}
            activeOpacity={0.9}
            style={styles.primaryBtn}
          >
            {submitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <AppText style={styles.primaryBtnText}>Continue</AppText>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>

      {showAgePicker && (
        <Pressable style={styles.modalOverlay} onPress={() => setShowAgePicker(false)}>
          <Pressable style={styles.pickerSheet} onPress={(e) => e.stopPropagation()}>
            <AppText style={styles.pickerTitle}>Select age group</AppText>
            <ScrollView style={styles.pickerList}>
              {AGE_GROUPS.map((ag) => (
                <TouchableOpacity
                  key={ag}
                  style={[styles.pickerRow, ageGroup === ag && styles.pickerRowActive]}
                  onPress={() => { setAgeGroup(ag); setShowAgePicker(false); setErrors((e) => ({ ...e, ageGroup: "" })); }}
                >
                  <AppText style={styles.pickerRowText}>{ag} years</AppText>
                  {ageGroup === ag ? <Ionicons name="checkmark" size={22} color={ACCENT} /> : null}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  center: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: BG },
  loadingText: { marginTop: 12, fontSize: 14, color: BODY },
  scroll: { paddingHorizontal: 20, paddingBottom: 32 },
  progressWrap: { marginBottom: 16, marginTop: 4 },
  progressBar: { height: 4, backgroundColor: BORDER, borderRadius: 2, overflow: "hidden" },
  progressFill: { height: "100%", backgroundColor: ACCENT, borderRadius: 2 },
  progressLabel: { fontSize: 12, color: BODY, marginTop: 8, fontWeight: "500" },
  logoWrap: { alignItems: "center", marginBottom: 20 },
  logoImage: { width: 120, height: 36 },
  card: {
    backgroundColor: CARD_BG,
    borderRadius: 20,
    paddingHorizontal: 18,
    paddingVertical: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 12,
    elevation: 3,
  },
  title: { fontSize: 20, fontWeight: "700", color: TITLE, marginBottom: 4 },
  subtitle: { fontSize: 14, color: BODY, marginBottom: 16 },
  label: { fontSize: 13, fontWeight: "600", color: TITLE, marginBottom: 6 },
  input: {
    backgroundColor: BG,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    color: TITLE,
    marginBottom: 16,
  },
  inputError: { borderColor: ERROR },
  selectTrigger: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  selectText: { color: TITLE },
  selectPlaceholder: { color: PLACEHOLDER },
  errorText: { fontSize: 13, color: ERROR, marginTop: -8, marginBottom: 8 },
  genderRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 12 },
  genderChip: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: BG,
  },
  genderChipActive: { borderColor: ACCENT, backgroundColor: ACCENT_LIGHT },
  genderText: { fontSize: 14, color: TITLE },
  genderTextActive: { fontWeight: "600", color: ACCENT },
  referralToggleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginVertical: 8 },
  referralToggleLabel: { fontSize: 15, fontWeight: "500", color: TITLE },
  referralOffHint: { fontSize: 13, color: BODY, marginVertical: 8 },
  primaryBtn: { backgroundColor: ACCENT, paddingVertical: 14, borderRadius: 14, alignItems: "center", marginTop: 4 },
  primaryBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  modalOverlay: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "flex-end",
  },
  pickerSheet: {
    backgroundColor: CARD_BG,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: "60%",
    paddingBottom: 32,
  },
  pickerTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: TITLE,
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  pickerList: { maxHeight: 320 },
  pickerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  pickerRowActive: { backgroundColor: ACCENT_LIGHT },
  pickerRowText: { fontSize: 16, color: TITLE },
});
