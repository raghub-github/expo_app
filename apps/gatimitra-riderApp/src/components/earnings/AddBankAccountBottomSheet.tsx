import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Platform,
  Keyboard,
  Modal,
  Pressable,
  Dimensions,
  KeyboardAvoidingView,
  type KeyboardEvent,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useCreateRiderBankPaymentMethod } from "@/src/hooks/useRiderBankAccount";
import {
  useVerificationModes,
  useVerifyDocument,
} from "@/src/hooks/useOnboarding";
import { useRiderProfile } from "@/src/hooks/useRiderProfile";
import { useSessionStore } from "@/src/stores/sessionStore";
import { extractApiErrorMessage } from "@/src/services/http";
import { colors } from "@/src/theme";
import type { EvState } from "@/src/components/onboarding/ElectronicVerifyCard";
import { PermissionBottomSheetShell } from "@/src/components/permissions/PermissionBottomSheetShell";
import { useBankAccountDuplicateCheck } from "@/src/hooks/useBankAccountDuplicateCheck";

const IFSC_RE = /^[A-Z]{4}0[A-Z0-9]{6}$/i;
const ACCOUNT_RE = /^\d{9,18}$/;

type Props = {
  visible: boolean;
  onDismiss: () => void;
  onSuccess: () => void;
};

type FormState = {
  accountHolderName: string;
  bankName: string;
  ifsc: string;
  branch: string;
  accountNumber: string;
  confirmAccountNumber: string;
};

type FormFieldKey = keyof FormState;

const EMPTY_FORM: FormState = {
  accountHolderName: "",
  bankName: "",
  ifsc: "",
  branch: "",
  accountNumber: "",
  confirmAccountNumber: "",
};

type KeyboardMetrics = {
  height: number;
  bottomLift: number;
  sheetHeight: number;
};

function readKeyboardMetrics(e: KeyboardEvent, topInset: number): KeyboardMetrics {
  const keyboardH = Math.round(e.endCoordinates.height);
  const keyboardTop = e.endCoordinates.screenY;
  const windowH = Dimensions.get("window").height;
  const gapBelowKeyboardTop = Math.max(0, Math.round(windowH - keyboardTop));

  const sheetHeight = Math.max(300, Math.round(keyboardTop - topInset - 8));
  let bottomLift = gapBelowKeyboardTop > 20 ? gapBelowKeyboardTop : 0;

  const screenH = Dimensions.get("screen").height;
  const modalNotResized = windowH > screenH * 0.85;
  if (bottomLift === 0 && keyboardH > 100 && modalNotResized) {
    bottomLift = keyboardH;
  }

  const resolvedSheetHeight =
    bottomLift > 0
      ? Math.max(300, windowH - topInset - bottomLift - 8)
      : sheetHeight;

  return { height: keyboardH, bottomLift, sheetHeight: resolvedSheetHeight };
}

function maskAccount(raw: string): string {
  const d = raw.replace(/\D/g, "");
  if (d.length <= 4) return "••••";
  return `•••• ${d.slice(-4)}`;
}

/**
 * Hybrid bank add (same policy as onboarding):
 * 1) Account number + IFSC → Cashfree verify (auto-fill bank name / holder)
 * 2) On fail / hybrid fallback → manual fields
 */
