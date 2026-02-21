/**
 * GatiMitra OTP Login – premium delivery-app style.
 * Centered card, soft white→mint gradient, logo top-left, hero illustration,
 * rounded input with focus glow, green gradient CTA, safe-area aware.
 */

import { useState, useEffect } from "react";
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
  Linking,
  Modal,
  FlatList,
  Pressable,
  Image,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { authService } from "@/services/auth.service";
import { COUNTRIES, DEFAULT_COUNTRY, type CountryOption } from "@/constants/countries";
import { getItem, setItem, removeItem } from "@/utils/storage";

const REMEMBER_ME_KEY = "gatimitra_remember_me";
const REMEMBERED_PHONE_KEY = "gatimitra_remembered_phone";

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
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [inputFocused, setInputFocused] = useState(false);
  const [selectedCountry, setSelectedCountry] = useState<CountryOption>(DEFAULT_COUNTRY);
  const [countryPickerVisible, setCountryPickerVisible] = useState(false);
  const [logoError, setLogoError] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);

  useEffect(() => {
    getItem(REMEMBER_ME_KEY).then((v) => setRememberMe(v === "true"));
    getItem(REMEMBERED_PHONE_KEY).then((v) => {
      if (v) setPhone(v);
    });
  }, []);

  const handleSendOtp = async () => {
    const digits = phone.replace(/\D/g, "");
    const minLen = selectedCountry.code === "IN" ? 10 : 7;
    if (digits.length < minLen) {
      setError(`Enter a valid mobile number (min ${minLen} digits)`);
      return;
    }
    setError("");
    setLoading(true);
    try {
      const phoneE164 = `${selectedCountry.dialCode}${digits}`;
      const res = await authService.sendOtp({ phoneE164 });
      if (rememberMe) {
        setItem(REMEMBER_ME_KEY, "true");
        setItem(REMEMBERED_PHONE_KEY, digits);
      } else {
        setItem(REMEMBER_ME_KEY, "false");
        removeItem(REMEMBERED_PHONE_KEY);
      }
      router.replace({
        pathname: "/(auth)/otp",
        params: { requestId: res.requestId, phoneE164 },
      });
    } catch (e: unknown) {
      const ax = e as { response?: { data?: { message?: string }; status?: number }; message?: string; code?: string };
      const msg = ax?.response?.data?.message ?? null;
      const isNetworkError =
        !ax?.response &&
        (ax?.code === "ECONNABORTED" ||
          ax?.message === "Network Error" ||
          (typeof ax?.message === "string" && ax.message.toLowerCase().includes("network")));
      setError(
        msg ||
          (isNetworkError
            ? "Cannot reach server. Ensure backend is running (npm run dev:backend) and, on a physical device, set EXPO_PUBLIC_API_BASE_URL to your PC IP (e.g. http://192.168.1.x:3001)."
            : "Failed to send OTP. Try again.")
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={[styles.container, { paddingBottom: insets.bottom }]}
    >
      <StatusBar style="dark" backgroundColor={BG_SCREEN} />
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
            <View style={styles.header}>
              {!logoError ? (
                <Image
                  source={require("../../public/img/logowithname.png")}
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
            </View>

            <HeroIllustration />

            <Text style={styles.title}>Login</Text>
            <Text style={styles.subtitle}>Enter your mobile number to get OTP</Text>

            <View style={styles.fieldWrap}>
              <Text style={styles.label}>Mobile number</Text>
              <View
                style={[
                  styles.inputRow,
                  inputFocused && styles.inputRowFocused,
                ]}
              >
                <TouchableOpacity
                  style={styles.countryTrigger}
                  onPress={() => setCountryPickerVisible(true)}
                  activeOpacity={0.8}
                  disabled={loading}
                >
                  <Text style={styles.flagEmoji}>{selectedCountry.flag}</Text>
                  <Text style={styles.countryCode}>{selectedCountry.dialCode}</Text>
                  <Ionicons name="chevron-down" size={18} color={TEXT_GRAY} />
                </TouchableOpacity>
                <View style={styles.inputDivider} />
                <TextInput
                  style={[styles.input, styles.inputNoOutline]}
                  placeholder="Enter mobile number"
                  placeholderTextColor={PLACEHOLDER_GRAY}
                  keyboardType="phone-pad"
                  maxLength={15}
                  value={phone}
                  onChangeText={(t) => setPhone(t.replace(/\D/g, ""))}
                  onFocus={() => setInputFocused(true)}
                  onBlur={() => setInputFocused(false)}
                  editable={!loading}
                  underlineColorAndroid="transparent"
                />
              </View>
              {error ? <Text style={styles.errorText}>{error}</Text> : null}
            </View>

            <TouchableOpacity
              style={styles.rememberRow}
              onPress={() => setRememberMe((v) => !v)}
              activeOpacity={0.8}
              disabled={loading}
            >
              <View style={[styles.checkbox, rememberMe && styles.checkboxChecked]}>
                {rememberMe ? (
                  <Ionicons name="checkmark" size={16} color="#fff" />
                ) : null}
              </View>
              <Text style={styles.rememberText}>Remember me</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={handleSendOtp}
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
                  <Text style={styles.buttonText}>Send OTP</Text>
                )}
              </LinearGradient>
            </TouchableOpacity>

            <Text style={styles.footerLine1}>By continuing, you agree to our</Text>
            <Text style={styles.footerLine2}>
              <Text
                style={styles.footerLink}
                onPress={() => Linking.openURL("/terms").catch(() => {})}
              >
                Terms of Service
              </Text>
              {" & "}
              <Text
                style={styles.footerLink}
                onPress={() => Linking.openURL("/privacy").catch(() => {})}
              >
                Privacy Policy
              </Text>
            </Text>
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
                <Text style={styles.modalTitle}>Select country</Text>
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
                    <Text style={styles.countryRowName}>{item.name}</Text>
                    <Text style={styles.countryRowDial}>{item.dialCode}</Text>
                  </TouchableOpacity>
                )}
              />
            </Pressable>
          </Pressable>
        </Modal>
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
    minHeight: 560,
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
  header: {
    alignSelf: "stretch",
    alignItems: "flex-start",
    marginBottom: 8,
  },
  logoImage: {
    width: 120,
    height: 36,
  },
  logoPlaceholder: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: MINT_SOFT,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  logoPlaceholderText: {
    fontSize: 16,
    fontWeight: "700",
    color: GREEN_PRIMARY,
    letterSpacing: 0.5,
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
    marginBottom: 28,
    textAlign: "center",
    lineHeight: 22,
  },
  fieldWrap: {
    width: "100%",
    marginBottom: 22,
  },
  label: {
    fontSize: 15,
    fontWeight: "500",
    color: TITLE_DARK,
    marginBottom: 10,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFF",
    borderWidth: 1,
    borderColor: "#E8ECF0",
    borderRadius: 14,
    paddingLeft: 4,
    minHeight: 54,
    overflow: "hidden",
    shadowColor: SHADOW_COLOR,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 6,
    elevation: 1,
  },
  inputRowFocused: {
    borderColor: "#80CBC4",
    borderWidth: 2,
    shadowColor: "rgba(128, 203, 196, 0.35)",
    shadowRadius: 10,
    elevation: 2,
  },
  countryTrigger: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 6,
  },
  flagEmoji: {
    fontSize: 22,
  },
  countryCode: {
    fontSize: 16,
    fontWeight: "600",
    color: TITLE_DARK,
  },
  inputDivider: {
    width: 1,
    height: 28,
    backgroundColor: "#E8ECF0",
    marginVertical: 6,
  },
  input: {
    flex: 1,
    paddingVertical: 14,
    paddingLeft: 16,
    paddingRight: 20,
    fontSize: 16,
    color: TITLE_DARK,
    minWidth: 0,
    borderWidth: 0,
    backgroundColor: "transparent",
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
  footerLine1: {
    marginTop: 28,
    fontSize: 12,
    color: FOOTER_GRAY,
    textAlign: "center",
  },
  footerLine2: {
    marginTop: 4,
    fontSize: 12,
    color: FOOTER_GRAY,
    textAlign: "center",
  },
  footerLink: {
    color: LINK_GREEN,
    fontWeight: "600",
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
