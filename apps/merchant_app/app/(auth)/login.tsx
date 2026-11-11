/**
 * Partner login — lite mobile-number entry (BHIM-style) + shared OTP verify sheet.
 *
 * Auth behavior (send/verify/resend, device-session retry, single-use OTP guards)
 * is preserved from main. UI is the CRMPD redesign; OTP sheet uses
 * `@gatimitra/otp-verify-ui` for consistency with other apps.
 *
 * NOTE: We deliberately do NOT auto-read SMS to fill the OTP. Reading SMS needs
 * READ_SMS / RECEIVE_SMS, which Google Play Protect blocks as "sensitive data"
 * and Google Play restricts to default SMS handlers. The user types the OTP
 * manually (same as the customer app).
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { AppText as Text } from "@/components/AppText";
import { View, TextInput, StyleSheet, Pressable, ActivityIndicator, KeyboardAvoidingView, Keyboard, Linking, Platform, ScrollView, BackHandler, type KeyboardEvent } from "react-native";
import { useRouter, useNavigation, Redirect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { StatusBar } from "expo-status-bar";
import * as WebBrowser from "expo-web-browser";
import { OtpVerifySheetModal } from "@gatimitra/otp-verify-ui";
import { useAuth, type PartnerData } from "@/context/AuthContext";
import {
  merchantAuthService,
  isMerchantAuthError,
} from "@/services/auth.service";
import { getOrCreateMerchantDeviceId } from "@/lib/merchantDeviceId";
import { getSupabaseAuth } from "@/lib/supabaseClient";
import { getMerchantGoogleOAuthRedirectTo } from "@/lib/merchantGoogleOAuthRedirect";
import { GatiMitraMerchant, SAFE_AREA_TOP_MIN } from "@/constants/theme";
import { getPartnerLegalUrls } from "@/lib/partnerLegalUrls";
import { merchantOtpVerifyTheme } from "@/lib/otpVerifyTheme";
import { MerchantBottomSheetShell } from "@/components/order/MerchantBottomSheetShell";
import { MerchantBootstrapScreen } from "@/components/MerchantBootstrapScreen";
import { logMerchantAuth } from "@/lib/merchantAuthLog";
import { hasValidMerchantIdentity, parsePartnerData } from "@/lib/merchantPartnerIdentity";
import { GoogleMark } from "@/components/GoogleMark";

WebBrowser.maybeCompleteAuthSession();

const PHONE_OTP_LEN = 6;
/** Supabase Partner email OTP is configured as 8 digits (same as partnersite). */
const EMAIL_OTP_LEN = 8;
const legalUrls = getPartnerLegalUrls();
const LORA_BOLD = "Lora_700Bold";
const POPPINS_BOLD = "Poppins_700Bold";
const NOT_REGISTERED_SHEET_MESSAGE = "No Partner Account registered with this no";
const NOT_REGISTERED_EMAIL_SHEET_MESSAGE = "No Partner Account registered with this email";
const NO_MERCHANT_MESSAGE =
  "Merchant account not found. Please use a registered merchant number or contact support.";
const GOOGLE_TEMP_UNAVAILABLE_MESSAGE =
  "Google Sign-In is temporarily unavailable. Please use Phone or Email Login.";

type LoginChannel = "phone" | "email";

function isNotRegisteredPartnerError(e: unknown): boolean {
  if (isMerchantAuthError(e) && e.code === "not_registered") return true;
  const msg = e instanceof Error ? e.message : String(e ?? "");
  return /isn't registered|not registered as a gatimitra partner|not_registered/i.test(msg);
}

/** Narrow exchange API partner payload to PartnerData after minimal structural checks. */
function partnerDataFromExchange(partner: { parent: unknown; childStores: unknown[] }): PartnerData {
  const parsed = parsePartnerData(partner);
  if (!parsed || !hasValidMerchantIdentity(parsed)) {
    throw new Error(NO_MERCHANT_MESSAGE);
  }
  // parsePartnerData validates the identity shape; childStores is typed unknown[] in the
  // pure identity module (no AuthContext import) but is structurally a PartnerData here.
  return parsed as unknown as PartnerData;
}

type LastExchange = null | "otp";

