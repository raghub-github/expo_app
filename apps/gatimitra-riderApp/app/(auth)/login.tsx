import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Platform,
  StyleSheet,
  Image,
  Pressable,
  Keyboard,
  KeyboardAvoidingView,
  Linking,
  type KeyboardEvent,
} from "react-native";
import * as WebBrowser from "expo-web-browser";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useTranslation } from "react-i18next";
import {
  isRiderAuthError,
  isRiderSessionConflict,
  riderAuthService,
  type RiderSessionConflict,
} from "@/src/services/auth/auth.service";
import { resetSessionRevokedFlag } from "@/src/services/sessionEvents";
import { getOrCreateDeviceId } from "@/src/utils/deviceId";
import {
  getRiderLoginGeoFromDevice,
  getRiderLoginGeoWithBudget,
} from "@/src/lib/getRiderLoginGeoFromDevice";
import { AnotherDeviceLoggedInSheet } from "@/src/components/auth/AnotherDeviceLoggedInSheet";
import { LanguageSelectionSheet } from "@/src/components/language/LanguageSelectionSheet";
import { AuthPrimaryButton } from "@/src/components/auth/AuthPrimaryButton";
import { useRiderBottomInset } from "@/src/hooks/useRiderBottomInset";
import type { Session } from "@gatimitra/contracts";
import { useSessionStore } from "@/src/stores/sessionStore";
import { useOnboardingStore } from "@/src/stores/onboardingStore";
import { useAppAssetSource } from "@/src/components/AppAssetImage";
import { RX } from "@/src/lib/appAssetKeys";
import { RiderFonts } from "@/src/theme/fonts";
import {
  RIDER_AUTH_ACCENT,
  RIDER_AUTH_BG,
  RIDER_AUTH_HINT,
  RIDER_AUTH_INK,
  RIDER_AUTH_LINK,
  RIDER_AUTH_MUTED,
  RIDER_AUTH_SURFACE,
} from "@/src/theme/riderAuthTheme";
import { keyboardInsetFromEvent } from "@/src/hooks/useKeyboardBottomInset";
import { sanitizeRiderAuthError } from "@/src/lib/sanitizeRiderAuthError";

const OTP_LENGTH = 6;
const RIDER_TERMS_URL = "https://rider.gatimitra.com/terms";

function AuthBrandHeader() {
  return (
    <View style={styles.brandWrap}>
      <Text
        style={styles.brandTitle}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.65}
      >
        GatiMitra
      </Text>
      <Text
        style={styles.brandSubtitle}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.7}
      >
        Moving India Forward
      </Text>
    </View>
  );
}

function NeedSupportLine() {
  const { t } = useTranslation();
  return (
    <View style={styles.supportRow}>
      <Text style={styles.supportText}>
        {t("login.needSupportQuestion", "Need Support?")}{" "}
      </Text>
      <Pressable
        onPress={() => router.push({ pathname: "/raise-ticket", params: { prelogin: "1" } })}
        hitSlop={10}
        accessibilityRole="link"
        accessibilityLabel={t("login.reachUs", "Reach Us")}
      >
        <Text style={styles.supportLink}>{t("login.reachUs", "Reach Us")}</Text>
      </Pressable>
    </View>
  );
}

function LegalTermsLine() {
  const { t } = useTranslation();
  const prefix = t("login.termsPrefix", "By continuing, you agree to our ");
  const link = t("login.termsLink", "Terms and Conditions");

  const openLegal = () => {
    void WebBrowser.openBrowserAsync(RIDER_TERMS_URL).catch(() => {
      void Linking.openURL(RIDER_TERMS_URL).catch(() => {});
    });
  };

  return (
    <View style={styles.legalRow}>
      <Text style={styles.legalTextMuted}>{prefix}</Text>
      <Pressable
        onPress={openLegal}
        hitSlop={12}
        accessibilityRole="link"
        accessibilityLabel={link}
      >
        <Text style={styles.legalLink}>{link}</Text>
      </Pressable>
    </View>
  );
}

