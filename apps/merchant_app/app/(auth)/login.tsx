/**
 * Professional Partner Login — Google + Phone OTP; both flows call backend and navigate to partner-home.
 */

import { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Image,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as AuthSession from "expo-auth-session";
import * as WebBrowser from "expo-web-browser";
import Constants from "expo-constants";
import { useAuth } from "@/context/AuthContext";
import { getConfig } from "@/config/env";
import { merchantAuthService } from "@/services/auth.service";
import { getSupabaseAuth } from "@/lib/supabaseClient";
import { GatiMitraMerchant, BUTTON_RADIUS, H_PADDING, CARD_RADIUS, SAFE_AREA_TOP_MIN } from "@/constants/theme";

// Android-only: auto-fill OTP from SMS when user grants "Read SMS" permission
const useAndroidSmsOtp = (step: "phone" | "otp", setOtp: (v: string) => void) => {
  useEffect(() => {
    if (Platform.OS !== "android" || step !== "otp") return;
    let cancelled = false;
    const ReadSMS = require("@maniac-tech/react-native-expo-read-sms");
    const parseOtpFromSms = (sms: string): string | null => {
      if (!sms || typeof sms !== "string") return null;
      const body = sms.includes(",") ? sms.split(",").slice(1).join(",").trim() : sms;
      const match = body.match(/\b(\d{6})\b/) ?? body.match(/(\d{6})/);
      return match ? match[1] : null;
    };
    const run = async () => {
      try {
        await ReadSMS.requestReadSMSPermission();
        if (cancelled) return;
        const { hasReadSmsPermission, hasReceiveSmsPermission } = await ReadSMS.checkIfHasSMSPermission();
        if (!hasReadSmsPermission || !hasReceiveSmsPermission) return;
        ReadSMS.startReadSMS((status: string, sms: string) => {
          if (cancelled || status !== "success" || !sms) return;
          const code = parseOtpFromSms(sms);
          if (code) setOtp((prev) => (prev.length === 6 ? prev : code));
        });
      } catch (_) {
        // Native module not available (e.g. Expo Go) — user can still type OTP manually
      }
    };
    run();
    return () => {
      cancelled = true;
      try {
        ReadSMS.stopReadSMS?.();
      } catch (_) {}
    };
  }, [step, setOtp]);
};

function getDeviceId(): string {
  return "merchant_" + Math.random().toString(36).slice(2, 12) + Date.now().toString(36);
}

const TOP_BAR_PADDING_BELOW_STATUS = 12;

export default function LoginScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { setTokenAndPartner } = useAuth();
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [step, setStep] = useState<"phone" | "otp">("phone");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [resendSeconds, setResendSeconds] = useState(0);
  const [resending, setResending] = useState(false);
  const otpInputRef = useRef<TextInput>(null);

  const { apiBaseUrl } = getConfig();

  const phoneE164 =
    phone.replace(/\D/g, "").length >= 10
      ? "+91" + phone.replace(/\D/g, "").slice(-10)
      : "";

  useEffect(() => {
    if (step !== "otp" || resendSeconds <= 0) return;
    const id = setInterval(() => setResendSeconds((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(id);
  }, [step, resendSeconds]);

  // Focus OTP field when entering OTP step so iOS shows "From Messages" and keyboard can suggest code
  useEffect(() => {
    if (step !== "otp") return;
    const t = setTimeout(() => otpInputRef.current?.focus(), 300);
    return () => clearTimeout(t);
  }, [step]);

  // Android: request "Read SMS" permission and auto-fill OTP when SMS arrives (like other apps)
  useAndroidSmsOtp(step, setOtp);

  const handleRequestOtp = async () => {
    if (!phoneE164 || phoneE164.length < 12) {
      if (__DEV__) console.log("[OTP DEBUG] Validation failed: invalid phone length");
      setError("Enter a valid 10-digit phone number");
      return;
    }
    setError("");
    setLoading(true);
    try {
      if (__DEV__) console.log("[OTP DEBUG] Supabase sendOtp started. phoneE164:", phoneE164);
      await merchantAuthService.sendOtp({ phoneE164 });
      setResendSeconds(60);
      setStep("otp");
      if (__DEV__) console.log("[OTP DEBUG] Supabase sendOtp success, moved to OTP step");
    } catch (e: unknown) {
      if (__DEV__) console.log("[OTP DEBUG] Supabase sendOtp error:", e instanceof Error ? e.message : e);
      const msg = e instanceof Error ? e.message : "Could not send OTP. Try again.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleResendOtp = async () => {
    if (resendSeconds > 0 || resending || !phoneE164) return;
    setError("");
    setResending(true);
    try {
      if (__DEV__) console.log("[OTP DEBUG] Supabase resendOtp started. phoneE164:", phoneE164);
      await merchantAuthService.sendOtp({ phoneE164 });
      setResendSeconds(60);
    } catch (e) {
      if (__DEV__) console.log("[OTP DEBUG] Supabase resendOtp error:", e instanceof Error ? e.message : e);
      const msg = e instanceof Error ? e.message : "Could not resend OTP. Try again.";
      setError(msg);
    } finally {
      setResending(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (__DEV__) {
      console.log("[OTP DEBUG] Verify OTP clicked via Supabase. otp length:", otp?.length);
    }
    if (!otp || otp.length !== 6) {
      if (__DEV__) console.log("[OTP DEBUG] Validation failed: OTP length");
      setError("Enter the 6-digit OTP");
      return;
    }
    setError("");
    setLoading(true);
    if (__DEV__) console.log("[OTP DEBUG] Supabase verifyOtp request started, loading=true");
    try {
      const deviceId = getDeviceId();
      const session = await merchantAuthService.verifyOtp({
        phoneE164,
        otp,
        deviceId,
      });
      if (__DEV__) console.log("[OTP DEBUG] Supabase verifyOtp success, setting token and partner");
      await setTokenAndPartner(session.accessToken, session.partner as any);
      router.replace("/(auth)/partner-home");
    } catch (e) {
      if (__DEV__) console.log("[OTP DEBUG] Supabase verifyOtp caught error:", e instanceof Error ? e.message : e);
      const msg = e instanceof Error ? e.message : "Invalid OTP or partner not found.";
      setError(msg);
    } finally {
      if (__DEV__) console.log("[OTP DEBUG] Supabase verifyOtp finally: loading=false");
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    const supabase = getSupabaseAuth();
    if (!supabase) {
      setError("Supabase is not configured. Check EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY.");
      return;
    }
    setError("");
    setLoading(true);
    try {
      // Must match a URL in Supabase → Auth → URL Configuration → Redirect URLs exactly, or Supabase uses Site URL (gatimitra.com).
      // In Expo Go use path "auth/callback" so we get exp://IP:port/--/auth/callback (add that exact URL in Supabase).
      // In dev build use custom scheme.
      const isExpoGo = Constants.appOwnership === "expo";
      const redirectTo = isExpoGo
        ? AuthSession.makeRedirectUri({ path: "auth/callback" })
        : AuthSession.makeRedirectUri({
            scheme: "gatimitra-merchant",
            path: "auth/callback",
          });
      if (__DEV__) console.log("[Google OAuth] redirectTo:", redirectTo, isExpoGo ? "(Expo Go)" : "");

      const { data: oauthData, error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo, skipBrowserRedirect: true },
      });
      if (oauthError) {
        setError(oauthError.message || "Could not start Google sign-in.");
        return;
      }
      const authUrl = oauthData?.url;
      if (!authUrl) {
        setError("Google sign-in URL not returned. Check Supabase Google provider settings.");
        return;
      }

      const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectTo);
      WebBrowser.maybeCompleteAuthSession();

      if (result.type === "cancel" || result.type === "dismiss") {
        setError("Sign-in was cancelled.");
        return;
      }
      if (result.type !== "success" || !result.url) {
        setError("Google sign-in was not completed. Try again or use Phone Login.");
        return;
      }

      const url = result.url;
      const hash = url.includes("#") ? url.split("#")[1] : "";
      const params = new URLSearchParams(hash);
      const accessToken = params.get("access_token");
      const refreshToken = params.get("refresh_token");
      if (!accessToken) {
        const errDesc = params.get("error_description") || params.get("error");
        const baseMsg = errDesc ? decodeURIComponent(String(errDesc)) : "Google did not return an access token.";
        const redirectHint = isExpoGo
          ? ` Add this URL to Supabase → Auth → URL Configuration → Redirect URLs: ${redirectTo}`
          : "";
        setError(baseMsg + redirectHint);
        return;
      }

      await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken ?? "",
      });

      const deviceId = getDeviceId();
      const session = await merchantAuthService.exchangeSupabaseOAuth({ accessToken, deviceId });
      await setTokenAndPartner(session.accessToken, session.partner as any);
      if (__DEV__) console.log("[Google OAuth] success, navigating to partner-home");
      router.replace("/(auth)/partner-home");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Google sign-in failed.";
      if (__DEV__) console.log("[Google OAuth] error:", msg);
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.page}>
      <KeyboardAvoidingView
        style={styles.keyboard}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 44 : 0}
      >
        {/* Top bar — respects status bar on all devices */}
        <View style={[styles.topBar, { paddingTop: Math.max(insets.top, SAFE_AREA_TOP_MIN) + TOP_BAR_PADDING_BELOW_STATUS }]}>
          <Pressable
            onPress={() => router.replace("/(auth)/welcome")}
            style={styles.backBtn}
            hitSlop={12}
          >
            <Ionicons name="arrow-back" size={24} color={GatiMitraMerchant.textPrimary} />
          </Pressable>
          <Text style={styles.topBarTitle}>Partner Login</Text>
          <View style={styles.backBtn} />
        </View>

        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Hero block */}
          <View style={styles.hero}>
            <View style={styles.logoWrap}>
              <Image
                source={require("../../assets/onlylogo.png")}
                style={styles.logoImg}
                resizeMode="contain"
                accessibilityLabel="GatiMitra"
              />
            </View>
            <Text style={styles.welcomeText}>Welcome back</Text>
            <Text style={styles.heroSubtext}>
              Sign in using your registered phone number to continue
            </Text>
          </View>

          {/* Card */}
          <View style={styles.card}>
            {/* Login method indicator */}
            <View style={styles.methodPillRow}>
              <View style={[styles.methodPill, styles.methodPillActive]}>
                <Ionicons name="call-outline" size={16} color={GatiMitraMerchant.primary} />
                <Text style={styles.methodPillText}>Phone OTP</Text>
              </View>
              <View style={[styles.methodPill, styles.methodPillDisabled]}>
                <Ionicons name="logo-google" size={16} color={GatiMitraMerchant.textTertiary} />
                <Text style={styles.methodPillDisabledText}>Google (coming soon)</Text>
              </View>
            </View>

            {step === "phone" ? (
              <>
                <Text style={styles.label}>Mobile number</Text>
                <View style={styles.inputBox}>
                  <Ionicons name="call-outline" size={20} color={GatiMitraMerchant.textTertiary} />
                  <TextInput
                    style={styles.input}
                    placeholder="Enter 10-digit number"
                    placeholderTextColor={GatiMitraMerchant.textTertiary}
                    value={phone}
                    onChangeText={(t) => setPhone(t.replace(/\D/g, "").slice(0, 10))}
                    keyboardType="phone-pad"
                    maxLength={10}
                    editable={!loading}
                  />
                </View>
                <Text style={styles.hint}>We'll send a 6-digit OTP via SMS</Text>
                <Pressable
                  style={[styles.primaryBtn, loading && styles.primaryBtnDisabled]}
                  onPress={handleRequestOtp}
                  disabled={loading}
                >
                  <LinearGradient
                    colors={GatiMitraMerchant.primaryGradient}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={StyleSheet.absoluteFill}
                  />
                  {loading ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <Text style={styles.primaryBtnText}>Send OTP</Text>
                  )}
                </Pressable>
              </>
            ) : (
              <>
                <Text style={styles.label}>Verification code</Text>
                <View style={styles.otpBoxRow}>
                  {Array.from({ length: 6 }).map((_, index) => {
                    const char = otp[index] ?? "";
                    const isFilled = Boolean(char);
                    const isActive = !isFilled && index === otp.length;
                    return (
                      <Pressable
                        key={index}
                        onPress={() => otpInputRef.current?.focus()}
                        hitSlop={8}
                        style={[
                          styles.otpBox,
                          isFilled && styles.otpBoxFilled,
                          isActive && styles.otpBoxActive,
                        ]}
                      >
                        <Text style={[styles.otpChar, isFilled && styles.otpCharFilled]}>
                          {char}
                        </Text>
                      </Pressable>
                    );
                  })}
                  <TextInput
                    ref={otpInputRef}
                    style={styles.otpHiddenInput}
                    value={otp}
                    onChangeText={(t) => setOtp(t.replace(/\D/g, "").slice(0, 6))}
                    keyboardType="number-pad"
                    maxLength={6}
                    editable={!loading}
                    textContentType="oneTimeCode"
                    autoComplete="sms-otp"
                    autoCapitalize="none"
                    autoCorrect={false}
                    importantForAutofill="yes"
                    autoFocus={step === "otp"}
                  />
                </View>
                <Text style={styles.hint}>
                  {Platform.OS === "ios"
                    ? "Tap the code above the keyboard to fill from SMS"
                    : "Allow SMS access to auto-fill, or paste the code from your message"}
                </Text>
                <Pressable
                  style={styles.resendRow}
                  onPress={handleResendOtp}
                  disabled={resendSeconds > 0 || loading || resending}
                >
                  <Text
                    style={[
                      styles.changeNumberText,
                      (resendSeconds > 0 || loading || resending) && styles.resendDisabled,
                    ]}
                  >
                    {resending
                      ? "Sending…"
                      : resendSeconds > 0
                        ? `Resend OTP in 0:${resendSeconds.toString().padStart(2, "0")}`
                        : "Resend OTP"}
                  </Text>
                </Pressable>
                <Pressable
                  style={[styles.primaryBtn, loading && styles.primaryBtnDisabled]}
                  onPress={handleVerifyOtp}
                  disabled={loading}
                >
                  <LinearGradient
                    colors={GatiMitraMerchant.primaryGradient}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={StyleSheet.absoluteFill}
                  />
                  {loading ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <Text style={styles.primaryBtnText}>Verify & sign in</Text>
                  )}
                </Pressable>
                <Pressable
                  style={styles.changeNumberBtn}
                  onPress={() => { setStep("phone"); setOtp(""); setError(""); }}
                  disabled={loading}
                >
                  <Text style={styles.changeNumberText}>Use a different number</Text>
                </Pressable>
              </>
            )}

            {error ? (
              <View style={styles.errorBox}>
                <Ionicons name="alert-circle-outline" size={18} color={GatiMitraMerchant.error} />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}

            <View style={styles.registerRow}>
              <Text style={styles.registerText}>New to GatiMitra? </Text>
              <Pressable
                onPress={() => router.push("/(auth)/signup-webview")}
                hitSlop={8}
              >
                <Text style={styles.registerLink}>Register as partner</Text>
              </Pressable>
            </View>
          </View>

          <Pressable
            style={styles.backToHome}
            onPress={() => router.replace("/(auth)/welcome")}
          >
            <Ionicons name="home-outline" size={18} color={GatiMitraMerchant.navy} />
            <Text style={styles.backToHomeText}>Back to home</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: GatiMitraMerchant.surfaceWarm,
  },
  keyboard: {
    flex: 1,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: H_PADDING,
    paddingBottom: 16,
    backgroundColor: GatiMitraMerchant.background,
    borderBottomWidth: 1,
    borderBottomColor: GatiMitraMerchant.border,
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  topBarTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: GatiMitraMerchant.textPrimary,
  },
  scroll: {
    padding: H_PADDING,
    paddingTop: 24,
    paddingBottom: 40,
  },
  hero: {
    alignItems: "center",
    marginBottom: 28,
  },
  logoWrap: {
    width: 64,
    height: 64,
    marginBottom: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  logoImg: {
    width: 64,
    height: 64,
  },
  welcomeText: {
    fontSize: 22,
    fontWeight: "700",
    color: GatiMitraMerchant.textPrimary,
    marginBottom: 6,
  },
  heroSubtext: {
    fontSize: 14,
    color: GatiMitraMerchant.textSecondary,
    textAlign: "center",
    paddingHorizontal: 24,
  },
  card: {
    backgroundColor: GatiMitraMerchant.background,
    borderRadius: CARD_RADIUS,
    padding: 22,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
    ...GatiMitraMerchant.shadowSm,
  },
  methodPillRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 20,
  },
  methodPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  methodPillActive: {
    backgroundColor: "#DCFCE7",
  },
  methodPillText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#166534",
  },
  methodPillDisabled: {
    backgroundColor: GatiMitraMerchant.surfaceSubtle,
  },
  methodPillDisabledText: {
    fontSize: 11,
    fontWeight: "500",
    color: GatiMitraMerchant.textTertiary,
  },
  btnPressed: { opacity: 0.9 },
  label: {
    fontSize: 14,
    fontWeight: "600",
    color: GatiMitraMerchant.textPrimary,
    marginBottom: 10,
  },
  inputBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    height: 52,
    paddingHorizontal: 16,
    borderRadius: BUTTON_RADIUS,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
    backgroundColor: GatiMitraMerchant.background,
    marginBottom: 8,
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: GatiMitraMerchant.textPrimary,
    paddingVertical: 0,
  },
  otpBoxRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 12,
    marginTop: 6,
  },
  otpBox: {
    width: 44,
    height: 52,
    borderRadius: BUTTON_RADIUS,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
    backgroundColor: GatiMitraMerchant.background,
    alignItems: "center",
    justifyContent: "center",
  },
  otpBoxFilled: {
    borderColor: GatiMitraMerchant.primary,
    backgroundColor: GatiMitraMerchant.surfaceSubtle,
  },
  otpBoxActive: {
    borderColor: GatiMitraMerchant.primary,
  },
  otpChar: {
    fontSize: 18,
    fontWeight: "500",
    color: GatiMitraMerchant.textSecondary,
  },
  otpCharFilled: {
    fontWeight: "700",
    color: GatiMitraMerchant.textPrimary,
  },
  otpHiddenInput: {
    position: "absolute",
    opacity: 0,
    // Non-zero height so Android reliably shows keyboard when focused,
    // but narrow width and fully transparent so it doesn't affect layout.
    width: 1,
    height: 40,
  },
  hint: {
    fontSize: 13,
    color: GatiMitraMerchant.textTertiary,
    marginBottom: 20,
  },
  primaryBtn: {
    height: 52,
    borderRadius: BUTTON_RADIUS,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  primaryBtnText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#fff",
  },
  primaryBtnDisabled: { opacity: 0.7 },
  resendRow: {
    alignSelf: "center",
    paddingVertical: 8,
    marginBottom: 4,
  },
  resendDisabled: {
    opacity: 0.6,
  },
  changeNumberBtn: {
    alignSelf: "center",
    paddingVertical: 12,
    marginBottom: 8,
  },
  changeNumberText: {
    fontSize: 14,
    color: GatiMitraMerchant.primary,
    fontWeight: "500",
  },
  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: "#FEF2F2",
    marginTop: 4,
    marginBottom: 8,
  },
  errorText: {
    flex: 1,
    fontSize: 13,
    color: GatiMitraMerchant.error,
    fontWeight: "500",
  },
  registerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    flexWrap: "wrap",
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: GatiMitraMerchant.divider,
  },
  registerText: {
    fontSize: 14,
    color: GatiMitraMerchant.textSecondary,
  },
  registerLink: {
    fontSize: 14,
    fontWeight: "600",
    color: GatiMitraMerchant.primary,
  },
  backToHome: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 28,
    paddingVertical: 14,
  },
  backToHomeText: {
    fontSize: 15,
    color: GatiMitraMerchant.navy,
    fontWeight: "600",
  },
});
