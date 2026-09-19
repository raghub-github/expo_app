/**
 * Onboarding Step 1 – Complete profile (full name, email optional, age group, gender).
 * Splash-teal layout matching login / OTP screens.
 */

import { useState, useEffect, useRef } from "react";
import { AppText } from "@/components/AppText";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
  StyleSheet,
  ScrollView,
  Pressable,
  Keyboard,
  KeyboardAvoidingView,
  StatusBar as NativeStatusBar,
  type KeyboardEvent,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { STORAGE_KEYS } from "@/constants";
import { profileService, GENDERS, AGE_GROUPS, type Gender } from "@/services/profile.service";
import { referralService } from "@/services/referral.service";
import { storePendingReferral } from "@/lib/pendingReferral";
import { setItem } from "@/utils/storage";
import { userMessageForReferralApplyError } from "@/lib/referralCopy";
import { GatiMitraColors } from "@/constants/gatimitra";
import { StoreFonts } from "@/constants/storeTypography";
import { useScreenChromeStore } from "@/store/screenChromeStore";
import { PROFILE_QUERY_KEY, writeCachedProfile } from "@/lib/profileCache";

const PROFILE_GENDERS = GENDERS.filter((g) => g.value !== "others");
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const BG_SPLASH = GatiMitraColors.splashMint;
const DARK_SURFACE = "#1A1C1E";
const REFERRAL_SURFACE = "#0F3D3A";
const TITLE_DARK = "#111827";
const TEXT_ON_TEAL = "#FFFFFF";
const TEXT_MUTED_ON_DARK = "#9CA3AF";
const APPLE_ORANGE = "#FF9500";
const PLACEHOLDER_GRAY = "#9CA3AF";
const SUBTEXT_DARK_BLUE = "#1E3A8A";
const CONTROL_RADIUS = 10;
const BTN_ACTIVE_TEXT = "#111827";
const ERROR = "#7F1D1D";
const TOGGLE_TRACK_OFF = "#334155";
const TOGGLE_TRACK_ON = "#0D9488";
const TOGGLE_KNOB = "#F8FAFC";

function SquareToggle({
  value,
  onValueChange,
  disabled,
}: {
  value: boolean;
  onValueChange: (next: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled: !!disabled }}
      disabled={disabled}
      onPress={() => onValueChange(!value)}
      style={[
        styles.squareToggleTrack,
        value ? styles.squareToggleTrackOn : styles.squareToggleTrackOff,
        disabled && styles.squareToggleDisabled,
      ]}
    >
      <View
        style={[
          styles.squareToggleKnob,
          value ? styles.squareToggleKnobOn : styles.squareToggleKnobOff,
        ]}
      />
    </Pressable>
  );
}

