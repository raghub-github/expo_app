/**
 * OTP verification – splash-teal layout matching login screen.
 * Same dark inputs, apple-orange CTA, Lora typography.
 */

import { useState, useRef, useEffect, useCallback } from "react";
import { AppText } from "@/components/AppText";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Keyboard,
  Platform,
  StyleSheet,
  ScrollView,
  Pressable,
  Dimensions,
  AppState,
  type AppStateStatus,
} from "react-native";
import Svg, { Path } from "react-native-svg";
import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import {
  extractSixDigitCode,
  startAndroidSmsOtpListener,
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

const BG_SPLASH = GatiMitraColors.splashMint;
const DARK_SURFACE = "#1A1C1E";
const TITLE_DARK = "#111827";
const TEXT_ON_TEAL = "#FFFFFF";
const BRAND_YELLOW = "#F5C518";
const APPLE_ORANGE = "#FF9500";
const PLACEHOLDER_GRAY = "#9CA3AF";
const CONTROL_RADIUS = 10;
const BTN_ACTIVE_TEXT = "#111827";
const SUBTEXT_DARK_BLUE = "#1E3A8A";
const FOOTER_DARK = "#020617";

const { width: SCREEN_W } = Dimensions.get("window");
const WAVE_W = Math.round(SCREEN_W * 0.64);
const WAVE_H = 112;

function ReferenceWaveHeader({ width, height }: { width: number; height: number }) {
  const w = width;
  const h = height;
  const leftEdgeY = h * 0.9 - 3;
  const d = [
    `M0 0`,
    `H${w}`,
    `V${h * 0.02}`,
    `C${w * 0.985} ${h * 0.03} ${w * 0.95} ${h * 0.05} ${w * 0.88} ${h * 0.12}`,
    `C${w * 0.78} ${h * 0.24} ${w * 0.66} ${h * 0.42} ${w * 0.5} ${h * 0.62}`,
    `C${w * 0.36} ${h * 0.78} ${w * 0.2} ${h * 0.92} ${w * 0.08} ${h * 0.96}`,
    `C${w * 0.03} ${h * 0.98} ${w * 0.01} ${h * 0.96} 0 ${leftEdgeY}`,
    `L0 0`,
    `Z`,
  ].join(" ");
  return (
    <Svg
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      style={StyleSheet.absoluteFill}
      pointerEvents="none"
    >
      <Path d={d} fill={DARK_SURFACE} />
    </Svg>
  );
}

export default function OtpScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ phoneE164: string }>();
  const phoneE164 = params.phoneE164 ?? "";

  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [focusedIndex, setFocusedIndex] = useState<number | null>(0);
  const focusedIndexRef = useRef(0);
  const [resendSeconds, setResendSeconds] = useState(60);
  const [resending, setResending] = useState(false);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const inputRef = useRef<TextInput>(null);
  const scrollRef = useRef<ScrollView>(null);
  const inputFocusedRef = useRef(false);
  const keyboardVisibleRef = useRef(false);
  const otpRef = useRef(otp);
  otpRef.current = otp;
  const digits = otp.split("").concat(Array(OTP_LENGTH).fill("")).slice(0, OTP_LENGTH);
  const appliedAutoCodeRef = useRef<string | null>(null);

  const waveH = WAVE_H + Math.max(insets.top, 0);
  const logoBlockHeight = waveH + 4;

  const applyAutoCode = useCallback((code: string, _source?: "sms" | "clipboard" | "keyboard") => {
    const cleaned = extractSixDigitCode(code) ?? code.replace(/\D/g, "").slice(0, OTP_LENGTH);
    if (cleaned.length !== OTP_LENGTH) return;
    if (appliedAutoCodeRef.current === cleaned) return;
    if (otpRef.current.length === OTP_LENGTH && otpRef.current === cleaned) return;
    appliedAutoCodeRef.current = cleaned;
    setOtp(cleaned);
    setError("");
    focusedIndexRef.current = OTP_LENGTH - 1;
    setFocusedIndex(OTP_LENGTH - 1);
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
      if (inputFocusedRef.current) {
        inputRef.current?.blur();
      }
    });
    return () => {
      onShow.remove();
      onHide.remove();
    };
  }, []);

  /** Place caret / select digit so that box can be edited, cleared, or replaced. */
  const selectBoxAt = useCallback((boxIndex: number) => {
    const input = inputRef.current;
    if (!input) return;
    const len = otpRef.current.length;
    const i = Math.max(0, Math.min(boxIndex, OTP_LENGTH - 1));
    if (i < len) {
      // Select existing digit so next key replaces it; backspace clears it.
      input.setNativeProps({ selection: { start: i, end: i + 1 } });
    } else {
      input.setNativeProps({ selection: { start: len, end: len } });
    }
  }, []);

  const focusOtpInput = useCallback(
    (boxIndex: number) => {
      if (loading) return;
      const clamped = Math.max(0, Math.min(boxIndex, OTP_LENGTH - 1));
      focusedIndexRef.current = clamped;
      setFocusedIndex(clamped);

      const input = inputRef.current;
      if (!input) return;

      const doFocus = () => {
        input.focus();
        requestAnimationFrame(() => selectBoxAt(clamped));
      };

      if (inputFocusedRef.current && !keyboardVisibleRef.current) {
        input.blur();
        requestAnimationFrame(() => {
          requestAnimationFrame(doFocus);
        });
        return;
      }

      if (inputFocusedRef.current && keyboardVisibleRef.current) {
        selectBoxAt(clamped);
        return;
      }

      doFocus();
    },
    [loading, selectBoxAt]
  );

  const goToLogin = () => router.replace("/(auth)/login");

  const setSession = useAuthStore((s) => s.setSession);
  const verifyInFlightRef = useRef(false);

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

  const handleVerify = useCallback(async (otpArg?: string) => {
    const otpToVerify = otpArg ?? otpRef.current;
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
      await authService.clearSession();
      const session = await authService.verifyOtp({
        phoneE164,
        otp: otpToVerify,
        deviceId,
      });
      await setSession(session);
      try {
        const profile = await profileService.getProfile();
        await writeCachedProfile(profile);
        await syncConsentFromProfile(profile);
        if (profile?.profile_completed === true) {
          router.replace("/(tabs)/");
          return;
        }
        router.replace("/(onboarding)");
        return;
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
      // No usable profile yet (new user / incomplete) → create profile flow.
      router.replace("/(onboarding)");
    } catch (e: unknown) {
      const msg =
        e instanceof Error
          ? e.message
          : e && typeof e === "object" && "response" in e
            ? (e as { response?: { data?: { message?: string } } }).response?.data?.message
            : null;
      setError(msg || "Invalid OTP. Try again.");
      verifyInFlightRef.current = false;
    } finally {
      setLoading(false);
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
      if (otpRef.current.length === OTP_LENGTH) return;
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
    const interval = setInterval(() => void tryClipboard(), 2000);

    const onAppState = (state: AppStateStatus) => {
      if (state === "active") void tryClipboard();
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

  const autoSubmittedRef = useRef(false);
  useEffect(() => {
    if (otp.length !== OTP_LENGTH) {
      autoSubmittedRef.current = false;
      return;
    }
    if (autoSubmittedRef.current || loading) return;
    autoSubmittedRef.current = true;
    void handleVerify(otp);
  }, [otp, loading, handleVerify]);

  return (
    <View style={styles.screen}>
      <StatusBar style="light" translucent backgroundColor="transparent" />

      <View
        style={[styles.logoHeader, { width: WAVE_W + 2, height: waveH + 2, left: -1, top: -1 }]}
        pointerEvents="none"
      >
        <ReferenceWaveHeader width={WAVE_W + 2} height={waveH + 2} />
        <View style={[styles.logoRow, { paddingTop: Math.max(insets.top, 8) + 10 }]}>
          <View style={styles.logoTextCol}>
            <View style={styles.brandNameRow}>
              <AppText style={styles.brandGati} bold>
                Gati
              </AppText>
              <AppText style={styles.brandMitra} bold>
                Mitra
              </AppText>
            </View>
            <AppText style={styles.brandTagline} bold>
              MOVING PEOPLE CLOSER
            </AppText>
          </View>
        </View>
      </View>

      <View style={styles.flex}>
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={[
            styles.scrollContent,
            {
              paddingTop: logoBlockHeight + 24,
              paddingBottom: Math.max(insets.bottom, 16) + 88,
            },
          ]}
          keyboardShouldPersistTaps="always"
          keyboardDismissMode="none"
          showsVerticalScrollIndicator={false}
          bounces={false}
          scrollEnabled={false}
        >
          <View style={styles.mainBlock}>
            <AppText style={styles.title} bold>
              Verify OTP
            </AppText>
            <AppText style={styles.subtitle} bold>
              Code sent to <AppText style={styles.phoneHighlight} bold>{phoneE164}</AppText>
            </AppText>

            <View style={styles.fieldWrap}>
              <AppText style={styles.label} bold>
                Enter 6-digit code
              </AppText>
              <Pressable
                style={styles.otpBoxesRow}
                onPress={() =>
                  focusOtpInput(otp.length < OTP_LENGTH ? otp.length : OTP_LENGTH - 1)
                }
                accessibilityLabel="OTP input"
              >
                {digits.map((d, i) => {
                  const isActive = focusedIndex === i || d !== "";
                  return (
                    <Pressable
                      key={i}
                      style={[styles.otpBox, isActive && styles.otpBoxActive]}
                      onPress={() => focusOtpInput(i)}
                      accessibilityRole="button"
                      accessibilityLabel={`OTP digit ${i + 1}`}
                    >
                      <Text
                        style={[
                          styles.otpBoxDigit,
                          d === "" && styles.otpBoxDigitPlaceholder,
                        ]}
                        allowFontScaling={false}
                      >
                        {d || "0"}
                      </Text>
                    </Pressable>
                  );
                })}
                <TextInput
                  ref={inputRef}
                  style={styles.otpInputHidden}
                  pointerEvents="none"
                  keyboardType="number-pad"
                  maxLength={OTP_LENGTH}
                  textContentType="oneTimeCode"
                  autoComplete="sms-otp"
                  importantForAutofill="yes"
                  autoCorrect={false}
                  showSoftInputOnFocus
                  autoFocus
                  value={otp}
                  onChangeText={(t) => {
                    const next = t.replace(/\D/g, "").slice(0, OTP_LENGTH);
                    const prev = otpRef.current;
                    // Full 6-digit paste / OS autofill
                    if (next.length === OTP_LENGTH && prev.length < OTP_LENGTH) {
                      applyAutoCode(next, "keyboard");
                      return;
                    }
                    setOtp(next);

                    if (next.length > prev.length) {
                      const idx = next.length < OTP_LENGTH ? next.length : OTP_LENGTH - 1;
                      focusedIndexRef.current = idx;
                      setFocusedIndex(idx);
                      requestAnimationFrame(() => selectBoxAt(idx));
                    } else if (next.length < prev.length) {
                      const idx = Math.max(0, next.length);
                      focusedIndexRef.current = idx;
                      setFocusedIndex(idx);
                      requestAnimationFrame(() => selectBoxAt(idx));
                    } else if (next !== prev) {
                      const idx = Math.min(focusedIndexRef.current + 1, OTP_LENGTH - 1);
                      focusedIndexRef.current = idx;
                      setFocusedIndex(idx);
                      requestAnimationFrame(() => selectBoxAt(idx));
                    }
                  }}
                  onFocus={() => {
                    inputFocusedRef.current = true;
                    const idx =
                      focusedIndexRef.current >= 0
                        ? focusedIndexRef.current
                        : otpRef.current.length < OTP_LENGTH
                          ? otpRef.current.length
                          : OTP_LENGTH - 1;
                    focusedIndexRef.current = idx;
                    setFocusedIndex(idx);
                    requestAnimationFrame(() => selectBoxAt(idx));
                  }}
                  onBlur={() => {
                    inputFocusedRef.current = false;
                    if (!keyboardVisibleRef.current) {
                      setFocusedIndex(null);
                    }
                  }}
                  editable={!loading}
                  contextMenuHidden={false}
                />
              </Pressable>
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
              disabled={loading || otp.length !== OTP_LENGTH}
              activeOpacity={0.88}
              style={[
                styles.button,
                otp.length === OTP_LENGTH && !loading
                  ? styles.buttonActive
                  : styles.buttonDisabled,
              ]}
            >
              {loading ? (
                <ActivityIndicator color={BTN_ACTIVE_TEXT} />
              ) : (
                <AppText
                  style={[
                    styles.buttonText,
                    otp.length === OTP_LENGTH ? styles.buttonTextActive : styles.buttonTextDisabled,
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

        {/* Docked to frozen screen bottom — keypad overlays it; layout does not shrink. */}
        <View
          pointerEvents={keyboardVisible ? "none" : "auto"}
          style={[
            styles.footerDock,
            { paddingBottom: Math.max(insets.bottom, 16) + 8 },
            keyboardVisible && styles.footerDockHidden,
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
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: BG_SPLASH,
  },
  flex: { flex: 1 },
  logoHeader: {
    position: "absolute",
    top: 0,
    left: 0,
    zIndex: 20,
    overflow: "hidden",
  },
  logoRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingLeft: 16,
    paddingRight: 28,
    zIndex: 1,
  },
  logoTextCol: {
    justifyContent: "center",
    maxWidth: WAVE_W * 0.72,
  },
  brandNameRow: {
    flexDirection: "row",
    alignItems: "baseline",
  },
  brandGati: {
    fontSize: 22,
    fontWeight: "800",
    color: TEXT_ON_TEAL,
    letterSpacing: 0.2,
  },
  brandMitra: {
    fontSize: 22,
    fontWeight: "800",
    color: BRAND_YELLOW,
    letterSpacing: 0.2,
  },
  brandTagline: {
    marginTop: 3,
    fontSize: 8,
    fontWeight: "700",
    color: TEXT_ON_TEAL,
    letterSpacing: 1.2,
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
    paddingTop: 36,
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
  otpBoxesRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8,
    position: "relative",
  },
  otpInputHidden: {
    ...StyleSheet.absoluteFillObject,
    // Keep slightly visible to OS autofill (opacity 0 breaks sms-otp on some OEMs).
    opacity: 0.02,
    color: "transparent",
    fontSize: 16,
    zIndex: 0,
    padding: 0,
    margin: 0,
  },
  otpBox: {
    flex: 1,
    aspectRatio: 1,
    maxWidth: 52,
    backgroundColor: DARK_SURFACE,
    borderWidth: 1,
    borderColor: "transparent",
    borderRadius: CONTROL_RADIUS,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 52,
    zIndex: 1,
  },
  otpBoxActive: {
    borderColor: "#FFFFFF",
  },
  otpBoxDigit: {
    fontSize: 22,
    fontFamily: StoreFonts.poppinsBold,
    color: TEXT_ON_TEAL,
  },
  otpBoxDigitPlaceholder: {
    color: PLACEHOLDER_GRAY,
    fontFamily: StoreFonts.poppinsBold,
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
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    paddingHorizontal: 28,
  },
  footerDockHidden: {
    opacity: 0,
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