export default function LoginScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { setTokenAndPartner, authState } = useAuth();
  const [loginChannel, setLoginChannel] = useState<LoginChannel>("phone");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [step, setStep] = useState<"phone" | "otp">("phone");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState("");
  const [notRegisteredSheetOpen, setNotRegisteredSheetOpen] = useState(false);
  const [notRegisteredKind, setNotRegisteredKind] = useState<"phone" | "email">("phone");
  const [deviceSessionMode, setDeviceSessionMode] = useState(false);
  const [lastExchange, setLastExchange] = useState<LastExchange>(null);
  const [resendSeconds, setResendSeconds] = useState(0);
  const [resending, setResending] = useState(false);
  const phoneInputRef = useRef<TextInput>(null);
  const emailInputRef = useRef<TextInput>(null);
  const sheetScrollRef = useRef<ScrollView>(null);
  const [phoneFieldFocused, setPhoneFieldFocused] = useState(false);
  const [emailFieldFocused, setEmailFieldFocused] = useState(false);
  const [phoneKeyboardVisible, setPhoneKeyboardVisible] = useState(false);
  /**
   * Hard re-entry guards for OTP verify. `loading` is React state, so it only
   * blocks a second call one render later — auto-submit and a manual "Verify"
   * tap can still both fire. A backend OTP requestId is SINGLE USE, so the
   * second call hits an already-consumed code and comes back 400
   * invalid_request_id. Refs update synchronously, so they close that window.
   */
  const verifyInFlightRef = useRef(false);
  const verifySucceededRef = useRef(false);

  const scrollPhoneFormIntoView = useCallback(() => {
    const end = () => sheetScrollRef.current?.scrollToEnd({ animated: true });
    requestAnimationFrame(end);
    setTimeout(end, 100);
    setTimeout(end, 280);
  }, []);

  useEffect(() => {
    if (step !== "otp" || resendSeconds <= 0) return;
    const id = setInterval(() => setResendSeconds((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(id);
  }, [step, resendSeconds]);

  useEffect(() => {
    if (step !== "phone") {
      setPhoneKeyboardVisible(false);
      return;
    }
    const showEvt = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvt = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const subShow = Keyboard.addListener(showEvt, (_event: KeyboardEvent) => {
      setPhoneKeyboardVisible(true);
    });
    const subHide = Keyboard.addListener(hideEvt, () => {
      setPhoneKeyboardVisible(false);
    });
    return () => {
      subShow.remove();
      subHide.remove();
    };
  }, [step]);

  useEffect(() => {
    if (step !== "phone" || !phoneKeyboardVisible) return;
    scrollPhoneFormIntoView();
  }, [step, phoneKeyboardVisible, scrollPhoneFormIntoView]);

  const phoneE164 =
    phone.replace(/\D/g, "").length >= 10
      ? "+91" + phone.replace(/\D/g, "").slice(-10)
      : "";
  const emailNormalized = email.trim().toLowerCase();
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailNormalized);

  const clearErrors = () => {
    setError("");
    setNotRegisteredSheetOpen(false);
    setDeviceSessionMode(false);
  };

  const switchLoginChannel = (next: LoginChannel) => {
    if (next === loginChannel || loading || googleLoading || step === "otp") return;
    clearErrors();
    setLoginChannel(next);
  };

  const openRegisterStore = () => {
    setNotRegisteredSheetOpen(false);
    router.push("/(auth)/signup-webview");
  };

  const handleRequestOtp = async () => {
    if (loginChannel === "email") {
      if (!emailValid) {
        setError("Enter a valid email address");
        return;
      }
      clearErrors();
      setLastExchange(null);
      setLoading(true);
      try {
        await merchantAuthService.sendEmailOtp({ email: emailNormalized });
        verifySucceededRef.current = false;
        verifyInFlightRef.current = false;
        setOtp("");
        setResendSeconds(60);
        setStep("otp");
      } catch (e: unknown) {
        if (isNotRegisteredPartnerError(e)) {
          setNotRegisteredKind("email");
          setNotRegisteredSheetOpen(true);
          setError("");
        } else {
          const msg = e instanceof Error ? e.message : "Could not send OTP. Try again.";
          setError(msg);
        }
      } finally {
        setLoading(false);
      }
      return;
    }

    if (!phoneE164 || phoneE164.length < 12) {
      setError("Enter a valid 10-digit mobile number");
      return;
    }
    clearErrors();
    setLastExchange(null);
    setLoading(true);
    try {
      await merchantAuthService.sendOtp({ phoneE164 });
      verifySucceededRef.current = false;
      verifyInFlightRef.current = false;
      setOtp("");
      setResendSeconds(60);
      setStep("otp");
    } catch (e: unknown) {
      if (isNotRegisteredPartnerError(e)) {
        setNotRegisteredKind("phone");
        setNotRegisteredSheetOpen(true);
        setError("");
      } else {
        const msg = e instanceof Error ? e.message : "Could not send OTP. Try again.";
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleResendOtp = async () => {
    if (resendSeconds > 0 || resending) return;
    if (loginChannel === "email") {
      if (!emailValid) return;
      clearErrors();
      setResending(true);
      try {
        await merchantAuthService.sendEmailOtp({ email: emailNormalized });
        verifySucceededRef.current = false;
        verifyInFlightRef.current = false;
        setOtp("");
        setResendSeconds(60);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Could not resend OTP. Try again.";
        setError(msg);
      } finally {
        setResending(false);
      }
      return;
    }
    if (!phoneE164) return;
    clearErrors();
    setResending(true);
    try {
      await merchantAuthService.sendOtp({ phoneE164 });
      verifySucceededRef.current = false;
      verifyInFlightRef.current = false;
      setOtp("");
      setResendSeconds(60);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not resend OTP. Try again.";
      setError(msg);
    } finally {
      setResending(false);
    }
  };

  function normalizeOtpErrorMessage(raw: string): string {
    const msg = String(raw || "").trim();
    const lower = msg.toLowerCase();
    if (lower.includes("expired or is invalid")) return "Invalid OTP. Please try again.";
    if (lower.includes("invalid otp") || (lower.includes("invalid") && lower.includes("token"))) {
      return "Invalid OTP. Please try again.";
    }
    if (lower.includes("expired")) return "OTP expired. Please request a new OTP.";
    return msg || "Invalid OTP. Please try again.";
  }

  const otpLen = loginChannel === "email" ? EMAIL_OTP_LEN : PHONE_OTP_LEN;

  const handleVerifyOtp = async (codeArg?: string) => {
    const code = (codeArg ?? otp).replace(/\D/g, "").slice(0, otpLen);
    if (!code || code.length !== otpLen) {
      setError(
        loginChannel === "email"
          ? `Enter the ${EMAIL_OTP_LEN}-digit code from email`
          : `Enter the ${PHONE_OTP_LEN}-digit code from SMS`
      );
      return;
    }
    if (verifyInFlightRef.current || verifySucceededRef.current) return;
    verifyInFlightRef.current = true;
    clearErrors();
    setLoading(true);
    setLastExchange("otp");
    try {
      const deviceId = await getOrCreateMerchantDeviceId();
      const session =
        loginChannel === "email"
          ? await merchantAuthService.verifyEmailOtp({
              email: emailNormalized,
              otp: code,
              deviceId,
            })
          : await merchantAuthService.verifyOtp({
              phoneE164,
              otp: code,
              deviceId,
            });
      logMerchantAuth("AUTH_OTP_VERIFIED", {});
      verifySucceededRef.current = true;
      const partner = partnerDataFromExchange(session.partner);
      await setTokenAndPartner(session.accessToken, partner, session.userId, session.expiresAt);
      setDeviceSessionMode(false);
      setLastExchange(null);
      router.replace("/");
    } catch (e: unknown) {
      if (isMerchantAuthError(e) && e.code === "device_session_unavailable") {
        setDeviceSessionMode(true);
        setError(e.message);
      } else {
        setDeviceSessionMode(false);
        setLastExchange(null);
        const raw = e instanceof Error ? e.message : "Invalid code or partner not found.";
        if (/merchant account not found|could not be found or is no longer active/i.test(raw)) {
          setError(NO_MERCHANT_MESSAGE);
        } else {
          setError(normalizeOtpErrorMessage(raw));
        }
      }
    } finally {
      verifyInFlightRef.current = false;
      setLoading(false);
    }
  };

  const handleCancelOtp = useCallback(() => {
    setStep("phone");
    setOtp("");
    setError("");
    setDeviceSessionMode(false);
    setLastExchange(null);
  }, []);

  const handleGoogleSignIn = async () => {
    const supabase = getSupabaseAuth();
    if (!supabase) {
      setError(GOOGLE_TEMP_UNAVAILABLE_MESSAGE);
      return;
    }
    clearErrors();
    setGoogleLoading(true);
    try {
      // Stable HTTPS callback (partnersite) — must be allowlisted in Supabase Redirect URLs.
      // Do NOT use exp://LAN IPs; those change and Supabase falls back to gatimitra.com.
      const redirectTo = getMerchantGoogleOAuthRedirectTo();
      if (__DEV__) {
        // eslint-disable-next-line no-console
        console.log("[Google OAuth] redirectTo:", redirectTo);
      }

      const { data: oauthData, error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo,
          skipBrowserRedirect: true,
          queryParams: { prompt: "select_account" },
        },
      });
      if (oauthError || !oauthData?.url) {
        setError(GOOGLE_TEMP_UNAVAILABLE_MESSAGE);
        return;
      }

      const result = await WebBrowser.openAuthSessionAsync(oauthData.url, redirectTo);
      WebBrowser.maybeCompleteAuthSession();

      if (result.type === "cancel" || result.type === "dismiss") {
        setError(GOOGLE_TEMP_UNAVAILABLE_MESSAGE);
        return;
      }
      if (result.type !== "success" || !("url" in result) || !result.url) {
        setError(GOOGLE_TEMP_UNAVAILABLE_MESSAGE);
        return;
      }

      const url = result.url;
      // Reject Site URL fallback (consumer site) — means redirectTo was not allowlisted.
      if (/gatimitra\.com/i.test(url) && !/partner\.gatimitra\.com/i.test(url)) {
        setError(GOOGLE_TEMP_UNAVAILABLE_MESSAGE);
        return;
      }

      const hash = url.includes("#") ? url.split("#")[1] : "";
      const query = url.includes("?") ? url.split("?")[1]?.split("#")[0] : "";
      const hashParams = new URLSearchParams(hash || "");
      const queryParams = new URLSearchParams(query || "");
      const errDesc =
        queryParams.get("error_description") ||
        hashParams.get("error_description") ||
        queryParams.get("error") ||
        hashParams.get("error");
      if (errDesc) {
        setError(GOOGLE_TEMP_UNAVAILABLE_MESSAGE);
        return;
      }

      let accessToken =
        hashParams.get("access_token") || queryParams.get("access_token") || "";
      const refreshToken =
        hashParams.get("refresh_token") || queryParams.get("refresh_token") || "";
      const authCode = queryParams.get("code") || hashParams.get("code");

      // Modern Supabase Google OAuth returns ?code= (PKCE). Exchange it for a session.
      if (!accessToken && authCode) {
        const { data: exchanged, error: exchangeErr } =
          await supabase.auth.exchangeCodeForSession(authCode);
        if (exchangeErr) {
          setError(GOOGLE_TEMP_UNAVAILABLE_MESSAGE);
          return;
        }
        accessToken = exchanged.session?.access_token ?? "";
        if (!accessToken) {
          setError(GOOGLE_TEMP_UNAVAILABLE_MESSAGE);
          return;
        }
      } else if (accessToken) {
        await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
      } else {
        setError(GOOGLE_TEMP_UNAVAILABLE_MESSAGE);
        return;
      }

      const deviceId = await getOrCreateMerchantDeviceId();
      const session = await merchantAuthService.exchangeSupabaseOAuth({
        accessToken,
        deviceId,
      });
      const partner = partnerDataFromExchange(session.partner);
      await setTokenAndPartner(session.accessToken, partner, session.userId, session.expiresAt);
      router.replace("/");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Google sign-in failed.";
      if (/partner_not_found|no partner/i.test(msg)) {
        setNotRegisteredKind("email");
        setNotRegisteredSheetOpen(true);
        setError("");
      } else {
        setError(GOOGLE_TEMP_UNAVAILABLE_MESSAGE);
      }
    } finally {
      setGoogleLoading(false);
    }
  };

  /** Android back: return to phone step when on OTP sheet. */
  useEffect(() => {
    if (step !== "otp") return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      handleCancelOtp();
      return true;
    });
    return () => sub.remove();
  }, [step, handleCancelOtp]);

  /** Block backward navigation (e.g. iOS swipe-back) until OTP is complete. */
  useEffect(() => {
    if (step !== "otp") return;
    const unsub = navigation.addListener("beforeRemove", (e) => {
      if (otp.length >= otpLen || loading || deviceSessionMode) return;
      const act = e.data.action;
      const actionType =
        typeof act === "object" && act !== null && "type" in act
          ? String((act as { type: string }).type)
          : "";
      if (actionType !== "GO_BACK" && actionType !== "POP") return;
      e.preventDefault();
    });
    return unsub;
  }, [navigation, step, otp.length, otpLen, loading, deviceSessionMode]);

  const handleRetryDeviceSession = async () => {
    if (!lastExchange) return;
    clearErrors();
    setLoading(true);
    try {
      const deviceId = await getOrCreateMerchantDeviceId();
      if (lastExchange === "otp") {
        const session =
          loginChannel === "email"
            ? await merchantAuthService.exchangeGoogleMerchantFromCurrentSupabaseSession({
                deviceId,
              })
            : await merchantAuthService.exchangeMerchantFromCurrentSupabaseSession({
                phoneE164,
                deviceId,
              });
        const partner = partnerDataFromExchange(session.partner);
        await setTokenAndPartner(session.accessToken, partner, session.userId, session.expiresAt);
        setLastExchange(null);
        router.replace("/");
      }
    } catch (e: unknown) {
      if (isMerchantAuthError(e) && e.code === "device_session_unavailable") {
        setDeviceSessionMode(true);
        setError(e.message);
      } else {
        setDeviceSessionMode(false);
        const msg = e instanceof Error ? e.message : "Could not connect. Try again.";
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  const topPad = Math.max(insets.top, SAFE_AREA_TOP_MIN) + 8;
  const bottomPad = Math.max(insets.bottom, 16);
  const phoneReady = phone.replace(/\D/g, "").length === 10;
  const proceedReady = loginChannel === "email" ? emailValid : phoneReady;
  const resendMins = Math.floor(resendSeconds / 60);
  const resendSecs = resendSeconds % 60;
  const phoneDigits = phone.replace(/\D/g, "").slice(-10);
  const otpSentPhone =
    phoneDigits.length === 10 ? `+91 ${phoneDigits}` : phoneE164 || phone;
  const otpSentTarget =
    loginChannel === "email" ? emailNormalized || email : otpSentPhone;

  const otpSheetError =
    step === "otp" && !deviceSessionMode && error.trim() ? error : null;

  if (authState.status === "loading" || authState.status === "logging_out") {
    return <MerchantBootstrapScreen />;
  }
  if (authState.status === "authenticated") {
    return <Redirect href="/" />;
  }

  return (
    <View style={styles.root}>
      <StatusBar style="dark" />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 8 : 0}
      >
        <ScrollView
          ref={sheetScrollRef}
          style={styles.flex}
          contentContainerStyle={[
            styles.content,
            { paddingTop: topPad, paddingBottom: bottomPad + 12 },
          ]}
          keyboardShouldPersistTaps="always"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
        >
          <Pressable
            onPress={() => router.replace("/(auth)/welcome")}
            style={({ pressed }) => [styles.backBtn, pressed && styles.pressed]}
            hitSlop={12}
            accessibilityLabel="Go back"
          >
            <Ionicons name="chevron-back" size={20} color={GatiMitraMerchant.textPrimary} />
          </Pressable>

          <View style={styles.channelToggle} accessibilityRole="tablist">
            <Pressable
              style={[styles.channelTab, loginChannel === "phone" && styles.channelTabActive]}
              onPress={() => switchLoginChannel("phone")}
              disabled={step === "otp" || loading || googleLoading}
              accessibilityRole="tab"
              accessibilityState={{ selected: loginChannel === "phone" }}
            >
              <Text
                style={[
                  styles.channelTabText,
                  loginChannel === "phone" && styles.channelTabTextActive,
                ]}
              >
                Phone
              </Text>
            </Pressable>
            <Pressable
              style={[styles.channelTab, loginChannel === "email" && styles.channelTabActive]}
              onPress={() => switchLoginChannel("email")}
              disabled={step === "otp" || loading || googleLoading}
              accessibilityRole="tab"
              accessibilityState={{ selected: loginChannel === "email" }}
            >
              <Text
                style={[
                  styles.channelTabText,
                  loginChannel === "email" && styles.channelTabTextActive,
                ]}
              >
                Email
              </Text>
            </Pressable>
          </View>

          <Text style={styles.title}>
            {loginChannel === "email" ? "Enter Your Email" : "Enter Your Mobile Number"}
          </Text>
          <Text style={styles.subtitle}>
            {loginChannel === "email"
              ? "Please enter the email registered with your GatiMitra partner account to continue."
              : "Please enter the mobile number registered with your GatiMitra partner account to continue."}
          </Text>

          {loginChannel === "email" ? (
            <Pressable
              onPress={() => emailInputRef.current?.focus()}
              accessibilityLabel="Email address"
              style={({ pressed }) => [
                styles.phoneShell,
                emailFieldFocused && styles.phoneShellFocused,
                pressed && styles.pressed,
              ]}
            >
              <Ionicons
                name="mail-outline"
                size={20}
                color={GatiMitraMerchant.textSecondary}
                style={styles.emailIcon}
              />
              <TextInput
                ref={emailInputRef}
                style={styles.phoneInput}
                placeholder="Email address"
                placeholderTextColor={GatiMitraMerchant.textTertiary}
                value={email}
                onChangeText={(t) => {
                  clearErrors();
                  setEmail(t.replace(/\s/g, ""));
                }}
                onFocus={() => {
                  setEmailFieldFocused(true);
                  scrollPhoneFormIntoView();
                }}
                onBlur={() => setEmailFieldFocused(false)}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                textContentType="emailAddress"
                editable={!loading && !googleLoading && step === "phone"}
                selectionColor={GatiMitraMerchant.primary}
                autoFocus={step === "phone"}
              />
            </Pressable>
          ) : (
            <Pressable
              onPress={() => phoneInputRef.current?.focus()}
              accessibilityLabel="Mobile number, country code India plus nine one"
              style={({ pressed }) => [
                styles.phoneShell,
                phoneFieldFocused && styles.phoneShellFocused,
                pressed && styles.pressed,
              ]}
            >
              <View style={styles.ccBlock} importantForAccessibility="no">
                <Text style={styles.flagEmoji}>🇮🇳</Text>
                <Text style={styles.ccText}>+91</Text>
                <Ionicons name="chevron-down" size={14} color={GatiMitraMerchant.textSecondary} />
              </View>
              <View style={styles.ccDivider} />
              <TextInput
                ref={phoneInputRef}
                style={styles.phoneInput}
                placeholder="Mobile Number"
                placeholderTextColor={GatiMitraMerchant.textTertiary}
                value={phone}
                onChangeText={(t) => {
                  clearErrors();
                  setPhone(t.replace(/\D/g, "").slice(0, 10));
                }}
                onFocus={() => {
                  setPhoneFieldFocused(true);
                  scrollPhoneFormIntoView();
                }}
                onBlur={() => setPhoneFieldFocused(false)}
                keyboardType="phone-pad"
                maxLength={10}
                editable={!loading && !googleLoading && step === "phone"}
                selectionColor={GatiMitraMerchant.primary}
                autoFocus={step === "phone"}
              />
            </Pressable>
          )}

          {step === "phone" && deviceSessionMode && lastExchange ? (
            <View style={styles.warnBanner}>
              <View style={styles.warnIconWrap}>
                <Ionicons name="cloud-offline-outline" size={22} color="#B45309" />
              </View>
              <View style={styles.warnBody}>
                <Text style={styles.warnTitle}>Could not start session</Text>
                <Text style={styles.warnText}>{error}</Text>
                <Pressable
                  style={[styles.retryBtn, loading && styles.btnDisabled]}
                  onPress={handleRetryDeviceSession}
                  disabled={loading}
                >
                  <Ionicons name="refresh" size={18} color="#92400E" />
                  <Text style={styles.retryBtnText}>{loading ? "Trying…" : "Try again"}</Text>
                </Pressable>
              </View>
            </View>
          ) : step === "phone" && error ? (
            <View style={styles.errorBanner}>
              <Ionicons name="alert-circle-outline" size={20} color={GatiMitraMerchant.error} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          <Pressable
            style={[
              styles.proceedBtn,
              proceedReady && !loading && !googleLoading
                ? styles.proceedBtnReady
                : styles.proceedBtnIdle,
              (loading || googleLoading) && styles.btnDisabled,
            ]}
            onPress={handleRequestOtp}
            disabled={loading || googleLoading || !proceedReady || step !== "phone"}
          >
            {loading && step === "phone" ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.proceedBtnText}>Proceed</Text>
            )}
          </Pressable>

          <View style={styles.orRow}>
            <View style={styles.orLine} />
            <Text style={styles.orText}>or</Text>
            <View style={styles.orLine} />
          </View>

          <Pressable
            style={({ pressed }) => [
              styles.googleBtn,
              (loading || googleLoading) && styles.btnDisabled,
              pressed && styles.pressed,
            ]}
            onPress={() => void handleGoogleSignIn()}
            disabled={loading || googleLoading || step !== "phone"}
          >
            {googleLoading ? (
              <ActivityIndicator color={GatiMitraMerchant.textPrimary} size="small" />
            ) : (
              <>
                <GoogleMark size={20} />
                <Text style={styles.googleBtnText}>Sign in with Google</Text>
              </>
            )}
          </Pressable>

          <View style={styles.registerBlock}>
            <Text style={styles.registerMuted}>New partner? </Text>
            <Pressable onPress={() => router.push("/(auth)/signup-webview")} hitSlop={8}>
              <Text style={styles.registerLink}>Create account</Text>
            </Pressable>
          </View>

          <View style={styles.legalBlock}>
            <Text style={styles.legalPrefix}>By logging in, you agree to our</Text>
            <View style={styles.legalLinksRow}>
              <Pressable
                onPress={() => Linking.openURL(legalUrls.terms).catch(() => {})}
                hitSlop={6}
              >
                <Text style={styles.legalLink}>Terms & Conditions</Text>
              </Pressable>
              <Text style={styles.legalSeparator}>•</Text>
              <Pressable
                onPress={() => Linking.openURL(legalUrls.privacyPolicy).catch(() => {})}
                hitSlop={6}
              >
                <Text style={styles.legalLink}>Privacy Policy</Text>
              </Pressable>
              <Text style={styles.legalSeparator}>•</Text>
              <Pressable
                onPress={() => Linking.openURL(legalUrls.codeOfConduct).catch(() => {})}
                hitSlop={6}
              >
                <Text style={styles.legalLink}>Code of Conduct</Text>
              </Pressable>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <OtpVerifySheetModal
        visible={step === "otp"}
        title="Verify OTP"
        subtitle={`The One Time Password is sent to ${otpSentTarget}. Please enter the One Time Password.`}
        otpLength={otpLen}
        value={otp}
        onChange={(next) => {
          clearErrors();
          setOtp(next);
        }}
        onVerify={(code) => {
          void handleVerifyOtp(code);
        }}
        onCancel={handleCancelOtp}
        loading={loading}
        error={otpSheetError}
        autoSubmitOnComplete
        dismissOnBackdropPress
        dockToKeyboard
        verifyDisabled={deviceSessionMode}
        theme={merchantOtpVerifyTheme}
        resendSlot={
          <View>
            <View style={styles.otpResendRow}>
              <Text style={styles.otpTimerText}>
                {resendSeconds > 0
                  ? `Resend OTP in ${resendMins}:${resendSecs.toString().padStart(2, "0")} sec`
                  : resending
                    ? "Sending code…"
                    : "You can resend OTP now"}
              </Text>
              <Pressable
                onPress={handleResendOtp}
                disabled={resendSeconds > 0 || loading || resending}
                hitSlop={8}
              >
                <Text
                  style={[
                    styles.otpResendLink,
                    (resendSeconds > 0 || loading || resending) && styles.otpResendLinkMuted,
                  ]}
                >
                  Resend OTP
                </Text>
              </Pressable>
            </View>
            {deviceSessionMode && lastExchange ? (
              <View style={styles.warnBanner}>
                <View style={styles.warnIconWrap}>
                  <Ionicons name="cloud-offline-outline" size={22} color="#B45309" />
                </View>
                <View style={styles.warnBody}>
                  <Text style={styles.warnTitle}>Could not start session</Text>
                  <Text style={styles.warnText}>
                    {error ||
                      "Our servers could not register this device. This is usually temporary — try again without a new OTP."}
                  </Text>
                  <Pressable
                    style={[styles.retryBtn, loading && styles.btnDisabled]}
                    onPress={handleRetryDeviceSession}
                    disabled={loading}
                  >
                    <Ionicons name="refresh" size={18} color="#92400E" />
                    <Text style={styles.retryBtnText}>{loading ? "Trying…" : "Try again"}</Text>
                  </Pressable>
                </View>
              </View>
            ) : null}
          </View>
        }
      />

      <MerchantBottomSheetShell
        visible={notRegisteredSheetOpen}
        onClose={() => setNotRegisteredSheetOpen(false)}
        maxHeightPercent="42%"
      >
        <View style={styles.notRegSheetBody}>
          <View style={styles.notRegIconWrap}>
            <Ionicons name="alert-circle" size={28} color={GatiMitraMerchant.error} />
          </View>
          <Text style={styles.notRegTitle}>
            {notRegisteredKind === "email"
              ? NOT_REGISTERED_EMAIL_SHEET_MESSAGE
              : NOT_REGISTERED_SHEET_MESSAGE}
          </Text>
          <Pressable
            style={({ pressed }) => [styles.registerStoreBtn, pressed && styles.pressed]}
            onPress={openRegisterStore}
          >
            <Text style={styles.registerStoreBtnText}>Register Store</Text>
          </Pressable>
        </View>
      </MerchantBottomSheetShell>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  flex: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: 22,
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: "flex-start",
    justifyContent: "center",
    marginBottom: 12,
  },
  pressed: {
    opacity: 0.72,
  },
  channelToggle: {
    flexDirection: "row",
    alignSelf: "stretch",
    backgroundColor: "#F1F5F9",
    borderRadius: 12,
    padding: 4,
    marginBottom: 18,
  },
  channelTab: {
    flex: 1,
    height: 40,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  channelTabActive: {
    backgroundColor: "#FFFFFF",
    shadowColor: "#0F172A",
    shadowOpacity: 0.06,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  channelTabText: {
    fontFamily: POPPINS_BOLD,
    fontSize: 14,
    color: GatiMitraMerchant.textSecondary,
  },
  channelTabTextActive: {
    color: GatiMitraMerchant.textPrimary,
  },
  title: {
    fontFamily: LORA_BOLD,
    fontSize: 28,
    color: GatiMitraMerchant.textPrimary,
    letterSpacing: -0.4,
    lineHeight: 34,
    marginBottom: 10,
  },
  subtitle: {
    fontFamily: LORA_BOLD,
    fontSize: 14,
    color: GatiMitraMerchant.textSecondary,
    lineHeight: 21,
    marginBottom: 28,
  },
  phoneShell: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 56,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: "#CBD5E1",
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 12,
    marginBottom: 20,
  },
  phoneShellFocused: {
    borderColor: GatiMitraMerchant.primary,
  },
  emailIcon: {
    marginRight: 10,
  },
  ccBlock: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingRight: 10,
  },
  flagEmoji: {
    fontSize: 18,
    lineHeight: 22,
  },
  ccText: {
    fontFamily: POPPINS_BOLD,
    fontSize: 16,
    color: GatiMitraMerchant.textPrimary,
  },
  ccDivider: {
    width: StyleSheet.hairlineWidth,
    alignSelf: "stretch",
    backgroundColor: "#CBD5E1",
    marginVertical: 12,
    marginRight: 12,
  },
  phoneInput: {
    flex: 1,
    fontFamily: POPPINS_BOLD,
    fontSize: 16,
    color: GatiMitraMerchant.textPrimary,
    paddingVertical: Platform.OS === "ios" ? 14 : 10,
    includeFontPadding: false,
  },
  proceedBtn: {
    height: 52,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
  },
  proceedBtnIdle: {
    backgroundColor: "#94A3B8",
  },
  proceedBtnReady: {
    backgroundColor: GatiMitraMerchant.primary,
  },
  proceedBtnText: {
    fontFamily: LORA_BOLD,
    fontSize: 16,
    color: "#FFFFFF",
    letterSpacing: 0.2,
  },
  btnDisabled: {
    opacity: 0.7,
  },
  orRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 22,
    marginBottom: 16,
    gap: 12,
  },
  orLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: "#CBD5E1",
  },
  orText: {
    fontFamily: POPPINS_BOLD,
    fontSize: 12,
    color: GatiMitraMerchant.textTertiary,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  googleBtn: {
    height: 52,
    borderRadius: 26,
    borderWidth: 1.5,
    borderColor: "#CBD5E1",
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 10,
  },
  googleBtnText: {
    fontFamily: LORA_BOLD,
    fontSize: 15,
    color: GatiMitraMerchant.textPrimary,
  },
  registerBlock: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 28,
  },
  registerMuted: {
    fontFamily: LORA_BOLD,
    fontSize: 14,
    color: GatiMitraMerchant.textSecondary,
  },
  registerLink: {
    fontFamily: LORA_BOLD,
    fontSize: 14,
    color: GatiMitraMerchant.primary,
  },
  legalBlock: {
    alignItems: "center",
    marginTop: 22,
    paddingHorizontal: 4,
  },
  legalPrefix: {
    fontFamily: LORA_BOLD,
    fontSize: 12,
    lineHeight: 18,
    color: GatiMitraMerchant.textTertiary,
    textAlign: "center",
  },
  legalLinksRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "center",
    columnGap: 7,
    rowGap: 4,
    marginTop: 4,
  },
  legalLink: {
    fontFamily: LORA_BOLD,
    fontSize: 12,
    lineHeight: 18,
    color: GatiMitraMerchant.primaryDark,
    textDecorationLine: "underline",
  },
  legalSeparator: {
    fontSize: 11,
    color: "#CBD5E1",
  },
  otpResendRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  otpTimerText: {
    fontFamily: POPPINS_BOLD,
    fontSize: 12,
    color: GatiMitraMerchant.textTertiary,
    flex: 1,
    paddingRight: 8,
  },
  otpResendLink: {
    fontFamily: LORA_BOLD,
    fontSize: 13,
    color: GatiMitraMerchant.primaryDark,
    textDecorationLine: "underline",
  },
  otpResendLinkMuted: {
    color: GatiMitraMerchant.textTertiary,
    textDecorationLine: "none",
  },
  errorBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    backgroundColor: "#FEF2F2",
    borderRadius: 12,
    padding: 12,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "#FECACA",
  },
  errorText: {
    flex: 1,
    fontFamily: LORA_BOLD,
    fontSize: 13,
    color: GatiMitraMerchant.error,
    lineHeight: 18,
  },
  warnBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    backgroundColor: "#FFFBEB",
    borderRadius: 12,
    padding: 12,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "#FDE68A",
  },
  warnIconWrap: {
    marginTop: 2,
  },
  warnBody: {
    flex: 1,
    minWidth: 0,
  },
  warnTitle: {
    fontFamily: LORA_BOLD,
    fontSize: 14,
    color: "#92400E",
    marginBottom: 4,
  },
  warnText: {
    fontFamily: LORA_BOLD,
    fontSize: 13,
    color: "#B45309",
    lineHeight: 18,
  },
  retryBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 10,
    alignSelf: "flex-start",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: "#FEF3C7",
  },
  retryBtnText: {
    fontFamily: LORA_BOLD,
    fontSize: 13,
    color: "#92400E",
  },
  notRegSheetBody: {
    paddingHorizontal: 22,
    paddingTop: 8,
    paddingBottom: 8,
    alignItems: "center",
  },
  notRegIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "#FEF2F2",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },
  notRegTitle: {
    fontFamily: LORA_BOLD,
    fontSize: 18,
    color: GatiMitraMerchant.textPrimary,
    textAlign: "center",
    lineHeight: 26,
    marginBottom: 20,
  },
  registerStoreBtn: {
    width: "100%",
    borderRadius: 14,
    backgroundColor: GatiMitraMerchant.primary,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  registerStoreBtnText: {
    fontFamily: POPPINS_BOLD,
    fontSize: 15,
    color: "#FFFFFF",
  },
});
