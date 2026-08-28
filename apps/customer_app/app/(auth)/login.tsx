/**
 * GatiMitra OTP Login – premium delivery-app style.
 * Centered card, soft white→mint gradient, logo top-left, hero illustration,
 * rounded input with focus glow, green gradient CTA, safe-area aware.
 */

import { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Keyboard,
  Platform,
  StyleSheet,
  ScrollView,
  Modal,
  FlatList,
  Pressable,
  Image,
  Dimensions,
  type ImageSourcePropType,
  type KeyboardEvent,
} from "react-native";
import { AppText } from "@/components/AppText";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { authService } from "@/services/auth.service";
import { useAppAssetSource } from "@/components/AppAssetImage";
import { CX } from "@/lib/appAssetKeys";
import { COUNTRIES, DEFAULT_COUNTRY, type CountryOption } from "@/constants/countries";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { setRuntimeApiBaseUrl, getConfig } from "@/config/env";

const API_URL_OVERRIDE_KEY = "dev.apiBaseUrl";
/** Bundled fallback so the header never swaps placeholder ↔ remote (layout flicker). */
const BUNDLED_AUTH_LOGO: ImageSourcePropType = require("../../assets/images/splash-logo.png");

/** Indian mobile display: 98765-43210 (5 digits, hyphen, 5 digits). */
function formatIndianPhoneDisplay(digits: string): string {
  if (digits.length <= 5) return digits;
  return `${digits.slice(0, 5)}-${digits.slice(5)}`;
}

function formatPhoneDisplay(digits: string, countryCode: string): string {
  if (countryCode === "IN") return formatIndianPhoneDisplay(digits);
  return digits;
}

function phoneDisplayMaxLength(countryCode: string, maxDigits: number): number {
  if (countryCode === "IN" && maxDigits === 10) return 11;
  return maxDigits;
}

// Premium palette – white → mint, soft shadows
const BG_SCREEN = "#F0F4F3";
const CARD_GRADIENT_TOP = "#FFFFFF";
const CARD_GRADIENT_BOTTOM = "#E8F5F3";
const MINT_SOFT = "#B2DFDB";
const MINT_MED = "#80CBC4";
const GREEN_PRIMARY = "#2E7D32";
const GREEN_LIGHT = "#4CAF50";
const TITLE_DARK = "#1A1A1A";
const TEXT_GRAY = "#6B7280";
const BORDER_INPUT = "#E5E7EB";
const BORDER_FOCUS = "#4ADE80";
const PLACEHOLDER_GRAY = "#9CA3AF";
const FOOTER_GRAY = "#6B7280";
const LINK_GREEN = "#059669";
const SHADOW_COLOR = "rgba(0,0,0,0.06)";

function HeroIllustration() {
  return (
    <View style={heroStyles.wrap}>
      <View style={heroStyles.blob1} />
      <View style={heroStyles.blob2} />
      <View style={heroStyles.phoneOuter}>
        <View style={heroStyles.phoneScreen} />
        {/* Lock icon centered on the phone screen, no bubble bg */}
        <View style={heroStyles.lockCenter}>
          <Ionicons name="lock-closed" size={14} color={GREEN_PRIMARY} />
        </View>
      </View>
    </View>
  );
}

