/**
 * Onboarding Help — Zomato-style support layout on GatiMitra mint chrome.
 * Raise a Hand CTA, confirm-logout bottom sheet, GatiMitra Rider watermark.
 */
import { useMemo, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Pressable,
  Modal,
  useWindowDimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "@/src/theme";
import { RIDER_AUTH_BG, RIDER_AUTH_INK } from "@/src/theme/riderAuthTheme";
import { performRiderLogout } from "@/src/lib/performRiderLogout";
import { LanguageSelectionSheet } from "@/src/components/language/LanguageSelectionSheet";
import { onboardingStepMetaForRoute } from "@/src/lib/onboarding-routes";
import { useRiderBottomInset } from "@/src/hooks/useRiderBottomInset";

const CARD = "#FFFFFF";
const INK = RIDER_AUTH_INK;
const MUTED = "#64748B";
const ACCENT = colors.primary[600];
const CTA_BG = "#F3F4F6";
const SHEET_BG = "#111827";

function paramString(v: string | string[] | undefined): string | undefined {
  if (Array.isArray(v)) return v[0];
  return typeof v === "string" ? v : undefined;
}

function ConfirmLogoutSheet({
  visible,
  onClose,
  onConfirm,
}: {
  visible: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const insets = useSafeAreaInsets();
  const bottomInset = useRiderBottomInset();
  const { height } = useWindowDimensions();
  const maxH = Math.round(height * 0.48);

  if (!visible) return null;

  return (
    <Modal
      visible
      transparent
      animationType="slide"
      statusBarTranslucent
      presentationStyle="overFullScreen"
      onRequestClose={onClose}
    >
      <View style={sheetStyles.overlay}>
        <Pressable style={sheetStyles.backdrop} onPress={onClose} accessibilityLabel="Dismiss" />
        <View
          style={[
            sheetStyles.sheet,
            {
              maxHeight: maxH,
              paddingBottom: Math.max(bottomInset, insets.bottom) + 16,
            },
          ]}
        >
          <Pressable
            onPress={onClose}
            hitSlop={12}
            style={sheetStyles.closeBtn}
            accessibilityRole="button"
            accessibilityLabel="Close"
          >
            <Ionicons name="close" size={22} color="#FFFFFF" />
          </Pressable>

          <View style={sheetStyles.copy}>
            <Text style={sheetStyles.title} numberOfLines={2} adjustsFontSizeToFit>
              Confirm logout
            </Text>
            <Text style={sheetStyles.subtitle} numberOfLines={3}>
              Are you sure you want to logout?
            </Text>
          </View>

          <Pressable
            onPress={onClose}
            style={({ pressed }) => [sheetStyles.noBtn, pressed && { opacity: 0.88 }]}
            accessibilityRole="button"
            accessibilityLabel="No"
          >
            <Text style={sheetStyles.noBtnText}>No</Text>
          </Pressable>

          <Pressable
            onPress={onConfirm}
            style={({ pressed }) => [sheetStyles.yesBtn, pressed && { opacity: 0.92 }]}
            accessibilityRole="button"
            accessibilityLabel="Yes"
          >
            <Text style={sheetStyles.yesBtnText}>Yes</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

export default function OnboardingHelpScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const bottomInset = useRiderBottomInset();
  const { width } = useWindowDimensions();
  const params = useLocalSearchParams<{ step?: string }>();
  const [languageOpen, setLanguageOpen] = useState(false);
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);

  const stepMeta = useMemo(
    () => onboardingStepMetaForRoute(paramString(params.step) ?? ""),
    [params.step]
  );

  const stepLine =
    stepMeta.number != null
      ? `Step ${stepMeta.number} of ${stepMeta.total} — ${stepMeta.label}`
      : stepMeta.label;

  const openRaiseHand = () => {
    router.push({
      pathname: "/raise-ticket",
      params: {
        prelogin: "1",
        from: "onboarding",
        step: paramString(params.step) ?? "",
      },
    });
  };

  const confirmLogout = () => {
    setLogoutConfirmOpen(false);
    void performRiderLogout({
      reasonCode: "OTHER",
      reasonText: "Onboarding help logout",
      logoutAllDevices: false,
    });
  };

  const padH = Math.max(14, Math.min(20, Math.round(width * 0.045)));

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={[styles.header, { paddingHorizontal: padH }]}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={10}
          style={styles.backBtn}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <Ionicons name="arrow-back" size={22} color={INK} />
        </Pressable>
        <Text
          style={styles.headerTitle}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.8}
        >
          Help
        </Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingHorizontal: padH,
            paddingBottom: bottomInset + 28,
          },
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {stepMeta.label ? (
          <Text style={styles.contextLine}>
            GatiMitra support can help you finish onboarding
            {stepMeta.number != null || stepMeta.label ? ` (${stepLine})` : ""}.
          </Text>
        ) : null}

        {/* Connect / Raise a Hand — same pattern as Zomato "Get a callback" */}
        <View style={styles.agentCard}>
          <View style={styles.agentAvatarWrap} pointerEvents="none">
            <View style={styles.agentAvatar}>
              <Ionicons name="headset" size={32} color={ACCENT} />
            </View>
          </View>
          <Text
            style={styles.agentTitle}
            numberOfLines={2}
            adjustsFontSizeToFit
            minimumFontScale={0.85}
          >
            Connect with an agent
          </Text>
          <Text style={styles.agentSub}>
            GatiMitra support will help you finish onboarding
            {stepMeta.label ? ` (${stepLine})` : ""}.
          </Text>
          <Pressable
            onPress={openRaiseHand}
            style={({ pressed }) => [styles.raiseCta, pressed && { opacity: 0.92 }]}
            accessibilityRole="button"
            accessibilityLabel="Raise a Hand"
          >
            <Text
              style={styles.raiseCtaText}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.75}
            >
              Raise a Hand
            </Text>
          </Pressable>
        </View>

        <Text style={styles.sectionLabel}>App settings</Text>
        <View style={styles.settingsCard}>
          <Pressable
            style={styles.settingsRow}
            onPress={() => setLanguageOpen(true)}
            accessibilityRole="button"
            accessibilityLabel="App language"
          >
            <Ionicons name="language-outline" size={20} color={INK} />
            <Text
              style={styles.settingsText}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.8}
            >
              App language
            </Text>
            <Ionicons name="chevron-forward" size={18} color={MUTED} />
          </Pressable>
        </View>

        <Pressable
          onPress={() => setLogoutConfirmOpen(true)}
          style={({ pressed }) => [styles.logoutOutline, pressed && { opacity: 0.88 }]}
          accessibilityRole="button"
          accessibilityLabel="Logout"
        >
          <Ionicons name="log-out-outline" size={20} color={INK} />
          <Text style={styles.logoutOutlineText}>Logout</Text>
        </Pressable>

        <View style={styles.watermark}>
          <Text style={styles.watermarkBrand}>GatiMitra</Text>
          <View style={styles.watermarkPill}>
            <Text style={styles.watermarkPillText}>Rider</Text>
          </View>
        </View>
      </ScrollView>

      <LanguageSelectionSheet visible={languageOpen} onClose={() => setLanguageOpen(false)} />
      <ConfirmLogoutSheet
        visible={logoutConfirmOpen}
        onClose={() => setLogoutConfirmOpen(false)}
        onConfirm={confirmLogout}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignSelf: "stretch",
    width: "100%",
    backgroundColor: RIDER_AUTH_BG,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "stretch",
    paddingVertical: 10,
    gap: 8,
  },
  backBtn: {
    width: 40,
    height: 40,
    flexShrink: 0,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.92)",
  },
  headerTitle: {
    flex: 1,
    minWidth: 0,
    fontSize: 20,
    fontWeight: "800",
    color: INK,
  },
  headerSpacer: { width: 40, height: 40, flexShrink: 0 },
  scroll: {
    flex: 1,
    alignSelf: "stretch",
  },
  scrollContent: {
    flexGrow: 1,
    alignSelf: "stretch",
  },
  contextLine: {
    marginTop: 4,
    marginBottom: 8,
    fontSize: 13,
    lineHeight: 18,
    color: MUTED,
    flexShrink: 1,
  },
  agentCard: {
    alignSelf: "stretch",
    backgroundColor: CARD,
    borderRadius: 18,
    paddingHorizontal: 18,
    paddingTop: 44,
    paddingBottom: 18,
    alignItems: "center",
    marginTop: 28,
    borderWidth: 1,
    borderColor: "rgba(57, 211, 83, 0.22)",
  },
  agentAvatarWrap: {
    position: "absolute",
    top: -28,
    alignSelf: "center",
  },
  agentAvatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "#ECFDF5",
    borderWidth: 3,
    borderColor: CARD,
    alignItems: "center",
    justifyContent: "center",
  },
  agentTitle: {
    marginTop: 4,
    fontSize: 18,
    fontWeight: "800",
    color: INK,
    textAlign: "center",
    alignSelf: "stretch",
    paddingHorizontal: 4,
  },
  agentSub: {
    marginTop: 8,
    fontSize: 13,
    color: MUTED,
    textAlign: "center",
    lineHeight: 18,
    alignSelf: "stretch",
    paddingHorizontal: 4,
  },
  raiseCta: {
    marginTop: 18,
    alignSelf: "stretch",
    backgroundColor: CTA_BG,
    borderRadius: 10,
    paddingVertical: 15,
    paddingHorizontal: 14,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(15, 23, 42, 0.08)",
  },
  raiseCtaText: {
    fontSize: 16,
    fontWeight: "800",
    color: "#0B0B0B",
    textAlign: "center",
  },
  sectionLabel: {
    marginTop: 26,
    marginBottom: 10,
    fontSize: 16,
    fontWeight: "800",
    color: INK,
  },
  settingsCard: {
    alignSelf: "stretch",
    backgroundColor: CARD,
    borderRadius: 14,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(15, 23, 42, 0.06)",
  },
  settingsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 16,
    minWidth: 0,
  },
  settingsText: {
    flex: 1,
    minWidth: 0,
    fontSize: 15,
    fontWeight: "600",
    color: INK,
  },
  logoutOutline: {
    marginTop: 22,
    alignSelf: "stretch",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: "rgba(15, 23, 42, 0.35)",
    backgroundColor: "transparent",
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  logoutOutlineText: {
    fontSize: 15,
    fontWeight: "800",
    color: INK,
  },
  watermark: {
    marginTop: "auto",
    paddingTop: 40,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  watermarkBrand: {
    fontSize: 28,
    fontWeight: "800",
    color: "rgba(15, 23, 42, 0.28)",
    letterSpacing: 0.4,
  },
  watermarkPill: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: "rgba(15, 23, 42, 0.12)",
  },
  watermarkPillText: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.4,
    textTransform: "uppercase",
    color: "rgba(15, 23, 42, 0.45)",
  },
});

const sheetStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  sheet: {
    alignSelf: "stretch",
    width: "100%",
    backgroundColor: SHEET_BG,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingHorizontal: 20,
    paddingTop: 18,
  },
  closeBtn: {
    alignSelf: "flex-end",
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  copy: {
    alignItems: "center",
    paddingHorizontal: 12,
    marginTop: 4,
    marginBottom: 28,
  },
  title: {
    fontSize: 22,
    fontWeight: "800",
    color: "#FFFFFF",
    textAlign: "center",
  },
  subtitle: {
    marginTop: 10,
    fontSize: 15,
    lineHeight: 21,
    color: "rgba(255,255,255,0.78)",
    textAlign: "center",
  },
  noBtn: {
    alignSelf: "stretch",
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.85)",
    paddingVertical: 15,
    alignItems: "center",
    marginBottom: 12,
  },
  noBtnText: {
    fontSize: 16,
    fontWeight: "800",
    color: "#FFFFFF",
  },
  yesBtn: {
    alignSelf: "stretch",
    borderRadius: 12,
    backgroundColor: "#FFFFFF",
    paddingVertical: 15,
    alignItems: "center",
  },
  yesBtnText: {
    fontSize: 16,
    fontWeight: "800",
    color: "#0B0B0B",
  },
});
