/**
 * Partner login — lite mobile-number entry (BHIM-style) + OTP verify.
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
  Linking,
  Modal,
  Dimensions,
  Platform,
  ScrollView,
  BackHandler,
  InteractionManager,
  useWindowDimensions,
  type KeyboardEvent,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { StatusBar } from "expo-status-bar";
import Svg, { Path } from "react-native-svg";
import { useAuth, type PartnerData } from "@/context/AuthContext";
import {
  merchantAuthService,
  isMerchantAuthError,
} from "@/services/auth.service";
import { getOrCreateMerchantDeviceId } from "@/lib/merchantDeviceId";
import { GatiMitraMerchant, SAFE_AREA_TOP_MIN } from "@/constants/theme";
import { getPartnerLegalUrls } from "@/lib/partnerLegalUrls";

const OTP_LEN = 6;
const legalUrls = getPartnerLegalUrls();
const LORA_BOLD = "Lora_700Bold";
const POPPINS_BOLD = "Poppins_700Bold";
/** CIBIL-style asymmetric top cut: high left plateau → soft step-down on the right. */
const OTP_WAVE_H = 56;
const OTP_WAVE_LOW_Y = 34;

function OtpSheetWaveCut({ width }: { width: number }) {
  const w = Math.max(320, width);
  const low = OTP_WAVE_LOW_Y;
  const path = [
    `M 0 ${OTP_WAVE_H}`,
    `L 0 10`,
    `Q 0 0 12 0`,
    `L ${w * 0.52} 0`,
    `C ${w * 0.62} 0 ${w * 0.64} ${low} ${w * 0.74} ${low}`,
    `L ${w} ${low}`,
    `L ${w} ${OTP_WAVE_H}`,
    "Z",
  ].join(" ");

  return (
    <Svg width={w} height={OTP_WAVE_H} style={styles.otpWave} pointerEvents="none">
      <Path d={path} fill="#FFFFFF" />
    </Svg>
  );
}

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

