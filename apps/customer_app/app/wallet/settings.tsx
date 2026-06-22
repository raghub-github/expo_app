/**
 * GatiCash wallet settings — Zomato Money reference UI.
 */

import { useMemo, useState, useEffect, type ReactNode } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Pressable,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Linking,
  BackHandler,
  Alert,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Ionicons } from "@expo/vector-icons";
import { AndroidBackHandler } from "@/components/AndroidBackHandler";
import { WalletSubpageHeader } from "@/components/wallet/WalletSubpageHeader";
import { BiPencilSquareIcon } from "@/components/icons/BiPencilSquareIcon";
import { GatiMitraColors } from "@/constants/gatimitra";
import { useProfile } from "@/hooks/useProfile";
import { formatIndianPhoneMasked } from "@/lib/formatIndianPhone";
import { walletService } from "@/services/wallet.service";

const PAGE_BG = "#F5F5F7";
const TEXT = "#111827";
const MUTED = "#6B7280";
const BORDER = "#E5E7EB";
const ACCENT = GatiMitraColors.primaryMint;
const ICON_BG = "#F3F4F6";

type ActionRowProps = {
  label: string;
  iconShape: "circle" | "square";
  onPress: () => void;
  leadingIcon?: ReactNode;
  ionIcon?: keyof typeof Ionicons.glyphMap;
};

function ActionRow({ label, iconShape, onPress, leadingIcon, ionIcon }: ActionRowProps) {
  return (
    <TouchableOpacity style={styles.actionRow} activeOpacity={0.75} onPress={onPress}>
      <View style={[styles.actionIconWrap, iconShape === "square" && styles.actionIconSquare]}>
        {leadingIcon ??
          (ionIcon ? <Ionicons name={ionIcon} size={18} color={TEXT} /> : null)}
      </View>
      <Text style={styles.actionLabel}>{label}</Text>
      <Ionicons name="chevron-forward" size={18} color="#C4C4C4" />
    </TouchableOpacity>
  );
}

export default function WalletSettingsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { data: profile } = useProfile();
  const [phoneModalVisible, setPhoneModalVisible] = useState(false);
  const [phoneInput, setPhoneInput] = useState("");
  const [phoneSubmitting, setPhoneSubmitting] = useState(false);

  const linkedPhone = useMemo(
    () => formatIndianPhoneMasked(profile?.mobile_number),
    [profile?.mobile_number]
  );

  const canContinue = phoneInput.length === 10;

  const openPhoneModal = () => {
    setPhoneInput("");
    setPhoneModalVisible(true);
  };

  const closePhoneModal = () => setPhoneModalVisible(false);

  useEffect(() => {
    if (!phoneModalVisible || Platform.OS !== "android") return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      closePhoneModal();
      return true;
    });
    return () => sub.remove();
  }, [phoneModalVisible]);

  const handleContinuePhoneChange = async () => {
    if (!canContinue || phoneSubmitting) return;
    setPhoneSubmitting(true);
    try {
      const result = await walletService.requestPhoneChange(phoneInput);
      setPhoneModalVisible(false);
      Alert.alert("Request submitted", result.message, [
        {
          text: "Contact support",
          onPress: () => {
            void Linking.openURL(
              "mailto:support@gatimitra.com?subject=GatiCash%20phone%20number%20change"
            );
          },
        },
        { text: "OK" },
      ]);
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        "Could not submit the request. Please try again or contact support.";
      Alert.alert("Unable to continue", message);
    } finally {
      setPhoneSubmitting(false);
    }
  };

  return (
    <>
      <AndroidBackHandler />
      <StatusBar style="dark" backgroundColor={PAGE_BG} />
      <View style={styles.screen}>
        <WalletSubpageHeader title="Settings" onBack={() => router.back()} />

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 24 }]}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.accountCard}>
            <View style={styles.accountIconWrap}>
              <Ionicons name="person-outline" size={20} color={MUTED} />
            </View>
            <View style={styles.accountTextWrap}>
              <Text style={styles.accountLabel}>Account linked with</Text>
              <Text style={styles.accountPhone}>{linkedPhone}</Text>
            </View>
          </View>

          <View style={styles.sectionHeader}>
            <View style={styles.accentBar} />
            <Text style={styles.sectionTitle}>Quick actions</Text>
          </View>

          <View style={styles.quickCard}>
            <ActionRow
              leadingIcon={<BiPencilSquareIcon size={18} color={TEXT} />}
              label="Change phone number"
              iconShape="square"
              onPress={openPhoneModal}
            />
            <View style={styles.separator} />
            <ActionRow
              ionIcon="help-circle-outline"
              label="FAQs"
              iconShape="circle"
              onPress={() => router.push("/wallet/faq")}
            />
          </View>
        </ScrollView>
      </View>

      <Modal visible={phoneModalVisible} transparent animationType="slide" onRequestClose={closePhoneModal}>
        <View style={styles.modalRoot}>
          <Pressable style={styles.modalOverlay} onPress={closePhoneModal} />

          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : undefined}
            style={styles.modalBottom}
          >
            <View style={styles.floatingCloseWrap}>
              <TouchableOpacity
                style={styles.floatingCloseBtn}
                activeOpacity={0.85}
                onPress={closePhoneModal}
                accessibilityLabel="Close"
              >
                <Ionicons name="close" size={22} color="#FFFFFF" />
              </TouchableOpacity>
            </View>

            <Pressable style={[styles.modalSheet, { paddingBottom: insets.bottom + 20 }]} onPress={(e) => e.stopPropagation()}>
              <Text style={styles.sheetTitle}>Change phone number</Text>

              <View style={styles.inputField}>
                <View style={styles.inputLabelWrap}>
                  <Text style={styles.inputLabel}>Phone number</Text>
                </View>
                <View style={styles.inputRow}>
                  <Text style={styles.prefix}>+91</Text>
                  <TextInput
                    style={styles.input}
                    value={phoneInput}
                    onChangeText={(v) => setPhoneInput(v.replace(/\D/g, "").slice(0, 10))}
                    keyboardType="phone-pad"
                    placeholder=""
                    placeholderTextColor="#9CA3AF"
                    maxLength={10}
                    autoFocus
                  />
                </View>
              </View>

              <View style={styles.infoRow}>
                <Ionicons name="information-circle-outline" size={17} color={MUTED} />
                <Text style={styles.infoText}>
                  The existing <Text style={styles.infoBold}>GatiCash</Text> balance will not be transferred to
                  the new phone number.
                </Text>
              </View>

              <TouchableOpacity
                style={[styles.continueBtn, (!canContinue || phoneSubmitting) && styles.continueBtnDisabled]}
                activeOpacity={0.88}
                disabled={!canContinue || phoneSubmitting}
                onPress={() => void handleContinuePhoneChange()}
              >
                {phoneSubmitting ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={[styles.continueText, !canContinue && styles.continueTextDisabled]}>
                    Continue
                  </Text>
                )}
              </TouchableOpacity>
            </Pressable>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </>
  );
}

