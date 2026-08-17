// @ts-nocheck — pending strict-mode cleanup; tracked in follow-up issue.
"use client";

/**
 * Step 4 · Bank Account Verification (hybrid)
 * Cashfree: Account number + IFSC → Verify Instantly.
 * Fallback (hybrid fail): slim form like earnings withdraw — holder (Aadhaar),
 * account, confirm, IFSC (+ bank name from Cashfree when available).
 */
import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  TextInput,
  ScrollView,
  StyleSheet,
  Platform,
  Pressable,
  KeyboardAvoidingView,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useOnboardingStore } from "@/src/stores/onboardingStore";
import { colors } from "@/src/theme";
import {
  useCreateRiderBankPaymentMethod,
  useRiderBankPaymentMethod,
  useRiderBankAddGate,
} from "@/src/hooks/useRiderBankAccount";
import {
  useVerificationModes,
  useVerifyDocument,
} from "@/src/hooks/useOnboarding";
import { extractApiErrorMessage } from "@/src/services/http";
import {
  ContinueButton,
  FieldLabel,
  ErrorBanner,
  onboardingFormStyles as form,
} from "@/src/components/onboarding/OnboardingFormUi";
import { notifyOnboardingToast } from "@/src/lib/rider-onboarding-toast";
import type { EvState } from "@/src/components/onboarding/ElectronicVerifyCard";
import { useUnlockCountdown } from "@/src/hooks/useUnlockCountdown";
import { useBankAccountDuplicateCheck } from "@/src/hooks/useBankAccountDuplicateCheck";

const ACCENT_DARK = "#22a745";
const BG = "#f4fbf6";
const IFSC_RE = /^[A-Z]{4}0[A-Z0-9]{6}$/i;
const ACCOUNT_RE = /^\d{9,18}$/;

function goBackOrReplace(href: `/(onboarding)/${string}`) {
  if (router.canGoBack()) router.back();
  else router.replace(href);
}

function maskAccount(raw: string): string {
  const d = raw.replace(/\D/g, "");
  if (d.length <= 4) return "••••";
  return `•••• ${d.slice(-4)}`;
}

