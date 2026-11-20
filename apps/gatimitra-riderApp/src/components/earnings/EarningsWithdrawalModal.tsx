import React, { useEffect, useMemo, useState } from "react";
import {
  Text,
  Modal,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Pressable,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { colors } from "@/src/theme";
import type { RiderBankPaymentMethod } from "@/src/services/api/riderApi";
import { riderApi } from "@/src/services/api/riderApi";
import { WithdrawProgressButton } from "@/src/components/earnings/WithdrawProgressButton";
import { useResponsiveLayout } from "@/src/hooks/useResponsiveLayout";
import { resolveRiderBottomInset } from "@/src/hooks/useRiderBottomInset";
import { ResponsiveSheetBody } from "@/src/components/ui/ResponsiveSheetBody";
import { flexShrinkText } from "@/src/theme/responsiveText";
import {
  formatAmountForInput,
  formatRupeesFull,
  formatRupeesShort,
  maxWithdrawalLimit,
  parseAmount,
  quickAmountOptions,
  sanitizeAmountInput,
  validateWithdrawAmount,
} from "@/src/lib/withdrawAmount";

const FALLBACK_MIN = 100;
const FALLBACK_MAX = 100_000;
const BRAND = colors.primary[700];

type Props = {
  visible: boolean;
  withdrawable: number;
  minWithdrawal?: number;
  maxWithdrawal?: number;
  bankAccount: RiderBankPaymentMethod | null | undefined;
  onClose: () => void;
  onSuccess: () => void;
};

export function EarningsWithdrawalModal({
  visible,
  withdrawable,
  minWithdrawal,
  maxWithdrawal,
  bankAccount,
  onClose,
  onSuccess,
}: Props) {
  const { t } = useTranslation();
  const { height, isShortHeight, insets } = useResponsiveLayout();
  const [amount, setAmount] = useState("");
  const [focused, setFocused] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const bottomPad = resolveRiderBottomInset(insets.bottom) + 12;
  const sheetMaxH = Math.round(height * (isShortHeight ? 0.86 : 0.9));

  const minAmount =
    Number.isFinite(minWithdrawal) && (minWithdrawal as number) > 0
      ? (minWithdrawal as number)
      : FALLBACK_MIN;
  const maxCap =
    Number.isFinite(maxWithdrawal) && (maxWithdrawal as number) > 0
      ? (maxWithdrawal as number)
      : FALLBACK_MAX;
  const limit = maxWithdrawalLimit(withdrawable, maxCap);
  const canWithdrawAny = limit >= minAmount;
  const parsed = parseAmount(amount);
  const validation = validateWithdrawAmount(parsed, minAmount, limit);
  const showError = !validation.ok && amount.trim() !== "" && validation.reason !== "empty";
  const quickAmounts = useMemo(() => quickAmountOptions(minAmount, limit), [minAmount, limit]);

  // Open pre-filled with the full withdrawable amount (most common request).
  useEffect(() => {
    if (!visible) return;
    setAmount(canWithdrawAny ? formatAmountForInput(limit) : "");
  }, [visible, limit, canWithdrawAny]);

  const handleAmountChange = (raw: string) => {
    setAmount(sanitizeAmountInput(raw));
  };

  const handleSubmit = async () => {
    if (!validation.ok) {
      Alert.alert(t("earnings.withdrawInvalid", "Invalid amount"), validation.message);
      return;
    }
    setSubmitting(true);
    try {
      await riderApi.createWithdrawalRequest(parsed);
      Alert.alert(
        t("earnings.withdrawSuccessTitle", "Withdrawal submitted"),
        t(
          "earnings.withdrawSuccessMessage",
          "Your withdrawal of {{amount}} has been submitted. Amount will be transferred within 24–48 hours.",
          { amount: formatRupeesFull(parsed) },
        ),
      );
      onSuccess();
      onClose();
    } catch (e) {
      Alert.alert(
        t("earnings.withdrawFailed", "Withdrawal failed"),
        e instanceof Error ? e.message : t("common.tryAgain", "Please try again"),
      );
    } finally {
      setSubmitting(false);
    }
  };

  const helper = !canWithdrawAny
    ? t("earnings.withdrawNeedMin", "You need at least {{min}} to withdraw.", {
        min: formatRupeesShort(minAmount),
      })
    : showError
      ? validation.message
      : t("earnings.withdrawLimitsShort", "Min {{min}} · Max {{max}} per request", {
          min: formatRupeesShort(minAmount),
          max: formatRupeesShort(limit),
        });

  const readyLabel = validation.ok
    ? t("earnings.withdrawAmountCta", "Withdraw {{amount}}", { amount: formatRupeesShort(parsed) })
    : t("earnings.submitWithdrawal", "Submit Withdrawal");

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={submitting ? undefined : onClose}>
        <Pressable
          style={[styles.sheet, { maxHeight: sheetMaxH }]}
          onPress={(e) => e.stopPropagation()}
        >
          <View style={styles.handle} />
          <ResponsiveSheetBody
            maxHeight={Math.max(280, sheetMaxH - bottomPad - 8)}
            contentContainerStyle={styles.bodyContent}
            footerStyle={styles.footerSlot}
            footerBottomInset={bottomPad}
            footer={
              <View>
                <WithdrawProgressButton
                  current={parsed}
                  minAmount={minAmount}
                  onPress={() => void handleSubmit()}
                  loading={submitting}
                  disabled={!validation.ok}
                  labelReady={readyLabel}
                  blockedLabel={
                    validation.ok
                      ? undefined
                      : validation.reason === "above_limit"
                        ? t("earnings.withdrawOverLimit", "Above your limit")
                        : t("earnings.enterAmount", "Enter an amount")
                  }
                />
                <TouchableOpacity
                  onPress={onClose}
                  disabled={submitting}
                  style={styles.cancelBtn}
                  accessibilityRole="button"
                >
                  <Text style={styles.cancelText} numberOfLines={1}>
                    {t("common.cancel", "Cancel")}
                  </Text>
                </TouchableOpacity>
              </View>
            }
          >
            {/* Header */}
            <View style={styles.headerRow}>
              <View style={styles.headerIcon}>
                <Ionicons name="wallet" size={18} color={BRAND} />
              </View>
              <Text style={[styles.title, flexShrinkText]} numberOfLines={1}>
                {t("earnings.withdrawToBank", "Withdraw to bank")}
              </Text>
              <TouchableOpacity
                onPress={onClose}
                disabled={submitting}
                hitSlop={10}
                style={styles.closeBtn}
                accessibilityRole="button"
                accessibilityLabel={t("common.close", "Close")}
              >
                <Ionicons name="close" size={20} color="#475569" />
              </TouchableOpacity>
            </View>

            {/* Balance hero */}
            <View style={styles.hero}>
              <View style={styles.heroGlow} />
              <Text style={styles.heroLabel} numberOfLines={1}>
                {t("earnings.availableToWithdraw", "Available to withdraw")}
              </Text>
              <Text style={[styles.heroAmount, flexShrinkText]} numberOfLines={1} adjustsFontSizeToFit>
                {formatRupeesFull(withdrawable)}
              </Text>
              <View style={styles.heroMetaRow}>
                <Ionicons name="time-outline" size={13} color="#CCFBF1" />
                <Text style={styles.heroMeta} numberOfLines={1}>
                  {t("earnings.withdrawEta", "Reaches your bank in 24–48 hours")}
                </Text>
              </View>
            </View>

            {/* Bank account */}
            {bankAccount ? (
              <View style={styles.bankCard}>
                <View style={styles.bankIcon}>
                  <Ionicons name="business" size={18} color={BRAND} />
                </View>
                <View style={styles.bankTextCol}>
                  <Text style={[styles.bankName, flexShrinkText]} numberOfLines={1}>
                    {bankAccount.bankName || t("earnings.bankAccount", "Bank account")}
                  </Text>
                  <Text style={styles.bankNumber} numberOfLines={1}>
                    {bankAccount.accountNumberMasked}
                  </Text>
                </View>
                {bankAccount.verificationStatus === "verified" ? (
                  <View style={styles.verifiedChip}>
                    <Ionicons name="checkmark-circle" size={13} color="#15803D" />
                    <Text style={styles.verifiedText}>{t("earnings.verified", "Verified")}</Text>
                  </View>
                ) : null}
              </View>
            ) : null}

            {/* Amount */}
            <Text style={styles.inputLabel} numberOfLines={1}>
              {t("earnings.enterAmountLabel", "Enter amount")}
            </Text>
            <View
              style={[
                styles.amountBox,
                focused ? styles.amountBoxFocused : null,
                showError ? styles.amountBoxError : null,
                !canWithdrawAny ? styles.amountBoxDisabled : null,
              ]}
            >
              <Text style={[styles.rupee, showError ? styles.errorText : null]}>₹</Text>
              <TextInput
                value={amount}
                onChangeText={handleAmountChange}
                keyboardType="decimal-pad"
                editable={canWithdrawAny && !submitting}
                onFocus={() => setFocused(true)}
                onBlur={() => setFocused(false)}
                style={styles.amountInput}
                placeholder={String(minAmount)}
                placeholderTextColor="#94A3B8"
                maxLength={10}
                selectionColor={BRAND}
                accessibilityLabel={t("earnings.withdrawAmount", "Amount (₹)")}
              />
              {amount !== "" && canWithdrawAny && !submitting ? (
                <TouchableOpacity onPress={() => setAmount("")} hitSlop={10}>
                  <Ionicons name="close-circle" size={20} color="#94A3B8" />
                </TouchableOpacity>
              ) : null}
            </View>

            <Text
              style={[styles.helper, showError || !canWithdrawAny ? styles.errorText : null, flexShrinkText]}
              numberOfLines={2}
            >
              {helper}
            </Text>

            {quickAmounts.length > 0 ? (
              <View style={styles.chipsRow}>
                {quickAmounts.map((v) => {
                  const isMax = v === limit;
                  const selected = parsed === v;
                  return (
                    <TouchableOpacity
                      key={v}
                      onPress={() => setAmount(formatAmountForInput(v))}
                      disabled={submitting}
                      style={[styles.chip, selected ? styles.chipSelected : null]}
                      accessibilityRole="button"
                    >
                      <Text
                        style={[styles.chipText, selected ? styles.chipTextSelected : null]}
                        numberOfLines={1}
                      >
                        {isMax
                          ? t("earnings.maxChip", "Max {{amount}}", { amount: formatRupeesShort(v) })
                          : formatRupeesShort(v)}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            ) : null}
          </ResponsiveSheetBody>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.55)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 8,
    overflow: "hidden",
    flexShrink: 1,
    minHeight: 0,
  },
  handle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#CBD5E1",
    marginBottom: 4,
  },
  bodyContent: {
    paddingTop: 8,
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  footerSlot: {
    paddingHorizontal: 20,
    paddingTop: 10,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 14,
  },
  headerIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.primary[50],
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    flex: 1,
    fontSize: 18,
    fontWeight: "800",
    color: "#0F172A",
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
    justifyContent: "center",
  },
  hero: {
    backgroundColor: BRAND,
    borderRadius: 18,
    paddingVertical: 18,
    paddingHorizontal: 18,
    marginBottom: 14,
    overflow: "hidden",
  },
  heroGlow: {
    position: "absolute",
    right: -40,
    top: -40,
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: "rgba(255,255,255,0.10)",
  },
  heroLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: "#CCFBF1",
  },
  heroAmount: {
    fontSize: 32,
    fontWeight: "800",
    color: "#FFFFFF",
    marginTop: 4,
    letterSpacing: -0.5,
  },
  heroMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: 8,
  },
  heroMeta: {
    fontSize: 12,
    fontWeight: "600",
    color: "#CCFBF1",
  },
  bankCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: "#F8FAFC",
    marginBottom: 18,
  },
  bankIcon: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    alignItems: "center",
    justifyContent: "center",
  },
  bankTextCol: {
    flex: 1,
    minWidth: 0,
  },
  bankName: {
    fontSize: 15,
    fontWeight: "700",
    color: "#0F172A",
  },
  bankNumber: {
    fontSize: 13,
    fontWeight: "600",
    color: "#64748B",
    marginTop: 2,
    letterSpacing: 0.5,
  },
  verifiedChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#F0FDF4",
    borderWidth: 1,
    borderColor: "#BBF7D0",
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  verifiedText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#15803D",
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: "#334155",
    marginBottom: 8,
  },
  amountBox: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1.5,
    borderColor: "#E2E8F0",
    borderRadius: 14,
    paddingHorizontal: 16,
    minHeight: 60,
    backgroundColor: "#FFFFFF",
    gap: 6,
  },
  amountBoxFocused: {
    borderColor: BRAND,
    backgroundColor: "#F0FDFA",
  },
  amountBoxError: {
    borderColor: "#DC2626",
    backgroundColor: "#FEF2F2",
  },
  amountBoxDisabled: {
    backgroundColor: "#F1F5F9",
  },
  rupee: {
    fontSize: 26,
    fontWeight: "800",
    color: "#0F172A",
  },
  amountInput: {
    flex: 1,
    fontSize: 26,
    fontWeight: "800",
    color: "#0F172A",
    paddingVertical: 10,
    includeFontPadding: false,
  },
  helper: {
    marginTop: 8,
    fontSize: 12.5,
    fontWeight: "600",
    color: "#64748B",
  },
  errorText: {
    color: "#DC2626",
  },
  chipsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 14,
  },
  chip: {
    borderWidth: 1,
    borderColor: "#CBD5E1",
    backgroundColor: "#FFFFFF",
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  chipSelected: {
    borderColor: BRAND,
    backgroundColor: colors.primary[50],
  },
  chipText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#334155",
  },
  chipTextSelected: {
    color: colors.primary[800],
  },
  cancelBtn: {
    marginTop: 10,
    alignItems: "center",
    paddingVertical: 10,
  },
  cancelText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#64748B",
  },
});
