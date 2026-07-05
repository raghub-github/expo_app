/**
 * Partner login — phone OTP, device-session retry; Google sign-in coming soon.
 */

import { useState, useEffect, useRef, useCallback, type Dispatch, type SetStateAction } from "react";
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  KeyboardAvoidingView,
  Keyboard,
  Platform,
  ScrollView,
  Image,
  useWindowDimensions,
  BackHandler,
  InteractionManager,
} from "react-native";
import { useRouter, useNavigation } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { StatusBar } from "expo-status-bar";
import { useAuth, type PartnerData } from "@/context/AuthContext";
import {
  merchantAuthService,
  isMerchantAuthError,
} from "@/services/auth.service";
import { getOrCreateMerchantDeviceId } from "@/lib/merchantDeviceId";
import { GatiMitraMerchant, H_PADDING, SAFE_AREA_TOP_MIN } from "@/constants/theme";
import LoginHeroBubbles from "./LoginHeroBubbles";
import { AppAssetImage } from "@/components/AppAssetImage";
import { MX } from "@/lib/appAssetKeys";

const OTP_LEN = 6;

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

const useAndroidSmsOtp = (step: "phone" | "otp", setOtp: Dispatch<SetStateAction<string>>) => {
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
          if (code) setOtp((prev) => (prev.length === OTP_LEN ? prev : code));
        });
      } catch (_) {
        // Native module not available (e.g. Expo Go)
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

type LastExchange = null | "otp";

/** Max share of window height for the white sign-in sheet (rest stays gradient). */
const SHEET_HEIGHT_RATIO = 0.62;

export default function LoginScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
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
  const otpInputRef = useRef<TextInput>(null);
  const phoneInputRef = useRef<TextInput>(null);
  const sheetScrollRef = useRef<ScrollView>(null);
  const [phoneFieldFocused, setPhoneFieldFocused] = useState(false);
  const [otpFieldFocused, setOtpFieldFocused] = useState(false);
  const [phoneKeyboardVisible, setPhoneKeyboardVisible] = useState(false);
  const [otpKeyboardVisible, setOtpKeyboardVisible] = useState(false);
  const otpAutoSubmittedRef = useRef<string | null>(null);
  const verifyOtpRef = useRef<(() => Promise<void>) | null>(null);

  const scrollPhoneFormIntoView = useCallback(() => {
    const end = () => sheetScrollRef.current?.scrollToEnd({ animated: true });
    requestAnimationFrame(end);
    setTimeout(end, 100);
    setTimeout(end, 280);
  }, []);

  const focusOtpFromSheetTap = useCallback(() => {
    if (step !== "otp" || loading || deviceSessionMode) return;
    const input = otpInputRef.current;
    if (!input) return;
    input.focus();
    if (Platform.OS === "android") {
      setTimeout(() => input.focus(), 50);
    }
    scrollPhoneFormIntoView();
  }, [step, loading, deviceSessionMode, scrollPhoneFormIntoView]);

  useEffect(() => {
    if (step !== "otp" || resendSeconds <= 0) return;
    const id = setInterval(() => setResendSeconds((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(id);
  }, [step, resendSeconds]);

  /** OTP step: open keyboard immediately and keep refocusing until all digits are entered. */
  useEffect(() => {
    if (step !== "otp") return;
    let cancelled = false;
    const focusOtp = () => {
      if (cancelled) return;
      otpInputRef.current?.focus();
    };
    focusOtp();
    const raf = requestAnimationFrame(focusOtp);
    const t0 = setTimeout(focusOtp, 50);
    const t1 = setTimeout(focusOtp, 200);
    const t2 = setTimeout(focusOtp, 500);
    const task = InteractionManager.runAfterInteractions(focusOtp);
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      clearTimeout(t0);
      clearTimeout(t1);
      clearTimeout(t2);
      void task;
    };
  }, [step]);

  /** If the keyboard is dismissed while OTP is incomplete, open it again (blur / outside tap). */
  useEffect(() => {
    if (step !== "otp") return;
    const hideEvt = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const sub = Keyboard.addListener(hideEvt, () => {
      if (otp.length >= OTP_LEN || loading || deviceSessionMode) return;
      setTimeout(() => otpInputRef.current?.focus(), 40);
    });
    return () => sub.remove();
  }, [step, otp.length, loading, deviceSessionMode]);

  /** Android back: return to phone step when OTP is incomplete (intentional exit). */
  useEffect(() => {
    if (step !== "otp") return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (otp.length >= OTP_LEN) return false;
      setStep("phone");
      setOtp("");
      setError("");
      setDeviceSessionMode(false);
      setLastExchange(null);
      return true;
    });
    return () => sub.remove();
  }, [step, otp.length]);

  /** Block backward navigation (e.g. iOS swipe-back) until OTP is complete; forward links (e.g. signup) still work. */
  useEffect(() => {
    if (step !== "otp") return;
    const unsub = navigation.addListener("beforeRemove", (e) => {
      if (otp.length >= OTP_LEN || loading || deviceSessionMode) return;
      const act = e.data.action;
      const actionType = typeof act === "object" && act !== null && "type" in act ? String((act as { type: string }).type) : "";
      if (actionType !== "GO_BACK" && actionType !== "POP") return;
      e.preventDefault();
      requestAnimationFrame(() => otpInputRef.current?.focus());
    });
    return unsub;
  }, [navigation, step, otp.length, loading, deviceSessionMode]);

  useAndroidSmsOtp(step, setOtp);

  useEffect(() => {
    if (step !== "phone") {
      setPhoneKeyboardVisible(false);
      return;
    }
    const showEvt = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvt = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const subShow = Keyboard.addListener(showEvt, () => setPhoneKeyboardVisible(true));
    const subHide = Keyboard.addListener(hideEvt, () => setPhoneKeyboardVisible(false));
    return () => {
      subShow.remove();
      subHide.remove();
    };
  }, [step]);

  useEffect(() => {
    if (step !== "otp") {
      setOtpKeyboardVisible(false);
      return;
    }
    const showEvt = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvt = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const subShow = Keyboard.addListener(showEvt, () => setOtpKeyboardVisible(true));
    const subHide = Keyboard.addListener(hideEvt, () => setOtpKeyboardVisible(false));
    return () => {
      subShow.remove();
      subHide.remove();
    };
  }, [step]);

  useEffect(() => {
    if (step !== "phone" || !phoneKeyboardVisible) return;
    scrollPhoneFormIntoView();
  }, [step, phoneKeyboardVisible, scrollPhoneFormIntoView]);

  useEffect(() => {
    if (step !== "otp") {
      otpAutoSubmittedRef.current = null;
      return;
    }
    if (otp.length < OTP_LEN) otpAutoSubmittedRef.current = null;
  }, [step, otp]);

  useEffect(() => {
    if (step !== "otp" || !otpKeyboardVisible) return;
    scrollPhoneFormIntoView();
  }, [step, otpKeyboardVisible, scrollPhoneFormIntoView]);

  useEffect(() => {
    if (step !== "otp" || otp.length !== OTP_LEN || loading || deviceSessionMode) return;
    if (otpAutoSubmittedRef.current === otp) return;
    otpAutoSubmittedRef.current = otp;
    const t = setTimeout(() => {
      void verifyOtpRef.current?.();
    }, 150);
    return () => clearTimeout(t);
  }, [step, otp, loading, deviceSessionMode]);

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
      setResendSeconds(60);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Could not resend OTP. Try again.";
      setError(msg);
    } finally {
      setResending(false);
      if (step === "otp") {
        setTimeout(() => otpInputRef.current?.focus(), 60);
      }
    }
  };

  function normalizeOtpErrorMessage(raw: string): string {
    const msg = String(raw || "").trim();
    const lower = msg.toLowerCase();
    // Supabase often returns: "Token has expired or is invalid"
    // For UX we prefer being specific: treat ambiguous "expired or invalid" as invalid.
    if (lower.includes("expired or is invalid")) return "Invalid OTP. Please try again.";
    if (lower.includes("invalid otp") || (lower.includes("invalid") && lower.includes("token"))) {
      return "Invalid OTP. Please try again.";
    }
    if (lower.includes("expired")) return "OTP expired. Please request a new OTP.";
    return msg || "Invalid OTP. Please try again.";
  }

  const handleVerifyOtp = async () => {
    if (!otp || otp.length !== OTP_LEN) {
      setError("Enter the 6-digit code from SMS");
      return;
    }
    clearErrors();
    setLoading(true);
    setLastExchange("otp");
    try {
      const deviceId = await getOrCreateMerchantDeviceId();
      const session = await merchantAuthService.verifyOtp({
        phoneE164,
        otp,
        deviceId,
      });
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
      setLoading(false);
    }
  };

  verifyOtpRef.current = handleVerifyOtp;

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
  const sheetMaxHeight = Math.round(windowHeight * SHEET_HEIGHT_RATIO);
  const sheetPadBottom = Math.max(insets.bottom, 16);
  const sheetScrollMaxHeight = Math.max(240, sheetMaxHeight - 10 - sheetPadBottom);
  /** Pull sheet flush with physical bottom; safe area padding lives inside ScrollView only. */
  const sheetBottomDock = -insets.bottom;

  /** Same layout as phone+IME: sheet grows and spacer collapses so OTP/CTA stay above keyboard (Android pan + iOS KAV). */
  const sheetImeOpen =
    (step === "phone" && phoneKeyboardVisible) || (step === "otp" && otpKeyboardVisible);
  const sheetPadApplied = 0;
  const scrollBottomInset =
    sheetImeOpen && step === "otp" ? 4 : sheetImeOpen ? 12 : sheetPadBottom + 8;

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <LinearGradient
        colors={[GatiMitraMerchant.navy, "#1e4d8c", "#1a6b7a", GatiMitraMerchant.primaryDark]}
        locations={[0, 0.35, 0.72, 1]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <LoginHeroBubbles />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? topPad + 6 : 0}
      >
        <View style={styles.mainColumn}>
          <View style={styles.topSection}>
            <View style={[styles.headerRow, { paddingTop: topPad }]}>
              <View style={styles.headerSide}>
                {step === "phone" && !phoneKeyboardVisible ? (
                  <Pressable
                    onPress={() => router.replace("/(auth)/welcome")}
                    style={({ pressed }) => [styles.iconCircle, pressed && styles.pressed]}
                    hitSlop={12}
                    accessibilityLabel="Go back"
                  >
                    <Ionicons name="arrow-back" size={22} color="#fff" />
                  </Pressable>
                ) : (
                  <View style={styles.headerSidePlaceholder} />
                )}
              </View>
              <View style={styles.headerCenterSlot}>
                {step === "otp" ? (
                  <Text style={styles.headerTitle} numberOfLines={1}>
                    Verify number
                  </Text>
                ) : null}
              </View>
              <View style={styles.headerSide} />
            </View>
          </View>

          <View
            style={sheetImeOpen ? styles.sheetSpacerCollapsed : styles.sheetSpacer}
          />

          <View
            style={[
              styles.sheet,
              sheetImeOpen && styles.sheetKeyboardOpen,
              sheetImeOpen && styles.sheetFillAboveKeyboard,
              !sheetImeOpen && { maxHeight: sheetMaxHeight },
              {
                paddingBottom: sheetPadApplied,
                marginBottom: sheetImeOpen ? 0 : sheetBottomDock,
              },
            ]}
          >
            <ScrollView
              ref={sheetScrollRef}
              style={[
                styles.sheetScroll,
                sheetImeOpen ? styles.sheetScrollFill : { maxHeight: sheetScrollMaxHeight },
              ]}
              contentContainerStyle={[
                styles.sheetScrollContent,
                /* OTP + keyboard: avoid flexGrow so footer sits just above IME (no empty stretch). */
                sheetImeOpen && step === "phone" && styles.sheetScrollContentKb,
                { paddingBottom: scrollBottomInset },
              ]}
              keyboardShouldPersistTaps="always"
              keyboardDismissMode={step === "otp" ? "none" : "on-drag"}
              showsVerticalScrollIndicator={false}
            >
              {(() => {
                const inner = (
                  <>
              <View
                style={
                  step === "phone" && phoneKeyboardVisible
                    ? styles.sheetWelcomeCompact
                    : styles.sheetWelcome
                }
                accessibilityRole="header"
              >
                {step === "phone" ? (
                  phoneKeyboardVisible ? (
                    <>
                      <View style={styles.sheetLogoRingCompact} accessibilityLabel="GatiMitra">
                        <AppAssetImage
                          assetKey={MX.auth.logo}
                          style={styles.sheetLogoImgCompact}
                          resizeMode="contain"
                        />
                      </View>
                      <Text style={styles.sheetWelcomeCompactTitle}>Welcome back</Text>
                      <Text style={styles.sheetWelcomeCompactHint} numberOfLines={2}>
                        Enter your mobile number — we will text you a code.
                      </Text>
                    </>
                  ) : (
                  <>
                    <View style={styles.sheetLogoRing} accessibilityLabel="GatiMitra">
                      <AppAssetImage
                        assetKey={MX.auth.logo}
                        style={styles.sheetLogoImg}
                        resizeMode="contain"
                      />
                    </View>
                    <View style={styles.sheetWelcomeAccent} />
                    <Text style={styles.sheetWelcomeTitle}>Welcome back</Text>
                    <Text style={styles.sheetWelcomeSubtitle}>
                      Sign in with your registered mobile number to manage orders, menu, and payouts.
                    </Text>
                  </>
                  )
                ) : (
                  <>
                    <View style={styles.sheetWelcomeAccent} />
                    <Text style={styles.sheetWelcomeTitle}>Almost there</Text>
                    <Text style={styles.sheetWelcomeSubtitle}>
                      Enter the code we sent to {maskedPhone}
                    </Text>
                  </>
                )}
              </View>

              <View style={styles.sheetFormArea}>
            {step === "phone" ? (
              <>
                <View style={styles.sheetMethodBlock}>
                  <Text style={styles.sheetLabel}>Sign in with</Text>
                  <View style={styles.segmentRow}>
                    <View style={[styles.segmentCell, styles.segmentCellActive]}>
                      <Ionicons name="phone-portrait-outline" size={18} color="#fff" />
                      <Text style={[styles.segmentText, styles.segmentTextActive]}>Phone</Text>
                    </View>
                    <View style={[styles.segmentCell, styles.segmentCellDisabled]} pointerEvents="none">
                      <Ionicons name="logo-google" size={18} color={GatiMitraMerchant.textTertiary} />
                      <Text style={styles.segmentTextMuted}>Google</Text>
                      <View style={styles.comingSoonBadge}>
                        <Text style={styles.comingSoonBadgeText}>Coming soon</Text>
                      </View>
                    </View>
                  </View>
                </View>

                <View style={styles.sheetInputCluster}>
                  <Text style={styles.fieldLabel}>Mobile number</Text>
                  <Pressable
                    onPress={() => phoneInputRef.current?.focus()}
                    accessibilityLabel="Mobile number, country code India plus nine one"
                    style={({ pressed }) => [
                      styles.phoneFieldShell,
                      styles.phoneFieldUnifiedLook,
                      phoneFieldFocused && styles.phoneFieldUnifiedFocus,
                      pressed && styles.phoneFieldShellPressed,
                    ]}
                  >
                    <View style={styles.phoneEmptyIconWrap} importantForAccessibility="no">
                      <Ionicons name="call-outline" size={20} color={GatiMitraMerchant.primary} />
                    </View>
                    <View style={styles.phoneFieldInner}>
                      <Text style={styles.phonePrefix}>+91</Text>
                      <View style={styles.phonePrefixRule} />
                      <TextInput
                        ref={phoneInputRef}
                        style={styles.phoneInputUnified}
                        placeholder={phone.length === 0 ? "Enter 10-digit number" : ""}
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
                        editable={!loading}
                        selectionColor={GatiMitraMerchant.primary}
                      />
                    </View>
                  </Pressable>

                  {deviceSessionMode && lastExchange ? (
                    <View style={[styles.warnBanner, { marginBottom: 12 }]}>
                      <View style={styles.warnIconWrap}>
                        <Ionicons name="cloud-offline-outline" size={22} color="#B45309" />
                      </View>
                      <View style={styles.warnBody}>
                        <Text style={styles.warnTitle}>Could not start session</Text>
                        <Text style={styles.warnText}>{error}</Text>
                        <Pressable
                          style={[styles.retryBtn, loading && styles.primaryBtnDisabled]}
                          onPress={handleRetryDeviceSession}
                          disabled={loading}
                        >
                          <Ionicons name="refresh" size={18} color="#92400E" />
                          <Text style={styles.retryBtnText}>{loading ? "Trying…" : "Try again"}</Text>
                        </Pressable>
                      </View>
                    </View>
                  ) : error ? (
                    <View style={[styles.errorBanner, { marginBottom: 12 }]}>
                      <Ionicons name="alert-circle-outline" size={20} color={GatiMitraMerchant.error} />
                      <Text style={styles.errorText}>{error}</Text>
                    </View>
                  ) : null}

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
                      <>
                        <Text style={styles.primaryBtnText}>Send OTP</Text>
                        <Ionicons name="arrow-forward" size={20} color="#fff" style={styles.btnIcon} />
                      </>
                    )}
                  </Pressable>
                </View>
              </>
            ) : (
              <View style={[styles.sheetInputCluster, styles.sheetInputClusterOtp]}>
                <Text style={styles.sheetLabel}>Verification</Text>
                <Text style={styles.fieldLabel}>Enter 6-digit code</Text>
                <Pressable
                  onPress={() => otpInputRef.current?.focus()}
                  accessibilityLabel="One-time code, six digits"
                  style={({ pressed }) => [
                    styles.phoneFieldShell,
                    styles.phoneFieldUnifiedLook,
                    otpFieldFocused && styles.phoneFieldUnifiedFocus,
                    pressed && styles.phoneFieldShellPressed,
                  ]}
                >
                  <View style={styles.phoneEmptyIconWrap} importantForAccessibility="no">
                    <Ionicons name="keypad-outline" size={20} color={GatiMitraMerchant.primary} />
                  </View>
                  <TextInput
                    ref={otpInputRef}
                    style={styles.otpInputPlain}
                    placeholder={otp.length === 0 ? "• • • • • •" : ""}
                    placeholderTextColor={GatiMitraMerchant.textTertiary}
                    value={otp}
                    onChangeText={(t) => {
                      clearErrors();
                      setOtp(t.replace(/\D/g, "").slice(0, OTP_LEN));
                    }}
                    onFocus={() => {
                      setOtpFieldFocused(true);
                      scrollPhoneFormIntoView();
                    }}
                    onBlur={() => {
                      setOtpFieldFocused(false);
                      if (otp.length >= OTP_LEN || loading || deviceSessionMode) return;
                      requestAnimationFrame(() => otpInputRef.current?.focus());
                    }}
                    keyboardType="number-pad"
                    maxLength={OTP_LEN}
                    editable={!loading && !deviceSessionMode}
                    textContentType="oneTimeCode"
                    autoComplete="sms-otp"
                    autoCapitalize="none"
                    autoCorrect={false}
                    importantForAutofill="yes"
                    showSoftInputOnFocus
                    blurOnSubmit={false}
                    selectionColor={GatiMitraMerchant.primary}
                  />
                </Pressable>
                <Text style={[styles.helper, otpKeyboardVisible && styles.helperOtpKb]}>
                  {Platform.OS === "ios"
                    ? "Use the code suggestion above the keyboard when available."
                    : "Allow SMS permission to auto-fill, or type the code manually."}
                </Text>

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
                        style={[styles.retryBtn, loading && styles.primaryBtnDisabled]}
                        onPress={handleRetryDeviceSession}
                        disabled={loading}
                      >
                        <Ionicons name="refresh" size={18} color="#92400E" />
                        <Text style={styles.retryBtnText}>{loading ? "Trying…" : "Try again"}</Text>
                      </Pressable>
                    </View>
                  </View>
                ) : error ? (
                  <View style={styles.errorBanner}>
                    <Ionicons name="alert-circle-outline" size={20} color={GatiMitraMerchant.error} />
                    <Text style={styles.errorText}>{error}</Text>
                  </View>
                ) : null}

                <Pressable
                  style={[styles.primaryBtn, loading && styles.primaryBtnDisabled]}
                  onPress={handleVerifyOtp}
                  disabled={loading || deviceSessionMode}
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

                <View style={[styles.otpFooter, otpKeyboardVisible && styles.otpFooterKb]}>
                  <Pressable
                    onPress={handleResendOtp}
                    disabled={resendSeconds > 0 || loading || resending}
                    hitSlop={8}
                  >
                    <Text
                      style={[
                        styles.linkText,
                        (resendSeconds > 0 || loading || resending) && styles.linkMuted,
                      ]}
                    >
                      {resending
                        ? "Sending code…"
                        : resendSeconds > 0
                          ? `Resend in 0:${resendSeconds.toString().padStart(2, "0")}`
                          : "Resend code"}
                    </Text>
                  </Pressable>
                  <Text style={styles.dotSep}>·</Text>
                  <Pressable
                    onPress={() => {
                      setStep("phone");
                      setOtp("");
                      clearErrors();
                      setLastExchange(null);
                    }}
                    disabled={loading}
                  >
                    <Text style={styles.linkText}>Wrong number?</Text>
                  </Pressable>
                </View>
              </View>
            )}
              </View>

              <View
                style={[
                  styles.registerBlock,
                  step === "otp" && otpKeyboardVisible && styles.registerBlockOtpKb,
                ]}
              >
                <Text style={styles.registerMuted}>New partner? </Text>
                <Pressable onPress={() => router.push("/(auth)/signup-webview")} hitSlop={8}>
                  <Text style={styles.registerLink}>Create account</Text>
                </Pressable>
              </View>
                  </>
                );
                return step === "otp" ? (
                  <Pressable
                    style={otpKeyboardVisible ? styles.otpSheetPressableKb : styles.otpSheetPressable}
                    onPress={focusOtpFromSheetTap}
                    accessibilityRole="none"
                  >
                    {inner}
                  </Pressable>
                ) : (
                  inner
                );
              })()}
            </ScrollView>
          </View>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const SHEET_RADIUS = 28;

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: GatiMitraMerchant.navy,
  },
  flex: {
    flex: 1,
  },
  mainColumn: {
    flex: 1,
  },
  topSection: {
    flexShrink: 0,
  },
  /** Fills space above sheet so the card sits on the bottom with a shorter fixed max height. */
  sheetSpacer: {
    flex: 1,
    minHeight: 0,
  },
  /** Phone + keyboard: pull sheet up under header so IME doesn’t cover the field. */
  sheetSpacerCollapsed: {
    height: 0,
    minHeight: 0,
    flexGrow: 0,
    flexShrink: 0,
  },
  sheetScroll: {},
  sheetScrollFill: {
    flex: 1,
    minHeight: 0,
  },
  sheetScrollContent: {
    flexDirection: "column",
  },
  sheetScrollContentKb: {
    flexGrow: 1,
  },
  /** Form body — no flex grow (avoids empty space between primary CTA and footer). */
  sheetFormArea: {
    width: "100%",
  },
  sheetMethodBlock: {
    width: "100%",
    flexShrink: 0,
    paddingBottom: 0,
  },
  /** Phone step: stack from top (avoid huge gap under segment). OTP: optional centering. */
  sheetInputCluster: {
    width: "100%",
    paddingTop: 4,
    paddingBottom: 4,
  },
  sheetInputClusterOtp: {
    width: "100%",
    paddingTop: 8,
    paddingBottom: 4,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: H_PADDING,
    marginBottom: 4,
  },
  headerSide: {
    width: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  headerSidePlaceholder: {
    width: 44,
    height: 44,
  },
  headerCenterSlot: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 44,
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  pressed: {
    opacity: 0.85,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: "#fff",
    letterSpacing: 0.2,
  },
  sheetWelcome: {
    width: "100%",
    alignItems: "center",
    paddingBottom: 12,
  },
  sheetWelcomeCompact: {
    width: "100%",
    alignItems: "center",
    paddingTop: 2,
    paddingBottom: 10,
    marginBottom: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: GatiMitraMerchant.divider,
  },
  sheetWelcomeCompactTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: GatiMitraMerchant.textPrimary,
    textAlign: "center",
    letterSpacing: -0.2,
  },
  sheetWelcomeCompactHint: {
    fontSize: 13,
    lineHeight: 18,
    color: GatiMitraMerchant.textSecondary,
    textAlign: "center",
    marginTop: 4,
    paddingHorizontal: 12,
  },
  sheetLogoRing: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: GatiMitraMerchant.surfaceSubtle,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
  },
  sheetLogoImg: {
    width: 34,
    height: 34,
  },
  sheetLogoRingCompact: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: GatiMitraMerchant.surfaceSubtle,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
  },
  sheetLogoImgCompact: {
    width: 28,
    height: 28,
  },
  sheetWelcomeAccent: {
    width: 36,
    height: 3,
    borderRadius: 2,
    backgroundColor: GatiMitraMerchant.primary,
    marginBottom: 8,
    opacity: 0.9,
  },
  sheetWelcomeTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: GatiMitraMerchant.textPrimary,
    marginBottom: 6,
    textAlign: "center",
    letterSpacing: -0.3,
  },
  sheetWelcomeSubtitle: {
    fontSize: 15,
    lineHeight: 22,
    color: GatiMitraMerchant.textSecondary,
    textAlign: "center",
    maxWidth: 340,
    paddingHorizontal: 4,
  },
  sheet: {
    flexShrink: 0,
    alignSelf: "stretch",
    overflow: "hidden",
    backgroundColor: GatiMitraMerchant.background,
    borderTopLeftRadius: SHEET_RADIUS,
    borderTopRightRadius: SHEET_RADIUS,
    marginTop: 0,
    paddingHorizontal: H_PADDING,
    paddingTop: 8,
    borderTopWidth: 1,
    borderLeftWidth: 0,
    borderRightWidth: 0,
    borderBottomWidth: 0,
    borderColor: "rgba(255,255,255,0.45)",
    ...Platform.select({
      ios: {
        shadowColor: "#0F172A",
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.08,
        shadowRadius: 12,
      },
      android: { elevation: 12 },
      default: {},
    }),
  },
  sheetKeyboardOpen: {
    paddingTop: 6,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
  },
  /** Fills space between header and KeyboardAvoidingView padding (removes blue gap above IME). */
  sheetFillAboveKeyboard: {
    flex: 1,
    minHeight: 0,
    alignSelf: "stretch",
  },
  sheetLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: GatiMitraMerchant.textTertiary,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  segmentRow: {
    flexDirection: "row",
    backgroundColor: GatiMitraMerchant.surfaceSubtle,
    borderRadius: 14,
    padding: 4,
    marginBottom: 14,
    gap: 4,
  },
  segmentCell: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 6,
    borderRadius: 11,
    minHeight: 44,
  },
  segmentCellActive: {
    backgroundColor: GatiMitraMerchant.navy,
    ...GatiMitraMerchant.shadowSm,
  },
  segmentCellDisabled: {
    backgroundColor: GatiMitraMerchant.surfaceWarm,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
  },
  segmentText: {
    fontSize: 15,
    fontWeight: "600",
    color: GatiMitraMerchant.textSecondary,
  },
  segmentTextActive: {
    color: "#fff",
  },
  segmentTextMuted: {
    fontSize: 15,
    fontWeight: "600",
    color: GatiMitraMerchant.textTertiary,
    flexShrink: 1,
  },
  comingSoonBadge: {
    marginLeft: 4,
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 6,
    backgroundColor: GatiMitraMerchant.statusPendingBg,
  },
  comingSoonBadgeText: {
    fontSize: 9,
    fontWeight: "700",
    color: GatiMitraMerchant.statusPending,
    letterSpacing: 0.15,
  },
  fieldLabel: {
    fontSize: 15,
    fontWeight: "800",
    color: GatiMitraMerchant.textPrimary,
    marginBottom: 8,
  },
  phoneFieldShell: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 56,
    borderRadius: 14,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  /** Same look empty / typing / after digits — only border tightens slightly on focus. */
  phoneFieldUnifiedLook: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1.5,
    borderStyle: "solid",
    borderColor: GatiMitraMerchant.border,
  },
  phoneFieldUnifiedFocus: {
    borderColor: GatiMitraMerchant.primary,
    borderWidth: 2,
  },
  phoneFieldShellPressed: {
    opacity: 0.98,
  },
  phoneEmptyIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "rgba(94, 217, 168, 0.14)",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 8,
  },
  phoneFieldInner: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    minHeight: 46,
  },
  phonePrefix: {
    fontSize: 17,
    fontWeight: "800",
    color: GatiMitraMerchant.textPrimary,
    letterSpacing: 0.2,
  },
  phonePrefixRule: {
    width: 1,
    height: 24,
    backgroundColor: GatiMitraMerchant.border,
    marginLeft: 10,
    marginRight: 6,
  },
  phoneInputUnified: {
    flex: 1,
    minHeight: 46,
    paddingHorizontal: 8,
    paddingVertical: Platform.OS === "ios" ? 10 : 8,
    fontSize: 18,
    fontWeight: "600",
    letterSpacing: 0.6,
    color: GatiMitraMerchant.textPrimary,
    backgroundColor: "transparent",
  },
  helper: {
    fontSize: 12,
    color: GatiMitraMerchant.textTertiary,
    marginTop: 8,
    marginBottom: 12,
    lineHeight: 17,
  },
  helperOtpKb: {
    marginTop: 6,
    marginBottom: 6,
  },
  primaryBtn: {
    height: 56,
    borderRadius: 14,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
  },
  primaryBtnDisabled: {
    opacity: 0.65,
  },
  primaryBtnText: {
    fontSize: 17,
    fontWeight: "800",
    color: "#fff",
  },
  btnIcon: {
    marginLeft: 4,
  },
  /** OTP step: tap empty sheet focuses input; flexGrow fills sheet when keyboard closed. */
  otpSheetPressable: {
    flexGrow: 1,
    width: "100%",
  },
  otpSheetPressableKb: {
    flexGrow: 0,
    width: "100%",
  },
  /** Same shell as phone row; single visible numeric field for the 6-digit code. */
  otpInputPlain: {
    flex: 1,
    minHeight: 46,
    paddingHorizontal: 8,
    paddingVertical: Platform.OS === "ios" ? 10 : 8,
    fontSize: 20,
    fontWeight: "700",
    letterSpacing: 10,
    color: GatiMitraMerchant.textPrimary,
    backgroundColor: "transparent",
  },
  otpFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 18,
    gap: 10,
  },
  otpFooterKb: {
    marginTop: 10,
  },
  linkText: {
    fontSize: 15,
    fontWeight: "600",
    color: GatiMitraMerchant.primary,
  },
  linkMuted: {
    color: GatiMitraMerchant.textTertiary,
  },
  dotSep: {
    color: GatiMitraMerchant.textTertiary,
    fontSize: 15,
  },
  warnBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    padding: 14,
    borderRadius: 14,
    backgroundColor: "#FFFBEB",
    borderWidth: 1,
    borderColor: "#FDE68A",
    marginBottom: 16,
  },
  warnIconWrap: {
    marginTop: 2,
  },
  warnBody: {
    flex: 1,
  },
  warnTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: "#92400E",
    marginBottom: 4,
  },
  warnText: {
    fontSize: 13,
    lineHeight: 19,
    color: "#A16207",
    marginBottom: 12,
  },
  retryBtn: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: "#FEF3C7",
    borderWidth: 1,
    borderColor: "#FCD34D",
  },
  retryBtnText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#92400E",
  },
  errorBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    padding: 14,
    borderRadius: 14,
    backgroundColor: "#FEF2F2",
    borderWidth: 1,
    borderColor: "#FECACA",
    marginBottom: 16,
  },
  errorText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
    color: "#B91C1C",
    fontWeight: "500",
  },
  registerBlock: {
    flexShrink: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 12,
    paddingBottom: 4,
    marginTop: 4,
    borderTopWidth: 1,
    borderTopColor: GatiMitraMerchant.divider,
  },
  registerBlockOtpKb: {
    paddingTop: 6,
    paddingBottom: 2,
    marginTop: 2,
  },
  registerMuted: {
    fontSize: 14,
    color: GatiMitraMerchant.textSecondary,
  },
  registerLink: {
    fontSize: 14,
    fontWeight: "700",
    color: GatiMitraMerchant.primary,
  },
});
