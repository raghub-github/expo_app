/**
 * Professional Partner Login — Google + Phone OTP; both flows call backend and navigate to partner-home.
 */

import { useState } from "react";
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
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as Google from "expo-auth-session/providers/google";
import { useAuth } from "@/context/AuthContext";
import { getConfig } from "@/config/env";
import {
  GatiMitraMerchant,
  BUTTON_RADIUS,
  H_PADDING,
  CARD_RADIUS,
} from "@/constants/theme";

function getDeviceId(): string {
  return "merchant_" + Math.random().toString(36).slice(2, 12) + Date.now().toString(36);
}

type TabType = "google" | "phone";

export default function LoginScreen() {
  const router = useRouter();
  const { setTokenAndPartner } = useAuth();
  const [activeTab, setActiveTab] = useState<TabType>("phone");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [step, setStep] = useState<"phone" | "otp">("phone");
  const [requestId, setRequestId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const { apiBaseUrl, googleWebClientId } = getConfig();

  const [googleRequest, googlePromptAsync] = Google.useIdTokenAuthRequest({
    clientId: googleWebClientId ?? "",
  });
  const phoneE164 =
    phone.replace(/\D/g, "").length >= 10
      ? "+91" + phone.replace(/\D/g, "").slice(-10)
      : "";

  const handleRequestOtp = async () => {
    const url = `${apiBaseUrl}/v1/auth/otp/request`;
    if (__DEV__) {
      console.log("[OTP DEBUG] Send OTP clicked. phoneE164:", phoneE164, "| API URL:", url);
    }
    if (!phoneE164 || phoneE164.length < 12) {
      if (__DEV__) console.log("[OTP DEBUG] Validation failed: invalid phone length");
      setError("Enter a valid 10-digit phone number");
      return;
    }
    setError("");
    setLoading(true);
    if (__DEV__) console.log("[OTP DEBUG] Request started, loading=true");
    const controller = new AbortController();
    const timeoutMs = 30000;
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phoneE164 }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      if (__DEV__) console.log("[OTP DEBUG] Response received. status:", res.status, "ok:", res.ok);
      let data: { requestId?: string; message?: string };
      try {
        const raw = await res.text();
        if (__DEV__) console.log("[OTP DEBUG] Response body (raw):", raw?.slice(0, 200));
        data = raw ? JSON.parse(raw) : {};
      } catch (parseErr) {
        if (__DEV__) console.log("[OTP DEBUG] JSON parse error:", parseErr);
        setError("Invalid response from server. Try again.");
        return;
      }
      if (!res.ok) {
        if (__DEV__) console.log("[OTP DEBUG] res.ok=false. data:", data);
        setError(data?.message ?? "Could not send OTP");
        return;
      }
      if (data.requestId) {
        if (__DEV__) console.log("[OTP DEBUG] Success. requestId:", data.requestId, "| Setting step to otp");
        setRequestId(data.requestId);
        setStep("otp");
      } else {
        if (__DEV__) console.log("[OTP DEBUG] No requestId in response. data:", data);
        setError("Could not get OTP. Try again.");
      }
    } catch (e: unknown) {
      clearTimeout(timeoutId);
      if (__DEV__) console.log("[OTP DEBUG] Caught error:", e instanceof Error ? e.name + ": " + e.message : e);
      if (e instanceof Error && e.name === "AbortError") {
        setError(`Request timed out (${timeoutMs / 1000}s). Is the backend running at ${apiBaseUrl}?`);
      } else {
        setError("Network error. Check connection and that backend is running at " + apiBaseUrl);
      }
    } finally {
      if (__DEV__) console.log("[OTP DEBUG] Finally: loading=false");
      setLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    const url = `${apiBaseUrl}/v1/auth/otp/verify`;
    if (__DEV__) {
      console.log("[OTP DEBUG] Verify OTP clicked. requestId:", requestId, "| otp length:", otp?.length, "| API URL:", url);
    }
    if (!requestId || !otp || otp.length < 4) {
      if (__DEV__) console.log("[OTP DEBUG] Validation failed: missing requestId or OTP");
      setError("Enter the 6-digit OTP");
      return;
    }
    setError("");
    setLoading(true);
    if (__DEV__) console.log("[OTP DEBUG] Verify request started, loading=true");
    try {
      const deviceId = getDeviceId();
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestId,
          phoneE164,
          otp,
          deviceId,
          appType: "merchant",
        }),
      });
      if (__DEV__) console.log("[OTP DEBUG] Verify response. status:", res.status, "ok:", res.ok);
      let data: { accessToken?: string; partner?: unknown; message?: string; error?: string };
      try {
        const raw = await res.text();
        if (__DEV__) console.log("[OTP DEBUG] Verify body (raw):", raw?.slice(0, 300));
        data = raw ? JSON.parse(raw) : {};
      } catch (parseErr) {
        if (__DEV__) console.log("[OTP DEBUG] Verify JSON parse error:", parseErr);
        setError("Invalid response from server.");
        return;
      }
      if (!res.ok) {
        if (__DEV__) console.log("[OTP DEBUG] Verify res.ok=false. data:", data);
        setError(
          data?.message ?? data?.error ?? "Invalid OTP or partner not found"
        );
        return;
      }
      if (data.accessToken && data.partner) {
        if (__DEV__) console.log("[OTP DEBUG] Verify success. Navigating to partner-home");
        await setTokenAndPartner(data.accessToken, data.partner);
        router.replace("/(auth)/partner-home");
      } else {
        if (__DEV__) console.log("[OTP DEBUG] No accessToken/partner in response. data keys:", data ? Object.keys(data) : []);
        setError(
          "No partner account for this number. Sign up at partner.gatimitra.com"
        );
      }
    } catch (e) {
      if (__DEV__) console.log("[OTP DEBUG] Verify caught error:", e instanceof Error ? e.message : e);
      setError("Network error. Try again.");
    } finally {
      if (__DEV__) console.log("[OTP DEBUG] Verify finally: loading=false");
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    if (!googleWebClientId?.trim()) {
      setError("Google Sign-In not configured. Set EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID in .env");
      return;
    }
    setError("");
    setLoading(true);
    if (__DEV__) console.log("[OTP DEBUG] Google Sign-In started");
    try {
      const result = await googlePromptAsync();
      if (__DEV__) console.log("[OTP DEBUG] Google prompt result:", result?.type, result?.params ? "has params" : "no params");
      if (result?.type !== "success" || !result.params?.id_token) {
        if (result?.type === "cancel") {
          setError("Sign-in was cancelled.");
        } else {
          setError("Google sign-in failed. Try again or use Phone Login.");
        }
        return;
      }
      const idToken = result.params.id_token;
      const deviceId = getDeviceId();
      const res = await fetch(`${apiBaseUrl}/v1/auth/google`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken, deviceId }),
      });
      if (__DEV__) console.log("[OTP DEBUG] Google backend response status:", res.status);
      const raw = await res.text();
      let data: { accessToken?: string; partner?: unknown; message?: string; error?: string };
      try {
        data = raw ? JSON.parse(raw) : {};
      } catch {
        setError("Invalid response from server.");
        return;
      }
      if (!res.ok) {
        setError(data?.message ?? data?.error ?? "Google sign-in failed.");
        return;
      }
      if (data.accessToken && data.partner) {
        if (__DEV__) console.log("[OTP DEBUG] Google sign-in success, navigating to partner-home");
        await setTokenAndPartner(data.accessToken, data.partner);
        router.replace("/(auth)/partner-home");
      } else {
        setError(data?.message ?? "No partner account for this Google email. Sign up at partner.gatimitra.com");
      }
    } catch (e) {
      if (__DEV__) console.log("[OTP DEBUG] Google sign-in error:", e instanceof Error ? e.message : e);
      setError("Google sign-in failed. Try again or use Phone Login.");
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
        {/* Top bar */}
        <View style={styles.topBar}>
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
              Sign in with Google or use phone OTP to continue
            </Text>
          </View>

          {/* Card */}
          <View style={styles.card}>
            {/* Tabs */}
            <View style={styles.tabRow}>
              <Pressable
                style={[styles.tab, activeTab === "google" && styles.tabActive]}
                onPress={() => { setActiveTab("google"); setError(""); }}
              >
                <Text style={[styles.tabText, activeTab === "google" && styles.tabTextActive]}>
                  Google
                </Text>
              </Pressable>
              <Pressable
                style={[styles.tab, activeTab === "phone" && styles.tabActive]}
                onPress={() => { setActiveTab("phone"); setError(""); }}
              >
                <Text style={[styles.tabText, activeTab === "phone" && styles.tabTextActive]}>
                  Phone
                </Text>
              </Pressable>
            </View>

            {activeTab === "google" ? (
              <Pressable
                style={({ pressed }) => [styles.outlineBtn, pressed && styles.btnPressed, loading && styles.primaryBtnDisabled]}
                onPress={handleGoogleSignIn}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator size="small" color={GatiMitraMerchant.primary} />
                ) : (
                  <>
                    <Text style={styles.outlineBtnText}>Continue with Google</Text>
                    <Ionicons name="arrow-forward" size={20} color={GatiMitraMerchant.primary} />
                  </>
                )}
              </Pressable>
            ) : step === "phone" ? (
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
                <View style={styles.inputBox}>
                  <TextInput
                    style={[styles.input, styles.otpInput]}
                    placeholder="Enter 6-digit OTP"
                    placeholderTextColor={GatiMitraMerchant.textTertiary}
                    value={otp}
                    onChangeText={(t) => setOtp(t.replace(/\D/g, "").slice(0, 6))}
                    keyboardType="number-pad"
                    maxLength={6}
                    editable={!loading}
                  />
                </View>
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
                  onPress={() => setStep("phone")}
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
    paddingTop: 56,
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
    padding: 24,
    ...GatiMitraMerchant.shadowCard,
  },
  tabRow: {
    flexDirection: "row",
    marginBottom: 24,
    backgroundColor: GatiMitraMerchant.surfaceSubtle,
    borderRadius: BUTTON_RADIUS,
    padding: 4,
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: "center",
    borderRadius: BUTTON_RADIUS - 2,
  },
  tabActive: {
    backgroundColor: GatiMitraMerchant.background,
    ...GatiMitraMerchant.shadowSm,
  },
  tabText: {
    fontSize: 15,
    fontWeight: "500",
    color: GatiMitraMerchant.textTertiary,
  },
  tabTextActive: {
    color: GatiMitraMerchant.textPrimary,
    fontWeight: "600",
  },
  outlineBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 16,
    borderRadius: BUTTON_RADIUS,
    borderWidth: 1.5,
    borderColor: GatiMitraMerchant.border,
    backgroundColor: GatiMitraMerchant.background,
  },
  outlineBtnText: {
    fontSize: 16,
    fontWeight: "600",
    color: GatiMitraMerchant.textPrimary,
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
  otpInput: {
    paddingLeft: 0,
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
