import { useEffect, useState, useCallback } from "react";
import { AppText as Text } from "@/components/AppText";
import { View, StyleSheet, ScrollView, TextInput, Pressable, ActivityIndicator, Alert, KeyboardAvoidingView, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { GatiMitraMerchant, H_PADDING, CARD_RADIUS } from "@/constants/theme";
import { useSelectedStore } from "@/context/SelectedStoreContext";
import { useAuth } from "@/context/AuthContext";
import {
  listBankAccounts,
  addBankAccount,
  setAccountDefault,
  setAccountDisabled,
  type BankAccount,
  type BankAccountPayload,
} from "@/services/bankAccountApi";

const IFSC_REGEX = /^[A-Za-z]{4}0[A-Za-z0-9]{6}$/;

export default function BankAccountScreen() {
  const { selectedStore } = useSelectedStore();
  const { token } = useAuth();

  const [loading, setLoading] = useState(true);
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [actionLoading, setActionLoading] = useState<number | null>(null);

  const [payoutMethod, setPayoutMethod] = useState<"bank" | "upi">("bank");
  const [holderName, setHolderName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [confirmAccountNumber, setConfirmAccountNumber] = useState("");
  const [ifsc, setIfsc] = useState("");
  const [bankName, setBankName] = useState("");
  const [branchName, setBranchName] = useState("");
  const [upiId, setUpiId] = useState("");
  const [saving, setSaving] = useState(false);

  const storeId = selectedStore?.id ?? null;

  const reload = useCallback(async () => {
    if (!storeId || !token) return;
    setLoading(true);
    try {
      const list = await listBankAccounts(storeId, token);
      setAccounts(list);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [storeId, token]);

  useEffect(() => {
    if (!storeId || !token) {
      setLoading(false);
      if (!token) setError("Not signed in.");
      else if (!storeId) setError("No store selected.");
      return;
    }
    reload();
  }, [storeId, token, reload]);

  const resetForm = () => {
    setPayoutMethod("bank");
    setHolderName("");
    setAccountNumber("");
    setConfirmAccountNumber("");
    setIfsc("");
    setBankName("");
    setBranchName("");
    setUpiId("");
  };

  const handleAdd = async () => {
    if (!storeId || !token) return;
    const trimmedName = holderName.trim();
    const trimmedAcc = accountNumber.trim();
    const trimmedConfirm = confirmAccountNumber.trim();
    const trimmedIfsc = ifsc.trim().toUpperCase();
    const trimmedBank = bankName.trim();
    const trimmedUpi = upiId.trim();

    if (!trimmedName || !trimmedAcc) {
      Alert.alert("Missing details", "Account holder name and account number are required.");
      return;
    }
    if (trimmedAcc !== trimmedConfirm) {
      Alert.alert("Mismatch", "Account number and confirm account number must match.");
      return;
    }
    if (payoutMethod === "bank") {
      if (!trimmedIfsc || !trimmedBank) {
        Alert.alert("Missing details", "IFSC and bank name required for bank accounts.");
        return;
      }
      if (!IFSC_REGEX.test(trimmedIfsc)) {
        Alert.alert("Invalid IFSC", "Enter a valid IFSC code (e.g. HDFC0001234).");
        return;
      }
    }
    if (payoutMethod === "upi" && !trimmedUpi) {
      Alert.alert("Missing UPI ID", "Enter a valid UPI ID.");
      return;
    }

    const payload: BankAccountPayload = {
      payout_method: payoutMethod,
      account_holder_name: trimmedName,
      account_number: trimmedAcc,
      ifsc_code: payoutMethod === "bank" ? trimmedIfsc : undefined,
      bank_name: payoutMethod === "bank" ? trimmedBank : undefined,
      branch_name: branchName.trim() || null,
      upi_id: payoutMethod === "upi" ? trimmedUpi : null,
      beneficiary_name: trimmedName,
    };

    setSaving(true);
    try {
      await addBankAccount(storeId, payload, token);
      Alert.alert("Added", "Bank/UPI account added successfully.");
      resetForm();
      setShowAddForm(false);
      await reload();
    } catch (e) {
      Alert.alert("Failed", e instanceof Error ? e.message : "Could not add account.");
    } finally {
      setSaving(false);
    }
  };

  const handleSetDefault = async (acc: BankAccount) => {
    if (!storeId || !token) return;
    if (acc.is_primary) return;
    Alert.alert("Set as default?", `Make "${acc.account_holder_name}" the default payout account?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Set Default",
        onPress: async () => {
          setActionLoading(acc.id);
          try {
            await setAccountDefault(storeId, acc.id, token);
            await reload();
          } catch (e) {
            Alert.alert("Failed", e instanceof Error ? e.message : "Could not set default.");
          } finally {
            setActionLoading(null);
          }
        },
      },
    ]);
  };

  const handleToggleDisable = async (acc: BankAccount) => {
    if (!storeId || !token) return;
    if (acc.is_primary && !acc.is_disabled) {
      Alert.alert("Cannot disable", "Set another account as default before disabling this one.");
      return;
    }
    const action = acc.is_disabled ? "Enable" : "Disable";
    Alert.alert(`${action} account?`, `${action} "${acc.account_holder_name}"?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: action,
        style: acc.is_disabled ? "default" : "destructive",
        onPress: async () => {
          setActionLoading(acc.id);
          try {
            await setAccountDisabled(storeId, acc.id, !acc.is_disabled, token);
            await reload();
          } catch (e) {
            Alert.alert("Failed", e instanceof Error ? e.message : "Could not update.");
          } finally {
            setActionLoading(null);
          }
        },
      },
    ]);
  };

  if (loading && accounts.length === 0) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={GatiMitraMerchant.primary} />
        <Text style={styles.loadingText}>Loading bank accounts…</Text>
      </View>
    );
  }

  if (error && !storeId) {
    return (
      <View style={styles.centered}>
        <Ionicons name="alert-circle-outline" size={40} color={GatiMitraMerchant.textTertiary} />
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
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.headerRow}>
          <Text style={styles.title}>Bank & UPI Accounts</Text>
          <Text style={styles.subtitle}>
            Manage your payout accounts. You cannot delete accounts; only disable them.
          </Text>
        </View>

        {accounts.length === 0 && !loading && (
          <View style={styles.emptyCard}>
            <Ionicons name="wallet-outline" size={36} color={GatiMitraMerchant.textTertiary} />
            <Text style={styles.emptyText}>No bank/UPI accounts added yet.</Text>
          </View>
        )}

        {accounts.map((acc) => (
          <View
            key={acc.id}
            style={[
              styles.accountCard,
              acc.is_disabled && styles.accountCardDisabled,
              acc.is_primary && styles.accountCardPrimary,
            ]}
          >
            <View style={styles.accountHeader}>
              <View style={styles.accountBadges}>
                {acc.is_primary && (
                  <View style={styles.badgePrimary}>
                    <Ionicons name="star" size={10} color="#fff" />
                    <Text style={styles.badgeText}>Default</Text>
                  </View>
                )}
                <View style={[styles.badgeMethod, acc.payout_method === "upi" ? styles.badgeUpi : styles.badgeBank]}>
                  <Text style={styles.badgeMethodText}>
                    {(acc.payout_method || "bank").toUpperCase()}
                  </Text>
                </View>
                {acc.is_disabled && (
                  <View style={styles.badgeDisabled}>
                    <Text style={styles.badgeText}>Disabled</Text>
                  </View>
                )}
                {acc.is_verified && (
                  <View style={styles.badgeVerified}>
                    <Ionicons name="checkmark-circle" size={10} color="#fff" />
                    <Text style={styles.badgeText}>Verified</Text>
                  </View>
                )}
              </View>
              {actionLoading === acc.id && (
                <ActivityIndicator size="small" color={GatiMitraMerchant.primary} />
              )}
            </View>

            <Text style={styles.accName}>{acc.account_holder_name}</Text>
            <Text style={styles.accDetail}>
              {acc.account_number_masked ?? `****${String(acc.account_number).slice(-4)}`}
              {acc.ifsc_code && acc.ifsc_code !== "N/A" ? ` · ${acc.ifsc_code}` : ""}
            </Text>
            {acc.bank_name && acc.bank_name !== "UPI" && (
              <Text style={styles.accDetail}>{acc.bank_name}{acc.branch_name ? ` – ${acc.branch_name}` : ""}</Text>
            )}
            {acc.upi_id && <Text style={styles.accDetail}>UPI: {acc.upi_id}</Text>}

            <View style={styles.accountActions}>
              {!acc.is_primary && !acc.is_disabled && (
                <Pressable
                  onPress={() => handleSetDefault(acc)}
                  disabled={actionLoading === acc.id}
                  style={({ pressed }) => [styles.actionBtn, styles.actionDefault, pressed && styles.actionPressed]}
                >
                  <Ionicons name="star-outline" size={14} color={GatiMitraMerchant.primary} />
                  <Text style={styles.actionDefaultText}>Set Default</Text>
                </Pressable>
              )}
              <Pressable
                onPress={() => handleToggleDisable(acc)}
                disabled={actionLoading === acc.id || (acc.is_primary && !acc.is_disabled)}
                style={({ pressed }) => [
                  styles.actionBtn,
                  acc.is_disabled ? styles.actionEnable : styles.actionDisable,
                  pressed && styles.actionPressed,
                  (acc.is_primary && !acc.is_disabled) && styles.actionBtnHidden,
                ]}
              >
                <Ionicons
                  name={acc.is_disabled ? "eye-outline" : "eye-off-outline"}
                  size={14}
                  color={acc.is_disabled ? "#16a34a" : "#dc2626"}
                />
                <Text style={acc.is_disabled ? styles.actionEnableText : styles.actionDisableText}>
                  {acc.is_disabled ? "Enable" : "Disable"}
                </Text>
              </Pressable>
            </View>
          </View>
        ))}

        {!showAddForm ? (
          <Pressable
            onPress={() => setShowAddForm(true)}
            style={({ pressed }) => [styles.addBtn, pressed && styles.addBtnPressed]}
          >
            <Ionicons name="add-circle-outline" size={20} color={GatiMitraMerchant.primary} />
            <Text style={styles.addBtnText}>Add Bank / UPI Account</Text>
          </Pressable>
        ) : (
          <View style={styles.formCard}>
            <Text style={styles.formTitle}>Add New Account</Text>

            <View style={styles.methodToggle}>
              <Pressable
                onPress={() => setPayoutMethod("bank")}
                style={[styles.methodChip, payoutMethod === "bank" && styles.methodChipActive]}
              >
                <Text style={payoutMethod === "bank" ? styles.methodTextActive : styles.methodText}>Bank</Text>
              </Pressable>
              <Pressable
                onPress={() => setPayoutMethod("upi")}
                style={[styles.methodChip, payoutMethod === "upi" && styles.methodChipActive]}
              >
                <Text style={payoutMethod === "upi" ? styles.methodTextActive : styles.methodText}>UPI</Text>
              </Pressable>
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Account holder name <Text style={styles.req}>*</Text></Text>
              <TextInput style={styles.input} value={holderName} onChangeText={setHolderName} placeholder="As per bank records" placeholderTextColor={GatiMitraMerchant.textTertiary} autoCapitalize="words" />
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Account number <Text style={styles.req}>*</Text></Text>
              <TextInput style={styles.input} value={accountNumber} onChangeText={setAccountNumber} placeholder="Enter account number" placeholderTextColor={GatiMitraMerchant.textTertiary} keyboardType="number-pad" />
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Confirm account number <Text style={styles.req}>*</Text></Text>
              <TextInput style={styles.input} value={confirmAccountNumber} onChangeText={setConfirmAccountNumber} placeholder="Re-enter account number" placeholderTextColor={GatiMitraMerchant.textTertiary} keyboardType="number-pad" />
            </View>

            {payoutMethod === "bank" && (
              <>
                <View style={styles.fieldGroup}>
                  <Text style={styles.label}>IFSC code <Text style={styles.req}>*</Text></Text>
                  <TextInput style={styles.input} value={ifsc} onChangeText={(t) => setIfsc(t.toUpperCase())} placeholder="e.g. HDFC0001234" placeholderTextColor={GatiMitraMerchant.textTertiary} autoCapitalize="characters" />
                </View>
                <View style={styles.fieldGroup}>
                  <Text style={styles.label}>Bank name <Text style={styles.req}>*</Text></Text>
                  <TextInput style={styles.input} value={bankName} onChangeText={setBankName} placeholder="e.g. HDFC Bank" placeholderTextColor={GatiMitraMerchant.textTertiary} />
                </View>
                <View style={styles.fieldGroup}>
                  <Text style={styles.label}>Branch name</Text>
                  <TextInput style={styles.input} value={branchName} onChangeText={setBranchName} placeholder="e.g. Andheri (E)" placeholderTextColor={GatiMitraMerchant.textTertiary} />
                </View>
              </>
            )}

            {payoutMethod === "upi" && (
              <View style={styles.fieldGroup}>
                <Text style={styles.label}>UPI ID <Text style={styles.req}>*</Text></Text>
                <TextInput style={styles.input} value={upiId} onChangeText={setUpiId} placeholder="yourname@bank" placeholderTextColor={GatiMitraMerchant.textTertiary} autoCapitalize="none" />
              </View>
            )}

            <View style={styles.formActions}>
              <Pressable onPress={handleAdd} disabled={saving} style={({ pressed }) => [styles.saveBtn, saving && styles.saveBtnDisabled, pressed && !saving && styles.saveBtnPressed]}>
                {saving ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.saveBtnText}>Add Account</Text>}
              </Pressable>
              <Pressable onPress={() => { resetForm(); setShowAddForm(false); }} style={({ pressed }) => [styles.cancelBtn, pressed && styles.cancelBtnPressed]}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </Pressable>
            </View>
          </View>
        )}

        <View style={styles.infoBox}>
          <Ionicons name="shield-checkmark-outline" size={18} color={GatiMitraMerchant.primary} />
          <Text style={styles.infoText}>
            Accounts cannot be deleted. You can only disable them. The default account receives all payouts.
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: GatiMitraMerchant.surfaceWarm },
  scroll: { flex: 1 },
  content: { padding: H_PADDING, paddingBottom: 40 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", padding: H_PADDING },
  loadingText: { marginTop: 12, fontSize: 14, color: GatiMitraMerchant.textSecondary },
  errorText: { marginTop: 12, fontSize: 15, color: GatiMitraMerchant.textSecondary, textAlign: "center" },
  headerRow: { marginBottom: 14 },
  title: { fontSize: 18, fontWeight: "700", color: GatiMitraMerchant.textPrimary },
  subtitle: { marginTop: 4, fontSize: 12, color: GatiMitraMerchant.textSecondary },
  emptyCard: { alignItems: "center", padding: 24, backgroundColor: GatiMitraMerchant.cardBg, borderRadius: CARD_RADIUS, borderWidth: 1, borderColor: GatiMitraMerchant.border, marginBottom: 12 },
  emptyText: { marginTop: 8, fontSize: 13, color: GatiMitraMerchant.textTertiary },
  accountCard: { backgroundColor: GatiMitraMerchant.cardBg, borderRadius: CARD_RADIUS, padding: 14, borderWidth: 1, borderColor: GatiMitraMerchant.border, marginBottom: 10, ...GatiMitraMerchant.shadowSm },
  accountCardDisabled: { opacity: 0.6, borderColor: "#e5e7eb" },
  accountCardPrimary: { borderColor: GatiMitraMerchant.primary, borderWidth: 1.5 },
  accountHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
  accountBadges: { flexDirection: "row", flexWrap: "wrap", gap: 4 },
  badgePrimary: { flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: GatiMitraMerchant.primary, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 99 },
  badgeMethod: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 99 },
  badgeBank: { backgroundColor: "#3b82f6" },
  badgeUpi: { backgroundColor: "#8b5cf6" },
  badgeMethodText: { fontSize: 10, fontWeight: "700", color: "#fff" },
  badgeDisabled: { backgroundColor: "#9ca3af", paddingHorizontal: 8, paddingVertical: 2, borderRadius: 99 },
  badgeVerified: { flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: "#16a34a", paddingHorizontal: 8, paddingVertical: 2, borderRadius: 99 },
  badgeText: { fontSize: 10, fontWeight: "700", color: "#fff" },
  accName: { fontSize: 15, fontWeight: "600", color: GatiMitraMerchant.textPrimary },
  accDetail: { fontSize: 12, color: GatiMitraMerchant.textSecondary, marginTop: 2 },
  accountActions: { flexDirection: "row", gap: 8, marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: "#f3f4f6" },
  actionBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1 },
  actionDefault: { borderColor: GatiMitraMerchant.primary, backgroundColor: "#fff7ed" },
  actionDefaultText: { fontSize: 12, fontWeight: "600", color: GatiMitraMerchant.primary },
  actionDisable: { borderColor: "#fecaca", backgroundColor: "#fef2f2" },
  actionDisableText: { fontSize: 12, fontWeight: "600", color: "#dc2626" },
  actionEnable: { borderColor: "#bbf7d0", backgroundColor: "#f0fdf4" },
  actionEnableText: { fontSize: 12, fontWeight: "600", color: "#16a34a" },
  actionPressed: { opacity: 0.7 },
  actionBtnHidden: { opacity: 0 },
  addBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 14, backgroundColor: GatiMitraMerchant.cardBg, borderRadius: CARD_RADIUS, borderWidth: 1, borderColor: GatiMitraMerchant.primary, borderStyle: "dashed", marginBottom: 12 },
  addBtnPressed: { opacity: 0.7 },
  addBtnText: { fontSize: 14, fontWeight: "600", color: GatiMitraMerchant.primary },
  formCard: { backgroundColor: GatiMitraMerchant.cardBg, borderRadius: CARD_RADIUS, padding: 14, borderWidth: 1, borderColor: GatiMitraMerchant.primary, marginBottom: 12, ...GatiMitraMerchant.shadowSm },
  formTitle: { fontSize: 15, fontWeight: "700", color: GatiMitraMerchant.textPrimary, marginBottom: 10 },
  methodToggle: { flexDirection: "row", backgroundColor: "#f3f4f6", borderRadius: 99, padding: 2, marginBottom: 12, alignSelf: "flex-start" },
  methodChip: { paddingHorizontal: 16, paddingVertical: 6, borderRadius: 99 },
  methodChipActive: { backgroundColor: "#fff", ...GatiMitraMerchant.shadowSm },
  methodText: { fontSize: 12, fontWeight: "600", color: GatiMitraMerchant.textSecondary },
  methodTextActive: { fontSize: 12, fontWeight: "700", color: GatiMitraMerchant.primary },
  fieldGroup: { marginTop: 8 },
  label: { fontSize: 11, fontWeight: "600", color: GatiMitraMerchant.textSecondary, textTransform: "uppercase", letterSpacing: 0.3 },
  req: { color: GatiMitraMerchant.error },
  input: { marginTop: 4, borderWidth: 1, borderColor: GatiMitraMerchant.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: GatiMitraMerchant.textPrimary, backgroundColor: "#fff" },
  formActions: { flexDirection: "row", gap: 10, marginTop: 14 },
  saveBtn: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 12, borderRadius: 99, backgroundColor: GatiMitraMerchant.primary },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnPressed: { opacity: 0.85 },
  saveBtnText: { fontSize: 14, fontWeight: "600", color: "#fff" },
  cancelBtn: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 12, borderRadius: 99, borderWidth: 1, borderColor: GatiMitraMerchant.border },
  cancelBtnPressed: { opacity: 0.7 },
  cancelBtnText: { fontSize: 14, fontWeight: "600", color: GatiMitraMerchant.textSecondary },
  infoBox: { flexDirection: "row", alignItems: "flex-start", gap: 8, padding: 12, borderRadius: 10, backgroundColor: GatiMitraMerchant.surfaceSubtle, borderWidth: 1, borderColor: GatiMitraMerchant.border, marginTop: 4 },
  infoText: { flex: 1, fontSize: 12, color: GatiMitraMerchant.textSecondary },
});
