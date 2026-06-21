/**
 * GatiCash — Add money (Zomato reference UI). Gift card row disabled.
 */

import { useEffect, useMemo, useState, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  Alert,
  Modal,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  BackHandler,
  Keyboard,
  type KeyboardEvent,
  type ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Ionicons } from "@expo/vector-icons";
import { AndroidBackHandler } from "@/components/AndroidBackHandler";
import { BiPencilSquareIcon } from "@/components/icons/BiPencilSquareIcon";
import { WalletSubpageHeader } from "@/components/wallet/WalletSubpageHeader";
import { GatiMitraColors } from "@/constants/gatimitra";
import { walletService } from "@/services/wallet.service";

const PAGE_BG = "#F5F5F7";
const TEXT = "#111827";
const MUTED = "#6B7280";
const BORDER = "#E5E7EB";
const ACCENT = GatiMitraColors.primaryMint;
const ACCENT_SOFT = "#ECFDF5";
const WARN_BG = "#FFF4ED";
const WARN_TEXT = "#9A3412";

const PRESETS = [2000, 5000, 10000] as const;
const DEFAULT_THRESHOLD = 500;

function formatAmount(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "0";
  return value.toLocaleString("en-IN");
}

function parseDigits(value: string, max = 50000): number {
  const digits = value.replace(/\D/g, "");
  if (!digits) return 0;
  return Math.min(Number(digits), max);
}

