/**
 * GatiMitra OTP Login – splash-teal reference layout.
 * Compact top-left wave, 10px controls, idle Dawao nudge after valid number.
 */

import { useEffect, useRef, useState } from "react";
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
  Modal,
  FlatList,
  Pressable,
  Dimensions,
  type KeyboardEvent,
} from "react-native";
import Svg, { Path } from "react-native-svg";
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { AppText } from "@/components/AppText";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { authService } from "@/services/auth.service";
import { COUNTRIES, DEFAULT_COUNTRY, type CountryOption } from "@/constants/countries";
import { GatiMitraColors } from "@/constants/gatimitra";
import { StoreFonts } from "@/constants/storeTypography";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { setRuntimeApiBaseUrl, getConfig } from "@/config/env";

const API_URL_OVERRIDE_KEY = "dev.apiBaseUrl";

const BG_SPLASH = GatiMitraColors.splashMint;
const DARK_SURFACE = "#1A1C1E";
const TITLE_DARK = "#111827";
const TEXT_ON_TEAL = "#FFFFFF";
const TEXT_MUTED_ON_DARK = "#9CA3AF";
const DIVIDER_ON_DARK = "rgba(255,255,255,0.28)";
const BRAND_YELLOW = "#F5C518";
const APPLE_ORANGE = "#FF9500";
const PLACEHOLDER_GRAY = "#9CA3AF";
const BORDER_INPUT = "#E5E7EB";
const TEXT_GRAY = "#6B7280";
const CONTROL_RADIUS = 10;

const BTN_DEFAULT = "Aao Ji, Login Karo 🤏";
const BTN_NUDGE = "Dawaooo jiiii 🤏";
const IDLE_NUDGE_MS = 4000;

const { width: SCREEN_W } = Dimensions.get("window");
/** Top-left wave — tall left edge so brand + slogan stay inside. */
const WAVE_W = Math.round(SCREEN_W * 0.64);
const WAVE_H = 112;
const SUBTEXT_DARK_BLUE = "#1E3A8A";
const BTN_INACTIVE_BG = "#9CA3AF";
const BTN_ACTIVE_TEXT = "#111827";
const FOOTER_DARK = "#0F172A";

