import { useEffect, useState, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  Pressable,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { GatiMitraMerchant, H_PADDING, CARD_RADIUS } from "@/constants/theme";
import { useSelectedStore } from "@/context/SelectedStoreContext";
import { useAuth } from "@/context/AuthContext";
import { getBankAccount, upsertBankAccount, type BankAccountPayload, type BankAccount } from "@/services/bankAccountApi";

const IFSC_REGEX = /^[A-Za-z]{4}0[A-Za-z0-9]{6}$/;

export default function BankAccountScreen() {
  const { selectedStore } = useSelectedStore();
  const { token } = useAuth();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [account, setAccount] = useState<BankAccount>(null);
  const [holderName, setHolderName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [confirmAccountNumber, setConfirmAccountNumber] = useState("");
  const [ifsc, setIfsc] = useState("");
  const [bankName, setBankName] = useState("");
  const [branchName, setBranchName] = useState("");
  const [upiId, setUpiId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [payoutSelection, setPayoutSelection] = useState<"BANK" | "UPI">("BANK");

  const storeId = selectedStore?.id ?? null;

  useEffect(() => {
    if (!storeId || !token) {
      setLoading(false);
      if (!token) setError("Not signed in.");
      else if (!storeId) setError("No store selected.");
      return;
    }
    let cancelled = false;
    setLoading(true);
    getBankAccount(storeId, token)
      .then((data) => {
        if (cancelled) return;
        setAccount(data);
        if (data) {
          setHolderName(data.account_holder_name ?? "");
          setAccountNumber(data.account_number ?? "");
          setConfirmAccountNumber(data.account_number ?? "");
          setIfsc(data.ifsc_code ?? "");
          setBankName(data.bank_name ?? "");
          setBranchName(data.branch_name ?? "");
          setUpiId(data.upi_id ?? "");
          const method = (data.payout_method || "").toUpperCase();
          if (method === "UPI") setPayoutSelection("UPI");
          else setPayoutSelection("BANK");
        }
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load bank account.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [storeId, token]);

  const statusLabel = (() => {
    if (!account) return "Not added";
    if (account.is_disabled) return "Disabled";
    if (account.is_verified) return "Verified";
    const status = (account.verification_status || "").toLowerCase();
    if (status === "rejected") return "Rejected";
    if (status === "under_review") return "Under review";
    return "Pending verification";
  })();

  const statusStyle = (() => {
    if (!account) return styles.statusPillPending;
    if (account.is_disabled) return styles.statusPillDisabled;
    if (account.is_verified) return styles.statusPillVerified;
    const status = (account.verification_status || "").toLowerCase();
    if (status === "rejected") return styles.statusPillError;
    return styles.statusPillPending;
  })();

  const canTogglePayoutMethod = useMemo(
    () => !!(accountNumber.trim() && upiId.trim()),
    [accountNumber, upiId]
  );

  const fieldsDisabled = useMemo(
    () => account?.is_verified === true && account.is_disabled === false,
    [account]
  );

  const onSave = async () => {
    if (!storeId || !token) return;
    const trimmedName = holderName.trim();
    const trimmedAcc = accountNumber.trim();
    const trimmedConfirm = confirmAccountNumber.trim();
    const trimmedIfsc = ifsc.trim().toUpperCase();
    const trimmedBank = bankName.trim();
    const trimmedBranch = branchName.trim();
    const trimmedUpi = upiId.trim();

    if (fieldsDisabled && account) {
      // Only allow payout method toggle when account is already verified.
      if (!canTogglePayoutMethod) {
        Alert.alert(
          "Change not allowed",
          "Your bank account is verified. To change bank details, please raise a support ticket from Help Centre."
        );
        return;
      }
    } else {
      if (!trimmedName || !trimmedAcc || !trimmedIfsc || !trimmedBank) {
        Alert.alert("Missing details", "Please fill all required fields marked with *.");
        return;
      }
      if (trimmedAcc.length < 8) {
        Alert.alert("Invalid account number", "Account number looks too short.");
        return;
      }
      if (trimmedAcc !== trimmedConfirm) {
        Alert.alert("Account number mismatch", "Account number and confirm account number must match.");
        return;
      }
      if (!IFSC_REGEX.test(trimmedIfsc)) {
        Alert.alert("Invalid IFSC", "Enter a valid IFSC code (e.g. HDFC0001234).");
        return;
      }
    }

    const payload: BankAccountPayload = {
      account_holder_name: trimmedName,
      account_number: trimmedAcc,
      ifsc_code: trimmedIfsc,
      bank_name: trimmedBank,
      branch_name: trimmedBranch || null,
      upi_id: trimmedUpi || null,
      payout_method: payoutSelection === "UPI" && trimmedUpi ? "UPI" : "BANK",
      beneficiary_name: trimmedName,
    };

    setSaving(true);
    try {
      await upsertBankAccount(storeId, payload, token);
      Alert.alert(
        "Saved",
        fieldsDisabled
          ? "Payout method updated. Future payouts will follow the selected option."
          : "Bank account details updated. Verification may take a few minutes."
      );
      setAccount((prev) =>
        prev
          ? {
              ...prev,
              account_holder_name: payload.account_holder_name,
              account_number: payload.account_number,
              ifsc_code: payload.ifsc_code,
              bank_name: payload.bank_name,
              branch_name: payload.branch_name ?? null,
              upi_id: payload.upi_id ?? null,
              payout_method: payload.payout_method ?? null,
              beneficiary_name: payload.beneficiary_name ?? null,
              is_verified: false,
              verification_status: "pending",
            }
          : {
              id: -1,
              store_id: storeId,
              account_holder_name: payload.account_holder_name,
              account_number: payload.account_number,
              ifsc_code: payload.ifsc_code,
              bank_name: payload.bank_name,
              branch_name: payload.branch_name ?? null,
              account_type: null,
              is_verified: false,
              verification_status: "pending",
              upi_id: payload.upi_id ?? null,
              upi_verified: false,
              is_primary: true,
              is_active: true,
              is_disabled: false,
              payout_method: payload.payout_method ?? null,
              beneficiary_name: payload.beneficiary_name ?? null,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            }
      );
    } catch (e) {
      Alert.alert("Save failed", e instanceof Error ? e.message : "Could not update bank account.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={GatiMitraMerchant.primary} />
        <Text style={styles.loadingText}>Loading bank account…</Text>
      </View>
    );
  }

  if (error && !storeId) {
    return (
      <View style={styles.centered}>
        <Ionicons
          name="alert-circle-outline"
          size={40}
          color={GatiMitraMerchant.textTertiary}
        />
        <Text style={styles.errorText}>{error}</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={Platform.OS === "ios" ? 80 : 0}
    >
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.card}>
        <View style={styles.headerRow}>
          <View style={styles.headerLeft}>
            <Text style={styles.title}>Payout bank account</Text>
            <Text style={styles.subtitle}>
              Money from your GatiMitra orders will be settled to this account.
            </Text>
          </View>
          <View style={[styles.statusPill, statusStyle]}>
            <Text style={styles.statusText}>{statusLabel}</Text>
          </View>
        </View>

        {canTogglePayoutMethod && (
          <View style={styles.toggleRow}>
            <Pressable
              onPress={() => setPayoutSelection("BANK")}
              style={({ pressed }) => [
                styles.toggleChip,
                payoutSelection === "BANK" && styles.toggleChipActive,
                pressed && styles.toggleChipPressed,
              ]}
            >
              <Text
                style={
                  payoutSelection === "BANK"
                    ? styles.toggleTextActive
                    : styles.toggleText
                }
              >
                Bank
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setPayoutSelection("UPI")}
              style={({ pressed }) => [
                styles.toggleChip,
                payoutSelection === "UPI" && styles.toggleChipActive,
                pressed && styles.toggleChipPressed,
              ]}
            >
              <Text
                style={
                  payoutSelection === "UPI"
                    ? styles.toggleTextActive
                    : styles.toggleText
                }
              >
                UPI
              </Text>
            </Pressable>
          </View>
        )}

        {payoutSelection === "BANK" && (
          <>
            <Text style={styles.sectionTitle}>Bank details</Text>

            <View style={styles.fieldGroup}>
              <Text style={styles.label}>
                Account holder name <Text style={styles.required}>*</Text>
              </Text>
              <TextInput
                editable={!fieldsDisabled}
                style={[styles.input, fieldsDisabled && styles.inputDisabled]}
                value={holderName}
                onChangeText={setHolderName}
                placeholder="As per bank records"
                placeholderTextColor={GatiMitraMerchant.textTertiary}
                autoCapitalize="words"
              />
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.label}>
                Account number <Text style={styles.required}>*</Text>
              </Text>
              <TextInput
                editable={!fieldsDisabled}
                style={[styles.input, fieldsDisabled && styles.inputDisabled]}
                value={accountNumber}
                onChangeText={setAccountNumber}
                placeholder="Enter account number"
                placeholderTextColor={GatiMitraMerchant.textTertiary}
                keyboardType="number-pad"
              />
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.label}>
                Confirm account number <Text style={styles.required}>*</Text>
              </Text>
              <TextInput
                editable={!fieldsDisabled}
                style={[styles.input, fieldsDisabled && styles.inputDisabled]}
                value={confirmAccountNumber}
                onChangeText={setConfirmAccountNumber}
                placeholder="Re-enter account number"
                placeholderTextColor={GatiMitraMerchant.textTertiary}
                keyboardType="number-pad"
              />
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.label}>
                IFSC code <Text style={styles.required}>*</Text>
              </Text>
              <TextInput
                editable={!fieldsDisabled}
                style={[styles.input, fieldsDisabled && styles.inputDisabled]}
                value={ifsc}
                onChangeText={(t) => setIfsc(t.toUpperCase())}
                placeholder="e.g. HDFC0001234"
                placeholderTextColor={GatiMitraMerchant.textTertiary}
                autoCapitalize="characters"
              />
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.label}>
                Bank name <Text style={styles.required}>*</Text>
              </Text>
              <TextInput
                editable={!fieldsDisabled}
                style={[styles.input, fieldsDisabled && styles.inputDisabled]}
                value={bankName}
                onChangeText={setBankName}
                placeholder="e.g. HDFC Bank"
                placeholderTextColor={GatiMitraMerchant.textTertiary}
              />
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Branch name</Text>
              <TextInput
                editable={!fieldsDisabled}
                style={[styles.input, fieldsDisabled && styles.inputDisabled]}
                value={branchName}
                onChangeText={setBranchName}
                placeholder="e.g. Andheri (E)"
                placeholderTextColor={GatiMitraMerchant.textTertiary}
              />
            </View>
          </>
        )}

        {payoutSelection === "UPI" && (
          <>
            <Text style={styles.sectionTitle}>UPI details</Text>
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>
                UPI ID <Text style={styles.required}>*</Text>
              </Text>
              <TextInput
                editable={!fieldsDisabled}
                style={[styles.input, fieldsDisabled && styles.inputDisabled]}
                value={upiId}
                onChangeText={setUpiId}
                placeholder="yourname@bank"
                placeholderTextColor={GatiMitraMerchant.textTertiary}
                autoCapitalize="none"
              />
              <Text style={styles.hint}>
                Payouts will be routed to this UPI ID once it is verified.
              </Text>
            </View>
          </>
        )}

        <View style={styles.infoBox}>
          <Ionicons
            name="shield-checkmark-outline"
            size={18}
            color={GatiMitraMerchant.primary}
          />
          <Text style={styles.infoText}>
            We only use these details to credit your payouts. Sensitive fields are
            stored securely and are not shared publicly.
          </Text>
        </View>

        {/* Save button hidden as per latest requirement; logic kept for potential future auto-save. */}
        {false && (
          <Pressable
            onPress={onSave}
            disabled={saving}
            style={({ pressed }) => [
              styles.saveBtn,
              saving && styles.saveBtnDisabled,
              pressed && !saving && styles.saveBtnPressed,
            ]}
          >
            {saving ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.saveBtnText}>Save bank details</Text>
            )}
          </Pressable>
        )}
      </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: GatiMitraMerchant.surfaceWarm },
  scroll: { flex: 1 },
  content: { padding: H_PADDING, paddingBottom: 32, flexGrow: 1 },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: H_PADDING,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: GatiMitraMerchant.textSecondary,
  },
  errorText: {
    marginTop: 12,
    fontSize: 15,
    color: GatiMitraMerchant.textSecondary,
    textAlign: "center",
  },
  card: {
    backgroundColor: GatiMitraMerchant.cardBg,
    borderRadius: CARD_RADIUS,
    padding: 14,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
    ...GatiMitraMerchant.shadowSm,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  headerLeft: { flex: 1, marginRight: 8 },
  title: {
    fontSize: 16,
    fontWeight: "700",
    color: GatiMitraMerchant.textPrimary,
  },
  subtitle: {
    marginTop: 4,
    fontSize: 12,
    color: GatiMitraMerchant.textSecondary,
  },
  fieldGroup: { marginTop: 10 },
  sectionTitle: {
    marginTop: 6,
    fontSize: 13,
    fontWeight: "700",
    color: GatiMitraMerchant.textPrimary,
  },
  label: {
    fontSize: 12,
    fontWeight: "600",
    color: GatiMitraMerchant.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  required: { color: GatiMitraMerchant.error },
  input: {
    marginTop: 4,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: GatiMitraMerchant.textPrimary,
    backgroundColor: GatiMitraMerchant.cardBg,
  },
  inputDisabled: {
    backgroundColor: GatiMitraMerchant.surfaceSubtle,
    color: GatiMitraMerchant.textSecondary,
  },
  hint: {
    marginTop: 4,
    fontSize: 11,
    color: GatiMitraMerchant.textTertiary,
  },
  infoBox: {
    marginTop: 14,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    padding: 10,
    borderRadius: 10,
    backgroundColor: GatiMitraMerchant.surfaceSubtle,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
  },
  infoText: {
    flex: 1,
    fontSize: 12,
    color: GatiMitraMerchant.textSecondary,
  },
  saveBtn: {
    marginTop: 18,
    borderRadius: 999,
    backgroundColor: GatiMitraMerchant.primary,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnPressed: { opacity: 0.85 },
  saveBtnText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#fff",
  },
  statusPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    alignSelf: "flex-start",
  },
  statusText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#fff",
    textTransform: "uppercase",
  },
  statusPillVerified: {
    backgroundColor: GatiMitraMerchant.statusCompleted,
  },
  statusPillPending: {
    backgroundColor: GatiMitraMerchant.statusPending,
  },
  statusPillError: {
    backgroundColor: GatiMitraMerchant.error,
  },
  statusPillDisabled: {
    backgroundColor: GatiMitraMerchant.textTertiary,
  },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    marginTop: 4,
    marginBottom: 8,
    borderRadius: 999,
    backgroundColor: GatiMitraMerchant.surfaceSubtle,
    padding: 2,
  },
  toggleChip: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 999,
  },
  toggleChipActive: {
    backgroundColor: "#fff",
  },
  toggleChipPressed: {
    opacity: 0.8,
  },
  toggleText: {
    fontSize: 11,
    fontWeight: "600",
    color: GatiMitraMerchant.textSecondary,
  },
  toggleTextActive: {
    fontSize: 11,
    fontWeight: "700",
    color: GatiMitraMerchant.primary,
  },
});