function PhoneField({
  value,
  onChange,
  error,
}: {
  value: string;
  onChange: (text: string) => void;
  error?: boolean;
}) {
  const { t } = useTranslation();
  const inputRef = useRef<TextInput>(null);

  return (
    <Pressable
      onPress={() => inputRef.current?.focus()}
      style={[styles.phoneField, error ? styles.phoneFieldError : null]}
      collapsable={false}
      accessibilityRole="none"
    >
      <View style={styles.phonePrefix} pointerEvents="none">
        <Text style={styles.flagEmoji}>🇮🇳</Text>
        <Text style={styles.prefixCode}>+91</Text>
      </View>
      <View style={styles.phoneDivider} pointerEvents="none" />
      <TextInput
        ref={inputRef}
        value={value}
        onChangeText={(text) => onChange(text.replace(/\D/g, "").slice(0, 10))}
        placeholder={t("login.phonePlaceholder", "Enter mobile number")}
        placeholderTextColor={RIDER_AUTH_HINT}
        keyboardType="phone-pad"
        maxLength={10}
        editable
        showSoftInputOnFocus
        underlineColorAndroid="transparent"
        pointerEvents="auto"
        style={styles.phoneInput}
      />
      {value.length > 0 ? (
        <Pressable onPress={() => onChange("")} hitSlop={8} accessibilityLabel="Clear">
          <Ionicons name="close-circle" size={18} color={RIDER_AUTH_HINT} />
        </Pressable>
      ) : null}
    </Pressable>
  );
}

function OtpBoxes({
  value,
  onChange,
  error,
}: {
  value: string;
  onChange: (text: string) => void;
  error?: boolean;
}) {
  const inputRef = useRef<TextInput>(null);
  const focusedIndex = Math.min(value.length, OTP_LENGTH - 1);

  return (
    <Pressable
      onPress={() => inputRef.current?.focus()}
      style={styles.otpRow}
      accessibilityLabel={`One-time code, ${OTP_LENGTH} digits`}
    >
      {Array.from({ length: OTP_LENGTH }).map((_, index) => {
        const digit = value.charAt(index);
        const active = index === focusedIndex;
        return (
          <View
            key={index}
            style={[
              styles.otpBox,
              active && styles.otpBoxActive,
              digit ? styles.otpBoxFilled : null,
              error ? styles.otpBoxError : null,
            ]}
            pointerEvents="none"
          >
            <Text style={styles.otpDigit}>{digit}</Text>
          </View>
        );
      })}
      <TextInput
        ref={inputRef}
        value={value}
        onChangeText={(text) => onChange(text.replace(/[^0-9]/g, "").slice(0, OTP_LENGTH))}
        keyboardType="number-pad"
        maxLength={OTP_LENGTH}
        autoComplete={Platform.OS === "android" ? "sms-otp" : "one-time-code"}
        textContentType="oneTimeCode"
        autoFocus
        caretHidden
        style={styles.otpHiddenInput}
      />
    </Pressable>
  );
}