export default function OnboardingProfileScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const setStatusBarBackground = useScreenChromeStore((s) => s.setStatusBarBackground);
  const resetStatusBarBackground = useScreenChromeStore((s) => s.resetStatusBarBackground);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [ageGroup, setAgeGroup] = useState("");
  const [gender, setGender] = useState<Gender | "">("");
  const [hasReferralCode, setHasReferralCode] = useState(false);
  const [referralId, setReferralId] = useState("");
  const [showAgePicker, setShowAgePicker] = useState(false);
  const [nameFocused, setNameFocused] = useState(false);
  const [emailFocused, setEmailFocused] = useState(false);
  const [referralFocused, setReferralFocused] = useState(false);
  const [emailChecking, setEmailChecking] = useState(false);
  const [emailAvailable, setEmailAvailable] = useState(false);
  const [referralValid, setReferralValid] = useState(false);
  const [referralChecking, setReferralChecking] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [keyboardCovered, setKeyboardCovered] = useState(0);
  const scrollRef = useRef<ScrollView>(null);
  const emailCheckSeqRef = useRef(0);
  const emailDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastEmailResultRef = useRef<{ email: string; available: boolean } | null>(null);
  const referralCheckSeqRef = useRef(0);
  const referralDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastReferralResultRef = useRef<{ code: string; valid: boolean } | null>(null);

  const queryClient = useQueryClient();
  const { data: profile, isLoading } = useQuery({
    queryKey: PROFILE_QUERY_KEY,
    queryFn: async () => {
      const p = await profileService.getProfile();
      await writeCachedProfile(p);
      return p;
    },
    retry: false,
    staleTime: 60_000,
  });
  const { data: referralConfig } = useQuery({
    queryKey: ["referral", "config", "customer"],
    queryFn: () => referralService.getConfig(),
    retry: 1,
    staleTime: 60_000,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
  });
  const customerReferralOn = referralConfig?.referralEnabled === true;

  useEffect(() => {
    setStatusBarBackground("transparent", "dark");
    useScreenChromeStore.setState({ hideStatusBarSpacer: true });
    if (Platform.OS === "android") {
      NativeStatusBar.setTranslucent(true);
      NativeStatusBar.setBackgroundColor("transparent", true);
      NativeStatusBar.setBarStyle("dark-content", true);
    }
    return () => resetStatusBarBackground();
  }, [setStatusBarBackground, resetStatusBarBackground]);

  useEffect(() => {
    const showEvt = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvt = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const onShow = Keyboard.addListener(showEvt, (e: KeyboardEvent) => {
      setKeyboardCovered(Math.max(0, Math.round(e.endCoordinates?.height ?? 0)));
      requestAnimationFrame(() => {
        scrollRef.current?.scrollTo({ y: 80, animated: true });
      });
    });
    const onHide = Keyboard.addListener(hideEvt, () => setKeyboardCovered(0));
    return () => {
      onShow.remove();
      onHide.remove();
    };
  }, []);

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
        const code = profile.referred_by.trim().toUpperCase();
        setReferralId(code);
        setHasReferralCode(true);
        scheduleReferralCheck(code);
      }
    }
  }, [profile, router, customerReferralOn]);

  const scrollReferralIntoView = () => {
    requestAnimationFrame(() => {
      setTimeout(() => {
        scrollRef.current?.scrollToEnd({ animated: true });
      }, 80);
    });
  };

  const checkEmailDuplicate = async (raw: string) => {
    const value = raw.trim().toLowerCase();
    if (!value) {
      setEmailAvailable(false);
      setErrors((e) => ({ ...e, email: "" }));
      lastEmailResultRef.current = null;
      return true;
    }
    if (!EMAIL_REGEX.test(value)) {
      setEmailAvailable(false);
      setErrors((e) => ({ ...e, email: "" }));
      return false;
    }
    const cached = lastEmailResultRef.current;
    if (cached?.email === value) {
      setEmailAvailable(cached.available);
      if (!cached.available) {
        setErrors((e) => ({
          ...e,
          email: e.email || "This email is already registered. Use a different email.",
        }));
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
        setErrors((e) => ({
          ...e,
          email: result.message || "This email is already registered. Use a different email.",
        }));
        return false;
      }
      setEmailAvailable(true);
      setErrors((e) => ({ ...e, email: "" }));
      return true;
    } catch {
      if (seq !== emailCheckSeqRef.current) return true;
      setEmailAvailable(false);
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
      return;
    }
    // Short debounce so it feels instant once the address looks complete.
    emailDebounceRef.current = setTimeout(() => {
      void checkEmailDuplicate(value);
    }, 120);
  };

  useEffect(() => {
    return () => {
      if (emailDebounceRef.current) clearTimeout(emailDebounceRef.current);
      if (referralDebounceRef.current) clearTimeout(referralDebounceRef.current);
    };
  }, []);

  const checkReferralCode = async (raw: string) => {
    const code = raw.trim().toUpperCase();
    if (!code) {
      setReferralValid(false);
      setErrors((e) => ({ ...e, referral: "" }));
      lastReferralResultRef.current = null;
      return false;
    }
    if (code.length < 3) {
      setReferralValid(false);
      setErrors((e) => ({ ...e, referral: "" }));
      return false;
    }
    const cached = lastReferralResultRef.current;
    if (cached?.code === code) {
      setReferralValid(cached.valid);
      if (!cached.valid) {
        setErrors((e) => ({
          ...e,
          referral: e.referral || "Invalid referral code. Please check the code and try again.",
        }));
      }
      return cached.valid;
    }
    const seq = ++referralCheckSeqRef.current;
    setReferralChecking(true);
    try {
      const preview = await referralService.preview(code);
      if (seq !== referralCheckSeqRef.current) return false;
      const valid = preview.ok === true;
      lastReferralResultRef.current = { code, valid };
      if (!valid) {
        setReferralValid(false);
        setErrors((e) => ({
          ...e,
          referral:
            preview.userMessage ||
            preview.message ||
            "Invalid referral code. Please check the code and try again.",
        }));
        return false;
      }
      setReferralValid(true);
      setErrors((e) => ({ ...e, referral: "" }));
      if (preview.code && preview.code !== referralId) {
        setReferralId(preview.code.trim().toUpperCase());
      }
      return true;
    } catch {
      if (seq !== referralCheckSeqRef.current) return false;
      setReferralValid(false);
      setErrors((e) => ({
        ...e,
        referral: "Could not verify referral code. Try again.",
      }));
      return false;
    } finally {
      if (seq === referralCheckSeqRef.current) setReferralChecking(false);
    }
  };

  const scheduleReferralCheck = (raw: string) => {
    if (referralDebounceRef.current) clearTimeout(referralDebounceRef.current);
    const code = raw.trim();
    if (code.length < 3) {
      setReferralValid(false);
      return;
    }
    // Wait for 2–3s typing idle, then validate.
    referralDebounceRef.current = setTimeout(() => {
      void checkReferralCode(code);
    }, 2500);
  };

  const validate = (): boolean => {
    const e: Record<string, string> = {};
    if (fullName.trim().length < 2) e.fullName = "At least 2 characters required";
    if (email.trim() && !EMAIL_REGEX.test(email.trim())) e.email = "Enter a valid email";
    setErrors((prev) => ({
      fullName: e.fullName ?? "",
      email: e.email ?? prev.email ?? "",
      referral: prev.referral ?? "",
      submit: prev.submit ?? "",
      ageGroup: prev.ageGroup ?? "",
      gender: prev.gender ?? "",
    }));
    if (Object.keys(e).length > 0) return false;
    if (email.trim() && errors.email) return false;
    return true;
  };

  const handleSubmit = async () => {
    if (submitting || emailChecking || referralChecking) return;
    if (!validate()) return;

    if (customerReferralOn && hasReferralCode) {
      if (!referralId.trim() || !referralValid) {
        setErrors((e) => ({
          ...e,
          referral: "Please fill a valid referral code or turn off the referral toggle.",
        }));
        scrollReferralIntoView();
        return;
      }
      const ok = await checkReferralCode(referralId);
      if (!ok) {
        setErrors((e) => ({
          ...e,
          referral:
            e.referral || "Please fill a valid referral code or turn off the referral toggle.",
        }));
        scrollReferralIntoView();
        return;
      }
    }

    if (email.trim()) {
      const ok = await checkEmailDuplicate(email);
      if (!ok) return;
    }
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
      const updated = await profileService.updateProfile({
        full_name: fullName.trim(),
        email: email.trim() ? email.trim().toLowerCase() : undefined,
        age_group: ageGroup || undefined,
        gender: (gender as Gender) || undefined,
        profile_completed: true,
        referred_by: referredBy,
      });
      await writeCachedProfile({ ...updated, profile_completed: true });
      queryClient.setQueryData(PROFILE_QUERY_KEY, {
        ...updated,
        profile_completed: true,
      });
      router.push("/(onboarding)/permissions");
    } catch (err: unknown) {
      const ax = err as {
        response?: { data?: { message?: string }; status?: number };
        message?: string;
        code?: string;
      };
      const backendMsg =
        typeof ax?.response?.data?.message === "string" ? ax.response.data.message.trim() : "";
      if (
        ax?.response?.status === 400 &&
        /email/i.test(backendMsg) &&
        /(already|registered|duplicate)/i.test(backendMsg)
      ) {
        setErrors({ email: backendMsg });
        return;
      }
      const isNetworkError =
        ax?.code === "ECONNABORTED" || ax?.message?.toLowerCase?.().includes("network");
      if (__DEV__ && isNetworkError) {
        try {
          const offlineProfile = {
            full_name: fullName.trim(),
            email: email.trim() ? email.trim().toLowerCase() : undefined,
            age_group: ageGroup,
            gender,
            profile_completed: true as const,
            referred_by:
              customerReferralOn && hasReferralCode && referralId.trim()
                ? referralId.trim()
                : undefined,
          };
          await setItem(STORAGE_KEYS.PROFILE_OFFLINE, JSON.stringify(offlineProfile));
          await writeCachedProfile({
            profile_completed: true,
            full_name: offlineProfile.full_name,
            email: offlineProfile.email ?? null,
            age_group: offlineProfile.age_group || null,
            gender: (offlineProfile.gender as Gender) || null,
            referred_by: offlineProfile.referred_by ?? null,
          });
          queryClient.setQueryData(PROFILE_QUERY_KEY, {
            profile_completed: true,
            full_name: offlineProfile.full_name,
            email: offlineProfile.email ?? null,
            age_group: offlineProfile.age_group || null,
            gender: (offlineProfile.gender as Gender) || null,
            referred_by: offlineProfile.referred_by ?? null,
          });
          router.push("/(onboarding)/permissions");
          return;
        } catch {
          // fall through
        }
      }
      const msg =
        ax?.response?.data?.message ??
        (isNetworkError
          ? "Unable to connect. Check your internet and try again."
          : "Could not save. Try again.");
      setErrors({ submit: msg });
    } finally {
      setSubmitting(false);
    }
  };

  if (isLoading && !profile) {
    return (
      <View style={[styles.screen, styles.center]}>
        <StatusBar style="dark" translucent backgroundColor="transparent" />
        <View
          pointerEvents="none"
          style={[styles.statusBarVeil, { height: Math.max(insets.top, 24) }]}
        />
        <ActivityIndicator size="large" color={TITLE_DARK} />
        <AppText style={styles.loadingText} bold>
          Loading…
        </AppText>
      </View>
    );
  }

  const statusVeilH = Math.max(
    insets.top,
    Platform.OS === "android" ? NativeStatusBar.currentHeight ?? 24 : 24,
    24
  );
  const baseReady =
    fullName.trim().length >= 2 &&
    !submitting &&
    !emailChecking &&
    !errors.email &&
    (!EMAIL_REGEX.test(email.trim()) || emailAvailable);
  const referralRequired = customerReferralOn && hasReferralCode;
  const referralReady = !referralRequired || (referralValid && !errors.referral && !referralChecking);
  const canContinue = baseReady && referralReady;

  return (
    <View style={styles.screen}>
      <StatusBar style="dark" translucent backgroundColor="transparent" />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={0}
      >
        <ScrollView
          ref={scrollRef}
          style={styles.flex}
          contentContainerStyle={[
            styles.scroll,
            {
              paddingTop: statusVeilH + 28,
              paddingBottom:
                keyboardCovered > 0 ? keyboardCovered + 24 : Math.max(insets.bottom, 16) + 36,
            },
          ]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
          bounces
        >
          <View style={styles.headerBlock}>
            <AppText style={styles.title} bold>
              Complete your profile
            </AppText>
            <AppText style={styles.subtitle} bold>
              Just a couple of details so we can personalize your experience.
            </AppText>
          </View>

          <View style={styles.formBlock}>
        <AppText style={styles.label} bold>
          Full name *
        </AppText>
        <View
          style={[
            styles.inputShell,
            nameFocused && styles.inputShellFocused,
            errors.fullName && styles.inputShellError,
          ]}
        >
          <TextInput
            style={styles.input}
            placeholder="Enter your full name"
            placeholderTextColor={PLACEHOLDER_GRAY}
            value={fullName}
            onChangeText={(t) => {
              setFullName(t);
              setErrors((e) => ({ ...e, fullName: "" }));
            }}
            onFocus={() => setNameFocused(true)}
            onBlur={() => setNameFocused(false)}
            autoCapitalize="words"
            editable={!submitting}
            selectionColor={BG_SPLASH}
            allowFontScaling={false}
          />
        </View>
        {errors.fullName ? <AppText style={styles.errorText}>{errors.fullName}</AppText> : null}

        <AppText style={styles.label} bold>
          Email
        </AppText>
        <View
          style={[
            styles.inputShell,
            styles.emailShell,
            emailFocused && styles.inputShellFocused,
            errors.email && styles.inputShellError,
            emailAvailable && !errors.email && styles.emailShellOk,
          ]}
        >
          <TextInput
            style={[styles.input, styles.emailInput]}
            placeholder="your@email.com"
            placeholderTextColor={PLACEHOLDER_GRAY}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            value={email}
            onChangeText={(t) => {
              setEmail(t);
              setEmailAvailable(false);
              lastEmailResultRef.current = null;
              setErrors((e) => ({ ...e, email: "" }));
              scheduleEmailCheck(t);
            }}
            onFocus={() => setEmailFocused(true)}
            onBlur={() => {
              setEmailFocused(false);
              void checkEmailDuplicate(email);
            }}
            editable={!submitting}
            selectionColor={BG_SPLASH}
            allowFontScaling={false}
          />
          {emailAvailable && !errors.email ? (
            <Ionicons name="checkmark-circle" size={22} color="#22C55E" style={styles.emailTick} />
          ) : null}
        </View>
        {errors.email ? <AppText style={styles.errorText}>{errors.email}</AppText> : null}

        <AppText style={styles.label} bold>
          Age group
        </AppText>
        <TouchableOpacity
          style={[styles.inputShell, styles.selectTrigger, errors.ageGroup && styles.inputShellError]}
          onPress={() => {
            Keyboard.dismiss();
            setShowAgePicker(true);
          }}
          disabled={submitting}
          activeOpacity={0.85}
        >
          <Text style={ageGroup ? styles.selectText : styles.selectPlaceholder} allowFontScaling={false}>
            {ageGroup ? `${ageGroup} years` : "Select age range"}
          </Text>
          <Ionicons name="chevron-down" size={18} color={TEXT_MUTED_ON_DARK} />
        </TouchableOpacity>
        {errors.ageGroup ? <AppText style={styles.errorText}>{errors.ageGroup}</AppText> : null}

        <AppText style={styles.label} bold>
          Gender
        </AppText>
        <View style={styles.genderRow}>
          {PROFILE_GENDERS.map((g) => {
            const active = gender === g.value;
            return (
              <TouchableOpacity
                key={g.value}
                style={[styles.genderChip, active && styles.genderChipActive]}
                onPress={() => {
                  setGender(g.value);
                  setErrors((e) => ({ ...e, gender: "" }));
                }}
                disabled={submitting}
                activeOpacity={0.85}
              >
                <AppText style={[styles.genderText, active && styles.genderTextActive]} bold>
                  {g.label}
                </AppText>
              </TouchableOpacity>
            );
          })}
        </View>
        {errors.gender ? <AppText style={styles.errorText}>{errors.gender}</AppText> : null}

        {customerReferralOn ? (
          <>
            <View style={styles.referralToggleRow}>
              <AppText style={styles.referralToggleLabel} bold>
                I have a referral code
              </AppText>
              <SquareToggle
                value={hasReferralCode}
                onValueChange={(next) => {
                  setHasReferralCode(next);
                  setReferralValid(false);
                  lastReferralResultRef.current = null;
                  setErrors((e) => ({ ...e, referral: "", submit: "" }));
                  if (!next) {
                    setReferralId("");
                    return;
                  }
                  scrollReferralIntoView();
                  if (referralId.trim().length >= 3) scheduleReferralCheck(referralId);
                }}
                disabled={submitting}
              />
            </View>
            {hasReferralCode ? (
              <>
                <AppText style={styles.label} bold>
                  Referral code
                </AppText>
                <View
                  style={[
                    styles.referralInputShell,
                    styles.emailShell,
                    referralFocused && styles.inputShellFocused,
                    errors.referral && styles.inputShellError,
                    referralValid && !errors.referral && styles.emailShellOk,
                  ]}
                >
                  <TextInput
                    style={[styles.referralInput, styles.emailInput]}
                    placeholder="Enter referrer's code"
                    placeholderTextColor={PLACEHOLDER_GRAY}
                    value={referralId}
                    onChangeText={(v) => {
                      const next = v.toUpperCase();
                      setReferralId(next);
                      setReferralValid(false);
                      lastReferralResultRef.current = null;
                      setErrors((e) => ({ ...e, referral: "" }));
                      scheduleReferralCheck(next);
                    }}
                    onFocus={() => {
                      setReferralFocused(true);
                      scrollReferralIntoView();
                    }}
                    onBlur={() => {
                      setReferralFocused(false);
                      void checkReferralCode(referralId);
                    }}
                    autoCapitalize="characters"
                    autoCorrect={false}
                    editable={!submitting}
                    selectionColor={BG_SPLASH}
                    allowFontScaling={false}
                  />
                  {referralValid && !errors.referral ? (
                    <Ionicons
                      name="checkmark-circle"
                      size={22}
                      color="#22C55E"
                      style={styles.emailTick}
                    />
                  ) : null}
                </View>
                {errors.referral ? <AppText style={styles.errorText}>{errors.referral}</AppText> : null}
              </>
            ) : null}
          </>
        ) : null}

        {errors.submit ? <AppText style={styles.errorText}>{errors.submit}</AppText> : null}

        <TouchableOpacity
          onPress={() => {
            if (baseReady && referralRequired && !referralReady) {
              setErrors((e) => ({
                ...e,
                referral: "Please fill a valid referral code or turn off the referral toggle.",
              }));
              scrollReferralIntoView();
              return;
            }
            void handleSubmit();
          }}
          disabled={!baseReady}
          activeOpacity={0.88}
          style={[styles.button, canContinue ? styles.buttonActive : styles.buttonDisabled]}
        >
          {submitting ? (
            <ActivityIndicator color={BTN_ACTIVE_TEXT} />
          ) : (
            <AppText
              style={[styles.buttonText, canContinue ? styles.buttonTextActive : styles.buttonTextDisabled]}
              bold
            >
              Continue
            </AppText>
          )}
        </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Teal veil under system icons — scroll content tucks underneath; no black overlap. */}
      <View pointerEvents="none" style={[styles.statusBarVeil, { height: statusVeilH }]} />

      {showAgePicker ? (
        <Pressable style={styles.modalOverlay} onPress={() => setShowAgePicker(false)}>
          <Pressable style={styles.pickerSheet} onPress={(e) => e.stopPropagation()}>
            <AppText style={styles.pickerTitle} bold>
              Select age group
            </AppText>
            <ScrollView style={styles.pickerList}>
              {AGE_GROUPS.map((ag) => (
                <TouchableOpacity
                  key={ag}
                  style={[styles.pickerRow, ageGroup === ag && styles.pickerRowActive]}
                  onPress={() => {
                    setAgeGroup(ag);
                    setShowAgePicker(false);
                    setErrors((e) => ({ ...e, ageGroup: "" }));
                  }}
                >
                  <AppText style={styles.pickerRowText} bold>
                    {ag} years
                  </AppText>
                  {ageGroup === ag ? <Ionicons name="checkmark" size={22} color={APPLE_ORANGE} /> : null}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: BG_SPLASH,
  },
  flex: { flex: 1 },
  statusBarVeil: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: BG_SPLASH,
    zIndex: 40,
  },
  center: {
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: TITLE_DARK,
    fontWeight: "700",
  },
  scroll: {
    paddingHorizontal: 28,
    flexGrow: 1,
  },
  headerBlock: {
    marginBottom: 28,
  },
  formBlock: {
    width: "100%",
    gap: 0,
  },
  title: {
    fontSize: 28,
    fontWeight: "800",
    color: TITLE_DARK,
    textAlign: "center",
    lineHeight: 34,
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 14,
    fontWeight: "700",
    color: SUBTEXT_DARK_BLUE,
    textAlign: "center",
    lineHeight: 21,
    marginBottom: 0,
    paddingHorizontal: 4,
  },
  label: {
    fontSize: 14,
    fontWeight: "700",
    color: TITLE_DARK,
    marginBottom: 10,
    marginTop: 4,
  },
  inputShell: {
    backgroundColor: DARK_SURFACE,
    borderRadius: CONTROL_RADIUS,
    borderWidth: 1,
    borderColor: "transparent",
    minHeight: 54,
    justifyContent: "center",
    marginBottom: 18,
    paddingHorizontal: 14,
  },
  emailShell: {
    flexDirection: "row",
    alignItems: "center",
    paddingRight: 12,
  },
  emailShellOk: {
    borderColor: "rgba(34,197,94,0.65)",
  },
  emailInput: {
    flex: 1,
    paddingRight: 8,
    minWidth: 0,
  },
  emailTick: {
    marginLeft: 4,
  },
  referralInputShell: {
    backgroundColor: REFERRAL_SURFACE,
    borderRadius: CONTROL_RADIUS,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.22)",
    minHeight: 64,
    justifyContent: "center",
    marginBottom: 18,
    paddingHorizontal: 14,
  },
  inputShellFocused: {
    borderColor: "#FFFFFF",
  },
  inputShellError: {
    borderColor: "#FCA5A5",
  },
  input: {
    fontSize: 16,
    fontFamily: StoreFonts.poppinsBold,
    color: TEXT_ON_TEAL,
    paddingVertical: Platform.OS === "ios" ? 14 : 12,
    ...(Platform.OS === "android" ? { includeFontPadding: false } : null),
  },
  referralInput: {
    fontSize: 17,
    fontFamily: StoreFonts.poppinsBold,
    color: TEXT_ON_TEAL,
    letterSpacing: 1.2,
    paddingVertical: Platform.OS === "ios" ? 16 : 14,
    ...(Platform.OS === "android" ? { includeFontPadding: false } : null),
  },
  selectTrigger: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  selectText: {
    fontSize: 16,
    fontFamily: StoreFonts.poppinsBold,
    color: TEXT_ON_TEAL,
  },
  selectPlaceholder: {
    fontSize: 16,
    fontFamily: StoreFonts.poppinsBold,
    color: PLACEHOLDER_GRAY,
  },
  errorText: {
    fontSize: 13,
    color: ERROR,
    marginTop: -10,
    marginBottom: 12,
    fontWeight: "700",
  },
  genderRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 20,
  },
  genderChip: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: CONTROL_RADIUS,
    borderWidth: 1,
    borderColor: "transparent",
    backgroundColor: DARK_SURFACE,
  },
  genderChipActive: {
    borderColor: "#FFFFFF",
    backgroundColor: DARK_SURFACE,
  },
  genderText: {
    fontSize: 14,
    color: TEXT_MUTED_ON_DARK,
    fontWeight: "700",
  },
  genderTextActive: {
    color: TEXT_ON_TEAL,
  },
  referralToggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 4,
    marginBottom: 14,
    minHeight: 44,
  },
  referralToggleLabel: {
    fontSize: 15,
    fontWeight: "700",
    color: TITLE_DARK,
    flex: 1,
    paddingRight: 12,
  },
  squareToggleTrack: {
    width: 48,
    height: 26,
    borderRadius: 5,
    padding: 3,
    justifyContent: "center",
  },
  squareToggleTrackOff: {
    backgroundColor: TOGGLE_TRACK_OFF,
  },
  squareToggleTrackOn: {
    backgroundColor: TOGGLE_TRACK_ON,
  },
  squareToggleKnob: {
    width: 20,
    height: 20,
    borderRadius: 3,
    backgroundColor: TOGGLE_KNOB,
  },
  squareToggleKnobOff: {
    alignSelf: "flex-start",
  },
  squareToggleKnobOn: {
    alignSelf: "flex-end",
    backgroundColor: APPLE_ORANGE,
  },
  squareToggleDisabled: {
    opacity: 0.55,
  },
  button: {
    width: "100%",
    minHeight: 56,
    borderRadius: CONTROL_RADIUS,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
    marginTop: 12,
  },
  buttonActive: {
    backgroundColor: APPLE_ORANGE,
  },
  buttonDisabled: {
    backgroundColor: "#9CA3AF",
    opacity: 0.72,
  },
  buttonText: {
    fontSize: 17,
    fontWeight: "800",
    letterSpacing: 0.2,
    textAlign: "center",
  },
  buttonTextActive: {
    color: BTN_ACTIVE_TEXT,
  },
  buttonTextDisabled: {
    color: "rgba(17,24,39,0.45)",
  },
  modalOverlay: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-end",
  },
  pickerSheet: {
    backgroundColor: "#F8FAFC",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: "60%",
    paddingBottom: 32,
  },
  pickerTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: TITLE_DARK,
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(15,23,42,0.12)",
  },
  pickerList: { maxHeight: 320 },
  pickerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  pickerRowActive: {
    backgroundColor: "rgba(255,149,0,0.12)",
  },
  pickerRowText: {
    fontSize: 16,
    color: TITLE_DARK,
    fontWeight: "700",
  },
});
