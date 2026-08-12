import { useEffect, useState, useCallback } from "react";
import { AppText as Text } from "@/components/AppText";
import {
  View,
  StyleSheet,
  ScrollView,
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
import { AddBankAccountSheet } from "@/components/bank/AddBankAccountSheet";
import {
  listBankAccounts,
  setAccountDefault,
  setAccountDisabled,
  verifyBankAccount,
  type BankAccount,
} from "@/services/bankAccountApi";

export default function BankAccountScreen() {
  const { selectedStore } = useSelectedStore();
  const { token } = useAuth();

  const [loading, setLoading] = useState(true);
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState<number | null>(null);
  const [verifyingId, setVerifyingId] = useState<number | null>(null);

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

  const handleVerify = async (acc: BankAccount) => {
    if (!storeId || !token) return;
    if (acc.is_verified) return;
    if (String(acc.payout_method || "bank").toLowerCase() === "upi") {
      Alert.alert("UPI unavailable", "UPI verification is not available in the app. Please add a bank account.");
      return;
    }
    setVerifyingId(acc.id);
    try {
      const result = await verifyBankAccount(storeId, acc.id, token);
      if (result.verified) {
        Alert.alert("Verified", result.message || "Bank account verified with Cashfree.");
      } else {
        Alert.alert("Pending review", result.message || "Saved for manual verification.");
      }
      await reload();
    } catch (e) {
      Alert.alert("Verification failed", e instanceof Error ? e.message : "Could not verify.");
    } finally {
      setVerifyingId(null);
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
        {accounts.length === 0 && !loading && (
          <View style={styles.emptyCard}>
            <Ionicons name="wallet-outline" size={36} color={GatiMitraMerchant.textTertiary} />
            <Text style={styles.emptyText}>No bank accounts added yet.</Text>
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
                {acc.is_verified ? (
                  <View style={styles.badgeVerified}>
                    <Ionicons name="checkmark-circle" size={10} color="#fff" />
                    <Text style={styles.badgeText}>Verified</Text>
                  </View>
                ) : (
                  <View style={styles.badgePending}>
                    <Text style={styles.badgeText}>Pending</Text>
                  </View>
                )}
              </View>
              {(actionLoading === acc.id || verifyingId === acc.id) && (
                <ActivityIndicator size="small" color={GatiMitraMerchant.primary} />
              )}
            </View>

            <Text style={styles.accName}>{acc.account_holder_name}</Text>
            <Text style={styles.accDetail}>
              {acc.account_number_masked ?? `****${String(acc.account_number).slice(-4)}`}
              {acc.ifsc_code && acc.ifsc_code !== "N/A" ? ` · ${acc.ifsc_code}` : ""}
            </Text>
            {acc.bank_name && acc.bank_name !== "UPI" && (
              <Text style={styles.accDetail}>
                {acc.bank_name}
                {acc.branch_name ? ` – ${acc.branch_name}` : ""}
              </Text>
            )}

            <View style={styles.accountActions}>
              {!acc.is_verified && String(acc.payout_method || "bank").toLowerCase() !== "upi" && (
                <Pressable
                  onPress={() => handleVerify(acc)}
                  disabled={verifyingId === acc.id || actionLoading === acc.id}
                  style={({ pressed }) => [styles.actionBtn, styles.actionVerify, pressed && styles.actionPressed]}
                >
                  <Ionicons name="shield-checkmark-outline" size={14} color="#4f46e5" />
                  <Text style={styles.actionVerifyText}>
                    {verifyingId === acc.id ? "Verifying…" : "Verify with Cashfree"}
                  </Text>
                </Pressable>
              )}
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
                  acc.is_primary && !acc.is_disabled && styles.actionBtnHidden,
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

        <Pressable
          onPress={() => setAddOpen(true)}
          style={({ pressed }) => [styles.addBtn, pressed && styles.addBtnPressed]}
        >
          <Ionicons name="add-circle-outline" size={20} color={GatiMitraMerchant.primary} />
          <Text style={styles.addBtnText}>Add Bank Account</Text>
        </Pressable>
      </ScrollView>

      <AddBankAccountSheet
        visible={addOpen}
        onClose={() => setAddOpen(false)}
        onAdded={() => void reload()}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: GatiMitraMerchant.surfaceWarm },
  scroll: { flex: 1 },
  content: { padding: H_PADDING, paddingTop: 12, paddingBottom: 40 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", padding: H_PADDING },
  loadingText: { marginTop: 12, fontSize: 14, color: GatiMitraMerchant.textSecondary },
  errorText: { marginTop: 12, fontSize: 15, color: GatiMitraMerchant.textSecondary, textAlign: "center" },
  emptyCard: {
    alignItems: "center",
    padding: 24,
    backgroundColor: GatiMitraMerchant.cardBg,
    borderRadius: CARD_RADIUS,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
    marginBottom: 12,
  },
  emptyText: { marginTop: 8, fontSize: 13, color: GatiMitraMerchant.textTertiary },
  accountCard: {
    backgroundColor: GatiMitraMerchant.cardBg,
    borderRadius: CARD_RADIUS,
    padding: 14,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
    marginBottom: 10,
    ...GatiMitraMerchant.shadowSm,
  },
  accountCardDisabled: { opacity: 0.6, borderColor: "#e5e7eb" },
  accountCardPrimary: { borderColor: GatiMitraMerchant.primary, borderWidth: 1.5 },
  accountHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  accountBadges: { flexDirection: "row", flexWrap: "wrap", gap: 4 },
  badgePrimary: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: GatiMitraMerchant.primary,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 99,
  },
  badgeMethod: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 99 },
  badgeBank: { backgroundColor: "#3b82f6" },
  badgeUpi: { backgroundColor: "#8b5cf6" },
  badgeMethodText: { fontSize: 10, fontWeight: "700", color: "#fff" },
  badgeDisabled: { backgroundColor: "#9ca3af", paddingHorizontal: 8, paddingVertical: 2, borderRadius: 99 },
  badgeVerified: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: "#16a34a",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 99,
  },
  badgePending: { backgroundColor: "#f59e0b", paddingHorizontal: 8, paddingVertical: 2, borderRadius: 99 },
  badgeText: { fontSize: 10, fontWeight: "700", color: "#fff" },
  accName: { fontSize: 15, fontWeight: "600", color: GatiMitraMerchant.textPrimary },
  accDetail: { fontSize: 12, color: GatiMitraMerchant.textSecondary, marginTop: 2 },
  accountActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "#f3f4f6",
  },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  actionVerify: { borderColor: "#c7d2fe", backgroundColor: "#eef2ff" },
  actionVerifyText: { fontSize: 12, fontWeight: "600", color: "#4f46e5" },
  actionDefault: { borderColor: GatiMitraMerchant.primary, backgroundColor: "#fff7ed" },
  actionDefaultText: { fontSize: 12, fontWeight: "600", color: GatiMitraMerchant.primary },
  actionDisable: { borderColor: "#fecaca", backgroundColor: "#fef2f2" },
  actionDisableText: { fontSize: 12, fontWeight: "600", color: "#dc2626" },
  actionEnable: { borderColor: "#bbf7d0", backgroundColor: "#f0fdf4" },
  actionEnableText: { fontSize: 12, fontWeight: "600", color: "#16a34a" },
  actionPressed: { opacity: 0.7 },
  actionBtnHidden: { opacity: 0 },
  addBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 14,
    backgroundColor: GatiMitraMerchant.cardBg,
    borderRadius: CARD_RADIUS,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.primary,
    borderStyle: "dashed",
    marginBottom: 12,
  },
  addBtnPressed: { opacity: 0.7 },
  addBtnText: { fontSize: 14, fontWeight: "600", color: GatiMitraMerchant.primary },
});
