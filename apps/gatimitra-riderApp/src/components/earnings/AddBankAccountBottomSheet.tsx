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
  Alert,
  type KeyboardEvent,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useCreateRiderBankPaymentMethod } from "@/src/hooks/useRiderBankAccount";
import { extractApiErrorMessage } from "@/src/services/http";
import { colors } from "@/src/theme";

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

  // Modal did not resize — lift sheet by keyboard height.
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

export function AddBankAccountBottomSheet({ visible, onDismiss, onSuccess }: Props) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  const fieldOffsets = useRef<Partial<Record<FormFieldKey, number>>>({});
  const createBank = useCreateRiderBankPaymentMethod();
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [activeField, setActiveField] = useState<FormFieldKey | null>(null);
  const [keyboard, setKeyboard] = useState<KeyboardMetrics | null>(null);

  const windowH = Dimensions.get("window").height;
  const closedMaxH = Math.round(windowH * 0.88);
  const keyboardUp = keyboard != null && keyboard.height > 0;

  useEffect(() => {
    if (!visible) {
      setForm(EMPTY_FORM);
      setFieldError(null);
      setActiveField(null);
      setKeyboard(null);
      return;
    }

    const onShow = (e: KeyboardEvent) => {
      const apply = () => setKeyboard(readKeyboardMetrics(e, insets.top));
      apply();
      if (Platform.OS === "android") {
        setTimeout(apply, 80);
      }
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
  }, [visible, insets.top]);

  const canSubmit = useMemo(() => {
    return (
      form.accountHolderName.trim().length >= 2 &&
      form.bankName.trim().length >= 2 &&
      IFSC_RE.test(form.ifsc.trim()) &&
      ACCOUNT_RE.test(form.accountNumber.replace(/\s/g, "")) &&
      form.confirmAccountNumber.replace(/\s/g, "") === form.accountNumber.replace(/\s/g, "")
    );
  }, [form]);

  const accountNumberMismatch = useMemo(() => {
    const accountDigits = form.accountNumber.replace(/\s/g, "");
    const confirmDigits = form.confirmAccountNumber.replace(/\s/g, "");
    return (
      accountDigits.length > 0 &&
      confirmDigits.length > 0 &&
      accountDigits !== confirmDigits
    );
  }, [form.accountNumber, form.confirmAccountNumber]);

  const updateField = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setFieldError(null);
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

  const handleSubmit = async () => {
    if (!canSubmit || createBank.isPending) return;

    const accountNumber = form.accountNumber.replace(/\s/g, "");
    const confirmAccountNumber = form.confirmAccountNumber.replace(/\s/g, "");
    if (accountNumber !== confirmAccountNumber) {
      setFieldError(t("earnings.bankAccount.confirmMismatch", "Account numbers do not match"));
      return;
    }

    try {
      const res = await createBank.mutateAsync({
        accountHolderName: form.accountHolderName.trim(),
        bankName: form.bankName.trim(),
        ifsc: form.ifsc.trim().toUpperCase(),
        branch: form.branch.trim() || undefined,
        accountNumber,
      });
      const pm = res.paymentMethod;
      if (pm?.crossCheckStatus === "mismatch") {
        Alert.alert(
          "Name mismatch with Aadhaar",
          (pm.crossCheckMessages && pm.crossCheckMessages.length
            ? pm.crossCheckMessages.join(". ")
            : "Account holder name does not match your verified Aadhaar name.") +
            " Account saved for manual review — payouts stay pending until approved.",
        );
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

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
      presentationStyle="overFullScreen"
      onRequestClose={onDismiss}
    >
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={onDismiss} accessibilityLabel="Close" />

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
              keyboardUp
                ? { height: keyboard!.sheetHeight }
                : { maxHeight: closedMaxH },
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
                  {t(
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
              <FormField
                fieldKey="ifsc"
                active={activeField === "ifsc"}
                onFieldLayout={registerFieldOffset}
                onFieldFocus={focusField}
                onFieldBlur={blurField}
                label={t("earnings.bankAccount.ifsc", "IFSC code")}
                value={form.ifsc}
                onChangeText={(value) => updateField("ifsc", value.toUpperCase())}
                autoCapitalize="characters"
                autoCorrect={false}
                maxLength={11}
                placeholder="SBIN0001234"
              />
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
                secureTextEntry
              />
              <FormField
                fieldKey="confirmAccountNumber"
                active={activeField === "confirmAccountNumber"}
                onFieldLayout={registerFieldOffset}
                onFieldFocus={focusField}
                onFieldBlur={blurField}
                label={t("earnings.bankAccount.confirmAccountNumber", "Confirm account number")}
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
                    ? t("earnings.bankAccount.confirmMismatch", "Account numbers do not match")
                    : undefined
                }
              />

              {fieldError ? (
                <View style={styles.errorBanner}>
                  <Ionicons name="alert-circle-outline" size={18} color={colors.error[600]} />
                  <Text style={styles.errorText}>{fieldError}</Text>
                </View>
              ) : null}
            </ScrollView>

            <View style={styles.footerRow}>
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={onDismiss}
                disabled={createBank.isPending}
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
                    {t("earnings.bankAccount.save", "Save")}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
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
} & Pick<
  React.ComponentProps<typeof TextInput>,
  "autoCapitalize" | "autoCorrect" | "keyboardType" | "maxLength" | "secureTextEntry"
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
        style={[styles.input, active && styles.inputActive, hasError && styles.inputError]}
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
  inlineWarning: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.error[600],
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
});