const heroStyles = StyleSheet.create({
  wrap: {
    width: 120,
    height: 120,
    alignItems: "center",
    justifyContent: "flex-end",
    marginBottom: 24,
  },
  blob1: {
    position: "absolute",
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: MINT_SOFT,
    opacity: 0.5,
    top: 0,
    left: 0,
  },
  blob2: {
    position: "absolute",
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: MINT_MED,
    opacity: 0.35,
    top: 16,
    right: 0,
  },
  phoneOuter: {
    width: 36,
    height: 56,
    borderRadius: 10,
    borderWidth: 2.5,
    borderColor: MINT_MED,
    backgroundColor: "#FFF",
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  phoneScreen: {
    width: 24,
    height: 36,
    borderRadius: 4,
    backgroundColor: MINT_SOFT,
    opacity: 0.9,
  },
  lockCenter: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
  },
});

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const scrollRef = useRef<ScrollView>(null);
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [inputFocused, setInputFocused] = useState(false);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [keyboardCovered, setKeyboardCovered] = useState(0);
  const [selectedCountry, setSelectedCountry] = useState<CountryOption>(DEFAULT_COUNTRY);
  const [countryPickerVisible, setCountryPickerVisible] = useState(false);
  const [logoError, setLogoError] = useState(false);
  const remoteLogo = useAppAssetSource(CX.auth.logoWithName);
  const logoSource = !logoError && remoteLogo ? remoteLogo : BUNDLED_AUTH_LOGO;
  const [apiUrlModalVisible, setApiUrlModalVisible] = useState(false);
  const [apiUrlInput, setApiUrlInput] = useState("");
  const [apiUrlSaving, setApiUrlSaving] = useState(false);
  const [currentApiUrl, setCurrentApiUrl] = useState<string>(() => getConfig().apiBaseUrl);

  useEffect(() => {
    const showEvt = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvt = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const subShow = Keyboard.addListener(showEvt, (event: KeyboardEvent) => {
      setKeyboardVisible(true);
      if (Platform.OS === "ios") {
        setKeyboardCovered(0);
        return;
      }
      const kbTop = event.endCoordinates.screenY;
      const winH = Dimensions.get("window").height;
      setKeyboardCovered(Math.max(0, Math.round(winH - kbTop)));
    });
    const subHide = Keyboard.addListener(hideEvt, () => {
      setKeyboardVisible(false);
      setKeyboardCovered(0);
    });
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
  const phoneDisplay = formatPhoneDisplay(phoneDigits, selectedCountry.code);
  const phoneInputMaxLen = phoneDisplayMaxLength(selectedCountry.code, maxPhoneLen);
  const isPhoneValid =
    selectedCountry.code === "IN"
      ? phoneDigits.length === 10
      : phoneDigits.length >= requiredPhoneLen;
  const canSendOtp = isPhoneValid && !loading;

  const handlePhoneChange = (raw: string) => {
    const digits = raw.replace(/\D/g, "").slice(0, maxPhoneLen);
    setPhone(digits);
    if (error) setError("");
  };

  const handleSendOtp = async () => {
    if (!isPhoneValid) {
      setError(`Enter a valid ${requiredPhoneLen}-digit mobile number`);
      return;
    }
    const digits = phoneDigits;
    setError("");
    setLoading(true);
    try {
      const phoneE164 = `${selectedCountry.dialCode}${digits}`;
      await authService.sendOtp({ phoneE164 });
      router.replace({
        pathname: "/(auth)/otp",
        params: { phoneE164 },
      });
    } catch (e: unknown) {
      const ax = e as { response?: { data?: { message?: string }; status?: number }; message?: string; code?: string };
      const rawMessage = typeof ax?.message === "string" ? ax.message.trim() : "";
      const isNetworkError =
        !ax?.response &&
        (ax?.code === "ECONNABORTED" ||
          rawMessage === "Network Error" ||
          rawMessage.toLowerCase().includes("network"));
      const msg =
        ax?.response?.data?.message ??
        (rawMessage && !isNetworkError ? rawMessage : null);
      setError(
        msg ||
          (isNetworkError
            ? "Cannot reach server. Run backend (npm run dev in backend/, default port 3000). On a physical device set EXPO_PUBLIC_DEV_HOST to your PC's LAN IP and use the same port as the backend (EXPO_PUBLIC_API_PORT or EXPO_PUBLIC_API_BASE_URL)."
            : "Failed to send OTP. Try again.")
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? Math.max(insets.top, 8) : 0}
      style={[styles.container, { paddingBottom: keyboardVisible ? 0 : insets.bottom }]}
    >
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={[
          styles.scrollContent,
          keyboardVisible && styles.scrollContentKeyboard,
          {
            paddingTop: keyboardVisible ? 8 : 24,
            paddingBottom: keyboardVisible
              ? keyboardCovered + 8
              : 24 + insets.bottom,
          },
        ]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.card, keyboardVisible && styles.cardKeyboard]}>
          <LinearGradient
            colors={[CARD_GRADIENT_TOP, CARD_GRADIENT_BOTTOM]}
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.waveWrap}>
            <View style={[styles.wave1, { backgroundColor: MINT_SOFT }]} />
            <View style={[styles.wave2, { backgroundColor: MINT_MED, opacity: 0.4 }]} />
          </View>

          <View style={[styles.cardInner, keyboardVisible && styles.cardInnerKeyboard]}>
            <View style={[styles.header, keyboardVisible && styles.headerKeyboard]}>
              <Image
                source={logoSource}
                style={[styles.logoImage, keyboardVisible && styles.logoImageKeyboard]}
                resizeMode="contain"
                accessibilityLabel="GatiMitra logo"
                onError={() => setLogoError(true)}
              />
            </View>

            {!keyboardVisible ? <HeroIllustration /> : null}

            <AppText style={[styles.title, keyboardVisible && styles.titleKeyboard]}>Login</AppText>
            {!keyboardVisible ? (
              <AppText style={styles.subtitle}>Enter your mobile number to get OTP</AppText>
            ) : (
              <AppText style={styles.subtitleKeyboard}>Enter your mobile number to get OTP</AppText>
            )}

            <View style={[styles.fieldWrap, keyboardVisible && styles.fieldWrapKeyboard]}>
              <View style={styles.labelRow}>
                <AppText style={styles.label}>Mobile number</AppText>
                {phoneDigits.length > 0 ? (
                  <AppText
                    style={[
                      styles.digitCounter,
                      isPhoneValid ? styles.digitCounterValid : undefined,
                    ]}
                  >
                    {phoneDigits.length}/{requiredPhoneLen}
                  </AppText>
                ) : null}
              </View>
              <View
                style={[
                  styles.inputRow,
                  inputFocused && styles.inputRowFocused,
                  isPhoneValid && styles.inputRowValid,
                ]}
              >
                <TouchableOpacity
                  style={styles.countryTrigger}
                  onPress={() => setCountryPickerVisible(true)}
                  activeOpacity={0.8}
                  disabled={loading}
                >
                  <AppText style={styles.flagEmoji}>{selectedCountry.flag}</AppText>
                  <AppText style={styles.countryCode}>{selectedCountry.dialCode}</AppText>
                  <Ionicons name="chevron-down" size={16} color={TEXT_GRAY} />
                </TouchableOpacity>
                <View style={styles.inputDivider} />
                <TextInput
                  style={[
                    styles.input,
                    styles.inputNoOutline,
                    phoneDigits.length > 0 && styles.inputFilled,
                  ]}
                  placeholder="Enter mobile number"
                  placeholderTextColor={PLACEHOLDER_GRAY}
                  keyboardType="phone-pad"
                  maxLength={phoneInputMaxLen}
                  value={phoneDisplay}
                  onChangeText={handlePhoneChange}
                  onFocus={() => {
                    setInputFocused(true);
                  }}
                  onBlur={() => setInputFocused(false)}
                  editable={!loading}
                  underlineColorAndroid="transparent"
                />
              </View>
              {error ? <AppText style={styles.errorText}>{error}</AppText> : null}
              {error && error.toLowerCase().includes("cannot reach server") ? (
                <TouchableOpacity
                  onPress={openApiUrlModal}
                  style={apiUrlStyles.configureBtn}
                  activeOpacity={0.85}
                >
                  <Ionicons name="settings-outline" size={16} color={GREEN_PRIMARY} />
                  <AppText style={apiUrlStyles.configureBtnText}>Configure API URL</AppText>
                </TouchableOpacity>
              ) : null}
            </View>

            <TouchableOpacity
              onPress={handleSendOtp}
              disabled={!canSendOtp}
              activeOpacity={canSendOtp ? 0.9 : 1}
              style={[styles.buttonWrap, !canSendOtp && styles.buttonWrapDisabled]}
            >
              <LinearGradient
                colors={canSendOtp ? [GREEN_PRIMARY, GREEN_LIGHT] : ["#B0BEC5", "#CFD8DC"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.button}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <AppText style={[styles.buttonText, !canSendOtp && styles.buttonTextDisabled]}>
                    Send OTP
                  </AppText>
                )}
              </LinearGradient>
            </TouchableOpacity>

            {!keyboardVisible ? (
              <>
                <AppText style={styles.footerLine1}>By continuing, you agree to our</AppText>
                <View style={styles.footerLinksRow}>
                  <Pressable
                    onPress={() => router.push("/legal/terms-of-service" as never)}
                    hitSlop={8}
                    accessibilityRole="link"
                  >
                    <AppText style={styles.footerLink}>Terms of Service</AppText>
                  </Pressable>
                  <AppText style={styles.footerLine2}> & </AppText>
                  <Pressable
                    onPress={() => router.push("/legal/privacy-policy" as never)}
                    hitSlop={8}
                    accessibilityRole="link"
                  >
                    <AppText style={styles.footerLink}>Privacy Policy</AppText>
                  </Pressable>
                </View>
              </>
            ) : null}
          </View>
        </View>

        <Modal
          visible={countryPickerVisible}
          transparent
          animationType="slide"
          onRequestClose={() => setCountryPickerVisible(false)}
        >
          <Pressable
            style={styles.modalOverlay}
            onPress={() => setCountryPickerVisible(false)}
          >
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
                    <AppText style={styles.countryRowFlag}>{item.flag}</AppText>
                    <AppText style={styles.countryRowName}>{item.name}</AppText>
                    <AppText style={styles.countryRowDial}>{item.dialCode}</AppText>
                  </TouchableOpacity>
                )}
              />
            </Pressable>
          </Pressable>
        </Modal>

        {/* Configure API URL — runtime override for the backend base URL.
            Persisted in AsyncStorage, hydrated at app startup. Lets you point
            an installed APK at a new LAN IP / ngrok URL without rebuilding. */}
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
                Point this installed app at a different backend without rebuilding.
                Use your PC's LAN IP (e.g. http://10.168.39.181:3000) or an ngrok URL.
              </AppText>
              <AppText style={apiUrlStyles.sheetLabel}>Current</AppText>
              <Text style={apiUrlStyles.sheetCurrent} numberOfLines={1}>{currentApiUrl}</Text>

              <AppText style={apiUrlStyles.sheetLabel}>New API base URL</AppText>
              <TextInput
                value={apiUrlInput}
                onChangeText={setApiUrlInput}
                placeholder="http://10.168.39.181:3000"
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
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const apiUrlStyles = StyleSheet.create({
  configureBtn: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    marginTop: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: "#ECFDF5",
    borderWidth: 1,
    borderColor: GREEN_PRIMARY,
    gap: 6,
  },
  configureBtnText: { fontSize: 13, color: GREEN_PRIMARY, fontWeight: "600" },
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
  sheetLabel: { fontSize: 12, fontWeight: "600", color: TEXT_GRAY, textTransform: "uppercase", marginBottom: 4 },
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
    backgroundColor: GREEN_PRIMARY,
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
  container: {
    flex: 1,
    backgroundColor: BG_SCREEN,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingTop: 24,
    paddingBottom: 24,
    paddingHorizontal: 20,
  },
  scrollContentKeyboard: {
    justifyContent: "flex-end",
  },
  card: {
    width: "100%",
    maxWidth: 380,
    borderRadius: 28,
    overflow: "hidden",
    minHeight: 560,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.06,
    shadowRadius: 24,
    elevation: 8,
  },
  cardKeyboard: {
    minHeight: 0,
  },
  waveWrap: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: "38%",
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
    paddingTop: 20,
    paddingBottom: 32,
    alignItems: "center",
  },
  cardInnerKeyboard: {
    paddingTop: 14,
    paddingBottom: 20,
  },
  header: {
    alignSelf: "stretch",
    alignItems: "flex-start",
    marginBottom: 8,
  },
  headerKeyboard: {
    marginBottom: 4,
  },
  logoImage: {
    width: 120,
    height: 36,
  },
  logoImageKeyboard: {
    width: 100,
    height: 30,
  },
  title: {
    fontSize: 26,
    fontWeight: "700",
    color: TITLE_DARK,
    marginBottom: 8,
    textAlign: "center",
    letterSpacing: 0.3,
  },
  titleKeyboard: {
    fontSize: 22,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 15,
    color: TEXT_GRAY,
    marginBottom: 28,
    textAlign: "center",
    lineHeight: 22,
  },
  subtitleKeyboard: {
    fontSize: 13,
    color: TEXT_GRAY,
    marginBottom: 14,
    textAlign: "center",
    lineHeight: 18,
  },
  fieldWrap: {
    width: "100%",
    marginBottom: 22,
  },
  fieldWrapKeyboard: {
    marginBottom: 14,
  },
  labelRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  label: {
    fontSize: 15,
    fontWeight: "600",
    color: TITLE_DARK,
  },
  digitCounter: {
    fontSize: 12,
    fontWeight: "600",
    color: TEXT_GRAY,
    fontVariant: ["tabular-nums"],
  },
  digitCounterValid: {
    color: GREEN_PRIMARY,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F8FAFC",
    borderWidth: 1.5,
    borderColor: "#E2E8F0",
    borderRadius: 16,
    paddingHorizontal: 6,
    paddingVertical: 4,
    minHeight: 58,
    overflow: "hidden",
    shadowColor: SHADOW_COLOR,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  inputRowFocused: {
    borderColor: "#4ADE80",
    backgroundColor: "#FFFFFF",
    shadowColor: "rgba(74, 222, 128, 0.25)",
    shadowRadius: 12,
    elevation: 3,
  },
  inputRowValid: {
    borderColor: "#86EFAC",
    backgroundColor: "#FFFFFF",
  },
  countryTrigger: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 5,
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E8ECF0",
  },
  flagEmoji: {
    fontSize: 20,
  },
  countryCode: {
    fontSize: 15,
    fontWeight: "700",
    color: TITLE_DARK,
    fontVariant: ["tabular-nums"],
  },
  inputDivider: {
    width: 1,
    height: 32,
    backgroundColor: "#E2E8F0",
    marginHorizontal: 8,
  },
  input: {
    flex: 1,
    paddingVertical: 14,
    paddingLeft: 4,
    paddingRight: 16,
    fontSize: 16,
    fontWeight: "400",
    color: TITLE_DARK,
    minWidth: 0,
    borderWidth: 0,
    backgroundColor: "transparent",
  },
  inputFilled: {
    fontSize: 18,
    fontWeight: "700",
    letterSpacing: 1.2,
    color: "#0F172A",
    fontVariant: ["tabular-nums"],
  },
  inputNoOutline: {
    ...(Platform.OS === "web" && {
      outlineStyle: "none",
      outlineWidth: 0,
    } as Record<string, unknown>),
  },
  errorText: {
    fontSize: 14,
    color: "#dc2626",
    marginTop: 10,
  },
  rememberRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 20,
    gap: 10,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: BORDER_INPUT,
    backgroundColor: "#FFF",
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxChecked: {
    backgroundColor: GREEN_PRIMARY,
    borderColor: GREEN_PRIMARY,
  },
  rememberText: {
    fontSize: 15,
    color: TITLE_DARK,
    fontWeight: "500",
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
  buttonWrapDisabled: {
    shadowOpacity: 0,
    elevation: 0,
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
  buttonTextDisabled: {
    color: "#F1F5F9",
  },
  footerLine1: {
    marginTop: 28,
    fontSize: 12,
    color: FOOTER_GRAY,
    textAlign: "center",
  },
  footerLinksRow: {
    marginTop: 4,
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "center",
  },
  footerLine2: {
    fontSize: 12,
    color: FOOTER_GRAY,
    textAlign: "center",
  },
  footerLink: {
    color: LINK_GREEN,
    fontWeight: "600",
    fontSize: 12,
    textDecorationLine: "underline",
    textDecorationColor: LINK_GREEN,
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
    backgroundColor: MINT_SOFT,
    opacity: 0.6,
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