const CARD_SHADOW = {
  shadowColor: "#0f172a",
  shadowOffset: { width: 0, height: 1 },
  shadowOpacity: 0.05,
  shadowRadius: 6,
  elevation: 2,
};

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: PAGE_BG },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingTop: 0 },
  accountCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 16,
    marginBottom: 22,
    ...CARD_SHADOW,
  },
  accountIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: ICON_BG,
    alignItems: "center",
    justifyContent: "center",
  },
  accountTextWrap: { flex: 1, minWidth: 0 },
  accountLabel: { fontSize: 14, color: MUTED, fontWeight: "500" },
  accountPhone: { fontSize: 17, fontWeight: "800", color: TEXT, marginTop: 4, letterSpacing: -0.2 },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
    paddingLeft: 2,
  },
  accentBar: {
    width: 3,
    height: 20,
    borderRadius: 2,
    backgroundColor: ACCENT,
  },
  sectionTitle: { fontSize: 18, fontWeight: "800", color: TEXT },
  quickCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    overflow: "hidden",
    ...CARD_SHADOW,
  },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  actionIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: ICON_BG,
    alignItems: "center",
    justifyContent: "center",
  },
  actionIconSquare: {
    borderRadius: 10,
  },
  actionLabel: { flex: 1, fontSize: 16, fontWeight: "600", color: TEXT },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: BORDER,
    marginLeft: 16 + 40 + 14,
  },
  modalRoot: {
    flex: 1,
    justifyContent: "flex-end",
  },
  modalOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  modalBottom: {
    width: "100%",
  },
  floatingCloseWrap: {
    alignItems: "center",
    marginBottom: 14,
    zIndex: 2,
  },
  floatingCloseBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#2D2D2D",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 6,
  },
  modalSheet: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 22,
  },
  sheetTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: TEXT,
    textAlign: "center",
    marginBottom: 24,
  },
  inputField: {
    borderWidth: 1,
    borderColor: TEXT,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingBottom: 14,
    paddingTop: 10,
    marginBottom: 18,
    position: "relative",
  },
  inputLabelWrap: {
    position: "absolute",
    top: -9,
    left: 12,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 4,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: MUTED,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 4,
  },
  prefix: {
    fontSize: 16,
    fontWeight: "700",
    color: TEXT,
  },
  input: {
    flex: 1,
    fontSize: 16,
    fontWeight: "700",
    color: TEXT,
    padding: 0,
    minHeight: 24,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    marginBottom: 22,
  },
  infoText: { flex: 1, fontSize: 13, color: MUTED, lineHeight: 19 },
  infoBold: { fontWeight: "800", color: TEXT },
  continueBtn: {
    backgroundColor: TEXT,
    borderRadius: 10,
    paddingVertical: 15,
    alignItems: "center",
  },
  continueBtnDisabled: {
    backgroundColor: "#E5E7EB",
  },
  continueText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  continueTextDisabled: {
    color: "#9CA3AF",
  },
});
