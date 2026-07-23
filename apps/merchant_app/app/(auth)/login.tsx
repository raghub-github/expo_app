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
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  KeyboardAvoidingView,
  Keyboard,
  Linking,
  Platform,
  ScrollView,
  BackHandler,
  type KeyboardEvent,
} from "react-native";
import { useRouter, useNavigation } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { StatusBar } from "expo-status-bar";
import { OtpVerifySheetModal } from "@gatimitra/otp-verify-ui";
import { useAuth, type PartnerData } from "@/context/AuthContext";
import {
  merchantAuthService,
  isMerchantAuthError,
} from "@/services/auth.service";
import { getOrCreateMerchantDeviceId } from "@/lib/merchantDeviceId";
import { GatiMitraMerchant, SAFE_AREA_TOP_MIN } from "@/constants/theme";
import { getPartnerLegalUrls } from "@/lib/partnerLegalUrls";
import { merchantOtpVerifyTheme } from "@/lib/otpVerifyTheme";

const OTP_LEN = 6;
const legalUrls = getPartnerLegalUrls();
const LORA_BOLD = "Lora_700Bold";
const POPPINS_BOLD = "Poppins_700Bold";

/** Narrow exchange API partner payload to PartnerData after minimal structural checks. */
function partnerDataFromExchange(partner: { parent: unknown; childStores: unknown[] }): PartnerData {
  if (typeof partner.parent !== "object" || partner.parent === null) {
    throw new Error("Invalid partner data from server.");
  }
  const pr = partner.parent as Record<string, unknown>;
  if (typeof pr.parent_merchant_id !== "string" || typeof pr.id !== "number") {
    throw new Error("Invalid partner data from server.");
  }
  if (!Array.isArray(partner.childStores)) {
    throw new Error("Invalid partner data from server.");
  }
  return partner as PartnerData;
}

type LastExchange = null | "otp";

export default function LoginScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { setTokenAndPartner } = useAuth();
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [step, setStep] = useState<"phone" | "otp">("phone");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [deviceSessionMode, setDeviceSessionMode] = useState(false);
  const [lastExchange, setLastExchange] = useState<LastExchange>(null);
  const [resendSeconds, setResendSeconds] = useState(0);
  const [resending, setResending] = useState(false);
  const phoneInputRef = useRef<TextInput>(null);
  const sheetScrollRef = useRef<ScrollView>(null);
  const [phoneFieldFocused, setPhoneFieldFocused] = useState(false);
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

  const maskedPhone =
    phone.replace(/\D/g, "").length >= 10
      ? `+91 •••• •${phone.replace(/\D/g, "").slice(-3)}`
      : phoneE164;

  const clearErrors = () => {
    setError("");
    setDeviceSessionMode(false);
  };

  const handleRequestOtp = async () => {
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
      const msg = e instanceof Error ? e.message : "Could not send OTP. Try again.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleResendOtp = async () => {
    if (resendSeconds > 0 || resending || !phoneE164) return;
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

  const handleVerifyOtp = async (codeArg?: string) => {
    const code = (codeArg ?? otp).replace(/\D/g, "").slice(0, OTP_LEN);
    if (!code || code.length !== OTP_LEN) {
      setError("Enter the 6-digit code from SMS");
      return;
    }
    if (verifyInFlightRef.current || verifySucceededRef.current) return;
    verifyInFlightRef.current = true;
    clearErrors();
    setLoading(true);
    setLastExchange("otp");
    try {
      const deviceId = await getOrCreateMerchantDeviceId();
      const session = await merchantAuthService.verifyOtp({
        phoneE164,
        otp: code,
        deviceId,
      });
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
        const msg = normalizeOtpErrorMessage(raw);
        setError(msg);
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
      if (otp.length >= OTP_LEN || loading || deviceSessionMode) return;
      const act = e.data.action;
      const actionType =
        typeof act === "object" && act !== null && "type" in act
          ? String((act as { type: string }).type)
          : "";
      if (actionType !== "GO_BACK" && actionType !== "POP") return;
      e.preventDefault();
    });
    return unsub;
  }, [navigation, step, otp.length, loading, deviceSessionMode]);

  const handleRetryDeviceSession = async () => {
    if (!lastExchange) return;
    clearErrors();
    setLoading(true);
    try {
      const deviceId = await getOrCreateMerchantDeviceId();
      if (lastExchange === "otp") {
        const session = await merchantAuthService.exchangeMerchantFromCurrentSupabaseSession({
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
  const resendMins = Math.floor(resendSeconds / 60);
  const resendSecs = resendSeconds % 60;
  const phoneDigits = phone.replace(/\D/g, "").slice(-10);
  const otpSentMask =
    phoneDigits.length === 10 ? `${phoneDigits.slice(0, 5)}****` : maskedPhone;

  const otpSheetError =
    step === "otp" && !deviceSessionMode && error.trim() ? error : null;

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
            <Ionicons name="arrow-back" size={24} color={GatiMitraMerchant.textPrimary} />
          </Pressable>

          <Text style={styles.title}>Enter Your Mobile Number</Text>
          <Text style={styles.subtitle}>
            Please enter the mobile number registered with your GatiMitra partner account to
            continue.
          </Text>

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
              editable={!loading && step === "phone"}
              selectionColor={GatiMitraMerchant.primary}
              autoFocus={step === "phone"}
            />
          </Pressable>

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
              phoneReady && !loading ? styles.proceedBtnReady : styles.proceedBtnIdle,
              loading && styles.btnDisabled,
            ]}
            onPress={handleRequestOtp}
            disabled={loading || !phoneReady || step !== "phone"}
          >
            {loading && step === "phone" ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.proceedBtnText}>Proceed</Text>
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
        subtitle={`The One Time Password is sent to ${otpSentMask}. Please enter the One Time Password.`}
        otpLength={6}
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
    marginBottom: 18,
  },
  pressed: {
    opacity: 0.72,
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
});