export function AddBankAccountBottomSheet({ visible, onDismiss, onSuccess }: Props) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  const fieldOffsets = useRef<Partial<Record<FormFieldKey, number>>>({});
  const createBank = useCreateRiderBankPaymentMethod();
  const verifyDocument = useVerifyDocument();
  const { data: modesData } = useVerificationModes();
  const { data: profile } = useRiderProfile();
  const session = useSessionStore((s) => s.session);
  const riderId = String(session?.riderId ?? session?.userId ?? "");

  const bankMode = (modesData?.modes?.bank_account ?? "hybrid") as
    | "manual"
    | "auto"
    | "hybrid"
    | "disabled";
  const bankElectronic = bankMode === "auto" || bankMode === "hybrid";

  const profileName = String(profile?.name ?? "").trim();

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [activeField, setActiveField] = useState<FormFieldKey | null>(null);
  const [keyboard, setKeyboard] = useState<KeyboardMetrics | null>(null);
  const [bankEv, setBankEv] = useState<EvState>({ phase: "idle" });
  const [showFallbackForm, setShowFallbackForm] = useState(!bankElectronic);
  const [nameMismatchVisible, setNameMismatchVisible] = useState(false);
  const [nameMismatchBody, setNameMismatchBody] = useState("");

  const windowH = Dimensions.get("window").height;
  const closedMaxH = Math.round(windowH * 0.88);
  const keyboardUp = keyboard != null && keyboard.height > 0;

  useEffect(() => {
    if (!visible) {
      setForm(EMPTY_FORM);
      setFieldError(null);
      setActiveField(null);
      setKeyboard(null);
      setBankEv({ phase: "idle" });
      setShowFallbackForm(!bankElectronic);
      return;
    }

    setShowFallbackForm(!bankElectronic);
    if (profileName) {
      setForm((prev) =>
        prev.accountHolderName.trim()
          ? prev
          : { ...prev, accountHolderName: profileName },
      );
    }

    const onShow = (e: KeyboardEvent) => {
      const apply = () => setKeyboard(readKeyboardMetrics(e, insets.top));
      apply();
      if (Platform.OS === "android") setTimeout(apply, 80);
    };
    const onHide = () => setKeyboard(null);

    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const showSub = Keyboard.addListener(showEvent, onShow);
    const hideSub = Keyboard.addListener(hideEvent, onHide);

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [visible, insets.top, bankElectronic, profileName]);

  const accountOk = ACCOUNT_RE.test(form.accountNumber.replace(/\s/g, ""));
  const ifscOk = IFSC_RE.test(form.ifsc.trim());
  const confirmOk =
    form.confirmAccountNumber.replace(/\s/g, "") === form.accountNumber.replace(/\s/g, "");

  const dupCheck = useBankAccountDuplicateCheck(form.accountNumber, visible && accountOk);

  useEffect(() => {
    if (!dupCheck.duplicate) return;
    setBankEv({ phase: "idle" });
    setShowFallbackForm(!bankElectronic);
    if (dupCheck.message) setFieldError(dupCheck.message);
  }, [dupCheck.duplicate, dupCheck.message, bankElectronic]);

  const accountNumberMismatch = useMemo(() => {
    const accountDigits = form.accountNumber.replace(/\s/g, "");
    const confirmDigits = form.confirmAccountNumber.replace(/\s/g, "");
    return (
      accountDigits.length > 0 &&
      confirmDigits.length > 0 &&
      accountDigits !== confirmDigits
    );
  }, [form.accountNumber, form.confirmAccountNumber]);

  const canVerify =
    bankElectronic &&
    accountOk &&
    ifscOk &&
    Boolean(riderId) &&
    bankEv.phase !== "verifying" &&
    bankEv.phase !== "verified" &&
    !dupCheck.duplicate &&
    !dupCheck.checking;

  const canSubmit = useMemo(() => {
    if (dupCheck.duplicate || dupCheck.checking) return false;
    if (bankEv.phase === "verified") {
      return (
        form.accountHolderName.trim().length >= 2 &&
        form.bankName.trim().length >= 1 &&
        IFSC_RE.test(form.ifsc.trim()) &&
        ACCOUNT_RE.test(form.accountNumber.replace(/\s/g, ""))
      );
    }
    if (!showFallbackForm && bankElectronic) return false;
    return (
      form.accountHolderName.trim().length >= 2 &&
      form.bankName.trim().length >= 2 &&
      IFSC_RE.test(form.ifsc.trim()) &&
      ACCOUNT_RE.test(form.accountNumber.replace(/\s/g, "")) &&
      confirmOk
    );
  }, [
    form,
    bankEv.phase,
    showFallbackForm,
    bankElectronic,
    confirmOk,
    dupCheck.duplicate,
    dupCheck.checking,
  ]);

  const updateField = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setFieldError(null);
    if (
      (key === "accountNumber" || key === "ifsc") &&
      bankEv.phase === "verified"
    ) {
      setBankEv({ phase: "idle" });
    }
  };

  const registerFieldOffset = (key: FormFieldKey, y: number) => {
    fieldOffsets.current[key] = y;
  };

  const scrollFieldIntoView = (key: FormFieldKey) => {
    requestAnimationFrame(() => {
      const y = fieldOffsets.current[key];
      if (y != null) {
        scrollRef.current?.scrollTo({ y: Math.max(0, y - 16), animated: true });
      }
    });
  };

  const focusField = (key: FormFieldKey) => {
    setActiveField(key);
    scrollFieldIntoView(key);
  };

  const blurField = (key: FormFieldKey) => {
    setActiveField((prev) => (prev === key ? null : prev));
  };

  const runBankVerify = async () => {
    if (!canVerify || !riderId) return;
    setBankEv({ phase: "verifying" });
    setFieldError(null);
    try {
      const res = await verifyDocument.mutateAsync({
        riderId,
        docKind: "bank_account",
        bankAccount: form.accountNumber.replace(/\s/g, ""),
        ifsc: form.ifsc.trim().toUpperCase(),
        name: form.accountHolderName.trim() || profileName || undefined,
      });
      if (res.outcome === "verified") {
        const details = res.verifiedData ?? {};
        setBankEv({ phase: "verified", details });
        setShowFallbackForm(false);
        const bankName =
          typeof details.bank_name === "string" ? details.bank_name.trim() : "";
        const branch =
          typeof details.branch_name === "string" ? details.branch_name.trim() : "";
        const nameAtBank =
          typeof details.name_at_bank === "string" ? details.name_at_bank.trim() : "";
        setForm((prev) => ({
          ...prev,
          bankName: bankName || prev.bankName,
          branch: branch || prev.branch,
          accountHolderName: nameAtBank || prev.accountHolderName || profileName,
          confirmAccountNumber: prev.accountNumber,
        }));
      } else if (res.outcome === "mismatch") {
        setBankEv({
          phase: "mismatch",
          error:
            res.error ||
            (res.mismatchMessages && res.mismatchMessages.join(". ")) ||
            "Name at bank does not match your profile name",
          reasons: res.mismatchReasons,
        });
        if (bankMode === "hybrid") setShowFallbackForm(true);
        if (res.verifiedData?.bank_name) {
          setForm((prev) => ({
            ...prev,
            bankName: String(res.verifiedData?.bank_name),
          }));
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
    }
  };

  const handleSubmit = async () => {
    if (!canSubmit || createBank.isPending) return;

    const accountNumber = form.accountNumber.replace(/\s/g, "");
    const confirmAccountNumber = form.confirmAccountNumber.replace(/\s/g, "");
    if (bankEv.phase !== "verified" && accountNumber !== confirmAccountNumber) {
      setFieldError(t("earnings.bankAccount.confirmMismatch", "Account numbers do not match"));
      return;
    }

    try {
      const details =
        bankEv.phase === "verified" ? bankEv.details : ({} as Record<string, unknown>);
      const resolvedBankName =
        String(form.bankName || details.bank_name || "Bank").trim() || "Bank";
      const res = await createBank.mutateAsync({
        accountHolderName: form.accountHolderName.trim(),
        bankName: resolvedBankName,
        ifsc: form.ifsc.trim().toUpperCase(),
        branch: form.branch.trim() || undefined,
        accountNumber,
      });
      const pm = res.paymentMethod;
      if (pm?.crossCheckStatus === "mismatch") {
        const detail =
          pm.crossCheckMessages && pm.crossCheckMessages.length
            ? pm.crossCheckMessages.join(". ")
            : t(
                "earnings.bankAccount.nameMismatchDetail",
                "Account holder name does not match your verified Aadhaar name.",
              );
        setNameMismatchBody(
          `${detail} ${t(
            "earnings.bankAccount.nameMismatchPending",
            "Account saved for manual review — payouts stay pending until approved.",
          )}`,
        );
        setNameMismatchVisible(true);
        onSuccess();
        onDismiss();
        return;
      }
      onSuccess();
      onDismiss();
    } catch (error) {
      setFieldError(
        extractApiErrorMessage(
          error,
          t("earnings.bankAccount.saveFailed", "Could not save bank account"),
        ),
      );
    }
  };

  const verifiedDetails = bankEv.phase === "verified" ? bankEv.details : null;
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
    if (form.accountNumber) {
      rows.push({ label: "Account", value: maskAccount(form.accountNumber) });
    }
    return rows.slice(0, 8);
  }, [verifiedDetails, form.accountNumber]);

  const showManualFields =
    showFallbackForm || !bankElectronic || bankEv.phase === "verified";

  return (
    <>
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
      presentationStyle="overFullScreen"
      // Android back → Cancel (explicit). Backdrop tap does not dismiss.
      onRequestClose={onDismiss}
    >
      <View style={styles.overlay}>
        {/* Absorb outside taps — sheet stays open until Cancel / Save. */}
        <Pressable style={styles.backdrop} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" />

        <KeyboardAvoidingView
          style={[
            styles.kav,
            keyboardUp ? { paddingBottom: keyboard?.bottomLift ?? 0 } : null,
          ]}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          enabled={Platform.OS === "ios"}
        >
          <View
            style={[
              styles.sheet,
              { paddingBottom: insets.bottom || 12 },
              keyboardUp ? { height: keyboard!.sheetHeight } : { maxHeight: closedMaxH },
            ]}
          >
            <View style={styles.handle} />

            <View style={styles.header}>
              <View style={styles.iconWrap}>
                <Ionicons name="business-outline" size={24} color={colors.primary[600]} />
              </View>
              <View style={styles.headerText}>
                <Text style={styles.title}>
                  {t("earnings.bankAccount.title", "Add bank account")}
                </Text>
                <Text style={styles.subtitle}>
                  {bankElectronic
                    ? t(
                        "earnings.bankAccount.hybridSubtitle",
                        "Enter account number + IFSC and verify instantly. Manual form opens if auto-verify fails.",
                      )
                    : t(
                        "earnings.bankAccount.subtitle",
                        "Add your bank account to receive payouts",
                      )}
                </Text>
              </View>
            </View>

            <ScrollView
              ref={scrollRef}
              style={[styles.formScroll, keyboardUp && styles.formScrollExpanded]}
              contentContainerStyle={styles.formContent}
              keyboardShouldPersistTaps="always"
              keyboardDismissMode="interactive"
              showsVerticalScrollIndicator={false}
              nestedScrollEnabled
            >
              <FormField
                fieldKey="accountNumber"
                active={activeField === "accountNumber"}
                onFieldLayout={registerFieldOffset}
                onFieldFocus={focusField}
                onFieldBlur={blurField}
                label={t("earnings.bankAccount.accountNumber", "Account number")}
                value={form.accountNumber}
                onChangeText={(value) => updateField("accountNumber", value.replace(/\D/g, ""))}
                keyboardType="number-pad"
                maxLength={18}
                placeholder="1234567890"
                editable={bankEv.phase !== "verifying"}
              />
              <FormField
                fieldKey="ifsc"
                active={activeField === "ifsc"}
                onFieldLayout={registerFieldOffset}
                onFieldFocus={focusField}
                onFieldBlur={blurField}
                label={t("earnings.bankAccount.ifsc", "IFSC code")}
                value={form.ifsc}
                onChangeText={(value) =>
                  updateField("ifsc", value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 11))
                }
                autoCapitalize="characters"
                autoCorrect={false}
                maxLength={11}
                placeholder="SBIN0001234"
                editable={bankEv.phase !== "verifying"}
              />

              {bankElectronic && bankEv.phase !== "verified" ? (
                <TouchableOpacity
                  style={[styles.verifyBtn, !canVerify && styles.verifyBtnDisabled]}
                  disabled={!canVerify}
                  onPress={() => void runBankVerify()}
                  activeOpacity={0.85}
                >
                  {bankEv.phase === "verifying" ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <>
                      <Ionicons name="flash" size={16} color="#FFFFFF" />
                      <Text style={styles.verifyBtnText}>
                        {t("earnings.bankAccount.verifyInstantly", "Verify Instantly")}
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
              ) : null}

              {bankEv.phase === "verified" ? (
                <View style={styles.verifiedCard}>
                  <View style={styles.verifiedHeader}>
                    <Ionicons name="shield-checkmark" size={18} color="#059669" />
                    <Text style={styles.verifiedTitle}>
                      {t("earnings.bankAccount.verifiedTitle", "Bank account is valid")}
                    </Text>
                  </View>
                  {detailRows.map((row) => (
                    <View key={row.label} style={styles.detailRow}>
                      <Text style={styles.detailLabel}>{row.label}</Text>
                      <Text style={styles.detailValue}>{row.value}</Text>
                    </View>
                  ))}
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
                      {t(
                        "earnings.bankAccount.fallbackHint",
                        "Fill the details below to continue.",
                      )}
                    </Text>
                  ) : null}
                </View>
              )}

              {showManualFields ? (
                <>
                  {(showFallbackForm || !bankElectronic) && bankEv.phase !== "verified" ? (
                    <FormField
                      fieldKey="confirmAccountNumber"
                      active={activeField === "confirmAccountNumber"}
                      onFieldLayout={registerFieldOffset}
                      onFieldFocus={focusField}
                      onFieldBlur={blurField}
                      label={t(
                        "earnings.bankAccount.confirmAccountNumber",
                        "Confirm account number",
                      )}
                      value={form.confirmAccountNumber}
                      onChangeText={(value) =>
                        updateField("confirmAccountNumber", value.replace(/\D/g, ""))
                      }
                      keyboardType="number-pad"
                      maxLength={18}
                      placeholder="1234567890"
                      hasError={accountNumberMismatch}
                      errorText={
                        accountNumberMismatch
                          ? t(
                              "earnings.bankAccount.confirmMismatch",
                              "Account numbers do not match",
                            )
                          : undefined
                      }
                    />
                  ) : null}

                  <FormField
                    fieldKey="accountHolderName"
                    active={activeField === "accountHolderName"}
                    onFieldLayout={registerFieldOffset}
                    onFieldFocus={focusField}
                    onFieldBlur={blurField}
                    label={t("earnings.bankAccount.accountHolderName", "Account holder name")}
                    value={form.accountHolderName}
                    onChangeText={(value) => updateField("accountHolderName", value)}
                    autoCapitalize="words"
                    placeholder={t(
                      "earnings.bankAccount.accountHolderPlaceholder",
                      "As per bank records",
                    )}
                  />
                  <FormField
                    fieldKey="bankName"
                    active={activeField === "bankName"}
                    onFieldLayout={registerFieldOffset}
                    onFieldFocus={focusField}
                    onFieldBlur={blurField}
                    label={t("earnings.bankAccount.bankName", "Bank name")}
                    value={form.bankName}
                    onChangeText={(value) => updateField("bankName", value)}
                    autoCapitalize="words"
                    placeholder={t(
                      "earnings.bankAccount.bankNamePlaceholder",
                      "e.g. State Bank of India",
                    )}
                  />
                  {(showFallbackForm || !bankElectronic) && bankEv.phase !== "verified" ? (
                    <FormField
                      fieldKey="branch"
                      active={activeField === "branch"}
                      onFieldLayout={registerFieldOffset}
                      onFieldFocus={focusField}
                      onFieldBlur={blurField}
                      label={t("earnings.bankAccount.branch", "Branch")}
                      value={form.branch}
                      onChangeText={(value) => updateField("branch", value)}
                      autoCapitalize="words"
                      placeholder={t("earnings.bankAccount.branchPlaceholder", "Optional")}
                      optional
                    />
                  ) : null}
                </>
              ) : null}

              {fieldError || (dupCheck.duplicate && dupCheck.message) ? (
                <View style={styles.errorBanner}>
                  <Ionicons name="alert-circle-outline" size={18} color={colors.error[600]} />
                  <Text style={styles.errorText}>
                    {fieldError || dupCheck.message}
                  </Text>
                </View>
              ) : null}
            </ScrollView>

            <View style={styles.footerRow}>
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={onDismiss}
                disabled={createBank.isPending || bankEv.phase === "verifying"}
                style={styles.cancelBtn}
              >
                <Text style={styles.cancelBtnText}>{t("common.cancel", "Cancel")}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => void handleSubmit()}
                disabled={!canSubmit || createBank.isPending}
                style={[
                  styles.continueBtn,
                  (!canSubmit || createBank.isPending) && styles.continueBtnDisabled,
                ]}
              >
                {createBank.isPending ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.continueBtnText}>
                    {t("earnings.bankAccount.save", "Save bank account")}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>

    <PermissionBottomSheetShell
      visible={nameMismatchVisible}
      dismissible={false}
      maxHeightRatio={0.55}
    >
      <View style={styles.mismatchBody}>
        <View style={styles.mismatchIconWrap}>
          <Ionicons name="warning-outline" size={28} color="#B45309" />
        </View>
        <Text style={styles.mismatchTitle}>
          {t("earnings.bankAccount.nameMismatchTitle", "Name mismatch with Aadhaar")}
        </Text>
        <Text style={styles.mismatchMessage}>{nameMismatchBody}</Text>
        <TouchableOpacity
          activeOpacity={0.88}
          onPress={() => {
            setNameMismatchVisible(false);
            setNameMismatchBody("");
          }}
          style={styles.mismatchOkBtn}
        >
          <Text style={styles.mismatchOkBtnText}>{t("common.ok", "OK")}</Text>
        </TouchableOpacity>
      </View>
    </PermissionBottomSheetShell>
    </>
  );
}