export default function LoginScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
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
  const [otpKeyboardLift, setOtpKeyboardLift] = useState(0);
  const lastKeyboardLiftRef = useRef(0);
  const autoVerifiedOtpRef = useRef("");

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

  useAndroidSmsOtp(step, setOtp);

  useEffect(() => {
    if (step !== "phone") {
      setPhoneKeyboardVisible(false);
      return;
    }
    const showEvt = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvt = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const subShow = Keyboard.addListener(showEvt, (event: KeyboardEvent) => {
      setPhoneKeyboardVisible(true);
      const windowHeight = Dimensions.get("window").height;
      lastKeyboardLiftRef.current = Math.max(
        0,
        windowHeight - Math.round(event.endCoordinates.screenY)
      );
    });
    const subHide = Keyboard.addListener(hideEvt, () => {
      setPhoneKeyboardVisible(false);
      lastKeyboardLiftRef.current = 0;
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

  useEffect(() => {
    if (step !== "otp") {
      setOtpKeyboardVisible(false);
      setOtpKeyboardLift(0);
      return;
    }
    setOtpKeyboardLift(lastKeyboardLiftRef.current);
    const showEvt = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvt = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const subShow = Keyboard.addListener(showEvt, (event: KeyboardEvent) => {
      setOtpKeyboardVisible(true);
      const windowHeight = Dimensions.get("window").height;
      const keyboardTop = Math.round(event.endCoordinates.screenY);
      const lift = Math.max(0, windowHeight - keyboardTop);
      lastKeyboardLiftRef.current = lift;
      setOtpKeyboardLift(lift);
    });
    const subHide = Keyboard.addListener(hideEvt, () => {
      setOtpKeyboardVisible(false);
      lastKeyboardLiftRef.current = 0;
      setOtpKeyboardLift(0);
    });
    return () => {
      subShow.remove();
      subHide.remove();
    };
  }, [step]);

  useEffect(() => {
    if (step !== "otp" || !otpKeyboardVisible) return;
    scrollPhoneFormIntoView();
  }, [step, otpKeyboardVisible, scrollPhoneFormIntoView]);

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

  useEffect(() => {
    if (step !== "otp") return;
    const hideEvt = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const sub = Keyboard.addListener(hideEvt, () => {
      if (otp.length >= OTP_LEN || loading || deviceSessionMode) return;
      setTimeout(() => otpInputRef.current?.focus(), 40);
    });
    return () => sub.remove();
  }, [step, otp.length, loading, deviceSessionMode]);

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

  useEffect(() => {
    if (step !== "otp" || otp.length !== OTP_LEN || loading || deviceSessionMode) {
      if (otp.length !== OTP_LEN) autoVerifiedOtpRef.current = "";
      return;
    }
    if (autoVerifiedOtpRef.current === otp) return;
    autoVerifiedOtpRef.current = otp;
    void handleVerifyOtp();
  }, [step, otp, loading, deviceSessionMode]);

  const handleCancelOtp = () => {
    setStep("phone");
    setOtp("");
    clearErrors();
    setLastExchange(null);
  };

  useEffect(() => {
    if (step !== "otp") return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      handleCancelOtp();
      return true;
    });
    return () => sub.remove();
  }, [step]);

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
  const otpReady = otp.length === OTP_LEN;
  const resendMins = Math.floor(resendSeconds / 60);
  const resendSecs = resendSeconds % 60;
  const phoneDigits = phone.replace(/\D/g, "").slice(-10);
  const otpSentMask =
    phoneDigits.length === 10 ? `${phoneDigits.slice(0, 5)}****` : maskedPhone;

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

      <Modal
        visible={step === "otp"}
        transparent
        animationType="slide"
        onRequestClose={handleCancelOtp}
        statusBarTranslucent
      >
        <View style={styles.otpModalRoot}>
          <Pressable style={styles.otpDim} onPress={handleCancelOtp} accessibilityLabel="Dismiss" />
          <View style={[styles.otpSheetWrap, { marginBottom: otpKeyboardLift }]}>
            <View style={styles.otpSheetOuter} pointerEvents="box-none">
              <OtpSheetWaveCut width={windowWidth} />
              <Pressable
                style={[styles.otpSheet, { paddingBottom: Math.max(insets.bottom, 12) }]}
                onPress={focusOtpFromSheetTap}
                accessibilityRole="none"
              >
                <Text style={styles.otpSheetTitle}>Verify OTP</Text>
                <Text style={styles.otpSheetSub}>
                  The One Time Password is sent to {otpSentMask}. Please enter the One Time
                  Password.
                </Text>

                <Pressable
                  style={styles.otpBoxesRow}
                  onPress={() => otpInputRef.current?.focus()}
                  accessibilityLabel="One-time code, six digits"
                >
                  {Array.from({ length: OTP_LEN }).map((_, index) => {
                    const digit = otp[index] ?? "";
                    const active = otpFieldFocused && index === Math.min(otp.length, OTP_LEN - 1);
                    return (
                      <View key={index} style={styles.otpBox}>
                        <Text style={styles.otpDigit}>{digit || (active ? "" : "-")}</Text>
                        <View style={[styles.otpUnderline, active && styles.otpUnderlineActive]} />
                        {active && !digit ? <View style={styles.otpCaret} /> : null}
                      </View>
                    );
                  })}
                  <TextInput
                    ref={otpInputRef}
                    style={styles.otpHiddenInput}
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
                    caretHidden
                    selectionColor={GatiMitraMerchant.primary}
                  />
                </Pressable>

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
                ) : error ? (
                  <View style={styles.errorBanner}>
                    <Ionicons name="alert-circle-outline" size={20} color={GatiMitraMerchant.error} />
                    <Text style={styles.errorText}>{error}</Text>
                  </View>
                ) : null}

                <View style={styles.otpActionsRow}>
                  <Pressable
                    style={({ pressed }) => [
                      styles.otpCancelBtn,
                      pressed && styles.pressed,
                      loading && styles.btnDisabled,
                    ]}
                    onPress={handleCancelOtp}
                    disabled={loading}
                  >
                    <Text style={styles.otpCancelText}>Cancel</Text>
                  </Pressable>
                  <Pressable
                    style={[
                      styles.otpVerifyBtn,
                      otpReady && !loading && !deviceSessionMode
                        ? styles.otpVerifyBtnReady
                        : styles.otpVerifyBtnIdle,
                      (loading || deviceSessionMode) && styles.btnDisabled,
                    ]}
                    onPress={handleVerifyOtp}
                    disabled={loading || deviceSessionMode || !otpReady}
                  >
                    {loading ? (
                      <ActivityIndicator color="#fff" size="small" />
                    ) : (
                      <Text style={styles.otpVerifyText}>Verify OTP</Text>
                    )}
                  </Pressable>
                </View>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
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
  otpModalRoot: {
    flex: 1,
    justifyContent: "flex-end",
  },
  otpDim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(15, 23, 42, 0.45)",
  },
  otpSheetWrap: {
    width: "100%",
  },
  otpSheetOuter: {
    width: "100%",
  },
  otpWave: {
    alignSelf: "stretch",
  },
  otpSheet: {
    backgroundColor: "#FFFFFF",
    marginTop: -(OTP_WAVE_H - OTP_WAVE_LOW_Y),
    paddingHorizontal: 20,
    paddingTop: 10,
  },
  otpSheetTitle: {
    fontFamily: LORA_BOLD,
    fontSize: 18,
    color: GatiMitraMerchant.textPrimary,
    marginTop: -(OTP_WAVE_LOW_Y - 14),
    marginBottom: 8,
  },
  otpSheetSub: {
    fontFamily: LORA_BOLD,
    fontSize: 12,
    lineHeight: 17,
    color: GatiMitraMerchant.textSecondary,
    marginBottom: 14,
  },
  otpBoxesRow: {
    position: "relative",
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8,
    marginBottom: 10,
  },
  otpBox: {
    flex: 1,
    height: 40,
    alignItems: "center",
    justifyContent: "flex-end",
    paddingBottom: 6,
  },
  otpDigit: {
    fontFamily: POPPINS_BOLD,
    fontSize: 22,
    color: GatiMitraMerchant.textPrimary,
    minHeight: 26,
    textAlign: "center",
  },
  otpUnderline: {
    width: "100%",
    height: 1.5,
    borderRadius: 1,
    backgroundColor: "#94A3B8",
  },
  otpUnderlineActive: {
    backgroundColor: GatiMitraMerchant.primary,
  },
  otpCaret: {
    position: "absolute",
    bottom: 10,
    width: 2,
    height: 20,
    backgroundColor: GatiMitraMerchant.textPrimary,
  },
  otpHiddenInput: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.02,
    color: "transparent",
  },
  otpResendRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
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
  otpActionsRow: {
    flexDirection: "row",
    gap: 12,
    marginTop: 2,
  },
  otpCancelBtn: {
    flex: 1,
    height: 46,
    borderRadius: 23,
    borderWidth: 1.5,
    borderColor: "#0F172A",
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  otpCancelText: {
    fontFamily: LORA_BOLD,
    fontSize: 15,
    color: "#0F172A",
  },
  otpVerifyBtn: {
    flex: 1,
    height: 46,
    borderRadius: 23,
    alignItems: "center",
    justifyContent: "center",
  },
  otpVerifyBtnIdle: {
    backgroundColor: "#94A3B8",
  },
  otpVerifyBtnReady: {
    backgroundColor: GatiMitraMerchant.primary,
  },
  otpVerifyText: {
    fontFamily: LORA_BOLD,
    fontSize: 15,
    color: "#FFFFFF",
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