export default function BankAccountOnboardingScreen() {
  const { data, setData, hydrate } = useOnboardingStore();
  const createBank = useCreateRiderBankPaymentMethod();
  const bankQuery = useRiderBankPaymentMethod();
  const existingBank = bankQuery.data;
  const { data: addGate } = useRiderBankAddGate();
  const countdown = useUnlockCountdown(addGate?.unlockAt);
  const addLocked = Boolean(addGate?.locked && countdown.locked);
  const { data: modesData } = useVerificationModes();
  const verifyDocument = useVerifyDocument();

  const bankMode = (modesData?.modes?.bank_account ?? "hybrid") as
    | "manual"
    | "auto"
    | "hybrid"
    | "disabled";
  const bankElectronic = bankMode === "auto" || bankMode === "hybrid";

  const aadhaarName = String(data.fullName || "").trim();

  const [accountNumber, setAccountNumber] = useState("");
  const [confirmAccountNumber, setConfirmAccountNumber] = useState("");
  const [ifsc, setIfsc] = useState("");
  const [bankName, setBankName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [bankEv, setBankEv] = useState<EvState>({ phase: "idle" });
  const [showFallbackForm, setShowFallbackForm] = useState(!bankElectronic);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  useEffect(() => {
    if (!existingBank) return;
    if (existingBank.verificationStatus === "rejected") return;
    if (data.bankAccountOnboardingDone) return;
    void setData({ bankAccountOnboardingDone: true });
  }, [existingBank, data.bankAccountOnboardingDone, setData]);

  useEffect(() => {
    if (!bankElectronic) setShowFallbackForm(true);
  }, [bankElectronic]);

  const vehicleReady =
    Boolean(data.vehicleChoice?.trim()) &&
    data.vehicleOnboardingSubmittedFor?.trim() === data.vehicleChoice.trim();

  useEffect(() => {
    if (!data.vehicleChoice) {
      router.replace("/(onboarding)/dl-rc");
    }
  }, [data.vehicleChoice]);

  const accountOk = ACCOUNT_RE.test(accountNumber);
  const ifscOk = IFSC_RE.test(ifsc.trim());
  const confirmOk =
    confirmAccountNumber.length === 0 || confirmAccountNumber === accountNumber;
  const accountMismatch =
    confirmAccountNumber.length > 0 && confirmAccountNumber !== accountNumber;

  const alreadyLinked =
    existingBank?.verificationStatus === "verified" ||
    existingBank?.verificationStatus === "pending";
  const rejectedExisting =
    existingBank?.verificationStatus === "rejected" ? existingBank : null;

  const dupCheck = useBankAccountDuplicateCheck(accountNumber, accountOk && !alreadyLinked);

  useEffect(() => {
    if (!dupCheck.duplicate) return;
    setBankEv({ phase: "idle" });
    if (bankElectronic) setShowFallbackForm(false);
    if (dupCheck.message) setError(dupCheck.message);
  }, [dupCheck.duplicate, dupCheck.message, bankElectronic]);

  const canVerify =
    accountOk &&
    ifscOk &&
    Boolean(data.riderId) &&
    !dupCheck.duplicate &&
    !dupCheck.checking &&
    !addLocked;
  const canFallbackSubmit =
    aadhaarName.length >= 2 &&
    accountOk &&
    ifscOk &&
    confirmAccountNumber === accountNumber &&
    (bankName.trim().length >= 1 || bankEv.phase === "verified") &&
    !dupCheck.duplicate &&
    !dupCheck.checking &&
    !addLocked;

  const handleBack = () => {
    if (data.vehicleOnboardingFlow === "rental_ev") {
      goBackOrReplace("/(onboarding)/rental-ev");
      return;
    }
    goBackOrReplace("/(onboarding)/dl-rc");
  };

  const goToPayment = async () => {
    await setData({ bankAccountOnboardingDone: true });
    router.replace("/(onboarding)/payment");
  };

  const saveBankAndContinue = async (opts?: {
    bankNameOverride?: string;
    fromElectronic?: boolean;
  }) => {
    if (existingBank || data.bankAccountOnboardingDone) {
      await goToPayment();
      return;
    }
    if (!accountOk || !ifscOk) {
      setError("Enter a valid account number and IFSC");
      return;
    }
    if (!opts?.fromElectronic && accountNumber !== confirmAccountNumber) {
      setError("Account numbers do not match");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      if (addLocked) {
        const msg = `Locked due to security reasons. Try after ${countdown.label ?? "—"}.`;
        setError(msg);
        notifyOnboardingToast(msg);
        return;
      }
      const details =
        bankEv.phase === "verified" ? bankEv.details : ({} as Record<string, unknown>);
      const resolvedBankName =
        String(opts?.bankNameOverride || bankName || details.bank_name || "Bank").trim() ||
        "Bank";
      await createBank.mutateAsync({
        accountHolderName: aadhaarName || "Rider",
        bankName: resolvedBankName,
        ifsc: ifsc.trim().toUpperCase(),
        accountNumber,
      });
      await goToPayment();
    } catch (e) {
      const message = extractApiErrorMessage(e, "Could not save bank account");
      setError(message);
      notifyOnboardingToast(message);
    } finally {
      setSubmitting(false);
    }
  };

  const runBankVerify = async () => {
    if (!data.riderId || !canVerify) return;
    setBankEv({ phase: "verifying" });
    setError(null);
    try {
      const res = await verifyDocument.mutateAsync({
        riderId: data.riderId,
        docKind: "bank_account",
        bankAccount: accountNumber,
        ifsc: ifsc.trim().toUpperCase(),
        name: aadhaarName || undefined,
      });
      if (res.outcome === "verified") {
        const details = res.verifiedData ?? {};
        setBankEv({ phase: "verified", details });
        setShowFallbackForm(false);
        if (typeof details.bank_name === "string" && details.bank_name.trim()) {
          setBankName(details.bank_name.trim());
        }
        if (typeof details.branch_name === "string" && details.branch_name.trim()) {
          // branch unused in slim save — bank name is enough
        }
      } else if (res.outcome === "mismatch") {
        setBankEv({
          phase: "mismatch",
          error:
            res.error ||
            (res.mismatchMessages && res.mismatchMessages.join(". ")) ||
            "Name at bank does not match Aadhaar",
          reasons: res.mismatchReasons,
        });
        if (bankMode === "hybrid") setShowFallbackForm(true);
        if (res.verifiedData?.bank_name) {
          setBankName(String(res.verifiedData.bank_name));
        }
      } else if (res.outcome === "manual") {
        setBankEv({ phase: "manual" });
        if (bankMode === "hybrid") setShowFallbackForm(true);
      } else {
        const exact =
          (typeof res.error === "string" && res.error.trim()) ||
          (typeof res.providerMessage === "string" && res.providerMessage.trim()) ||
          "Bank account could not be verified.";
        setBankEv({
          phase: "failed",
          error: exact,
          providerReference: res.providerReference ?? null,
          verificationId: res.verificationId ?? null,
        });
        if (bankMode === "hybrid") setShowFallbackForm(true);
      }
    } catch (e) {
      const message = extractApiErrorMessage(e, "Bank verification failed");
      setBankEv({ phase: "failed", error: message });
      if (bankMode === "hybrid") setShowFallbackForm(true);
      notifyOnboardingToast(message);
    }
  };

  const verifiedDetails =
    bankEv.phase === "verified" ? bankEv.details : null;

  const detailRows = useMemo(() => {
    if (!verifiedDetails) return [];
    const rows: Array<{ label: string; value: string }> = [];
    const push = (label: string, key: string) => {
      const v = verifiedDetails[key];
      if (v == null || String(v).trim() === "") return;
      rows.push({ label, value: String(v).trim() });
    };
    push("Name at bank", "name_at_bank");
    push("Bank", "bank_name");
    push("Branch", "branch_name");
    push("IFSC", "ifsc");
    if (accountNumber) rows.push({ label: "Account", value: maskAccount(accountNumber) });
    push("Status", "account_status");
    return rows.slice(0, 8);
  }, [verifiedDetails, accountNumber]);

  return (
    <View style={form.root}>
      <StatusBar style="dark" backgroundColor={BG} translucent={false} />
      <SafeAreaView style={form.safeArea} edges={["top", "bottom"]}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={form.flex}
        >
          <ScrollView
            contentContainerStyle={form.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <LinearGradient
              colors={["#dff5e4", BG]}
              start={{ x: 0.5, y: 0 }}
              end={{ x: 0.5, y: 1 }}
              style={form.header}
            >
              <Pressable onPress={handleBack} style={form.backBtn} accessibilityRole="button">
                <Ionicons name="arrow-back" size={20} color={colors.gray[700]} />
              </Pressable>

              <View style={form.stepPill}>
                <Ionicons name="business-outline" size={14} color={ACCENT_DARK} />
                <Text style={form.stepPillText}>Step 4 · Bank Account Verification</Text>
              </View>

              <Text style={form.title}>Bank Account</Text>
              <Text style={form.subtitle}>
                {bankElectronic
                  ? "Enter account number + IFSC and verify instantly. Same name as Aadhaar works best."
                  : "Add your bank account for payouts. Use the same name as on your Aadhaar."}
              </Text>
            </LinearGradient>

            <View style={styles.body}>
              {error ? <ErrorBanner message={error} /> : null}

              {rejectedExisting && !addLocked ? (
                <Text style={styles.warnText}>
                  {rejectedExisting.rejectionReason
                    ? `Previous account rejected: ${rejectedExisting.rejectionReason}`
                    : "Previous bank account was rejected. Add a valid account to continue."}
                </Text>
              ) : null}

              {addLocked ? (
                <Text style={styles.warnText}>
                  Locked due to security reasons. Try after {countdown.label ?? "—"}.
                </Text>
              ) : null}

              {alreadyLinked ? (
                <View style={styles.linkedCard}>
                  <Ionicons name="shield-checkmark" size={20} color="#059669" />
                  <View style={{ flex: 1, gap: 4 }}>
                    <Text style={styles.linkedTitle}>Bank account already linked</Text>
                    <Text style={styles.linkedText}>
                      {existingBank?.bankName || "Bank"} ·{" "}
                      {existingBank?.accountNumberMasked || "••••"}
                    </Text>
                  </View>
                </View>
              ) : (
                <>
                  <View style={form.fieldGroup}>
                    <FieldLabel label="Account holder name" required />
                    <View style={[form.inputWrap, styles.readOnlyWrap]}>
                      <TextInput
                        value={aadhaarName}
                        editable={false}
                        style={[form.textInput, styles.readOnlyInput]}
                        placeholder="As per Aadhaar"
                        placeholderTextColor={colors.gray[400]}
                      />
                      <Ionicons name="lock-closed-outline" size={16} color={colors.gray[400]} />
                    </View>
                    <Text style={styles.hint}>Locked to your Aadhaar name.</Text>
                  </View>

                  <View style={form.fieldGroup}>
                    <FieldLabel label="Account number" required />
                    <View style={form.inputWrap}>
                      <TextInput
                        value={accountNumber}
                        onChangeText={(v) => {
                          setAccountNumber(v.replace(/\D/g, "").slice(0, 18));
                          if (bankEv.phase === "verified") setBankEv({ phase: "idle" });
                          setError(null);
                        }}
                        style={form.textInput}
                        placeholder="1234567890"
                        placeholderTextColor={colors.gray[400]}
                        keyboardType="number-pad"
                        maxLength={18}
                        editable={bankEv.phase !== "verifying"}
                      />
                    </View>
                  </View>

                  <View style={form.fieldGroup}>
                    <FieldLabel label="IFSC code" required />
                    <View style={form.inputWrap}>
                      <TextInput
                        value={ifsc}
                        onChangeText={(v) => {
                          setIfsc(v.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 11));
                          if (bankEv.phase === "verified") setBankEv({ phase: "idle" });
                          setError(null);
                        }}
                        style={form.textInput}
                        placeholder="SBIN0001234"
                        placeholderTextColor={colors.gray[400]}
                        autoCapitalize="characters"
                        autoCorrect={false}
                        maxLength={11}
                        editable={bankEv.phase !== "verifying"}
                      />
                    </View>
                  </View>

                  {bankElectronic && bankEv.phase !== "verified" ? (
                    <TouchableOpacity
                      style={[styles.verifyBtn, (!canVerify || bankEv.phase === "verifying") && styles.verifyBtnDisabled]}
                      disabled={!canVerify || bankEv.phase === "verifying"}
                      onPress={() => void runBankVerify()}
                      activeOpacity={0.85}
                    >
                      {bankEv.phase === "verifying" ? (
                        <ActivityIndicator color="#fff" />
                      ) : (
                        <>
                          <Ionicons name="flash" size={16} color="#fff" />
                          <Text style={styles.verifyBtnText}>Verify Instantly</Text>
                        </>
                      )}
                    </TouchableOpacity>
                  ) : null}

                  {bankEv.phase === "verified" ? (
                    <View style={styles.verifiedCard}>
                      <View style={styles.verifiedHeader}>
                        <Ionicons name="shield-checkmark" size={18} color="#059669" />
                        <Text style={styles.verifiedTitle}>Bank account is valid</Text>
                      </View>
                      {detailRows.map((row) => (
                        <View key={row.label} style={styles.detailRow}>
                          <Text style={styles.detailLabel}>{row.label}</Text>
                          <Text style={styles.detailValue}>{row.value}</Text>
                        </View>
                      ))}
                      <Text style={styles.verifiedHint}>
                        Verified with Cashfree. Continue to save for payouts.
                      </Text>
                    </View>
                  ) : null}

                  {(bankEv.phase === "failed" ||
                    bankEv.phase === "mismatch" ||
                    bankEv.phase === "manual") && (
                    <View
                      style={[
                        styles.notice,
                        bankEv.phase === "mismatch" ? styles.noticeWarn : styles.noticeError,
                      ]}
                    >
                      <Text
                        style={
                          bankEv.phase === "mismatch"
                            ? styles.noticeWarnText
                            : styles.noticeErrorText
                        }
                      >
                        {"error" in bankEv ? bankEv.error : "Verification needs manual review"}
                      </Text>
                      {bankMode === "hybrid" ? (
                        <Text style={styles.noticeHint}>
                          Fill the details below to continue (same as earnings withdraw).
                        </Text>
                      ) : null}
                    </View>
                  )}

                  {/* Slim fallback — earnings withdraw fields (no optional branch) */}
                  {(showFallbackForm || !bankElectronic) && bankEv.phase !== "verified" ? (
                    <>
                      <View style={form.fieldGroup}>
                        <FieldLabel label="Confirm account number" required />
                        <View
                          style={[
                            form.inputWrap,
                            accountMismatch ? styles.inputError : null,
                          ]}
                        >
                          <TextInput
                            value={confirmAccountNumber}
                            onChangeText={(v) =>
                              setConfirmAccountNumber(v.replace(/\D/g, "").slice(0, 18))
                            }
                            style={form.textInput}
                            placeholder="1234567890"
                            placeholderTextColor={colors.gray[400]}
                            keyboardType="number-pad"
                            maxLength={18}
                          />
                        </View>
                        {accountMismatch ? (
                          <Text style={styles.errorText}>Account numbers do not match</Text>
                        ) : null}
                      </View>

                      <View style={form.fieldGroup}>
                        <FieldLabel label="Bank name" required />
                        <View style={form.inputWrap}>
                          <TextInput
                            value={bankName}
                            onChangeText={setBankName}
                            style={form.textInput}
                            placeholder="e.g. State Bank of India"
                            placeholderTextColor={colors.gray[400]}
                            autoCapitalize="words"
                          />
                        </View>
                      </View>
                    </>
                  ) : null}
                </>
              )}

              {!vehicleReady ? (
                <Text style={styles.warnText}>
                  Finish vehicle documents first, then return here.
                </Text>
              ) : null}

              <ContinueButton
                label={
                  alreadyLinked || data.bankAccountOnboardingDone
                    ? "Continue to payment"
                    : addLocked
                      ? `Try after ${countdown.label ?? "—"}`
                      : bankEv.phase === "verified"
                        ? "Continue"
                        : showFallbackForm || !bankElectronic
                          ? "Save & continue"
                          : "Verify & continue"
                }
                onPress={() => {
                  if (alreadyLinked || data.bankAccountOnboardingDone) {
                    void goToPayment();
                    return;
                  }
                  if (addLocked) {
                    const msg = `Locked due to security reasons. Try after ${countdown.label ?? "—"}.`;
                    setError(msg);
                    notifyOnboardingToast(msg);
                    return;
                  }
                  if (bankEv.phase === "verified") {
                    void saveBankAndContinue({ fromElectronic: true });
                    return;
                  }
                  if (bankElectronic && !showFallbackForm) {
                    void runBankVerify();
                    return;
                  }
                  if (!canFallbackSubmit || !confirmOk) {
                    setError(
                      accountMismatch
                        ? "Account numbers do not match"
                        : "Please fill account number, confirm, IFSC and bank name",
                    );
                    return;
                  }
                  void saveBankAndContinue();
                }}
                disabled={
                  submitting ||
                  createBank.isPending ||
                  !vehicleReady ||
                  bankEv.phase === "verifying" ||
                  (alreadyLinked || data.bankAccountOnboardingDone
                    ? false
                    : addLocked
                      ? true
                      : bankEv.phase === "verified"
                        ? false
                        : showFallbackForm || !bankElectronic
                          ? !canFallbackSubmit
                          : !canVerify)
                }
                loading={submitting || createBank.isPending || bankQuery.isLoading}
              />
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  body: {
    paddingHorizontal: 20,
    gap: 14,
    paddingBottom: 24,
  },
  hint: {
    marginTop: 4,
    fontSize: 12,
    color: colors.gray[500],
    lineHeight: 16,
  },
  readOnlyWrap: {
    backgroundColor: "#f8fafc",
  },
  readOnlyInput: {
    color: colors.gray[700],
  },
  inputError: {
    borderColor: colors.error[500],
    backgroundColor: "#fef2f2",
  },
  errorText: {
    marginTop: 4,
    fontSize: 12,
    fontWeight: "600",
    color: colors.error[600],
  },
  warnText: {
    fontSize: 13,
    color: "#92400e",
    backgroundColor: "#fffbeb",
    borderWidth: 1,
    borderColor: "#fde68a",
    borderRadius: 10,
    padding: 10,
  },
  linkedCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    backgroundColor: "#ecfdf5",
    borderWidth: 1,
    borderColor: "#a7f3d0",
    borderRadius: 12,
    padding: 14,
  },
  linkedTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#065f46",
  },
  linkedText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#047857",
  },
  verifyBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#16a34a",
    borderRadius: 12,
    paddingVertical: 14,
  },
  verifyBtnDisabled: {
    backgroundColor: "#edf8f0",
    borderWidth: 1.5,
    borderColor: "rgba(57, 211, 83, 0.25)",
  },
  verifyBtnText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "700",
  },
  verifiedCard: {
    backgroundColor: "#ecfdf5",
    borderWidth: 1,
    borderColor: "#a7f3d0",
    borderRadius: 12,
    padding: 14,
    gap: 8,
  },
  verifiedHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  verifiedTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#065f46",
  },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
  },
  detailLabel: {
    fontSize: 12,
    color: "#64748b",
    maxWidth: "42%",
  },
  detailValue: {
    flex: 1,
    fontSize: 12,
    fontWeight: "600",
    color: "#0f172a",
    textAlign: "right",
  },
  verifiedHint: {
    marginTop: 4,
    fontSize: 12,
    color: "#047857",
  },
  notice: {
    borderRadius: 10,
    padding: 12,
    gap: 4,
  },
  noticeError: {
    backgroundColor: "#fff1f2",
    borderWidth: 1,
    borderColor: "#fecdd3",
  },
  noticeWarn: {
    backgroundColor: "#fffbeb",
    borderWidth: 1,
    borderColor: "#fde68a",
  },
  noticeErrorText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#9f1239",
  },
  noticeWarnText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#92400e",
  },
  noticeHint: {
    fontSize: 12,
    color: "#64748b",
  },
});