export default function WalletAddMoneyScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [amount, setAmount] = useState(2000);
  const [autoAdd, setAutoAdd] = useState(false);
  const [autoAddAmount, setAutoAddAmount] = useState(2000);
  const [thresholdAmount, setThresholdAmount] = useState(DEFAULT_THRESHOLD);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [draftAutoAdd, setDraftAutoAdd] = useState("");
  const [draftThreshold, setDraftThreshold] = useState("");
  const [amountInputFocused, setAmountInputFocused] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [keyboardFooterHeight, setKeyboardFooterHeight] = useState(0);

  const effectiveKeyboardHeight =
    keyboardHeight || (amountInputFocused && Platform.OS === "android" ? 300 : 0);

  useEffect(() => {
    if (!amountInputFocused) {
      setKeyboardHeight(0);
      return;
    }

    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";

    const onShow = (event: KeyboardEvent) => {
      setKeyboardHeight(event.endCoordinates.height);
    };
    const onHide = () => setKeyboardHeight(0);

    const showSub = Keyboard.addListener(showEvent, onShow);
    const hideSub = Keyboard.addListener(hideEvent, onHide);

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [amountInputFocused]);

  useEffect(() => {
    setAutoAddAmount(amount);
  }, [amount]);

  useEffect(() => {
    let cancelled = false;
    void walletService
      .getSettings()
      .then((settings) => {
        if (cancelled) return;
        setAutoAdd(settings.auto_add_enabled);
        if (settings.auto_add_amount > 0) {
          setAutoAddAmount(settings.auto_add_amount);
          setAmount(settings.auto_add_amount);
        }
        if (settings.auto_add_threshold > 0) {
          setThresholdAmount(settings.auto_add_threshold);
        }
      })
      .catch(() => {
        /* settings API unavailable until migrations are applied */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const persistSettings = useCallback(
    async (next: {
      auto_add_enabled?: boolean;
      auto_add_amount?: number;
      auto_add_threshold?: number;
    }) => {
      try {
        await walletService.updateSettings(next);
      } catch {
        /* keep local UI state; backend may not be migrated yet */
      }
    },
    []
  );

  const amountDisplay = useMemo(() => formatAmount(amount), [amount]);

  const showThresholdWarning = autoAdd && thresholdAmount > amount;
  const canProceed = amount > 0 && !showThresholdWarning;

  const openEditModal = () => {
    setDraftAutoAdd(String(autoAddAmount || ""));
    setDraftThreshold(String(thresholdAmount || ""));
    setEditModalVisible(true);
  };

  const closeEditModal = () => setEditModalVisible(false);

  useEffect(() => {
    if (!editModalVisible || Platform.OS !== "android") return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      closeEditModal();
      return true;
    });
    return () => sub.remove();
  }, [editModalVisible]);

  const saveAutoAddSettings = () => {
    const nextAuto = parseDigits(draftAutoAdd);
    const nextThreshold = parseDigits(draftThreshold);
    if (nextAuto <= 0 || nextThreshold <= 0) return;
    setAutoAddAmount(nextAuto);
    setThresholdAmount(nextThreshold);
    setAmount(nextAuto);
    closeEditModal();
    void persistSettings({
      auto_add_enabled: autoAdd,
      auto_add_amount: nextAuto,
      auto_add_threshold: nextThreshold,
    });
  };

  const canSaveAutoAdd =
    parseDigits(draftAutoAdd) > 0 && parseDigits(draftThreshold) > 0;

  const onAddPaymentMethod = () => {
    if (!canProceed) return;
    Alert.alert(
      "Coming soon",
      "Payment methods for GatiCash top-up will be available soon.",
      [{ text: "OK" }]
    );
  };

  const renderPaymentCta = useCallback(
    (containerStyle?: ViewStyle) => (
      <View style={[styles.ctaStack, containerStyle]}>
        {showThresholdWarning ? (
          <View style={styles.warningBanner}>
            <Text style={styles.warningText}>
              Threshold amount cannot be greater than add money amount
            </Text>
          </View>
        ) : null}

        <TouchableOpacity
          style={[styles.ctaBtn, !canProceed && styles.ctaBtnDisabled]}
          activeOpacity={0.88}
          disabled={!canProceed}
          onPress={onAddPaymentMethod}
        >
          <Text style={styles.ctaText}>Add Payment Method</Text>
          <Ionicons name="chevron-forward" size={18} color="#FFFFFF" />
        </TouchableOpacity>
      </View>
    ),
    [canProceed, onAddPaymentMethod, showThresholdWarning]
  );

  const keyboardScrollPadding =
    effectiveKeyboardHeight + keyboardFooterHeight + (showThresholdWarning ? 12 : 0) + 16;

  return (
    <>
      <AndroidBackHandler />
      <StatusBar style="dark" backgroundColor={PAGE_BG} />
      <View style={styles.screen}>
        <WalletSubpageHeader title="Add money" onBack={() => router.back()} />

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[
            styles.scrollContent,
            {
              paddingBottom: amountInputFocused
                ? keyboardScrollPadding
                : insets.bottom + 120,
            },
          ]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.amountCard}>
            <Text style={styles.enterLabel}>Enter amount</Text>
            <View style={styles.amountRow}>
              <Text style={styles.rupee}>₹</Text>
              <TextInput
                style={styles.amountInput}
                value={amountDisplay}
                onChangeText={(v) => setAmount(parseDigits(v))}
                keyboardType="number-pad"
                maxLength={8}
                onFocus={() => setAmountInputFocused(true)}
                onBlur={() => {
                  setAmountInputFocused(false);
                  setKeyboardFooterHeight(0);
                }}
              />
            </View>

            <View style={styles.presetRow}>
              {PRESETS.map((preset) => {
                const active = amount === preset;
                return (
                  <TouchableOpacity
                    key={preset}
                    style={[styles.presetChip, active && styles.presetChipActive]}
                    activeOpacity={0.85}
                    onPress={() => setAmount(preset)}
                  >
                    <Text style={[styles.presetText, active && styles.presetTextActive]}>
                      ₹{formatAmount(preset)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          <View style={styles.autoAddCard}>
            <TouchableOpacity
              style={styles.checkboxHit}
              activeOpacity={0.85}
              onPress={() => {
                setAutoAdd((v) => {
                  const next = !v;
                  void persistSettings({
                    auto_add_enabled: next,
                    auto_add_amount: autoAddAmount,
                    auto_add_threshold: thresholdAmount,
                  });
                  return next;
                });
              }}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: autoAdd }}
            >
              <View style={[styles.checkbox, autoAdd && styles.checkboxChecked]}>
                {autoAdd ? <Ionicons name="checkmark" size={14} color="#fff" /> : null}
              </View>
            </TouchableOpacity>

            <View style={styles.autoAddTextWrap}>
              <Text style={styles.autoAddTitle}>Auto-add ₹{formatAmount(autoAddAmount)}</Text>
              <View style={styles.autoAddSubRow}>
                <Text style={styles.autoAddSub}>
                  when balance goes below ₹{formatAmount(thresholdAmount)}
                </Text>
                <TouchableOpacity
                  onPress={openEditModal}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  accessibilityLabel="Edit auto-add settings"
                >
                  <BiPencilSquareIcon size={14} color={ACCENT} />
                </TouchableOpacity>
              </View>
            </View>
          </View>

          {!amountInputFocused ? (
            <>
              <Text style={styles.sectionLabel}>ADD WITH GIFT CARD</Text>
              <View
                pointerEvents="none"
                style={styles.giftCardRowBlocked}
                accessibilityState={{ disabled: true }}
              >
                <Ionicons name="gift-outline" size={20} color={MUTED} />
                <Text style={styles.giftCardLabel}>Claim a gift card</Text>
                <Ionicons name="chevron-forward" size={18} color="#D1D5DB" />
              </View>
              <Text style={styles.comingSoonHint}>Coming soon</Text>

              <Text style={[styles.sectionLabel, { marginTop: 22 }]}>NOTE</Text>
              <View style={styles.noteCard}>
                <Text style={styles.noteBullet}>• Money added has an expiry of 10 years</Text>
                <Text style={styles.noteBullet}>
                  • Balance cannot be transferred to a bank account as per RBI guidelines
                </Text>
                <Text style={styles.noteBullet}>
                  • GatiCash can be used exclusively on GatiMitra.
                </Text>
              </View>
            </>
          ) : null}
        </ScrollView>

        {amountInputFocused ? (
          <View
            style={[
              styles.keyboardStickyFooter,
              { bottom: effectiveKeyboardHeight, paddingBottom: insets.bottom > 0 ? 8 : 12 },
            ]}
            onLayout={(event) => {
              setKeyboardFooterHeight(event.nativeEvent.layout.height);
            }}
          >
            {renderPaymentCta()}
          </View>
        ) : (
          <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
            {renderPaymentCta()}
          </View>
        )}
      </View>

      <Modal visible={editModalVisible} transparent animationType="slide" onRequestClose={closeEditModal}>
        <View style={styles.modalRoot}>
          <Pressable style={styles.modalOverlay} onPress={closeEditModal} />

          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : undefined}
            style={styles.modalBottom}
          >
            <View style={styles.floatingCloseWrap}>
              <TouchableOpacity
                style={styles.floatingCloseBtn}
                activeOpacity={0.85}
                onPress={closeEditModal}
                accessibilityLabel="Close"
              >
                <Ionicons name="close" size={22} color="#FFFFFF" />
              </TouchableOpacity>
            </View>

            <Pressable
              style={[styles.modalSheet, { paddingBottom: insets.bottom + 20 }]}
              onPress={(e) => e.stopPropagation()}
            >
              <Text style={styles.sheetTitle}>Add money</Text>
              <Text style={styles.sheetSubtitle}>You can add a maximum of ₹50,000 in this month</Text>

              <Text style={styles.fieldGroupLabel}>Automatically add</Text>
              <View style={[styles.inputField, styles.inputFieldActive]}>
                <View style={styles.inputLabelWrap}>
                  <Text style={styles.inputLabel}>Amount</Text>
                </View>
                <View style={styles.inputRow}>
                  <Text style={styles.prefix}>₹</Text>
                  <TextInput
                    style={styles.modalInput}
                    value={draftAutoAdd}
                    onChangeText={(v) => setDraftAutoAdd(v.replace(/\D/g, "").slice(0, 6))}
                    keyboardType="number-pad"
                  />
                </View>
              </View>

              <Text style={[styles.fieldGroupLabel, { marginTop: 16 }]}>when balance goes below</Text>
              <View style={styles.inputField}>
                <View style={styles.inputLabelWrap}>
                  <Text style={styles.inputLabel}>Threshold Amount</Text>
                </View>
                <View style={styles.inputRow}>
                  <Text style={styles.prefix}>₹</Text>
                  <TextInput
                    style={styles.modalInput}
                    value={draftThreshold}
                    onChangeText={(v) => setDraftThreshold(v.replace(/\D/g, "").slice(0, 6))}
                    keyboardType="number-pad"
                  />
                </View>
              </View>

              <TouchableOpacity
                style={[styles.continueBtn, !canSaveAutoAdd && styles.continueBtnDisabled]}
                activeOpacity={0.88}
                disabled={!canSaveAutoAdd}
                onPress={saveAutoAddSettings}
              >
                <Text style={[styles.continueText, !canSaveAutoAdd && styles.continueTextDisabled]}>
                  Continue
                </Text>
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
  scrollContent: { paddingHorizontal: 16, paddingTop: 4 },
  amountCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 18,
    marginBottom: 14,
    ...CARD_SHADOW,
  },
  enterLabel: { fontSize: 13, color: MUTED, fontWeight: "500", marginBottom: 8 },
  amountRow: { flexDirection: "row", alignItems: "center" },
  rupee: { fontSize: 28, fontWeight: "800", color: TEXT, marginRight: 4 },
  amountInput: {
    flex: 1,
    fontSize: 28,
    fontWeight: "800",
    color: TEXT,
    padding: 0,
    letterSpacing: -0.5,
  },
  presetRow: { flexDirection: "row", gap: 10, marginTop: 18 },
  presetChip: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: "#FFFFFF",
  },
  presetChipActive: {
    borderColor: ACCENT,
    backgroundColor: ACCENT_SOFT,
  },
  presetText: { fontSize: 14, fontWeight: "700", color: TEXT },
  presetTextActive: { color: "#15803D" },
  autoAddCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 16,
    marginBottom: 22,
    ...CARD_SHADOW,
  },
  checkboxHit: { paddingTop: 2 },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: ACCENT,
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxChecked: {
    backgroundColor: ACCENT,
    borderColor: ACCENT,
  },
  autoAddTextWrap: { flex: 1 },
  autoAddTitle: { fontSize: 16, fontWeight: "800", color: TEXT },
  autoAddSubRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 },
  autoAddSub: { fontSize: 14, color: MUTED, fontWeight: "500" },
  sectionLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: MUTED,
    letterSpacing: 1,
    marginBottom: 10,
  },
  giftCardRowBlocked: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 16,
    opacity: 0.42,
    ...CARD_SHADOW,
  },
  giftCardLabel: {
    flex: 1,
    fontSize: 16,
    fontWeight: "600",
    color: MUTED,
  },
  comingSoonHint: {
    fontSize: 11,
    color: MUTED,
    marginTop: 6,
    marginLeft: 4,
    fontWeight: "500",
  },
  noteCard: { gap: 10 },
  noteBullet: { fontSize: 13, color: MUTED, lineHeight: 20 },
  ctaStack: { gap: 10 },
  keyboardStickyFooter: {
    position: "absolute",
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    paddingTop: 8,
    backgroundColor: PAGE_BG,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: BORDER,
  },
  footer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    paddingTop: 8,
    backgroundColor: PAGE_BG,
    gap: 10,
  },
  warningBanner: {
    backgroundColor: WARN_BG,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  warningText: {
    fontSize: 13,
    fontWeight: "600",
    color: WARN_TEXT,
    textAlign: "center",
    lineHeight: 18,
  },
  ctaBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: ACCENT,
    borderRadius: 12,
    paddingVertical: 16,
  },
  ctaBtnDisabled: {
    opacity: 0.45,
  },
  ctaText: { fontSize: 16, fontWeight: "700", color: "#FFFFFF" },
  modalRoot: {
    flex: 1,
    justifyContent: "flex-end",
  },
  modalOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  modalBottom: { width: "100%" },
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
  },
  sheetSubtitle: {
    fontSize: 13,
    color: MUTED,
    textAlign: "center",
    marginTop: 6,
    marginBottom: 22,
    lineHeight: 18,
  },
  fieldGroupLabel: {
    fontSize: 14,
    fontWeight: "700",
    color: TEXT,
    marginBottom: 10,
  },
  inputField: {
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingBottom: 14,
    paddingTop: 10,
    position: "relative",
  },
  inputFieldActive: {
    borderColor: TEXT,
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
    gap: 4,
    marginTop: 4,
  },
  prefix: {
    fontSize: 16,
    fontWeight: "700",
    color: TEXT,
  },
  modalInput: {
    flex: 1,
    fontSize: 16,
    fontWeight: "700",
    color: TEXT,
    padding: 0,
    minHeight: 24,
  },
  continueBtn: {
    backgroundColor: ACCENT,
    borderRadius: 10,
    paddingVertical: 15,
    alignItems: "center",
    marginTop: 24,
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