/** Rapido-style wave: tall flush left (-3px left height), sharper right tip. */
function ReferenceWaveHeader({ width, height }: { width: number; height: number }) {
  const w = width;
  const h = height;
  const leftEdgeY = h * 0.9 - 3;
  const d = [
    `M0 0`,
    `H${w}`,
    `V${h * 0.02}`,
    // Sharper pointed tip near top-right (status bar edge)
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

function formatPhoneDisplay(digits: string): string {
  return digits;
}

function phoneDisplayMaxLength(_countryCode: string, maxDigits: number): number {
  return maxDigits;
}

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const scrollRef = useRef<ScrollView>(null);
  const inputRef = useRef<TextInput>(null);
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const sendOtpLockRef = useRef(false);
  const [error, setError] = useState("");
  const [inputFocused, setInputFocused] = useState(false);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [selectedCountry, setSelectedCountry] = useState<CountryOption>(DEFAULT_COUNTRY);
  const [countryPickerVisible, setCountryPickerVisible] = useState(false);
  const [apiUrlModalVisible, setApiUrlModalVisible] = useState(false);
  const [showApiConfig, setShowApiConfig] = useState(false);
  const [apiUrlInput, setApiUrlInput] = useState("");
  const [apiUrlSaving, setApiUrlSaving] = useState(false);
  const [currentApiUrl, setCurrentApiUrl] = useState<string>(() => getConfig().apiBaseUrl);
  const [showIdleNudge, setShowIdleNudge] = useState(false);
  const pressedBeforeNudgeRef = useRef(false);
  const nudgeScale = useSharedValue(1);
  const formShiftY = useSharedValue(0);

  const waveH = WAVE_H + Math.max(insets.top, 0);
  const logoBlockHeight = waveH + 4;

  useEffect(() => {
    const showEvt = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvt = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const ease = Easing.bezier(0.22, 1, 0.36, 1);
    const subShow = Keyboard.addListener(showEvt, (event: KeyboardEvent) => {
      setKeyboardVisible(true);
      const kbH = event.endCoordinates?.height ?? 0;
      // Match OS keyboard timing; small lift only — no padding jumps (those feel sticky).
      const duration =
        Platform.OS === "ios" && typeof event.duration === "number" && event.duration > 0
          ? event.duration
          : 220;
      const lift = Math.min(48, Math.max(24, Math.round(kbH * 0.08)));
      formShiftY.value = withTiming(-lift, { duration, easing: ease });
    });
    const subHide = Keyboard.addListener(hideEvt, (event: KeyboardEvent) => {
      const duration =
        Platform.OS === "ios" && typeof event.duration === "number" && event.duration > 0
          ? event.duration
          : 200;
      formShiftY.value = withTiming(0, { duration, easing: ease });
      setKeyboardVisible(false);
    });
    return () => {
      subShow.remove();
      subHide.remove();
    };
  }, [formShiftY]);

  const openApiUrlModal = () => {
    setApiUrlInput(currentApiUrl);
    setApiUrlModalVisible(true);
  };

  const saveApiUrl = async () => {
    const trimmed = apiUrlInput.trim().replace(/\/+$/, "");
    if (!trimmed) return;
    if (!/^https?:\/\/.+/.test(trimmed)) {
      setError("API URL must start with http:// or https://");
      return;
    }
    setApiUrlSaving(true);
    try {
      await AsyncStorage.setItem(API_URL_OVERRIDE_KEY, trimmed);
      setRuntimeApiBaseUrl(trimmed);
      setCurrentApiUrl(trimmed);
      setError("");
      setApiUrlModalVisible(false);
    } catch (e) {
      console.warn("[login] saveApiUrl failed", e);
    } finally {
      setApiUrlSaving(false);
    }
  };

  const resetApiUrl = async () => {
    setApiUrlSaving(true);
    try {
      await AsyncStorage.removeItem(API_URL_OVERRIDE_KEY);
      setRuntimeApiBaseUrl(null);
      setCurrentApiUrl(getConfig().apiBaseUrl);
      setApiUrlModalVisible(false);
    } catch (e) {
      console.warn("[login] resetApiUrl failed", e);
    } finally {
      setApiUrlSaving(false);
    }
  };

  const phoneDigits = phone.replace(/\D/g, "");
  const requiredPhoneLen = selectedCountry.code === "IN" ? 10 : 7;
  const maxPhoneLen = selectedCountry.code === "IN" ? 10 : 15;
  const phoneDisplay = formatPhoneDisplay(phoneDigits);
  const phoneInputMaxLen = phoneDisplayMaxLength(selectedCountry.code, maxPhoneLen);
  const isPhoneValid =
    selectedCountry.code === "IN"
      ? phoneDigits.length === 10
      : phoneDigits.length >= requiredPhoneLen;
  const canSendOtp = isPhoneValid && !loading;

  // Dawao only after number is filled and 5s pass without tapping Aao Ji CTA.
  useEffect(() => {
    if (!isPhoneValid || loading || pressedBeforeNudgeRef.current) {
      setShowIdleNudge(false);
      cancelAnimation(nudgeScale);
      nudgeScale.value = 1;
      return;
    }
    setShowIdleNudge(false);
    const t = setTimeout(() => {
      if (pressedBeforeNudgeRef.current) return;
      setShowIdleNudge(true);
    }, IDLE_NUDGE_MS);
    return () => clearTimeout(t);
  }, [isPhoneValid, loading, phoneDigits, nudgeScale]);

  useEffect(() => {
    if (!showIdleNudge) {
      cancelAnimation(nudgeScale);
      nudgeScale.value = 1;
      return;
    }
    nudgeScale.value = withRepeat(
      withSequence(
        withTiming(1.05, { duration: 380 }),
        withTiming(0.97, { duration: 380 }),
        withTiming(1.03, { duration: 280 }),
        withTiming(1, { duration: 280 })
      ),
      -1,
      false
    );
    return () => {
      cancelAnimation(nudgeScale);
    };
  }, [showIdleNudge, nudgeScale]);

  const nudgeBtnStyle = useAnimatedStyle(() => ({
    transform: [{ scale: nudgeScale.value }],
  }));

  const formLiftStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: formShiftY.value }],
  }));

  const handlePhoneChange = (raw: string) => {
    const digits = raw.replace(/\D/g, "").slice(0, maxPhoneLen);
    setPhone(digits);
    if (error) setError("");
  };

  const handleSendOtp = async () => {
    if (sendOtpLockRef.current || loading) return;
    if (!isPhoneValid) {
      setError(`Enter a valid ${requiredPhoneLen}-digit mobile number`);
      return;
    }
    // Tapped while still on "Aao Ji…" — no click/pulse animation.
    if (!showIdleNudge) {
      pressedBeforeNudgeRef.current = true;
      setShowIdleNudge(false);
      cancelAnimation(nudgeScale);
      nudgeScale.value = 1;
    }
    const digits = phoneDigits;
    sendOtpLockRef.current = true;
    setError("");
    setShowApiConfig(false);
    setLoading(true);
    try {
      const phoneE164 = `${selectedCountry.dialCode}${digits}`;
      await authService.sendOtp({ phoneE164 });
      router.replace({
        pathname: "/(auth)/otp",
        params: { phoneE164 },
      });
    } catch (e: unknown) {
      const ax = e as {
        response?: { data?: { message?: string }; status?: number };
        message?: string;
        code?: string;
      };
      const rawMessage = typeof ax?.message === "string" ? ax.message.trim() : "";
      const isNetworkError =
        !ax?.response &&
        (ax?.code === "ECONNABORTED" ||
          rawMessage === "Network Error" ||
          rawMessage.toLowerCase().includes("network"));
      const backendMsg =
        typeof ax?.response?.data?.message === "string" && ax.response.data.message.trim()
          ? ax.response.data.message.trim()
          : null;
      if (__DEV__ && isNetworkError) {
        console.warn(
          "[Login] Cannot reach server. Start backend (port 3000) or set EXPO_PUBLIC_DEV_HOST to your PC's LAN IP (EXPO_PUBLIC_API_PORT / EXPO_PUBLIC_API_BASE_URL)."
        );
      }
      setShowApiConfig(__DEV__ && isNetworkError);
      setError(
        backendMsg ||
          (isNetworkError
            ? "We couldn’t reach our servers. Please check your internet connection and try again."
            : "Something went wrong. Please try again in a moment.")
      );
    } finally {
      sendOtpLockRef.current = false;
      setLoading(false);
    }
  };

  return (
    <View style={styles.screen}>
      <StatusBar style="light" translucent backgroundColor="transparent" />

      <View style={[styles.logoHeader, { width: WAVE_W + 2, height: waveH + 2, left: -1, top: -1 }]} pointerEvents="none">
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
              paddingTop: logoBlockHeight + 28,
              paddingBottom: Math.max(insets.bottom, 16) + 20,
            },
          ]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
          bounces={false}
        >
          <Animated.View style={[styles.mainBlock, formLiftStyle]}>
            <AppText style={styles.title} bold>
              {"Let's Get You\nOn The Move !"}
            </AppText>

            <AppText style={styles.subtitle} bold>
              {
                "Your wallet balance will be linked to this number. Don't worry, we will never make it public."
              }
            </AppText>

            <View style={styles.fieldWrap}>
              <Pressable
                style={[
                  styles.inputRow,
                  inputFocused && styles.inputRowFocused,
                  isPhoneValid && styles.inputRowValid,
                ]}
                onPress={() => {
                  if (!loading) inputRef.current?.focus();
                }}
                disabled={loading}
                accessibilityRole="none"
              >
                <TouchableOpacity
                  style={styles.countryTrigger}
                  onPress={() => setCountryPickerVisible(true)}
                  activeOpacity={0.8}
                  disabled={loading}
                >
                  <Text style={styles.flagEmoji} allowFontScaling={false}>
                    {selectedCountry.flag}
                  </Text>
                  <Text style={styles.countryCode} allowFontScaling={false}>
                    {selectedCountry.dialCode}
                  </Text>
                  <Ionicons name="chevron-down" size={14} color={TEXT_MUTED_ON_DARK} />
                </TouchableOpacity>
                <View style={styles.inputDivider} pointerEvents="none" />
                <TextInput
                  ref={inputRef}
                  style={[styles.input, styles.inputNoOutline]}
                  placeholder="Enter mobile no."
                  placeholderTextColor={PLACEHOLDER_GRAY}
                  keyboardType="phone-pad"
                  maxLength={phoneInputMaxLen}
                  value={phoneDisplay}
                  onChangeText={handlePhoneChange}
                  onFocus={() => setInputFocused(true)}
                  onBlur={() => setInputFocused(false)}
                  editable={!loading}
                  underlineColorAndroid="transparent"
                  selectionColor={BG_SPLASH}
                  allowFontScaling={false}
                />
              </Pressable>
              {error ? <AppText style={styles.errorText}>{error}</AppText> : null}
              {__DEV__ && showApiConfig ? (
                <TouchableOpacity
                  onPress={openApiUrlModal}
                  style={apiUrlStyles.configureBtn}
                  activeOpacity={0.85}
                >
                  <Ionicons name="settings-outline" size={16} color={TITLE_DARK} />
                  <AppText style={apiUrlStyles.configureBtnText}>Configure API URL</AppText>
                </TouchableOpacity>
              ) : null}
            </View>

            <Animated.View
              style={[styles.buttonAnimWrap, showIdleNudge ? nudgeBtnStyle : undefined]}
            >
              <TouchableOpacity
                onPress={handleSendOtp}
                disabled={!canSendOtp}
                activeOpacity={canSendOtp ? 0.88 : 1}
                style={[styles.button, canSendOtp ? styles.buttonActive : styles.buttonDisabled]}
              >
                {loading ? (
                  <ActivityIndicator color={BTN_ACTIVE_TEXT} />
                ) : (
                  <Text
                    style={[
                      styles.buttonText,
                      canSendOtp ? styles.buttonTextActive : styles.buttonTextDisabled,
                    ]}
                    allowFontScaling={false}
                  >
                    {showIdleNudge && canSendOtp ? BTN_NUDGE : BTN_DEFAULT}
                  </Text>
                )}
              </TouchableOpacity>
            </Animated.View>
          </Animated.View>

          <View style={[styles.footer, keyboardVisible && styles.footerKeyboard]}>
            <View style={styles.footerRuleRow}>
              <View style={styles.footerRule} />
              <AppText style={styles.footerLine} bold>
                {"By clicking 'Login', you accept our"}
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
        </ScrollView>
      </View>

      <Modal
        visible={countryPickerVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setCountryPickerVisible(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setCountryPickerVisible(false)}>
          <Pressable style={styles.modalContent} onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalHeader}>
              <AppText style={styles.modalTitle}>Select country</AppText>
              <TouchableOpacity onPress={() => setCountryPickerVisible(false)} hitSlop={12}>
                <Ionicons name="close" size={24} color={TITLE_DARK} />
              </TouchableOpacity>
            </View>
            <FlatList
              data={COUNTRIES}
              keyExtractor={(item) => item.code}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[
                    styles.countryRow,
                    item.code === selectedCountry.code && styles.countryRowSelected,
                  ]}
                  onPress={() => {
                    setSelectedCountry(item);
                    setCountryPickerVisible(false);
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={styles.countryRowFlag}>{item.flag}</Text>
                  <AppText style={styles.countryRowName}>{item.name}</AppText>
                  <Text style={styles.countryRowDial}>{item.dialCode}</Text>
                </TouchableOpacity>
              )}
            />
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={apiUrlModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setApiUrlModalVisible(false)}
      >
        <Pressable
          style={apiUrlStyles.backdrop}
          onPress={() => (apiUrlSaving ? undefined : setApiUrlModalVisible(false))}
        >
          <Pressable onPress={() => {}} style={apiUrlStyles.sheet}>
            <AppText style={apiUrlStyles.sheetTitle}>Configure API URL</AppText>
            <AppText style={apiUrlStyles.sheetSubtitle}>
              {
                "Point this installed app at a different backend without rebuilding. Use your PC's LAN IP (e.g. http://10.15.120.181:3000) or an ngrok URL."
              }
            </AppText>
            <AppText style={apiUrlStyles.sheetLabel}>Current</AppText>
            <Text style={apiUrlStyles.sheetCurrent} numberOfLines={1}>
              {currentApiUrl}
            </Text>

            <AppText style={apiUrlStyles.sheetLabel}>New API base URL</AppText>
            <TextInput
              value={apiUrlInput}
              onChangeText={setApiUrlInput}
              placeholder="http://10.15.120.181:3000"
              placeholderTextColor={PLACEHOLDER_GRAY}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              style={apiUrlStyles.sheetInput}
              editable={!apiUrlSaving}
            />

            <TouchableOpacity
              onPress={saveApiUrl}
              disabled={apiUrlSaving || apiUrlInput.trim().length === 0}
              style={[
                apiUrlStyles.sheetPrimary,
                (apiUrlSaving || apiUrlInput.trim().length === 0) && apiUrlStyles.sheetBtnDisabled,
              ]}
              activeOpacity={0.85}
            >
              {apiUrlSaving ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <AppText style={apiUrlStyles.sheetPrimaryText}>Save & use this URL</AppText>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              onPress={resetApiUrl}
              disabled={apiUrlSaving}
              style={apiUrlStyles.sheetSecondary}
              activeOpacity={0.85}
            >
              <AppText style={apiUrlStyles.sheetSecondaryText}>Reset to build default</AppText>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => setApiUrlModalVisible(false)}
              disabled={apiUrlSaving}
              style={apiUrlStyles.sheetCancel}
              activeOpacity={0.85}
            >
              <AppText style={apiUrlStyles.sheetCancelText}>Cancel</AppText>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const apiUrlStyles = StyleSheet.create({
  configureBtn: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    marginTop: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: "rgba(255,255,255,0.85)",
    borderWidth: 1,
    borderColor: TITLE_DARK,
    gap: 6,
  },
  configureBtnText: { fontSize: 13, color: TITLE_DARK, fontWeight: "600" },
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  sheet: {
    backgroundColor: "#fff",
    borderRadius: 18,
    padding: 22,
  },
  sheetTitle: { fontSize: 18, fontWeight: "700", color: TITLE_DARK, marginBottom: 6 },
  sheetSubtitle: { fontSize: 13, color: TEXT_GRAY, lineHeight: 19, marginBottom: 16 },
  sheetLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: TEXT_GRAY,
    textTransform: "uppercase",
    marginBottom: 4,
  },
  sheetCurrent: {
    fontSize: 13,
    color: TITLE_DARK,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    marginBottom: 14,
    backgroundColor: "#F3F4F6",
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
  },
  sheetInput: {
    borderWidth: 1,
    borderColor: BORDER_INPUT,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: TITLE_DARK,
    marginBottom: 16,
  },
  sheetPrimary: {
    backgroundColor: DARK_SURFACE,
    paddingVertical: 13,
    borderRadius: 12,
    alignItems: "center",
    marginBottom: 8,
  },
  sheetPrimaryText: { color: "#fff", fontSize: 15, fontWeight: "700" },
  sheetBtnDisabled: { opacity: 0.5 },
  sheetSecondary: {
    paddingVertical: 11,
    borderRadius: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: BORDER_INPUT,
    marginBottom: 4,
  },
  sheetSecondaryText: { color: TEXT_GRAY, fontSize: 14, fontWeight: "600" },
  sheetCancel: { paddingVertical: 10, alignItems: "center" },
  sheetCancelText: { color: TEXT_GRAY, fontSize: 14, fontWeight: "500" },
});

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
    gap: 10,
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
    fontFamily: StoreFonts.loraBold,
    color: TEXT_ON_TEAL,
    letterSpacing: 0.2,
  },
  brandMitra: {
    fontSize: 22,
    fontFamily: StoreFonts.loraBold,
    color: BRAND_YELLOW,
    letterSpacing: 0.2,
  },
  brandTagline: {
    marginTop: 3,
    fontSize: 8,
    fontFamily: StoreFonts.loraBold,
    color: TEXT_ON_TEAL,
    letterSpacing: 1.2,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: "space-between",
    paddingHorizontal: 28,
  },
  mainBlock: {
    width: "100%",
    maxWidth: 400,
    alignSelf: "center",
    alignItems: "center",
    flexGrow: 1,
    justifyContent: "flex-start",
    paddingTop: 52,
  },
  title: {
    fontSize: 32,
    fontFamily: StoreFonts.loraBold,
    color: TITLE_DARK,
    textAlign: "center",
    lineHeight: 40,
    letterSpacing: 0.2,
    marginBottom: 14,
  },
  subtitle: {
    fontSize: 14,
    fontFamily: StoreFonts.loraBold,
    color: SUBTEXT_DARK_BLUE,
    textAlign: "center",
    lineHeight: 21,
    marginBottom: 48,
    paddingHorizontal: 8,
  },
  fieldWrap: {
    width: "100%",
    marginBottom: 16,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: DARK_SURFACE,
    borderRadius: CONTROL_RADIUS,
    borderWidth: 1.5,
    borderColor: "transparent",
    paddingHorizontal: 6,
    paddingVertical: 4,
    minHeight: 56,
  },
  inputRowFocused: {
    borderColor: "rgba(255,255,255,0.35)",
  },
  inputRowValid: {
    borderColor: "rgba(255,255,255,0.22)",
  },
  countryTrigger: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 6,
  },
  flagEmoji: {
    fontSize: 20,
    lineHeight: 24,
    color: TEXT_ON_TEAL,
    ...(Platform.OS === "android" ? { includeFontPadding: false } : null),
  },
  countryCode: {
    fontSize: 18,
    // Custom bold face only — pairing fontWeight causes Android bold↔regular flicker.
    fontFamily: StoreFonts.poppinsBold,
    color: TEXT_ON_TEAL,
    fontVariant: ["tabular-nums"],
    ...(Platform.OS === "android" ? { includeFontPadding: false } : null),
  },
  inputDivider: {
    width: StyleSheet.hairlineWidth,
    height: 28,
    backgroundColor: DIVIDER_ON_DARK,
    marginRight: 4,
  },
  input: {
    flex: 1,
    paddingVertical: Platform.OS === "ios" ? 14 : 10,
    paddingLeft: 8,
    paddingRight: 18,
    fontSize: 18,
    fontFamily: StoreFonts.poppinsBold,
    letterSpacing: 1.1,
    color: TEXT_ON_TEAL,
    fontVariant: ["tabular-nums"],
    minWidth: 0,
    borderWidth: 0,
    backgroundColor: "transparent",
    ...(Platform.OS === "android" ? { includeFontPadding: false } : null),
  },
  inputFilled: {
    // Keep identical metrics so typing never swaps weight/family.
  },
  inputNoOutline: {
    ...(Platform.OS === "web" &&
      ({
        outlineStyle: "none",
        outlineWidth: 0,
      } as Record<string, unknown>)),
  },
  errorText: {
    fontSize: 14,
    color: "#7F1D1D",
    marginTop: 10,
    textAlign: "center",
    fontWeight: "700",
  },
  buttonAnimWrap: {
    width: "100%",
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
    backgroundColor: BTN_INACTIVE_BG,
    opacity: 0.72,
  },
  buttonText: {
    fontSize: 17,
    fontWeight: "800",
    // System face stays bold with emoji — never swap fontFamily mid-nudge.
    letterSpacing: 0.2,
    textAlign: "center",
  },
  buttonTextActive: {
    color: BTN_ACTIVE_TEXT,
  },
  buttonTextDisabled: {
    color: "rgba(17,24,39,0.45)",
  },
  footer: {
    marginTop: 28,
    alignItems: "center",
    paddingHorizontal: 8,
  },
  footerKeyboard: {
    marginTop: 16,
    opacity: 0.7,
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
    color: "#020617",
    textAlign: "center",
  },
  footerLink: {
    fontSize: 13,
    fontWeight: "800",
    color: "#020617",
    textAlign: "center",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: "#FFF",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: "70%",
    paddingBottom: 32,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: BORDER_INPUT,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: TITLE_DARK,
  },
  countryRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 14,
    gap: 12,
  },
  countryRowSelected: {
    backgroundColor: "#CCFBF1",
  },
  countryRowFlag: {
    fontSize: 24,
  },
  countryRowName: {
    flex: 1,
    fontSize: 16,
    color: TITLE_DARK,
  },
  countryRowDial: {
    fontSize: 15,
    color: TEXT_GRAY,
    fontWeight: "600",
  },
});
