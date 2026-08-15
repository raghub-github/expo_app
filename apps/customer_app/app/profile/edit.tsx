/**
 * Edit profile – full name, email, age, gender, optional referral, address.
 */

import { useState, useEffect } from "react";
import { AppText } from "@/components/AppText";

import { View, TextInput, TouchableOpacity, ActivityIndicator, KeyboardAvoidingView, Platform, StyleSheet, ScrollView, Pressable, Keyboard } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { profileService, GENDERS, AGE_GROUPS, type Gender } from "@/services/profile.service";
import { referralService } from "@/services/referral.service";
import { REFERRAL_CODE_UNAVAILABLE_USER_MESSAGE } from "@/lib/referralCopy";

const PROFILE_GENDERS = GENDERS.filter((g) => g.value !== "others");
const BG = "#F0F4F3";
const GREEN = "#2E7D32";
const TITLE = "#1A1A1A";
const GRAY = "#6B7280";
const BORDER = "#E5E7EB";
const PLACEHOLDER = "#9CA3AF";
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function EditProfileScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [ageGroup, setAgeGroup] = useState("");
  const [gender, setGender] = useState<Gender | "">("");
  const [referralId, setReferralId] = useState("");
  const [addressLine1, setAddressLine1] = useState("");
  const [addressLine2, setAddressLine2] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [pincode, setPincode] = useState("");
  const [country, setCountry] = useState("");
  const [showAgePicker, setShowAgePicker] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

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
    if (profile) {
      setFullName(profile.full_name ?? "");
      setEmail(profile.email ?? "");
      setAgeGroup(profile.age_group ?? "");
      setGender((profile.gender as Gender) ?? "");
      setReferralId(profile.referred_by ?? "");
      setAddressLine1(profile.address_line1 ?? "");
      setAddressLine2(profile.address_line2 ?? "");
      setCity(profile.city ?? "");
      setState(profile.state ?? "");
      setPincode(profile.pincode ?? "");
      setCountry(profile.country ?? "");
    }
  }, [profile]);

  const isEmailVerified = profile?.is_email_verified ?? false;

  const validate = (): boolean => {
    const e: Record<string, string> = {};
    if (fullName.trim().length < 2) e.fullName = "At least 2 characters required";
    if (!email.trim()) e.email = "Email is required";
    else if (!EMAIL_REGEX.test(email.trim())) e.email = "Enter a valid email";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate() || submitting) return;
    setSubmitting(true);
    try {
      let referredBy: string | undefined = customerReferralOn ? referralId.trim() || undefined : undefined;
      if (referredBy) {
        const preview = await referralService.preview(referredBy);
        if (!preview.ok) {
          setErrors({
            referral:
              preview.userMessage ||
              preview.message ||
              "Invalid referral code. Please check the code and try again.",
          });
          return;
        }
        referredBy = (preview.code || referredBy).toUpperCase();
      }
      await profileService.updateProfile({
        full_name: fullName.trim(),
        ...(isEmailVerified ? {} : { email: email.trim().toLowerCase() }),
        age_group: ageGroup || undefined,
        gender: gender || undefined,
        referred_by: referredBy,
        address_line1: addressLine1.trim() || undefined,
        address_line2: addressLine2.trim() || undefined,
        city: city.trim() || undefined,
        state: state.trim() || undefined,
        pincode: pincode.trim() || undefined,
        country: country.trim() || undefined,
      });
      await queryClient.invalidateQueries({ queryKey: ["me", "profile"] });
      router.back();
    } catch (err: any) {
      setErrors({ submit: err?.response?.data?.message ?? "Could not save. Try again." });
    } finally {
      setSubmitting(false);
    }
  };

  if (isLoading && !profile) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={GREEN} />
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
        <AppText style={styles.label}>Full name *</AppText>
        <TextInput
          style={[styles.input, errors.fullName && styles.inputError]}
          placeholder="Enter full name"
          placeholderTextColor={PLACEHOLDER}
          value={fullName}
          onChangeText={(t) => { setFullName(t); setErrors((e) => ({ ...e, fullName: "" })); }}
          editable={!submitting}
        />
        {errors.fullName ? <AppText style={styles.errorText}>{errors.fullName}</AppText> : null}

        <View style={styles.labelRow}>
          <AppText style={[styles.label, styles.labelInline]}>Email *</AppText>
          {isEmailVerified ? (
            <View style={styles.verifiedBadge}>
              <Ionicons name="checkmark-circle" size={14} color={GREEN} />
              <AppText style={styles.verifiedBadgeText}>Verified</AppText>
            </View>
          ) : null}
        </View>
        <View style={[styles.emailFieldWrap, isEmailVerified && styles.emailFieldWrapLocked]}>
          {isEmailVerified ? (
            <Ionicons name="lock-closed" size={16} color={GRAY} style={styles.emailLockIcon} />
          ) : null}
          <TextInput
            style={[
              styles.input,
              styles.emailInput,
              isEmailVerified && styles.inputLocked,
              errors.email && styles.inputError,
            ]}
            placeholder="your@email.com"
            placeholderTextColor={PLACEHOLDER}
            keyboardType="email-address"
            autoCapitalize="none"
            value={email}
            onChangeText={(t) => { setEmail(t); setErrors((e) => ({ ...e, email: "" })); }}
            editable={!submitting && !isEmailVerified}
          />
        </View>
        {isEmailVerified ? (
          <AppText style={styles.verifiedHint}>Verified email cannot be changed.</AppText>
        ) : null}
        {errors.email ? <AppText style={styles.errorText}>{errors.email}</AppText> : null}

        <AppText style={styles.label}>Age group</AppText>
        <TouchableOpacity
          style={[styles.input, styles.selectTrigger]}
          onPress={() => { Keyboard.dismiss(); setShowAgePicker(true); }}
          disabled={submitting}
        >
          <AppText style={ageGroup ? styles.selectText : styles.selectPlaceholder}>
            {ageGroup || "Select age range"}
          </AppText>
          <Ionicons name="chevron-down" size={20} color={GRAY} />
        </TouchableOpacity>

        <AppText style={styles.label}>Gender</AppText>
        <View style={styles.genderRow}>
          {PROFILE_GENDERS.map((g) => (
            <TouchableOpacity
              key={g.value}
              style={[styles.genderChip, gender === g.value && styles.genderChipActive]}
              onPress={() => setGender(g.value)}
              disabled={submitting}
            >
              <AppText style={[styles.genderText, gender === g.value && styles.genderTextActive]}>{g.label}</AppText>
            </TouchableOpacity>
          ))}
        </View>

        {referralConfig && !customerReferralOn ? (
          <>
            <AppText style={styles.label}>Referral ID (optional)</AppText>
            <AppText style={styles.verifiedHint}>{REFERRAL_CODE_UNAVAILABLE_USER_MESSAGE}</AppText>
          </>
        ) : (
          <>
        <AppText style={styles.label}>Referral ID (optional)</AppText>
        <TextInput
          style={styles.input}
          placeholder="Referral code"
          placeholderTextColor={PLACEHOLDER}
          value={referralId}
          onChangeText={(v) => {
            setReferralId(v);
            if (errors.referral) setErrors((e) => ({ ...e, referral: "" }));
          }}
          autoCapitalize="characters"
          editable={!submitting}
        />
        {errors.referral ? <AppText style={styles.errorText}>{errors.referral}</AppText> : null}
          </>
        )}

        <AppText style={styles.sectionTitle}>Address (optional)</AppText>
        <AppText style={styles.label}>Address line 1</AppText>
        <TextInput style={styles.input} placeholder="Street, building" placeholderTextColor={PLACEHOLDER} value={addressLine1} onChangeText={setAddressLine1} editable={!submitting} />
        <AppText style={styles.label}>Address line 2</AppText>
        <TextInput style={styles.input} placeholder="Area, landmark" placeholderTextColor={PLACEHOLDER} value={addressLine2} onChangeText={setAddressLine2} editable={!submitting} />
        <View style={styles.row2}>
          <View style={styles.half}>
            <AppText style={styles.label}>City</AppText>
            <TextInput style={styles.input} placeholder="City" placeholderTextColor={PLACEHOLDER} value={city} onChangeText={setCity} editable={!submitting} />
          </View>
          <View style={styles.half}>
            <AppText style={styles.label}>State</AppText>
            <TextInput style={styles.input} placeholder="State" placeholderTextColor={PLACEHOLDER} value={state} onChangeText={setState} editable={!submitting} />
          </View>
        </View>
        <View style={styles.row2}>
          <View style={styles.half}>
            <AppText style={styles.label}>Pincode</AppText>
            <TextInput style={styles.input} placeholder="Pincode" placeholderTextColor={PLACEHOLDER} value={pincode} onChangeText={setPincode} keyboardType="number-pad" editable={!submitting} />
          </View>
          <View style={styles.half}>
            <AppText style={styles.label}>Country</AppText>
            <TextInput style={styles.input} placeholder="Country" placeholderTextColor={PLACEHOLDER} value={country} onChangeText={setCountry} editable={!submitting} />
          </View>
        </View>

        {errors.submit ? <AppText style={styles.errorText}>{errors.submit}</AppText> : null}

        <TouchableOpacity onPress={handleSubmit} disabled={submitting} style={styles.btn}>
          {submitting ? <ActivityIndicator color="#fff" /> : <AppText style={styles.btnText}>Save</AppText>}
        </TouchableOpacity>
      </ScrollView>

      {showAgePicker ? (
        <Pressable style={styles.modalOverlay} onPress={() => setShowAgePicker(false)}>
          <Pressable style={styles.pickerSheet} onPress={(e) => e.stopPropagation()}>
            <AppText style={styles.pickerTitle}>Select age group</AppText>
            <ScrollView style={styles.pickerList}>
              {AGE_GROUPS.map((ag) => (
                <TouchableOpacity
                  key={ag}
                  style={[styles.pickerRow, ageGroup === ag && styles.pickerRowActive]}
                  onPress={() => { setAgeGroup(ag); setShowAgePicker(false); }}
                >
                  <AppText style={styles.pickerRowText}>{ag} years</AppText>
                  {ageGroup === ag ? <Ionicons name="checkmark" size={22} color={GREEN} /> : null}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      ) : null}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  center: { flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: BG },
  scroll: { padding: 20, paddingBottom: 40 },
  sectionTitle: { fontSize: 16, fontWeight: "700", color: TITLE, marginTop: 20, marginBottom: 12 },
  label: { fontSize: 14, fontWeight: "600", color: TITLE, marginBottom: 8 },
  labelRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
  labelInline: { marginBottom: 0 },
  verifiedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#ECFDF5",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: "#BBF7D0",
  },
  verifiedBadgeText: { fontSize: 12, fontWeight: "700", color: GREEN },
  emailFieldWrap: { position: "relative", marginBottom: 16 },
  emailFieldWrapLocked: { marginBottom: 6 },
  emailLockIcon: { position: "absolute", left: 14, top: 15, zIndex: 1 },
  emailInput: { marginBottom: 0 },
  inputLocked: { backgroundColor: "#F9FAFB", color: GRAY, paddingLeft: 40 },
  verifiedHint: { fontSize: 12, color: GRAY, marginBottom: 16 },
  input: {
    backgroundColor: "#FFF",
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 16,
    color: TITLE,
    marginBottom: 16,
  },
  inputError: { borderColor: "#dc2626" },
  selectTrigger: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  selectText: { color: TITLE },
  selectPlaceholder: { color: PLACEHOLDER },
  errorText: { fontSize: 13, color: "#dc2626", marginBottom: 8 },
  genderRow: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 16 },
  genderChip: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: "#FFF",
  },
  genderChipActive: { borderColor: GREEN, backgroundColor: "#E8F5E9" },
  genderText: { fontSize: 14, color: TITLE },
  genderTextActive: { fontWeight: "600", color: GREEN },
  row2: { flexDirection: "row", gap: 12 },
  half: { flex: 1 },
  btn: { backgroundColor: GREEN, paddingVertical: 16, borderRadius: 14, alignItems: "center", marginTop: 8 },
  btnText: { color: "#fff", fontSize: 17, fontWeight: "700" },
  modalOverlay: { position: "absolute", left: 0, right: 0, top: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" },
  pickerSheet: { backgroundColor: "#FFF", borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: "60%", paddingBottom: 32 },
  pickerTitle: { fontSize: 18, fontWeight: "700", color: TITLE, padding: 20, borderBottomWidth: 1, borderBottomColor: BORDER },
  pickerList: { maxHeight: 320 },
  pickerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingVertical: 16 },
  pickerRowActive: { backgroundColor: "#E8F5E9" },
  pickerRowText: { fontSize: 16, color: TITLE },
});
