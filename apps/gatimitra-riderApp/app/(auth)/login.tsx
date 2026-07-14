import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Platform,
  StyleSheet,
  Image,
  Pressable,
  useWindowDimensions,
  ActivityIndicator,
  Keyboard,
  TouchableOpacity,
  Linking,
  type KeyboardEvent,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useTranslation } from "react-i18next";
import {
  isRiderAuthError,
  riderAuthService,
} from "@/src/services/auth/auth.service";
import { resetSessionRevokedFlag } from "@/src/services/sessionEvents";
import { getOrCreateDeviceId } from "@/src/utils/deviceId";
import { getRiderLoginGeoFromDevice } from "@/src/lib/getRiderLoginGeoFromDevice";
import { useSessionStore } from "@/src/stores/sessionStore";
import { useOnboardingStore } from "@/src/stores/onboardingStore";
import { useAppAssetSource } from "@/src/components/AppAssetImage";
import { RX } from "@/src/lib/appAssetKeys";

const ACCENT = "#39d353";
const ACCENT_DARK = "#22a745";
const OTP_LENGTH = 6;

function StatBadge({
  icon,
  label,
  compact = false,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  compact?: boolean;
}) {
  return (
    <View style={[styles.statBadge, compact && styles.statBadgeCompact]}>
      <View style={[styles.statIconWrap, compact && styles.statIconWrapCompact]}>
        <Ionicons name={icon} size={compact ? 13 : 15} color={ACCENT} />
      </View>
      <Text style={[styles.statLabel, compact && styles.statLabelCompact]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

function TrustItem({
  icon,
  label,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
}) {
  return (
    <View style={styles.trustItem}>
      <View style={styles.trustIconWrap}>
        <Ionicons name={icon} size={18} color={ACCENT_DARK} />
      </View>
      <Text style={styles.trustLabel}>{label}</Text>
    </View>
  );
}

function ContinueButton({
  label,
  onPress,
  disabled,
  loading,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
}) {
  const isInactive = Boolean(disabled || loading);

  return (
    <TouchableOpacity
      activeOpacity={isInactive ? 1 : 0.85}
      onPress={() => {
        if (!isInactive) onPress();
      }}
      accessibilityRole="button"
      accessibilityState={{ disabled: isInactive }}
      style={[styles.continueBtn, isInactive ? styles.continueBtnDisabled : null]}
    >
      {loading ? (
        <ActivityIndicator color={ACCENT_DARK} />
      ) : (
        <>
          <Text style={[styles.continueBtnText, isInactive && styles.continueBtnTextDisabled]}>
            {label}
          </Text>
          <Ionicons
            name="arrow-forward"
            size={18}
            color={isInactive ? "#7cb889" : "#ffffff"}
          />
        </>
      )}
    </TouchableOpacity>
  );
}

function LegalTermsLine() {
  const { t } = useTranslation();
  const prefix = t("login.termsPrefix");
  const link = t("login.termsLink");

  const openLegal = () => {
    Linking.openURL("https://gatimitra.com/terms").catch(() => {});
  };

  if (!prefix || prefix === "login.termsPrefix" || !link || link === "login.termsLink") {
    return <Text style={styles.legalText}>{t("login.terms")}</Text>;
  }

  return (
    <Text style={styles.legalText}>
      <Text style={styles.legalTextMuted}>{prefix}</Text>
      <Text style={styles.legalLink} onPress={openLegal}>
        {link}
      </Text>
    </Text>
  );
}

export default function LoginScreen() {
  const { t } = useTranslation();
  const { height: windowHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const setSession = useSessionStore((s) => s.setSession);
  const setOnboardingData = useOnboardingStore((s) => s.setData);

  const [phoneE164, setPhoneE164] = useState("");
  const [otp, setOtp] = useState("");
  const [step, setStep] = useState<"phone" | "otp">("phone");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(0);
  const [deviceSessionRetry, setDeviceSessionRetry] = useState(false);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const riderHero = useAppAssetSource(RX.auth.hero);
  const brandLogo = useAppAssetSource(RX.auth.logo);

  const phoneDigits = phoneE164.replace(/\D/g, "");
  const phoneValid = phoneDigits.length >= 10;
  const otpValid = otp.trim().length === OTP_LENGTH;
  const heroMinHeight = Math.round(windowHeight * 0.46);
  const sheetMinHeight = keyboardVisible ? undefined : heroMinHeight;
  const safeBottom = Math.max(insets.bottom, 12);
  const sheetBottomPad = keyboardVisible ? 20 : safeBottom;
  const keyboardOffset = keyboardVisible && keyboardHeight > 0 ? keyboardHeight : 0;

  useEffect(() => {
    const onShow = (event: KeyboardEvent) => {
      setKeyboardVisible(true);
      setKeyboardHeight(event.endCoordinates.height);
    };
    const onHide = () => {
      setKeyboardVisible(false);
      setKeyboardHeight(0);
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
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(
          () => reject(new Error("Request timeout. Please check your internet connection and try again.")),
          20000
        );
      });

      const normalizedPhone = phoneDigits.length === 10 ? `+91${phoneDigits}` : phoneE164.trim();
      await Promise.race([
        riderAuthService.sendOtp({ phoneE164: normalizedPhone }),
        timeoutPromise,
      ]);

      setDeviceSessionRetry(false);
      setStep("otp");
      startCountdown();
      // Do not Alert here — success is entering the OTP step (same UX as merchant app).
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      let errorMessage = err.message || "Unable to send OTP. Please try again.";
      if (/network request failed|failed to fetch|network error|aborted/i.test(errorMessage)) {
        errorMessage = "Unable to send OTP. Please try again.";
      }
      setError(errorMessage);
      if (__DEV__) {
        console.warn("OTP request error:", e);
      }
    } finally {
      setBusy(false);
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
      const deviceId = await getOrCreateDeviceId();
      const loginGeo = await getRiderLoginGeoFromDevice();
      const normalizedPhone = phoneDigits.length === 10 ? `+91${phoneDigits}` : phoneE164.trim();
      const otpValue = otp.trim();

      let session;
      try {
        session = await riderAuthService.verifyOtp({
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
        throw verifyError;
      }

      resetSessionRevokedFlag();
      await setSession(session);

      const status = await riderAuthService.getRiderStatus(session.accessToken);
      const riderId =
        status.riderId ??
        session.riderId ??
        session.userId.replace(/^usr_/, "");

      if (riderId) {
        await setOnboardingData({ riderId });
      }

      if (status.onboardingStatus === "approved") {
        router.replace("/(tabs)/orders");
      } else if (status.onboardingStatus === "pending_approval") {
        router.replace("/(onboarding)/pending");
      } else if (status.exists) {
        router.replace("/");
      } else {
        router.replace("/(onboarding)/method-selection");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : t("login.failedVerify"));
    } finally {
      setBusy(false);
    }
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
      setError(e instanceof Error ? e.message : "Unable to send OTP. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const onRetryDeviceSession = async () => {
    if (!otpValid) return;
    setBusy(true);
    setError(null);
    try {
      const deviceId = await getOrCreateDeviceId();
      const loginGeo = await getRiderLoginGeoFromDevice();
      const normalizedPhone = phoneDigits.length === 10 ? `+91${phoneDigits}` : phoneE164.trim();
      const session = await riderAuthService.exchangeRiderFromCurrentSupabaseSession({
        phoneE164: normalizedPhone,
        deviceId,
        loginGeo,
      });
      resetSessionRevokedFlag();
      await setSession(session);
      setDeviceSessionRetry(false);
      router.replace("/");
    } catch (e) {
      setError(e instanceof Error ? e.message : t("login.failedVerify"));
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

  const phoneForm = (
    <View style={[styles.sheetInner, sheetMinHeight ? styles.sheetInnerExpanded : null]}>
      <View style={styles.sheetMain}>
        {!keyboardVisible ? (
          <>
            <Text style={styles.formTitle}>Enter your mobile number</Text>
            <Text style={styles.formDescription}>{t("login.phoneDescription")}</Text>
          </>
        ) : (
          <>
            <Text style={styles.formTitleCompact}>Enter your mobile number</Text>
            <Text style={styles.formDescriptionCompact}>{t("login.phoneDescription")}</Text>
          </>
        )}

        <View style={[styles.phoneField, error ? styles.phoneFieldError : null]}>
          <View style={styles.phonePrefix}>
            <Text style={styles.flagEmoji}>🇮🇳</Text>
            <Text style={styles.prefixCode}>+91</Text>
            <Ionicons name="chevron-down" size={14} color="#9ca3af" />
          </View>
          <View style={styles.phoneDivider} />
          <Ionicons name="phone-portrait-outline" size={18} color="#9ca3af" style={styles.phoneFieldIcon} />
          <TextInput
            value={phoneE164}
            onChangeText={(text) => {
              setPhoneE164(text.replace(/\D/g, "").slice(0, 10));
              setError(null);
            }}
            placeholder="9876543210"
            placeholderTextColor="#9ca3af"
            keyboardType="phone-pad"
            maxLength={10}
            style={styles.phoneInput}
          />
        </View>

        {error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        <ContinueButton
          label="Continue"
          onPress={onRequestOtp}
          disabled={!phoneValid}
          loading={busy}
        />
      </View>

      {!keyboardVisible ? (
        <>
          <View style={styles.trustRow}>
            <TrustItem icon="shield-checkmark-outline" label={"Secure OTP\nVerification"} />
            <View style={styles.trustDivider} />
            <TrustItem icon="ribbon-outline" label={"No Hidden\nCharges"} />
            <View style={styles.trustDivider} />
            <TrustItem icon="time-outline" label={"Instant\nApproval"} />
          </View>
          <LegalTermsLine />
        </>
      ) : null}
    </View>
  );

  const otpForm = (
    <View style={styles.sheetMain}>
      {!keyboardVisible ? (
        <>
          <Text style={styles.formTitle}>{t("login.enterOtp")}</Text>
          <Text style={styles.formDescription}>
            Enter the {OTP_LENGTH}-digit code sent to +91 {phoneDigits}
          </Text>
        </>
      ) : (
        <>
          <Text style={styles.formTitleCompact}>{t("login.enterOtp")}</Text>
          <Text style={styles.formDescriptionCompact}>
            Enter the {OTP_LENGTH}-digit code sent to +91 {phoneDigits}
          </Text>
        </>
      )}

      <TextInput
        value={otp}
        onChangeText={(text) => {
          setOtp(text.replace(/[^0-9]/g, "").slice(0, OTP_LENGTH));
          setError(null);
        }}
        placeholder="000000"
        placeholderTextColor="#9ca3af"
        keyboardType="number-pad"
        maxLength={OTP_LENGTH}
        autoComplete={Platform.OS === "android" ? "sms-otp" : "one-time-code"}
        textContentType="oneTimeCode"
        autoFocus
        style={[
          styles.otpInput,
          otpValid ? styles.otpInputReady : null,
          error ? styles.phoneFieldError : null,
        ]}
      />

      {error ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      {deviceSessionRetry ? (
        <Pressable onPress={onRetryDeviceSession} disabled={busy || !otpValid} style={styles.retrySessionBtn}>
          <Text style={styles.linkText}>Try again without re-entering OTP</Text>
        </Pressable>
      ) : null}

      <ContinueButton
        label={t("login.verifyOtp")}
        onPress={onVerifyOtp}
        disabled={!otpValid}
        loading={busy}
      />

      <View style={styles.otpActions}>
        <Text style={styles.resendHint}>
          {t("login.didntReceive")}{" "}
          {countdown > 0 ? (
            <Text style={styles.resendCountdown}>{t("login.resendIn", { count: countdown })}</Text>
          ) : null}
        </Text>
        {countdown === 0 ? (
          <Pressable onPress={onRetryOtp} disabled={busy} hitSlop={8}>
            <Text style={styles.linkText}>{t("login.resendOtp")}</Text>
          </Pressable>
        ) : null}
        <Pressable onPress={resetToPhone} hitSlop={8}>
          <Text style={styles.linkTextMuted}>{t("login.changePhone")}</Text>
        </Pressable>
      </View>
    </View>
  );

  return (
    <View style={[styles.root, keyboardOffset > 0 ? { marginBottom: keyboardOffset } : null]}>
      <View
        style={[
          styles.hero,
          keyboardVisible
            ? styles.heroKeyboard
            : { flex: 1, minHeight: heroMinHeight },
        ]}
      >
        {riderHero ? <Image source={riderHero} style={styles.heroImage} resizeMode="cover" /> : null}
        <LinearGradient
          colors={["rgba(0,0,0,0.12)", "rgba(0,0,0,0.5)", "rgba(0,0,0,0.92)"]}
          locations={[0, 0.5, 1]}
          style={StyleSheet.absoluteFill}
        />

        <SafeAreaView
          edges={["top"]}
          style={[styles.heroSafe, keyboardVisible && styles.heroSafeCompact]}
        >
          {brandLogo ? (
            <Image
              source={brandLogo}
              style={[styles.brandLogo, keyboardVisible && styles.brandLogoCompact]}
              resizeMode="contain"
            />
          ) : null}

          <View style={[styles.heroBottom, keyboardVisible && styles.heroBottomCompact]}>
            <Text style={[styles.heroHeadline, keyboardVisible && styles.heroHeadlineCompact]}>
              Deliver Smiles.{"\n"}
              <Text style={styles.heroHeadlineAccent}>Earn More.</Text>
            </Text>
            <Text style={[styles.heroSubline, keyboardVisible && styles.heroSublineCompact]}>
              Join GatiMitra & grow your income on every delivery.
            </Text>

            <View style={styles.statsColumn}>
              <StatBadge icon="star" label="4.8  Partner Rating" compact={keyboardVisible} />
              <StatBadge icon="wallet-outline" label="Earn upto ₹700–1,200 /day" compact={keyboardVisible} />
              <StatBadge icon="flash-outline" label="Instant Payouts" compact={keyboardVisible} />
            </View>
          </View>
        </SafeAreaView>
      </View>

      <View style={styles.sheetFill}>
        <View
          style={[
            styles.sheet,
            sheetMinHeight ? { minHeight: sheetMinHeight } : null,
            keyboardVisible ? styles.sheetCompact : null,
            { paddingBottom: sheetBottomPad },
          ]}
        >
          <View style={[styles.sheetHandle, keyboardVisible && styles.sheetHandleCompact]} />

          {step === "phone" ? (
            phoneForm
          ) : (
            otpForm
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    width: "100%",
    backgroundColor: "#0a0a0a",
  },
  hero: {
    width: "100%",
    backgroundColor: "#0a0a0a",
  },
  heroKeyboard: {
    flex: 1,
    minHeight: 200,
  },
  heroImage: {
    ...StyleSheet.absoluteFillObject,
    width: "100%",
    height: "100%",
  },
  heroSafe: {
    flex: 1,
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  heroSafeCompact: {
    justifyContent: "space-between",
    paddingBottom: 10,
  },
  brandLogo: {
    width: 148,
    height: 40,
    marginTop: 4,
  },
  brandLogoCompact: {
    width: 128,
    height: 34,
  },
  heroBottom: {
    gap: 6,
    paddingBottom: 4,
  },
  heroBottomCompact: {
    gap: 4,
    paddingBottom: 2,
  },
  heroHeadline: {
    fontSize: 28,
    fontWeight: "800",
    color: "#ffffff",
    lineHeight: 34,
    letterSpacing: -0.5,
  },
  heroHeadlineCompact: {
    fontSize: 22,
    lineHeight: 28,
  },
  heroHeadlineAccent: {
    color: ACCENT,
  },
  heroSubline: {
    fontSize: 13,
    color: "rgba(255,255,255,0.8)",
    lineHeight: 19,
    marginBottom: 2,
    maxWidth: 290,
  },
  heroSublineCompact: {
    fontSize: 11,
    lineHeight: 15,
    marginBottom: 0,
  },
  statsColumn: {
    gap: 6,
  },
  statBadge: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: "rgba(0,0,0,0.58)",
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 11,
    borderWidth: 1,
    borderColor: "rgba(57,211,83,0.3)",
    gap: 8,
    maxWidth: "100%",
  },
  statBadgeCompact: {
    paddingVertical: 5,
    paddingHorizontal: 9,
    gap: 6,
  },
  statIconWrap: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: "rgba(57,211,83,0.18)",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  statIconWrapCompact: {
    width: 22,
    height: 22,
    borderRadius: 11,
  },
  statLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: "#ffffff",
    flexShrink: 1,
  },
  statLabelCompact: {
    fontSize: 11,
  },
  sheetFill: {
    width: "100%",
    flexShrink: 0,
  },
  sheet: {
    width: "100%",
    backgroundColor: "#ffffff",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: 10,
    paddingHorizontal: 22,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(57,211,83,0.25)",
  },
  sheetCompact: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 8,
    marginTop: -12,
  },
  sheetHandle: {
    alignSelf: "center",
    width: 44,
    height: 4,
    borderRadius: 999,
    backgroundColor: ACCENT,
    marginBottom: 14,
  },
  sheetHandleCompact: {
    marginBottom: 10,
  },
  sheetInner: {
    width: "100%",
  },
  sheetInnerExpanded: {
    minHeight: 280,
    justifyContent: "space-between",
  },
  sheetMain: {
    width: "100%",
  },
  formTitle: {
    fontSize: 21,
    fontWeight: "800",
    color: "#111827",
    marginBottom: 4,
  },
  formTitleCompact: {
    fontSize: 19,
    fontWeight: "800",
    color: "#111827",
    marginBottom: 2,
  },
  formDescription: {
    fontSize: 13,
    color: "#6b7280",
    lineHeight: 18,
    marginBottom: 14,
  },
  formDescriptionCompact: {
    fontSize: 12,
    color: "#6b7280",
    lineHeight: 16,
    marginBottom: 10,
  },
  phoneField: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1.5,
    borderColor: "#e5e7eb",
    borderRadius: 14,
    backgroundColor: "#f9fafb",
    paddingHorizontal: 12,
    minHeight: 54,
    marginBottom: 14,
  },
  phoneFieldError: {
    borderColor: "#fca5a5",
    backgroundColor: "#fef2f2",
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
    fontSize: 16,
    fontWeight: "700",
    color: "#111827",
  },
  phoneDivider: {
    width: 1,
    height: 28,
    backgroundColor: "#e5e7eb",
    marginRight: 10,
  },
  phoneFieldIcon: {
    marginRight: 8,
  },
  phoneInput: {
    flex: 1,
    fontSize: 19,
    fontWeight: "bold",
    color: "#111827",
    paddingVertical: 12,
    letterSpacing: 0.8,
    ...(Platform.OS === "android" ? { includeFontPadding: false, textAlignVertical: "center" } : {}),
  },
  continueBtn: {
    width: "100%",
    height: 52,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: ACCENT,
    borderRadius: 999,
    paddingHorizontal: 20,
    marginTop: 4,
    shadowColor: ACCENT_DARK,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  continueBtnDisabled: {
    backgroundColor: "#edf8f0",
    borderWidth: 1.5,
    borderColor: "#c2e8cb",
    shadowOpacity: 0,
    elevation: 0,
  },
  continueBtnText: {
    fontSize: 17,
    fontWeight: "800",
    color: "#ffffff",
  },
  continueBtnTextDisabled: {
    color: "#6aab78",
  },
  trustRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginTop: 22,
    marginBottom: 6,
    paddingTop: 18,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#eef0f2",
  },
  trustItem: {
    flex: 1,
    alignItems: "center",
    paddingHorizontal: 4,
  },
  trustIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(57,211,83,0.12)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 6,
  },
  trustLabel: {
    fontSize: 11,
    lineHeight: 15,
    textAlign: "center",
    color: "#6b7280",
    fontWeight: "500",
  },
  trustDivider: {
    width: 1,
    height: 44,
    backgroundColor: "#e5e7eb",
    marginTop: 6,
  },
  legalText: {
    fontSize: 11,
    lineHeight: 17,
    textAlign: "center",
    marginTop: 20,
    paddingHorizontal: 8,
    paddingBottom: 4,
  },
  legalTextMuted: {
    color: "#9ca3af",
  },
  legalLink: {
    color: ACCENT_DARK,
    fontWeight: "600",
    textDecorationLine: "underline",
    textDecorationStyle: "dotted",
    textDecorationColor: ACCENT_DARK,
  },
  otpInput: {
    borderWidth: 1.5,
    borderColor: "#e5e7eb",
    borderRadius: 16,
    backgroundColor: "#f9fafb",
    paddingHorizontal: 16,
    paddingVertical: 16,
    fontSize: 28,
    fontWeight: "bold",
    color: "#111827",
    textAlign: "center",
    letterSpacing: 10,
    marginBottom: 14,
    ...(Platform.OS === "android" ? { includeFontPadding: false } : {}),
  },
  otpInputReady: {
    borderColor: ACCENT,
    backgroundColor: "rgba(57,211,83,0.08)",
  },
  errorBox: {
    marginBottom: 12,
    padding: 12,
    backgroundColor: "#fef2f2",
    borderWidth: 1,
    borderColor: "#fecaca",
    borderRadius: 12,
  },
  errorText: {
    fontSize: 13,
    color: "#dc2626",
    lineHeight: 18,
  },
  otpActions: {
    marginTop: 16,
    alignItems: "center",
    gap: 10,
  },
  resendHint: {
    fontSize: 14,
    color: "#6b7280",
    textAlign: "center",
  },
  resendCountdown: {
    fontWeight: "700",
    color: "#374151",
  },
  retrySessionBtn: {
    alignSelf: "center",
    marginBottom: 10,
  },
  linkText: {
    fontSize: 15,
    fontWeight: "700",
    color: ACCENT_DARK,
  },
  linkTextMuted: {
    fontSize: 14,
    fontWeight: "500",
    color: "#9ca3af",
  },
});