function FormField({
  fieldKey,
  active,
  onFieldLayout,
  onFieldFocus,
  onFieldBlur,
  label,
  value,
  onChangeText,
  placeholder,
  optional,
  hasError,
  errorText,
  editable = true,
  ...inputProps
}: {
  fieldKey: FormFieldKey;
  active: boolean;
  onFieldLayout: (key: FormFieldKey, y: number) => void;
  onFieldFocus: (key: FormFieldKey) => void;
  onFieldBlur: (key: FormFieldKey) => void;
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  optional?: boolean;
  hasError?: boolean;
  errorText?: string;
  editable?: boolean;
} & Pick<
  React.ComponentProps<typeof TextInput>,
  "autoCapitalize" | "autoCorrect" | "keyboardType" | "maxLength"
>) {
  return (
    <View
      style={styles.fieldBlock}
      onLayout={(e) => onFieldLayout(fieldKey, e.nativeEvent.layout.y)}
    >
      <Text style={styles.fieldLabel}>
        {label}
        {optional ? <Text style={styles.optionalMark}> (optional)</Text> : null}
      </Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#94A3B8"
        editable={editable}
        style={[
          styles.input,
          active && styles.inputActive,
          hasError && styles.inputError,
          !editable && styles.inputReadonly,
        ]}
        onFocus={() => onFieldFocus(fieldKey)}
        onBlur={() => onFieldBlur(fieldKey)}
        {...inputProps}
      />
      {errorText ? <Text style={styles.inlineWarning}>{errorText}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(15, 23, 42, 0.55)",
  },
  kav: {
    width: "100%",
  },
  sheet: {
    width: "100%",
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: "hidden",
    paddingHorizontal: 20,
    paddingTop: 8,
    flexDirection: "column",
  },
  handle: {
    alignSelf: "center",
    width: 44,
    height: 5,
    borderRadius: 999,
    backgroundColor: "#CBD5E1",
    marginBottom: 12,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    marginBottom: 12,
    flexShrink: 0,
  },
  iconWrap: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: colors.primary[50],
    alignItems: "center",
    justifyContent: "center",
  },
  headerText: {
    flex: 1,
  },
  title: {
    fontSize: 18,
    fontWeight: "800",
    color: "#0F172A",
  },
  subtitle: {
    marginTop: 4,
    fontSize: 13,
    lineHeight: 18,
    color: "#64748B",
  },
  formScroll: {
    flexGrow: 0,
    flexShrink: 1,
  },
  formScrollExpanded: {
    flex: 1,
    minHeight: 0,
  },
  formContent: {
    gap: 12,
    paddingBottom: 8,
  },
  fieldBlock: {
    gap: 6,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: "#334155",
  },
  optionalMark: {
    fontWeight: "500",
    color: "#94A3B8",
  },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 12,
    backgroundColor: "#F8FAFC",
    paddingHorizontal: 14,
    fontSize: 15,
    fontWeight: "500",
    color: "#0F172A",
  },
  inputActive: {
    borderColor: colors.primary[500],
    backgroundColor: "#FFFFFF",
  },
  inputError: {
    borderColor: colors.error[500],
    backgroundColor: "#FEF2F2",
  },
  inputReadonly: {
    opacity: 0.7,
  },
  inlineWarning: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.error[600],
    lineHeight: 16,
  },
  verifyBtn: {
    height: 48,
    borderRadius: 12,
    backgroundColor: "#0F766E",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  verifyBtnDisabled: {
    opacity: 0.55,
  },
  verifyBtnText: {
    color: "#FFFFFF",
    fontWeight: "800",
    fontSize: 14,
  },
  verifiedCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#A7F3D0",
    backgroundColor: "#ECFDF5",
    padding: 12,
    gap: 8,
  },
  verifiedHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  verifiedTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: "#047857",
  },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
  },
  detailLabel: {
    fontSize: 12,
    color: "#64748B",
    fontWeight: "600",
  },
  detailValue: {
    flex: 1,
    fontSize: 12,
    color: "#0F172A",
    fontWeight: "700",
    textAlign: "right",
  },
  notice: {
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    gap: 6,
  },
  noticeError: {
    backgroundColor: "#FEF2F2",
    borderColor: "#FECACA",
  },
  noticeWarn: {
    backgroundColor: "#FFFBEB",
    borderColor: "#FDE68A",
  },
  noticeErrorText: {
    fontSize: 13,
    color: colors.error[700],
    fontWeight: "600",
    lineHeight: 18,
  },
  noticeWarnText: {
    fontSize: 13,
    color: "#92400E",
    fontWeight: "600",
    lineHeight: 18,
  },
  noticeHint: {
    fontSize: 12,
    color: "#64748B",
    lineHeight: 16,
  },
  errorBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    padding: 12,
    borderRadius: 12,
    backgroundColor: "#FEF2F2",
    borderWidth: 1,
    borderColor: "#FECACA",
  },
  errorText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
    color: colors.error[700],
  },
  footerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingTop: 12,
    paddingBottom: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#E2E8F0",
    flexShrink: 0,
  },
  cancelBtn: {
    flex: 1,
    height: 52,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#D1D5DB",
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  cancelBtnText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#374151",
  },
  continueBtn: {
    flex: 1,
    height: 52,
    borderRadius: 12,
    backgroundColor: colors.primary[500],
    alignItems: "center",
    justifyContent: "center",
  },
  continueBtnDisabled: {
    opacity: 0.55,
  },
  continueBtnText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "700",
  },
  mismatchBody: {
    paddingHorizontal: 20,
    paddingTop: 8,
    alignItems: "center",
  },
  mismatchIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: "#FEF3C7",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  mismatchTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#0F172A",
    textAlign: "center",
    marginBottom: 8,
  },
  mismatchMessage: {
    fontSize: 14,
    lineHeight: 20,
    color: "#64748B",
    textAlign: "center",
    marginBottom: 20,
  },
  mismatchOkBtn: {
    alignSelf: "stretch",
    height: 52,
    borderRadius: 14,
    backgroundColor: colors.primary[600],
    alignItems: "center",
    justifyContent: "center",
  },
  mismatchOkBtnText: {
    fontSize: 16,
    fontWeight: "800",
    color: "#FFFFFF",
  },
});
