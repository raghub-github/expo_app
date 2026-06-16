/**
 * OTP verification – modern style matching login screen.
 * Centered card, soft gradient, 6-digit input with proper spacing, green CTA.
 */

import { useState, useRef, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  ScrollView,
  Image,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useLocalSearchParams } from "expo-router";
import { authService } from "@/services/auth.service";
import { profileService } from "@/services/profile.service";
import { writeCachedProfile } from "@/lib/profileCache";
import { useAuthStore } from "@/store/authStore";
import { getDeviceIdAsync } from "@/utils/deviceId";
import { OTP_LENGTH } from "@/constants";

const BG_SCREEN = "#F0F4F3";
const CARD_GRADIENT_TOP = "#FFFFFF";
const CARD_GRADIENT_BOTTOM = "#E8F5F3";
const MINT_SOFT = "#B2DFDB";
const MINT_MED = "#80CBC4";
const GREEN_PRIMARY = "#2E7D32";
const GREEN_LIGHT = "#4CAF50";
const TITLE_DARK = "#1A1A1A";
const TEXT_GRAY = "#6B7280";
const BORDER_INPUT = "#E8ECF0";
const PLACEHOLDER_GRAY = "#9CA3AF";
const LINK_GREEN = "#059669";
const SHADOW_COLOR = "rgba(0,0,0,0.06)";

