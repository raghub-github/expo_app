/**
 * GatiMitra OTP Login – splash-teal reference layout.
 * Flat header (no wave), 10px controls, idle Dawao nudge after valid number.
 */

import { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  ScrollView,
  Modal,
  FlatList,
  Pressable,
  useWindowDimensions,
} from "react-native";
import Animated, {
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
import { useKeyboardBottomInset } from "@/hooks/useKeyboardBottomInset";
import { armSmsOtpCapture } from "@/lib/androidSmsOtpRetriever";

const API_URL_OVERRIDE_KEY = "dev.apiBaseUrl";

const BG_SPLASH = GatiMitraColors.splashMint;
const DARK_SURFACE = "#1A1C1E";
const TITLE_DARK = "#111827";
const TEXT_ON_TEAL = "#FFFFFF";
const TEXT_MUTED_ON_DARK = "#9CA3AF";
const DIVIDER_ON_DARK = "rgba(255,255,255,0.28)";
const APPLE_ORANGE = "#FF9500";
const PLACEHOLDER_GRAY = "#9CA3AF";
const BORDER_INPUT = "#E5E7EB";
const TEXT_GRAY = "#6B7280";
const CONTROL_RADIUS = 10;

const BTN_DEFAULT = "Aao Ji, Login Karo 🤏";
const BTN_NUDGE = "Dawaooo jiiii 🤏";
const IDLE_NUDGE_MS = 4000;

const SUBTEXT_DARK_BLUE = "#1E3A8A";
const BTN_INACTIVE_BG = "#9CA3AF";
const BTN_ACTIVE_TEXT = "#111827";
function formatPhoneDisplay(digits: string): string {
  return digits;
}

function phoneDisplayMaxLength(_countryCode: string, maxDigits: number): number {
  return maxDigits;
}

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const { width: screenW, height: screenH } = useWindowDimensions();
  const compact = screenH < 700 || screenW < 360;
  const padH = Math.max(20, Math.min(32, Math.round(screenW * 0.07)));
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
  const keyboardInset = useKeyboardBottomInset();
  useEffect(() => {
    const showEvt = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvt = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const subShow = Keyboard.addListener(showEvt, () => setKeyboardVisible(true));
    const subHide = Keyboard.addListener(hideEvt, () => setKeyboardVisible(false));
    return () => {
      subShow.remove();
      subHide.remove();
    };
  }, []);

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

  const handlePhoneChange = (raw: string) => {
    const digits = raw.replace(/\D/g, "").slice(0, maxPhoneLen);
    setPhone(digits);
    if (error) setError("");
  };

  const focusPhoneInput = () => {
    if (loading) return;
    const node = inputRef.current;
    if (!node) return;
    node.focus();
    if (Platform.OS === "android") {
      const State = (
        TextInput as unknown as { State?: { focusTextInput?: (n: unknown) => void } }
      ).State;
      State?.focusTextInput?.(node);
    }
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
      void armSmsOtpCapture();
      const sendPromise = authService.sendOtp({ phoneE164 });
      // SMS can arrive before the send HTTP call finishes. Never block the
      // OTP screen on permission dialogs or a hung send.
      await Promise.race([
        sendPromise,
        new Promise<void>((resolve) => setTimeout(resolve, 4000)),
      ]);
      router.replace({
        pathname: "/(auth)/otp",
        params: { phoneE164 },
      });
      void sendPromise.catch(() => undefined);
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
              paddingTop: Math.max(insets.top, 12) + (compact ? 28 : 48),
              paddingHorizontal: padH,
              paddingBottom: 16,
            },
          ]}
          keyboardShouldPersistTaps="always"
          keyboardDismissMode="none"
          showsVerticalScrollIndicator={false}
          bounces={false}
        >
              <Animated.View style={[styles.mainBlock, compact && styles.mainBlockCompact]}>
            <View style={styles.brandCenter}>
              <AppText style={styles.brandWord} bold>
                GatiMitra
              </AppText>
              <AppText style={styles.brandTagline} bold>
                MOVING PEOPLE CLOSER
              </AppText>
            </View>

            <AppText
              style={styles.title}
              bold
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.78}
            >
              Let's Get You On The Move !
            </AppText>

            <AppText style={[styles.subtitle, compact && styles.subtitleCompact]} bold>
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
                onPress={focusPhoneInput}
                onPressIn={focusPhoneInput}
                delayPressIn={0}
                disabled={loading}
                accessibilityRole="none"
              >
                <TextInput
                  ref={inputRef}
                  style={[styles.input, styles.inputNoOutline]}
                  placeholder="Enter mobile no."
                  placeholderTextColor={PLACEHOLDER_GRAY}
                  keyboardType="phone-pad"
                  showSoftInputOnFocus
                  maxLength={phoneInputMaxLen}
                  value={phoneDisplay}
                  onChangeText={handlePhoneChange}
                  onFocus={() => setInputFocused(true)}
                  onBlur={() => setInputFocused(false)}
                  onPressIn={focusPhoneInput}
                  returnKeyType="send"
                  blurOnSubmit
                  onSubmitEditing={() => {
                    void handleSendOtp();
                  }}
                  editable={!loading}
                  underlineColorAndroid="transparent"
                  selectionColor={BG_SPLASH}
                  allowFontScaling={false}
                />
                <View style={styles.countryOverlay} pointerEvents="box-none">
                  <TouchableOpacity
                    style={styles.countryTrigger}
                    onPress={() => setCountryPickerVisible(true)}
                    activeOpacity={0.8}
                    disabled={loading}
                    delayPressIn={0}
                    hitSlop={4}
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
                </View>
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
    </KeyboardAvoidingView>
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
  brandCenter: {
    alignItems: "center",
    marginBottom: 32,
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
    justifyContent: "flex-start",
    paddingTop: 0,
  },
  mainBlockCompact: {
    paddingTop: 0,
  },
  title: {
    fontSize: 22,
    fontFamily: StoreFonts.loraBold,
    color: TITLE_DARK,
    textAlign: "center",
    lineHeight: 28,
    letterSpacing: 0.1,
    marginBottom: 12,
    width: "100%",
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
  subtitleCompact: {
    marginBottom: 24,
    fontSize: 13,
    lineHeight: 19,
  },
  fieldWrap: {
    width: "100%",
    marginBottom: 16,
  },
  inputRow: {
    position: "relative",
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: DARK_SURFACE,
    borderRadius: CONTROL_RADIUS,
    borderWidth: 1.5,
    borderColor: "transparent",
    minHeight: 56,
    overflow: "hidden",
  },
  inputRowFocused: {
    borderColor: "rgba(255,255,255,0.35)",
  },
  inputRowValid: {
    borderColor: "rgba(255,255,255,0.22)",
  },
  countryOverlay: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: "row",
    alignItems: "center",
    paddingLeft: 6,
    zIndex: 2,
  },
  countryTrigger: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 14,
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
    ...StyleSheet.absoluteFillObject,
    zIndex: 1,
    paddingVertical: 0,
    paddingLeft: 118,
    paddingRight: 18,
    fontSize: 18,
    fontFamily: StoreFonts.poppinsBold,
    letterSpacing: 1.1,
    color: TEXT_ON_TEAL,
    fontVariant: ["tabular-nums"],
    borderWidth: 0,
    backgroundColor: "transparent",
    ...(Platform.OS === "android" ? { includeFontPadding: false, textAlignVertical: "center" } : null),
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
