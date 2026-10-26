/**
 * OTP verification – splash-teal layout matching login screen (no wave).
 * Same dark inputs, apple-orange CTA, Lora typography.
 */

import { useState, useRef, useEffect, useCallback } from "react";
import { AppText } from "@/components/AppText";
import {
  View,
  TouchableOpacity,
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  ScrollView,
  Pressable,
  useWindowDimensions,
  AppState,
  type AppStateStatus,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import {
  extractSixDigitCode,
  armSmsOtpCapture,
  startAndroidSmsOtpListener,
  subscribePendingSmsOtp,
  takePendingSmsOtp,
} from "@/lib/androidSmsOtpRetriever";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { authService } from "@/services/auth.service";
import { profileService } from "@/services/profile.service";
import { writeCachedProfile } from "@/lib/profileCache";
import { syncConsentFromProfile } from "@/lib/legal-consent";
import { useAuthStore } from "@/store/authStore";
import { getDeviceIdAsync } from "@/utils/deviceId";
import { OTP_LENGTH } from "@/constants";
import { GatiMitraColors } from "@/constants/gatimitra";
import { StoreFonts } from "@/constants/storeTypography";
import { useKeyboardBottomInset } from "@/hooks/useKeyboardBottomInset";
import { OtpCodeInputs } from "@/components/OtpCodeInputs";
import {
  OTP_BOXES,
  emptyOtpCells,
  otpCellsComplete,
  otpCellsFromCode,
  otpCellsToCode,
} from "@/lib/otpDigitEdit";

const BG_SPLASH = GatiMitraColors.splashMint;
const TITLE_DARK = "#111827";
const APPLE_ORANGE = "#FF9500";
const CONTROL_RADIUS = 10;
const BTN_ACTIVE_TEXT = "#111827";
const SUBTEXT_DARK_BLUE = "#1E3A8A";
const FOOTER_DARK = "#020617";

export default function OtpScreen() {
  const insets = useSafeAreaInsets();
  const { width: screenW, height: screenH } = useWindowDimensions();
  const compact = screenH < 700 || screenW < 360;
  const padH = Math.max(16, Math.min(32, Math.round(screenW * 0.07)));
  const titleSize = compact ? 26 : screenW < 400 ? 28 : 32;
  const router = useRouter();
  const params = useLocalSearchParams<{ phoneE164: string }>();
  const phoneE164 = params.phoneE164 ?? "";

  const [cells, setCells] = useState<string[]>(() => emptyOtpCells());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [resendSeconds, setResendSeconds] = useState(60);
  const [resending, setResending] = useState(false);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const keyboardVisibleRef = useRef(false);
  const cellsRef = useRef(cells);
  cellsRef.current = cells;
  const appliedAutoCodeRef = useRef<string | null>(null);
  const lastAutoSubmittedCodeRef = useRef<string | null>(null);
  const keyboardInset = useKeyboardBottomInset();
  const otpComplete = otpCellsComplete(cells);
  const otpCode = otpCellsToCode(cells);

  const applyAutoCode = useCallback((code: string, _source?: "sms" | "clipboard" | "keyboard") => {
    const cleaned = extractSixDigitCode(code) ?? code.replace(/\D/g, "").slice(0, OTP_BOXES);
    if (cleaned.length !== OTP_BOXES) return;
    if (appliedAutoCodeRef.current === cleaned) return;
    if (otpCellsToCode(cellsRef.current) === cleaned && otpCellsComplete(cellsRef.current)) return;
    appliedAutoCodeRef.current = cleaned;
    setCells(otpCellsFromCode(cleaned));
    setActiveIndex(OTP_BOXES - 1);
    setError("");
  }, []);

  const timerActive = resendSeconds > 0;
  useEffect(() => {
    if (!timerActive) return;
    const id = setInterval(() => {
      setResendSeconds((s) => (s <= 1 ? 0 : s - 1));
    }, 1000);
    return () => clearInterval(id);
  }, [timerActive]);

  useEffect(() => {
    const showEvt = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvt = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const onShow = Keyboard.addListener(showEvt, () => {
      keyboardVisibleRef.current = true;
      setKeyboardVisible(true);
    });
    const onHide = Keyboard.addListener(hideEvt, () => {
      keyboardVisibleRef.current = false;
      setKeyboardVisible(false);
    });
    return () => {
      onShow.remove();
      onHide.remove();
    };
  }, []);

  const goToLogin = () => router.replace("/(auth)/login");

  useEffect(() => {
    const pending = takePendingSmsOtp();
    if (pending) applyAutoCode(pending, "sms");
    const unsub = subscribePendingSmsOtp((code) => applyAutoCode(code, "sms"));
    return () => unsub();
  }, [applyAutoCode]);

  const setSession = useAuthStore((s) => s.setSession);
  const verifyInFlightRef = useRef(false);
  const screenMountedRef = useRef(true);

  useEffect(() => {
    screenMountedRef.current = true;
    return () => {
      screenMountedRef.current = false;
    };
  }, []);

  const handleResend = async () => {
    if (resendSeconds > 0 || resending) return;
    setError("");
    setResending(true);
    try {
      await authService.sendOtp({ phoneE164 });
      void armSmsOtpCapture();
      lastAutoSubmittedCodeRef.current = null;
      setResendSeconds(60);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Could not resend OTP.";
      setError(msg);
    } finally {
      setResending(false);
    }
  };

  const handleVerify = useCallback(async (otpArg?: string) => {
    const otpToVerify = otpArg ?? otpCellsToCode(cellsRef.current);
    if (!otpArg && !otpCellsComplete(cellsRef.current)) {
      setError("Enter 6-digit OTP");
      return;
    }
    if (otpToVerify.length !== OTP_LENGTH) {
      setError("Enter 6-digit OTP");
      return;
    }
    if (verifyInFlightRef.current) return;
    verifyInFlightRef.current = true;
    setError("");
    setLoading(true);
    try {
      const deviceId = await getDeviceIdAsync();
      const session = await authService.verifyOtp({
        phoneE164,
        otp: otpToVerify,
        deviceId,
      });
      Keyboard.dismiss();
      await setSession(session);
      try {
        const profile = await profileService.getProfile();
        await writeCachedProfile(profile);
        await syncConsentFromProfile(profile);
        if (profile?.profile_completed === true) {
          router.replace("/(tabs)/");
          return;
        }
      } catch (e: unknown) {
        const ax = e as { response?: { status?: number; data?: { error?: string } } };
        if (
          ax?.response?.status === 401 &&
          (ax?.response?.data?.error === "user_deleted" ||
            ax?.response?.data?.error === "session_revoked")
        ) {
          return;
        }
      }
      try {
        router.replace("/(onboarding)");
      } catch (navErr) {
        console.warn("[otp] navigate after verify failed", navErr);
      }
    } catch (e: unknown) {
      const msg =
        e instanceof Error
          ? e.message
          : e && typeof e === "object" && "response" in e
            ? (e as { response?: { data?: { message?: string } } }).response?.data?.message
            : null;
      if (screenMountedRef.current) {
        setError(msg || "Invalid OTP. Try again.");
      }
      verifyInFlightRef.current = false;
    } finally {
      if (screenMountedRef.current) {
        setLoading(false);
      }
    }
  }, [phoneE164, router, setSession]);

  /** 1) Android SMS Retriever (prod / custom builds — no permission). */
  useEffect(() => {
    if (Platform.OS !== "android") return;
    let unmounted = false;
    let listener: { stop: () => void } | null = null;

    void startAndroidSmsOtpListener({
      onCode: (code) => {
        if (unmounted) return;
        applyAutoCode(code, "sms");
      },
    }).then((active) => {
      if (unmounted) {
        active?.stop();
        return;
      }
      listener = active;
    });

    return () => {
      unmounted = true;
      listener?.stop();
    };
  }, [applyAutoCode]);

  /** 2) Clipboard paste detect (Expo Go + production). */
  useEffect(() => {
    let cancelled = false;
    const startedAt = Date.now();
    const seen = new Set<string>();

    const tryClipboard = async () => {
      if (cancelled) return;
      if (Date.now() - startedAt > 90_000) return;
      if (otpCellsComplete(cellsRef.current)) return;
      try {
        const text = await Clipboard.getStringAsync();
        const code = extractSixDigitCode(text ?? "");
        if (!code || seen.has(code)) return;
        seen.add(code);
        applyAutoCode(code, "clipboard");
      } catch {
        /* clipboard unavailable */
      }
    };

    void tryClipboard();
    const interval = setInterval(() => void tryClipboard(), 800);

    const onAppState = (state: AppStateStatus) => {
      if (state !== "active") return;
      void tryClipboard();
    };
    const sub = AppState.addEventListener("change", onAppState);

    let clipSub: { remove: () => void } | null = null;
    try {
      const addListener = (
        Clipboard as unknown as {
          addClipboardListener?: (listener: () => void) => { remove: () => void };
        }
      ).addClipboardListener;
      if (typeof addListener === "function") {
        clipSub = addListener(() => {
          void tryClipboard();
        });
      }
    } catch {
      /* older expo-clipboard */
    }

    return () => {
      cancelled = true;
      clearInterval(interval);
      sub.remove();
      clipSub?.remove();
    };
  }, [applyAutoCode]);

  useEffect(() => {
    if (!otpComplete) return;
    if (lastAutoSubmittedCodeRef.current === otpCode) return;
    lastAutoSubmittedCodeRef.current = otpCode;
    void handleVerify(otpCode);
  }, [otpComplete, otpCode, handleVerify]);

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <StatusBar style="dark" translucent backgroundColor="transparent" />

      <View style={[styles.flex, keyboardInset > 0 ? { paddingBottom: keyboardInset } : null]}>
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={[
            styles.scrollContent,
            {
              paddingTop: Math.max(insets.top, 12) + (compact ? 24 : 40),
              paddingHorizontal: padH,
              paddingBottom: 16,
            },
          ]}
          keyboardShouldPersistTaps="always"
          keyboardDismissMode="none"
          showsVerticalScrollIndicator={false}
          bounces={false}
          scrollEnabled={compact}
        >
          <View style={[styles.mainBlock, compact && styles.mainBlockCompact]}>
            <View style={styles.brandCenter}>
              <AppText style={styles.brandWord} bold>
                GatiMitra
              </AppText>
              <AppText style={styles.brandTagline} bold>
                MOVING PEOPLE CLOSER
              </AppText>
            </View>
            <AppText style={[styles.title, { fontSize: titleSize, lineHeight: titleSize + 8 }]} bold>
              Verify OTP
            </AppText>
            <AppText style={styles.subtitle} bold>
              Code sent to <AppText style={styles.phoneHighlight} bold>{phoneE164}</AppText>
            </AppText>

            <View style={styles.fieldWrap}>
              <AppText style={styles.label} bold>
                Enter 6-digit code
              </AppText>
              <OtpCodeInputs
                cells={cells}
                activeIndex={activeIndex}
                editable={!loading}
                onCellsChange={(next) => {
                  setCells(next);
                  if (error) setError("");
                }}
                onActiveIndexChange={setActiveIndex}
              />
              {error ? <AppText style={styles.errorText}>{error}</AppText> : null}
              <View style={styles.helperRow}>
                <TouchableOpacity
                  disabled={resendSeconds > 0 || loading || resending}
                  onPress={handleResend}
                  activeOpacity={0.7}
                  style={styles.helperLinkRow}
                >
                  <Ionicons
                    name="refresh"
                    size={16}
                    color={TITLE_DARK}
                    style={
                      resendSeconds > 0 || loading || resending
                        ? styles.helperIconDisabled
                        : undefined
                    }
                  />
                  <AppText
                    style={[
                      styles.helperLink,
                      (resendSeconds > 0 || loading || resending) && styles.helperLinkDisabled,
                    ]}
                    bold
                  >
                    {resending
                      ? "Sending…"
                      : resendSeconds > 0
                        ? `Resend OTP in 0:${resendSeconds.toString().padStart(2, "0")}`
                        : "Resend OTP"}
                  </AppText>
                </TouchableOpacity>
              </View>
            </View>

            <TouchableOpacity
              onPress={() => handleVerify()}
              disabled={loading || !otpComplete}
              activeOpacity={0.88}
              style={[
                styles.button,
                otpComplete && !loading ? styles.buttonActive : styles.buttonDisabled,
              ]}
            >
              {loading ? (
                <ActivityIndicator color={BTN_ACTIVE_TEXT} />
              ) : (
                <AppText
                  style={[
                    styles.buttonText,
                    otpComplete ? styles.buttonTextActive : styles.buttonTextDisabled,
                  ]}
                  bold
                >
                  Verify & Continue
                </AppText>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              onPress={goToLogin}
              style={styles.changeNumber}
              disabled={loading}
              activeOpacity={0.7}
            >
              <AppText style={styles.changeNumberText} bold>
                Change mobile number
              </AppText>
            </TouchableOpacity>
          </View>
        </ScrollView>

        <View
          style={[
            styles.footerDock,
            {
              paddingBottom:
                keyboardVisible || keyboardInset > 0
                  ? 8
                  : Math.max(insets.bottom, 16) + 8,
            },
          ]}
        >
          <View style={styles.footerRuleRow}>
            <View style={styles.footerRule} />
            <AppText style={styles.footerLine} bold>
              By verifying you accept our
            </AppText>
            <View style={styles.footerRule} />
          </View>
          <Pressable
            onPress={() => router.push("/legal/privacy-policy" as never)}
            hitSlop={8}
            accessibilityRole="link"
          >
            <AppText style={styles.footerLink} bold>
              Privacy policy
            </AppText>
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: BG_SPLASH,
  },
  flex: { flex: 1 },
  brandCenter: {
    alignItems: "center",
    marginBottom: 28,
  },
  brandWord: {
    fontSize: 42,
    fontFamily: StoreFonts.loraBold,
    color: "#0E2A26",
    letterSpacing: 0.4,
    textAlign: "center",
  },
  brandTagline: {
    marginTop: 5,
    fontSize: 9,
    fontFamily: StoreFonts.loraBold,
    color: "#3F5B57",
    letterSpacing: 2.4,
    textAlign: "center",
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: "flex-start",
    paddingHorizontal: 28,
  },
  mainBlock: {
    width: "100%",
    maxWidth: 400,
    alignSelf: "center",
    alignItems: "center",
    flexGrow: 0,
    justifyContent: "flex-start",
    paddingTop: 0,
  },
  mainBlockCompact: {
    paddingTop: 0,
  },
  title: {
    fontSize: 32,
    fontWeight: "800",
    color: TITLE_DARK,
    textAlign: "center",
    lineHeight: 40,
    letterSpacing: 0.2,
    marginBottom: 12,
  },
  subtitle: {
    fontSize: 14,
    fontWeight: "700",
    color: SUBTEXT_DARK_BLUE,
    textAlign: "center",
    lineHeight: 21,
    marginBottom: 32,
    paddingHorizontal: 8,
  },
  phoneHighlight: {
    fontWeight: "800",
    color: TITLE_DARK,
    fontFamily: StoreFonts.poppinsBold,
  },
  fieldWrap: {
    width: "100%",
    marginBottom: 20,
  },
  label: {
    fontSize: 15,
    fontWeight: "700",
    color: TITLE_DARK,
    marginBottom: 14,
    textAlign: "center",
  },
  errorText: {
    fontSize: 14,
    color: "#7F1D1D",
    marginTop: 10,
    textAlign: "center",
    fontWeight: "700",
  },
  helperRow: {
    marginTop: 14,
    alignItems: "center",
    width: "100%",
  },
  helperLinkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  helperLink: {
    fontSize: 14,
    color: TITLE_DARK,
    fontWeight: "700",
  },
  helperLinkDisabled: {
    opacity: 0.55,
  },
  helperIconDisabled: {
    opacity: 0.55,
  },
  button: {
    width: "100%",
    minHeight: 56,
    borderRadius: CONTROL_RADIUS,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
    paddingHorizontal: 12,
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
  changeNumber: {
    marginTop: 10,
    paddingVertical: 4,
    paddingHorizontal: 12,
  },
  changeNumberText: {
    fontSize: 15,
    fontWeight: "700",
    color: TITLE_DARK,
    textAlign: "center",
    textDecorationLine: "underline",
  },
  footerDock: {
    alignItems: "center",
    paddingHorizontal: 28,
    paddingTop: 8,
    backgroundColor: BG_SPLASH,
  },
  footerRuleRow: {
    flexDirection: "row",
    alignItems: "center",
    width: "100%",
    gap: 10,
    marginBottom: 6,
  },
  footerRule: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: "rgba(2,6,23,0.45)",
  },
  footerLine: {
    fontSize: 12,
    fontWeight: "700",
    color: FOOTER_DARK,
    textAlign: "center",
  },
  footerLink: {
    fontSize: 13,
    fontWeight: "800",
    color: FOOTER_DARK,
    textAlign: "center",
  },
});