export default function OtpScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ phoneE164: string }>();
  const phoneE164 = params.phoneE164 ?? "";

  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [logoError, setLogoError] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
  const [resendSeconds, setResendSeconds] = useState(60);
  const [resending, setResending] = useState(false);
  const inputRef = useRef<TextInput>(null);
  const digits = otp.split("").concat(Array(OTP_LENGTH).fill("")).slice(0, OTP_LENGTH);

  useEffect(() => {
    if (resendSeconds <= 0) return;
    const id = setInterval(() => setResendSeconds((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(id);
  }, [resendSeconds]);

  const goToLogin = () => router.replace("/(auth)/login");

  const setSession = useAuthStore((s) => s.setSession);

  const handleResend = async () => {
    if (resendSeconds > 0 || resending) return;
    setError("");
    setResending(true);
    try {
      await authService.sendOtp({ phoneE164 });
      setResendSeconds(60);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Could not resend OTP.";
      setError(msg);
    } finally {
      setResending(false);
    }
  };

  const handleVerify = async () => {
    if (otp.length !== OTP_LENGTH) {
      setError("Enter 6-digit OTP");
      return;
    }
    setError("");
    setLoading(true);
    try {
      const deviceId = await getDeviceIdAsync();
      await authService.clearSession();
      const session = await authService.verifyOtp({
        phoneE164,
        otp,
        deviceId,
      });
      await setSession(session);
      try {
        const profile = await profileService.getProfile();
        await writeCachedProfile(profile);
        if (profile?.profile_completed === true) {
          router.replace("/(tabs)/");
          return;
        }
      } catch (e: unknown) {
        const ax = e as { response?: { status?: number; data?: { error?: string } } };
        if (ax?.response?.status === 401 && (ax?.response?.data?.error === "user_deleted" || ax?.response?.data?.error === "session_revoked")) {
          return;
        }
      }
      router.replace("/(onboarding)");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message
        : (e && typeof e === "object" && "response" in e
            ? (e as { response?: { data?: { message?: string } } }).response?.data?.message
            : null);
      setError(msg || "Invalid OTP. Try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={[styles.container, { paddingBottom: insets.bottom }]}
    >
      {/* Back button – explicit replace to avoid GO_BACK not handled */}
      <View style={styles.topBar}>
        <TouchableOpacity onPress={goToLogin} style={styles.backButton} hitSlop={12}>
          <Ionicons name="arrow-back" size={24} color={TITLE_DARK} />
        </TouchableOpacity>
      </View>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.card}>
          <LinearGradient
            colors={[CARD_GRADIENT_TOP, CARD_GRADIENT_BOTTOM]}
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.waveWrap}>
            <View style={[styles.wave1, { backgroundColor: MINT_SOFT }]} />
            <View style={[styles.wave2, { backgroundColor: MINT_MED, opacity: 0.4 }]} />
          </View>

          <View style={styles.cardInner}>
            {/* Logo – GatiMitra from public/img/logo.png */}
            {!logoError ? (
              <Image
                source={require("../../public/img/logo.png")}
                style={styles.logoImage}
                resizeMode="contain"
                accessibilityLabel="GatiMitra logo"
                onError={() => setLogoError(true)}
              />
            ) : (
              <View style={styles.logoPlaceholder}>
                <Text style={styles.logoPlaceholderText}>GatiMitra</Text>
              </View>
            )}

            <Text style={styles.title}>Verify OTP</Text>
            <Text style={styles.subtitle}>
              Code sent to <Text style={styles.phoneHighlight}>{phoneE164}</Text>
            </Text>

            <View style={styles.fieldWrap}>
              <Text style={styles.label}>Enter 6-digit code</Text>
              <View style={styles.otpBoxesRow}>
                {digits.map((d, i) => (
                  <TouchableOpacity
                    key={i}
                    style={[
                      styles.otpBox,
                      focusedIndex === i && styles.otpBoxFocused,
                      d !== "" && styles.otpBoxFilled,
                    ]}
                    onPress={() => {
                      inputRef.current?.focus();
                      setFocusedIndex(i);
                    }}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.otpBoxDigit, d === "" && styles.otpBoxDigitPlaceholder]}>
                      {d || "0"}
                    </Text>
                  </TouchableOpacity>
                ))}
                <TextInput
                  ref={inputRef}
                  style={styles.otpInputHidden}
                  keyboardType="number-pad"
                  maxLength={OTP_LENGTH}
                  // Hint OS/keyboard that this is a one-time code field, so SMS OTP can be auto-filled.
                  textContentType="oneTimeCode"
                  autoComplete="sms-otp"
                  value={otp}
                  onChangeText={(t) => {
                    const next = t.replace(/\D/g, "").slice(0, OTP_LENGTH);
                    setOtp(next);
                    setFocusedIndex(next.length < OTP_LENGTH ? next.length : OTP_LENGTH - 1);
                  }}
                  onFocus={() => setFocusedIndex(otp.length < OTP_LENGTH ? otp.length : OTP_LENGTH - 1)}
                  onBlur={() => setFocusedIndex(null)}
                  editable={!loading}
                />
              </View>
              {error ? <Text style={styles.errorText}>{error}</Text> : null}
              <View style={styles.helperRow}>
                <TouchableOpacity
                  disabled={resendSeconds > 0 || loading || resending}
                  onPress={handleResend}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      styles.helperLink,
                      (resendSeconds > 0 || loading || resending) && styles.helperLinkDisabled,
                    ]}
                  >
                    {resending
                      ? "Sending…"
                      : resendSeconds > 0
                        ? `Resend OTP in 0:${resendSeconds.toString().padStart(2, "0")}`
                        : "Resend OTP"}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            <TouchableOpacity
              onPress={handleVerify}
              disabled={loading}
              activeOpacity={0.9}
              style={styles.buttonWrap}
            >
              <LinearGradient
                colors={[GREEN_PRIMARY, GREEN_LIGHT]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.button}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.buttonText}>Verify & Continue</Text>
                )}
              </LinearGradient>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={goToLogin}
              style={styles.changeNumber}
              disabled={loading}
              activeOpacity={0.7}
            >
              <Text style={styles.changeNumberText}>Change mobile number</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BG_SCREEN,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 24,
    paddingHorizontal: 20,
  },
  card: {
    width: "100%",
    maxWidth: 380,
    borderRadius: 28,
    overflow: "hidden",
    minHeight: 420,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.06,
    shadowRadius: 24,
    elevation: 8,
  },
  waveWrap: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: "40%",
    overflow: "hidden",
  },
  wave1: {
    position: "absolute",
    left: "-15%",
    right: "-15%",
    bottom: 0,
    height: "100%",
    borderTopLeftRadius: 160,
    borderTopRightRadius: 160,
  },
  wave2: {
    position: "absolute",
    left: "-8%",
    right: "-8%",
    bottom: -12,
    height: "88%",
    borderTopLeftRadius: 140,
    borderTopRightRadius: 140,
  },
  cardInner: {
    paddingHorizontal: 28,
    paddingTop: 32,
    paddingBottom: 32,
    alignItems: "center",
  },
  logoImage: {
    width: 80,
    height: 80,
    marginBottom: 20,
  },
  logoPlaceholder: {
    width: 80,
    height: 80,
    borderRadius: 20,
    backgroundColor: MINT_SOFT,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
  },
  logoPlaceholderText: {
    fontSize: 14,
    fontWeight: "700",
    color: GREEN_PRIMARY,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: BG_SCREEN,
  },
  backButton: {
    padding: 8,
  },
  title: {
    fontSize: 26,
    fontWeight: "700",
    color: TITLE_DARK,
    marginBottom: 8,
    textAlign: "center",
    letterSpacing: 0.3,
  },
  subtitle: {
    fontSize: 15,
    color: TEXT_GRAY,
    marginBottom: 24,
    textAlign: "center",
    lineHeight: 22,
  },
  phoneHighlight: {
    fontWeight: "600",
    color: TITLE_DARK,
  },
  fieldWrap: {
    width: "100%",
    marginBottom: 24,
  },
  label: {
    fontSize: 15,
    fontWeight: "500",
    color: TITLE_DARK,
    marginBottom: 12,
  },
  otpBoxesRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 10,
    position: "relative",
  },
  otpBox: {
    flex: 1,
    aspectRatio: 1,
    maxWidth: 52,
    backgroundColor: "#FFF",
    borderWidth: 1.5,
    borderColor: BORDER_INPUT,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 52,
  },
  otpBoxFocused: {
    borderColor: MINT_MED,
    borderWidth: 2,
    shadowColor: "rgba(128, 203, 196, 0.4)",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 2,
  },
  otpBoxFilled: {
    borderColor: "#D1FAE5",
  },
  otpBoxDigit: {
    fontSize: 22,
    fontWeight: "700",
    color: TITLE_DARK,
  },
  otpBoxDigitPlaceholder: {
    color: PLACEHOLDER_GRAY,
    fontWeight: "500",
  },
  otpInputHidden: {
    position: "absolute",
    opacity: 0,
    width: 1,
    height: 1,
    padding: 0,
  },
  errorText: {
    fontSize: 14,
    color: "#dc2626",
    marginTop: 10,
    textAlign: "center",
  },
  helperRow: {
    marginTop: 10,
    alignItems: "flex-end",
    width: "100%",
  },
  helperLink: {
    fontSize: 14,
    color: "#059669",
    fontWeight: "500",
  },
  helperLinkDisabled: {
    opacity: 0.55,
  },
  buttonWrap: {
    width: "100%",
    borderRadius: 14,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
  },
  button: {
    width: "100%",
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 52,
  },
  buttonText: {
    color: "#FFF",
    fontSize: 17,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  changeNumber: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 20,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  changeNumberText: {
    fontSize: 15,
    fontWeight: "600",
    color: LINK_GREEN,
  },
});