export default function LoginScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const bottomInset = useRiderBottomInset();

  const setSession = useSessionStore((s) => s.setSession);
  const setOnboardingData = useOnboardingStore((s) => s.setData);

  const [phoneE164, setPhoneE164] = useState("");
  const [otp, setOtp] = useState("");
  const [step, setStep] = useState<"phone" | "otp">("phone");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(0);
  const [deviceSessionRetry, setDeviceSessionRetry] = useState(false);
  const [sessionConflict, setSessionConflict] = useState<RiderSessionConflict | null>(null);
  const [takeoverBusy, setTakeoverBusy] = useState(false);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [keyboardLift, setKeyboardLift] = useState(0);
  const [languageSheetOpen, setLanguageSheetOpen] = useState(false);
  const riderHero = useAppAssetSource(RX.auth.hero);
  /** Prefetch while rider types OTP so verify does not wait on GPS. */
  const loginGeoPrefetchRef = useRef<ReturnType<typeof getRiderLoginGeoFromDevice> | null>(null);

  const phoneDigits = phoneE164.replace(/\D/g, "");
  const phoneValid = phoneDigits.length >= 10;
  const otpValid = otp.trim().length === OTP_LENGTH;
  const showSignupHero = step === "phone" && !keyboardVisible;

  useEffect(() => {
    const onShow = (event: KeyboardEvent) => {
      setKeyboardVisible(true);
      setKeyboardLift(keyboardInsetFromEvent(event));
    };
    const onHide = () => {
      setKeyboardVisible(false);
      setKeyboardLift(0);
    };

    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";

    const showSub = Keyboard.addListener(showEvent, onShow);
    const hideSub = Keyboard.addListener(hideEvent, onHide);

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  // Warm GPS/geocode in the background as soon as OTP step opens.
  useEffect(() => {
    if (step !== "otp") {
      loginGeoPrefetchRef.current = null;
      return;
    }
    loginGeoPrefetchRef.current = getRiderLoginGeoFromDevice();
  }, [step]);

  const startCountdown = () => {
    setCountdown(60);
    const interval = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const onRequestOtp = async () => {
    if (!phoneValid) {
      setError("Please enter a valid 10-digit phone number");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const normalizedPhone = phoneDigits.length === 10 ? `+91${phoneDigits}` : phoneE164.trim();
      await riderAuthService.sendOtp({ phoneE164: normalizedPhone });

      setDeviceSessionRetry(false);
      setStep("otp");
      startCountdown();
    } catch (e) {
      setError(sanitizeRiderAuthError(e, t("login.highTraffic")));
      if (__DEV__) {
        console.warn("OTP request error:", e);
      }
    } finally {
      setBusy(false);
    }
  };

  const proceedAfterSession = async (session: Session) => {
    resetSessionRevokedFlag();
    await setSession(session);

    const status = await riderAuthService.getRiderStatus(session.accessToken);
    const riderId =
      status.riderId ??
      session.riderId ??
      session.userId.replace(/^usr_/, "");

    // Bind rider-scoped onboarding BEFORE writing — prevents inheriting another rider's RC/DL.
    if (riderId) {
      await useOnboardingStore.getState().bindOwner(String(riderId));
      await setOnboardingData({ riderId: String(riderId) });
    } else {
      await useOnboardingStore.getState().bindOwner(session.userId);
    }

    if (status.onboardingStatus === "approved") {
      router.replace("/(tabs)/orders");
    } else if (
      status.onboardingStatus === "pending_approval" &&
      status.paymentCompleted === true
    ) {
      router.replace("/(onboarding)/pending");
    } else if (
      !status.exists ||
      status.onboardingStatus === "not_started" ||
      status.onboardingStatus == null
    ) {
      await setOnboardingData({
        ...(riderId ? { riderId } : {}),
        referralPromptHandled: false,
        skippedReferral: false,
      });
      router.replace("/(onboarding)/referral");
    } else {
      router.replace("/");
    }
  };

  const resolveLoginGeoFast = async () => {
    const pending = loginGeoPrefetchRef.current ?? getRiderLoginGeoFromDevice();
    loginGeoPrefetchRef.current = pending;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        pending,
        new Promise<undefined>((resolve) => {
          timer = setTimeout(() => resolve(undefined), 350);
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  };

  const onVerifyOtp = async () => {
    if (!otp.trim() || otp.trim().length !== OTP_LENGTH) {
      setError(`Please enter a valid ${OTP_LENGTH}-digit OTP`);
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const [deviceId, loginGeo] = await Promise.all([
        getOrCreateDeviceId(),
        resolveLoginGeoFast(),
      ]);
      const normalizedPhone = phoneDigits.length === 10 ? `+91${phoneDigits}` : phoneE164.trim();
      const otpValue = otp.trim();

      let result;
      try {
        result = await riderAuthService.verifyOtp({
          phoneE164: normalizedPhone,
          otp: otpValue,
          deviceId,
          loginGeo,
        });
      } catch (verifyError) {
        if (isRiderAuthError(verifyError) && verifyError.code === "device_session_unavailable") {
          setDeviceSessionRetry(true);
          throw verifyError;
        }
        if (isRiderAuthError(verifyError) && verifyError.code === "device_change_limit_exceeded") {
          setDeviceSessionRetry(false);
          throw verifyError;
        }
        throw verifyError;
      }

      if (isRiderSessionConflict(result)) {
        setSessionConflict(result);
        return;
      }

      await proceedAfterSession(result);
    } catch (e) {
      setError(sanitizeRiderAuthError(e, t("login.highTraffic")));
    } finally {
      setBusy(false);
    }
  };

  // Auto-verify as soon as all 6 digits are entered (once per OTP value).
  const autoVerifyOtpRef = useRef<string | null>(null);
  useEffect(() => {
    if (step !== "otp") {
      autoVerifyOtpRef.current = null;
      return;
    }
    if (!otpValid) {
      // User is still editing — allow auto-verify again when 6 digits are complete.
      if (otp.trim().length < OTP_LENGTH) autoVerifyOtpRef.current = null;
      return;
    }
    if (busy || sessionConflict != null) return;
    const code = otp.trim();
    if (autoVerifyOtpRef.current === code) return;
    autoVerifyOtpRef.current = code;
    void onVerifyOtp();
  }, [otp, otpValid, busy, step, sessionConflict]);

  const onMarkLogout = async () => {
    if (!sessionConflict || takeoverBusy) return;
    setTakeoverBusy(true);
    setError(null);
    try {
      const [deviceId, loginGeo] = await Promise.all([
        getOrCreateDeviceId(),
        getRiderLoginGeoWithBudget(350),
      ]);
      const session = await riderAuthService.takeoverDeviceSession({
        takeoverToken: sessionConflict.takeoverToken,
        deviceId,
        loginGeo,
      });
      setSessionConflict(null);
      await proceedAfterSession(session);
    } catch (e) {
      setError(sanitizeRiderAuthError(e, t("login.highTraffic")));
    } finally {
      setTakeoverBusy(false);
    }
  };

  const onCancelConflict = () => {
    if (takeoverBusy) return;
    setSessionConflict(null);
    setError(null);
    setOtp("");
  };

  const onRetryOtp = async () => {
    if (countdown > 0) return;

    setBusy(true);
    setError(null);
    try {
      const normalizedPhone = phoneDigits.length === 10 ? `+91${phoneDigits}` : phoneE164.trim();
      await riderAuthService.sendOtp({ phoneE164: normalizedPhone });
      startCountdown();
    } catch (e) {
      setError(sanitizeRiderAuthError(e, t("login.highTraffic")));
    } finally {
      setBusy(false);
    }
  };

  const onRetryDeviceSession = async () => {
    if (!otpValid) return;
    setBusy(true);
    setError(null);
    try {
      const [deviceId, loginGeo] = await Promise.all([
        getOrCreateDeviceId(),
        getRiderLoginGeoWithBudget(350),
      ]);
      const normalizedPhone = phoneDigits.length === 10 ? `+91${phoneDigits}` : phoneE164.trim();
      const result = await riderAuthService.exchangeRiderFromCurrentSupabaseSession({
        phoneE164: normalizedPhone,
        deviceId,
        loginGeo,
      });
      if (isRiderSessionConflict(result)) {
        setDeviceSessionRetry(false);
        setSessionConflict(result);
        return;
      }
      resetSessionRevokedFlag();
      await setSession(result);
      setDeviceSessionRetry(false);
      router.replace("/");
    } catch (e) {
      if (isRiderAuthError(e) && e.code === "device_change_limit_exceeded") {
        setDeviceSessionRetry(false);
      }
      setError(sanitizeRiderAuthError(e, t("login.highTraffic")));
    } finally {
      setBusy(false);
    }
  };

  const resetToPhone = () => {
    setStep("phone");
    setOtp("");
    setDeviceSessionRetry(false);
    setError(null);
    setCountdown(0);
  };

  const onChromeBack = () => {
    if (step === "otp") {
      resetToPhone();
      return;
    }
    if (keyboardVisible) {
      Keyboard.dismiss();
      return;
    }
    if (router.canGoBack()) router.back();
  };

  const updatePhone = (text: string) => {
    setPhoneE164(text);
    setError(null);
  };

  const errorBanner = error ? (
    <View style={styles.errorBox}>
      <Text style={styles.errorText}>{error}</Text>
    </View>
  ) : null;

  const sheetBottomPad = keyboardVisible ? 8 : bottomInset + 20;
  const androidKeyboardPad = Platform.OS === "android" && keyboardLift > 0 ? keyboardLift : 0;

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={[styles.root, androidKeyboardPad > 0 ? { paddingBottom: androidKeyboardPad } : null]}>
      <StatusBar style="dark" />

      {showSignupHero ? (
        <View style={styles.hero}>
          {riderHero ? (
            <Image
              source={riderHero}
              style={[styles.heroImage, { top: insets.top + 10 }]}
              resizeMode="contain"
            />
          ) : null}
          <SafeAreaView edges={["top"]} style={styles.heroChrome} pointerEvents="box-none">
            <View style={styles.heroTopRow} pointerEvents="box-none">
              {router.canGoBack() ? (
                <Pressable
                  onPress={() => router.back()}
                  hitSlop={12}
                  style={styles.iconBtn}
                  accessibilityRole="button"
                  accessibilityLabel={t("common.back", "Back")}
                >
                  <Ionicons name="arrow-back" size={24} color={RIDER_AUTH_INK} />
                </Pressable>
              ) : (
                <View style={styles.iconBtn} />
              )}
              <Pressable
                onPress={() => setLanguageSheetOpen(true)}
                style={styles.langChip}
                accessibilityRole="button"
                accessibilityLabel={t("topbar.selectLanguage", "Select language")}
              >
                <Text style={styles.langChipText}>अA</Text>
              </Pressable>
            </View>
          </SafeAreaView>
        </View>
      ) : (
        <>
          <SafeAreaView edges={["top"]} style={styles.chromeSafe}>
            <View style={styles.chromeTop}>
              <Pressable
                onPress={onChromeBack}
                hitSlop={12}
                style={styles.iconBtn}
                accessibilityRole="button"
                accessibilityLabel={t("common.back", "Back")}
              >
                <Ionicons name="arrow-back" size={24} color={RIDER_AUTH_INK} />
              </Pressable>
            </View>
            <AuthBrandHeader />
          </SafeAreaView>
        </>
      )}

      <View
        style={[
          styles.sheet,
          !showSignupHero && styles.sheetFill,
          { paddingBottom: sheetBottomPad },
        ]}
      >
        {step === "phone" ? (
          <>
            {showSignupHero ? (
              <Text style={[styles.formTitle, styles.formTitleCentered]}>
                {t("login.signupTitle", "Start your journey with")}
                {"\n"}
                {t("login.signupBrand", "GatiMitra")}
              </Text>
            ) : (
              <>
                <Text style={styles.signInTitle}>
                  {t("login.signInTitle", "Sign in to your account")}
                </Text>
                <Text style={styles.signInSubtitle}>
                  {t("login.signInSubtitle", "Login or create an account")}
                </Text>
              </>
            )}

            <PhoneField
              value={phoneE164}
              onChange={updatePhone}
              error={Boolean(error)}
            />
            {!showSignupHero ? (
              <Text style={styles.hintText}>
                {t("login.validMobileHint", "Enter a valid 10 digit mobile number")}
              </Text>
            ) : null}
            {!showSignupHero ? <NeedSupportLine /> : null}
            {errorBanner}

            {!showSignupHero ? <View style={styles.sheetSpacer} /> : null}

            <View style={[styles.ctaBlock, showSignupHero && styles.ctaBlockCompact]}>
              <AuthPrimaryButton
                label={t("login.continue", "Continue")}
                onPress={onRequestOtp}
                disabled={!phoneValid}
                loading={busy}
              />
              <LegalTermsLine />
            </View>
          </>
        ) : (
          <>
            <Text style={styles.formTitle}>{t("login.enterOtp", "Enter OTP")}</Text>
            <Text style={styles.formSubtitle}>
              {t("login.otpSentTo", "OTP sent to {{phone}}", { phone: phoneDigits })}
            </Text>

            <OtpBoxes
              value={otp}
              onChange={(text) => {
                setOtp(text);
                setError(null);
              }}
              error={Boolean(error)}
            />

            <Text style={styles.resendHint}>
              {countdown > 0
                ? t("login.resendSmsIn", "Didn't get the OTP? Resend SMS in {{count}}s", {
                    count: countdown,
                  })
                : t("login.didntReceive")}
            </Text>
            {countdown === 0 ? (
              <Pressable onPress={onRetryOtp} disabled={busy} hitSlop={8} style={styles.resendBtn}>
                <Text style={styles.linkText}>{t("login.resendOtp")}</Text>
              </Pressable>
            ) : null}

            {errorBanner}

            {deviceSessionRetry ? (
              <Pressable onPress={onRetryDeviceSession} disabled={busy || !otpValid} style={styles.retrySessionBtn}>
                <Text style={styles.linkText}>Try again without re-entering OTP</Text>
              </Pressable>
            ) : null}

            <View style={styles.sheetSpacer} />

            <View style={styles.ctaBlock}>
              <AuthPrimaryButton
                label={t("login.submit", "Submit")}
                onPress={onVerifyOtp}
                disabled={!otpValid}
                loading={busy}
              />
            </View>
          </>
        )}
      </View>

      <LanguageSelectionSheet
        visible={languageSheetOpen}
        onClose={() => setLanguageSheetOpen(false)}
        applyImmediately
      />

      <AnotherDeviceLoggedInSheet
        visible={sessionConflict != null}
        existingSession={sessionConflict?.existingSession ?? null}
        busy={takeoverBusy}
        onMarkLogout={onMarkLogout}
        onCancel={onCancelConflict}
      />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignSelf: "stretch",
    backgroundColor: RIDER_AUTH_BG,
  },
  hero: {
    flex: 1,
    alignSelf: "stretch",
    minHeight: 0,
    backgroundColor: RIDER_AUTH_BG,
  },
  heroFill: {
    flex: 1,
    minHeight: 0,
  },
  heroImage: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    width: "100%",
  },
  heroChrome: {
    ...StyleSheet.absoluteFillObject,
  },
  heroTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 14,
    alignSelf: "stretch",
  },
  chromeSafe: {
    alignSelf: "stretch",
    paddingBottom: 0,
  },
  chromeTop: {
    paddingHorizontal: 12,
    minHeight: 44,
    justifyContent: "center",
    alignSelf: "stretch",
  },
  iconBtn: {
    width: 40,
    height: 40,
    alignItems: "flex-start",
    justifyContent: "center",
  },
  langChip: {
    minWidth: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: RIDER_AUTH_ACCENT,
    borderWidth: 2,
    borderColor: "#111111",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
  },
  langChipText: {
    fontFamily: RiderFonts.loraBold,
    fontSize: 15,
    color: RIDER_AUTH_INK,
  },
  brandWrap: {
    alignItems: "center",
    alignSelf: "stretch",
    paddingHorizontal: 16,
    marginTop: 0,
    marginBottom: 4,
  },
  brandTitle: {
    fontFamily: RiderFonts.poppinsExtraBold,
    fontSize: 40,
    color: "#000000",
    letterSpacing: 0.2,
    maxWidth: "100%",
    textAlign: "center",
  },
  brandSubtitle: {
    fontFamily: RiderFonts.poppinsBold,
    fontSize: 16,
    color: "#000000",
    letterSpacing: 0.4,
    marginTop: 4,
    maxWidth: "100%",
    textAlign: "center",
  },
  sheet: {
    alignSelf: "stretch",
    flexGrow: 0,
    flexShrink: 0,
    backgroundColor: RIDER_AUTH_BG,
    paddingHorizontal: 22,
    paddingTop: 8,
  },
  sheetFill: {
    flex: 1,
    flexGrow: 1,
    paddingTop: 36,
  },
  sheetSpacer: {
    flex: 1,
    minHeight: 16,
  },
  ctaBlock: {
    alignSelf: "stretch",
    marginTop: 8,
    flexShrink: 0,
  },
  ctaBlockCompact: {
    marginTop: 12,
  },
  formTitle: {
    fontFamily: RiderFonts.poppinsExtraBold,
    fontSize: 26,
    color: "#000000",
    letterSpacing: 0.2,
    marginBottom: 14,
    marginTop: 0,
  },
  formTitleCentered: {
    textAlign: "center",
    fontSize: 24,
    lineHeight: 30,
    marginTop: 0,
    marginBottom: 8,
  },
  signInTitle: {
    fontFamily: RiderFonts.poppinsExtraBold,
    fontSize: 28,
    lineHeight: 34,
    color: "#000000",
    letterSpacing: -0.2,
    marginTop: 8,
    marginBottom: 4,
  },
  signInSubtitle: {
    fontFamily: RiderFonts.poppinsSemiBold,
    fontSize: 15,
    color: RIDER_AUTH_MUTED,
    marginBottom: 20,
  },
  formSubtitle: {
    fontFamily: RiderFonts.poppinsBold,
    fontSize: 15,
    color: RIDER_AUTH_MUTED,
    marginBottom: 22,
  },
  phoneField: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "stretch",
    borderWidth: 1.5,
    borderColor: RIDER_AUTH_INK,
    borderRadius: 12,
    backgroundColor: RIDER_AUTH_SURFACE,
    paddingHorizontal: 12,
    minHeight: 56,
    marginTop: 6,
    marginBottom: 8,
  },
  phoneFieldError: {
    borderColor: "#DC2626",
    backgroundColor: "#FEF2F2",
  },
  phonePrefix: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingRight: 10,
  },
  flagEmoji: {
    fontSize: 18,
  },
  prefixCode: {
    fontFamily: RiderFonts.poppinsBold,
    fontSize: 18,
    color: "#000000",
  },
  phoneDivider: {
    width: 1,
    height: 32,
    backgroundColor: RIDER_AUTH_INK,
    marginRight: 10,
    opacity: 0.28,
  },
  phoneInput: {
    flex: 1,
    fontFamily: RiderFonts.poppinsBold,
    fontSize: 18,
    color: "#000000",
    fontWeight: Platform.OS === "ios" ? "700" : "normal",
    paddingVertical: 14,
    ...(Platform.OS === "android" ? { includeFontPadding: false, textAlignVertical: "center" } : {}),
  },
  hintText: {
    fontFamily: RiderFonts.poppinsBold,
    fontSize: 14,
    color: RIDER_AUTH_INK,
    marginBottom: 8,
  },
  supportRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    marginBottom: 4,
  },
  supportText: {
    fontFamily: RiderFonts.poppinsBold,
    fontSize: 15,
    color: "#000000",
  },
  supportLink: {
    fontFamily: RiderFonts.poppinsBold,
    fontSize: 15,
    color: RIDER_AUTH_LINK,
    textDecorationLine: "underline",
  },
  legalRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 10,
    marginBottom: 0,
    paddingHorizontal: 4,
  },
  legalTextMuted: {
    fontFamily: RiderFonts.poppinsBold,
    fontSize: 14,
    lineHeight: 20,
    color: RIDER_AUTH_INK,
    textAlign: "center",
  },
  legalLink: {
    fontFamily: RiderFonts.poppinsBold,
    fontSize: 14,
    lineHeight: 20,
    color: RIDER_AUTH_LINK,
    textDecorationLine: "underline",
  },
  otpRow: {
    position: "relative",
    flexDirection: "row",
    alignSelf: "stretch",
    justifyContent: "space-between",
    gap: 8,
    marginBottom: 14,
    marginTop: 4,
  },
  otpBox: {
    flex: 1,
    minWidth: 0,
    height: 62,
    borderRadius: 12,
    backgroundColor: RIDER_AUTH_SURFACE,
    borderWidth: 1.5,
    borderColor: RIDER_AUTH_INK,
    alignItems: "center",
    justifyContent: "center",
  },
  otpBoxActive: {
    borderColor: RIDER_AUTH_INK,
    borderWidth: 2,
  },
  otpBoxFilled: {
    borderColor: RIDER_AUTH_INK,
  },
  otpBoxError: {
    borderColor: "#DC2626",
  },
  otpDigit: {
    fontFamily: RiderFonts.poppinsBold,
    fontSize: 24,
    color: "#000000",
    fontWeight: Platform.OS === "ios" ? "700" : "normal",
  },
  otpHiddenInput: {
    ...StyleSheet.absoluteFillObject,
    opacity: Platform.OS === "android" ? 0.02 : 0.01,
    color: "transparent",
  },
  resendHint: {
    fontFamily: RiderFonts.loraBold,
    fontSize: 15,
    color: RIDER_AUTH_INK,
    marginBottom: 8,
  },
  resendBtn: {
    marginBottom: 12,
  },
  errorBox: {
    marginBottom: 12,
    padding: 12,
    backgroundColor: "#FEF2F2",
    borderWidth: 1,
    borderColor: "#FECACA",
    borderRadius: 12,
  },
  errorText: {
    fontFamily: RiderFonts.loraBold,
    fontSize: 14,
    color: "#DC2626",
    lineHeight: 18,
  },
  retrySessionBtn: {
    alignSelf: "flex-start",
    marginBottom: 10,
  },
  linkText: {
    fontFamily: RiderFonts.loraBold,
    fontSize: 16,
    color: RIDER_AUTH_INK,
  },
});
