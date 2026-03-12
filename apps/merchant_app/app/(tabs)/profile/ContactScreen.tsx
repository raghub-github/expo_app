import { useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, Alert, Modal, TextInput } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { GatiMitraMerchant, H_PADDING, CARD_RADIUS, BUTTON_RADIUS } from "@/constants/theme";
import { useSelectedStore } from "@/context/SelectedStoreContext";
import { useAuth } from "@/context/AuthContext";
import { getOutlet, updateOutlet, type OutletInfo } from "@/services/outletApi";

function isValidPhone(num: string): boolean {
  // Basic validation: 10–15 digits (can include + at start)
  const cleaned = num.replace(/[\s\-]/g, "");
  return /^(\+?\d{10,15})$/.test(cleaned);
}

export default function ContactScreen() {
  const { selectedStore } = useSelectedStore();
  const { token } = useAuth();
  const router = useRouter();
  const storeId = selectedStore?.id ?? null;

  const [outlet, setOutlet] = useState<OutletInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [altNumbers, setAltNumbers] = useState<string[]>([]);

  const [modalVisible, setModalVisible] = useState(false);
  const [modalMode, setModalMode] = useState<"add" | "edit">("add");
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [modalValue, setModalValue] = useState("");

  useEffect(() => {
    if (!storeId || !token) {
      setLoading(false);
      if (!token) setError("Not signed in.");
      else if (!storeId) setError("No store selected.");
      return;
    }
    let cancelled = false;
    getOutlet(storeId, token)
      .then((info) => {
        if (cancelled) return;
        const phones = Array.isArray(info.store_phones) ? info.store_phones : [];
        const [, ...alts] = phones;
        setOutlet(info);
        setAltNumbers(alts);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load contact details");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [storeId, token]);

  const persistAltNumbers = async (nextAlts: string[]) => {
    if (!storeId || !token || !outlet) return;
    const phones = Array.isArray(outlet.store_phones) ? outlet.store_phones : [];
    const primary = phones[0] ?? "";

    for (const n of nextAlts) {
      if (!isValidPhone(n)) {
        Alert.alert("Invalid number", `Please check this number: ${n}`);
        return;
      }
    }

    const nextPhones = primary ? [primary, ...nextAlts] : nextAlts;

    setSaving(true);
    try {
      await updateOutlet(storeId, { store_phones: nextPhones }, token);
      const fresh = await getOutlet(storeId, token);
      setOutlet(fresh);
      const [, ...freshAlts] = Array.isArray(fresh.store_phones) ? fresh.store_phones : [];
      setAltNumbers(freshAlts);
    } catch (e) {
      Alert.alert("Save failed", e instanceof Error ? e.message : "Could not update contact details.");
    } finally {
      setSaving(false);
    }
  };

  const openAddModal = () => {
    setModalMode("add");
    setEditingIndex(null);
    setModalValue("");
    setModalVisible(true);
  };

  const openEditModal = (index: number, value: string) => {
    setModalMode("edit");
    setEditingIndex(index);
    setModalValue(value);
    setModalVisible(true);
  };

  const handleModalSave = async () => {
    const trimmed = modalValue.trim();
    if (!trimmed) {
      Alert.alert("Enter number", "Please enter a phone number.");
      return;
    }
    if (!isValidPhone(trimmed)) {
      Alert.alert("Invalid number", "Please enter a valid phone number (10–15 digits).");
      return;
    }

    let next: string[];
    if (modalMode === "edit" && editingIndex != null) {
      next = altNumbers.map((n, i) => (i === editingIndex ? trimmed : n));
    } else {
      next = [...altNumbers, trimmed];
    }

    await persistAltNumbers(next);
    setModalVisible(false);
    setModalValue("");
    setEditingIndex(null);
  };

  const handleRemove = async (index: number) => {
    const toRemove = altNumbers[index];
    Alert.alert("Remove number", `Remove ${toRemove} from order reminders?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: async () => {
          const next = altNumbers.filter((_, i) => i !== index);
          await persistAltNumbers(next);
        },
      },
    ]);
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={GatiMitraMerchant.primary} />
        <Text style={styles.loadingText}>Loading contact details…</Text>
      </View>
    );
  }

  if (error || !outlet) {
    return (
      <View style={styles.centered}>
        <Ionicons name="alert-circle-outline" size={48} color={GatiMitraMerchant.textTertiary} />
        <Text style={styles.errorText}>{error ?? "Unable to load contact details"}</Text>
      </View>
    );
  }

  const phones = Array.isArray(outlet.store_phones) ? outlet.store_phones : [];
  const primary = phones[0] ?? "";

  return (
    <View style={styles.container}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Order reminder numbers */}
        <View style={styles.card}>
          <View style={styles.sectionHeader}>
            <Ionicons name="notifications-outline" size={18} color={GatiMitraMerchant.textSecondary} />
            <Text style={styles.sectionTitle}>Order reminder numbers</Text>
          </View>
          <Text style={styles.helperText}>
            These numbers are used by our team to reach your store for live order support and reminders.
          </Text>
          <Pressable
            style={({ pressed }) => [styles.linkRow, pressed && styles.linkRowPressed]}
            onPress={openAddModal}
            disabled={saving}
          >
            <Text style={styles.linkText}>Add order reminder number</Text>
            <Ionicons name="add-circle-outline" size={18} color={GatiMitraMerchant.primary} />
          </Pressable>
          {altNumbers.length > 0 ? (
            <View style={styles.altList}>
              {altNumbers.map((num, idx) => (
                <View key={`${num}-${idx}`} style={styles.altRow}>
                  <Ionicons name="call-outline" size={18} color={GatiMitraMerchant.primary} />
                  <Text style={styles.altNumber}>{num}</Text>
                  <Pressable
                    onPress={() => openEditModal(idx, num)}
                    hitSlop={8}
                    style={({ pressed }) => [styles.iconButton, pressed && styles.iconButtonPressed]}
                  >
                    <Ionicons name="pencil-outline" size={16} color={GatiMitraMerchant.textSecondary} />
                  </Pressable>
                  <Pressable
                    onPress={() => handleRemove(idx)}
                    hitSlop={8}
                    style={({ pressed }) => [styles.iconButton, pressed && styles.iconButtonPressed]}
                  >
                    <Ionicons name="trash-outline" size={16} color={GatiMitraMerchant.error} />
                  </Pressable>
                </View>
              ))}
            </View>
          ) : (
            <Text style={styles.emptyText}>No reminder numbers added yet.</Text>
          )}
        </View>

        {/* Restaurant page number (primary) */}
        <View style={styles.card}>
          <View style={styles.sectionHeader}>
            <Ionicons name="call-outline" size={18} color={GatiMitraMerchant.textSecondary} />
            <Text style={styles.sectionTitle}>Restaurant page number</Text>
          </View>
          <Text style={styles.helperText}>
            This is the number shown to customers on your store page. It is managed during onboarding and is read only
            here.
          </Text>
          <View style={styles.primaryRow}>
            <View style={styles.primaryIconWrap}>
              <Ionicons name="shield-checkmark-outline" size={18} color={GatiMitraMerchant.primary} />
            </View>
            <View style={styles.primaryTextWrap}>
              <Text style={styles.primaryNumber}>{primary || "Not set"}</Text>
              <Text style={styles.primaryHint}>Primary contact • Read only</Text>
            </View>
          </View>
        </View>

        {/* Staff contact management */}
        <View style={styles.card}>
          <Pressable
            onPress={() => router.push("/(tabs)/profile/staff" as any)}
            style={({ pressed }) => [styles.staffRow, pressed && styles.staffRowPressed]}
          >
            <View style={styles.staffLeft}>
              <View style={styles.staffIconWrap}>
                <Ionicons name="people-outline" size={18} color={GatiMitraMerchant.primary} />
              </View>
              <View style={styles.staffTextWrap}>
                <Text style={styles.staffTitle}>Manage contact details for your staff</Text>
                <Text style={styles.staffSubtitle}>View and edit staff phone numbers and roles.</Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={18} color={GatiMitraMerchant.textTertiary} />
          </Pressable>
        </View>
      </ScrollView>

      <Modal visible={modalVisible} transparent animationType="fade" onRequestClose={() => setModalVisible(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setModalVisible(false)}>
          <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>
              {modalMode === "edit" ? "Edit reminder number" : "Add reminder number"}
            </Text>
            <Text style={styles.modalHint}>Enter a phone number used for order reminders.</Text>
            <View style={styles.modalInputRow}>
              <Ionicons
                name="call-outline"
                size={18}
                color={GatiMitraMerchant.textSecondary}
                style={styles.modalInputIcon}
              />
              <View style={styles.modalInputInner}>
                <TextInput
                  style={styles.modalTextInput}
                  value={modalValue}
                  onChangeText={setModalValue}
                  placeholder="+91 9876543210"
                  placeholderTextColor={GatiMitraMerchant.textTertiary}
                  keyboardType="phone-pad"
                  autoFocus
                />
              </View>
            </View>
            <View style={styles.modalActions}>
              <Pressable
                onPress={() => setModalVisible(false)}
                style={({ pressed }) => [styles.modalBtn, styles.modalBtnSecondary, pressed && styles.modalBtnPressed]}
              >
                <Text style={styles.modalBtnSecondaryText}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={handleModalSave}
                disabled={saving}
                style={({ pressed }) => [
                  styles.modalBtn,
                  styles.modalBtnPrimary,
                  (pressed || saving) && styles.modalBtnPressed,
                ]}
              >
                {saving ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.modalBtnPrimaryText}>Save</Text>
                )}
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: GatiMitraMerchant.surfaceWarm },
  centered: { flex: 1, justifyContent: "center", alignItems: "center", padding: H_PADDING },
  loadingText: { marginTop: 12, fontSize: 14, color: GatiMitraMerchant.textSecondary },
  errorText: { marginTop: 12, fontSize: 15, color: GatiMitraMerchant.textSecondary, textAlign: "center" },

  scroll: { flex: 1 },
  scrollContent: { padding: H_PADDING, paddingBottom: 80 },

  sectionHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 },
  sectionTitle: { fontSize: 15, fontWeight: "700", color: GatiMitraMerchant.textPrimary },

  card: {
    backgroundColor: GatiMitraMerchant.cardBg,
    borderRadius: CARD_RADIUS,
    padding: 14,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
    marginBottom: 14,
    ...GatiMitraMerchant.shadowSm,
  },
  label: { fontSize: 13, fontWeight: "600", color: GatiMitraMerchant.textSecondary, marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.4 },

  primaryRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  primaryIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: GatiMitraMerchant.surfaceSubtle,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryTextWrap: { flex: 1 },
  primaryNumber: { fontSize: 15, fontWeight: "600", color: GatiMitraMerchant.textPrimary },
  primaryHint: { fontSize: 12, color: GatiMitraMerchant.textSecondary, marginTop: 2 },

  helperText: { fontSize: 12, color: GatiMitraMerchant.textSecondary, marginBottom: 8 },

  linkRow: { flexDirection: "row", alignItems: "center", gap: 4, marginBottom: 8 },
  linkRowPressed: { opacity: 0.7 },
  linkText: { fontSize: 13, fontWeight: "600", color: GatiMitraMerchant.primary },

  altList: { marginBottom: 8, gap: 6 },
  altRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 6,
  },
  altNumber: { flex: 1, fontSize: 14, color: GatiMitraMerchant.textPrimary },
  iconButton: {
    paddingHorizontal: 4,
    paddingVertical: 4,
    borderRadius: 999,
  },
  iconButtonPressed: { backgroundColor: GatiMitraMerchant.surfaceSubtle },
  emptyText: { fontSize: 12, color: GatiMitraMerchant.textSecondary },

  staffRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  staffRowPressed: { opacity: 0.7 },
  staffLeft: { flexDirection: "row", alignItems: "center", flex: 1, minWidth: 0, gap: 10 },
  staffIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: GatiMitraMerchant.surfaceSubtle,
    alignItems: "center",
    justifyContent: "center",
  },
  staffTextWrap: { flex: 1, minWidth: 0 },
  staffTitle: { fontSize: 14, fontWeight: "600", color: GatiMitraMerchant.textPrimary },
  staffSubtitle: { fontSize: 12, color: GatiMitraMerchant.textSecondary, marginTop: 2 },

  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
  },
  modalCard: {
    width: "100%",
    maxWidth: 380,
    borderRadius: CARD_RADIUS,
    backgroundColor: GatiMitraMerchant.cardBg,
    padding: 20,
    ...GatiMitraMerchant.shadowSm,
  },
  modalTitle: { fontSize: 16, fontWeight: "700", color: GatiMitraMerchant.textPrimary, marginBottom: 4 },
  modalHint: { fontSize: 13, color: GatiMitraMerchant.textSecondary, marginBottom: 16 },
  modalInputRow: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 18,
  },
  modalInputIcon: { marginRight: 8 },
  modalInputInner: { flex: 1, flexDirection: "row", alignItems: "center", gap: 6 },
  modalTextInput: {
    flex: 1,
    fontSize: 15,
    color: GatiMitraMerchant.textPrimary,
  },
  modalActions: { flexDirection: "row", gap: 10 },
  modalBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: BUTTON_RADIUS,
    alignItems: "center",
    justifyContent: "center",
  },
  modalBtnSecondary: {
    backgroundColor: GatiMitraMerchant.surfaceSubtle,
  },
  modalBtnPrimary: {
    backgroundColor: GatiMitraMerchant.primary,
  },
  modalBtnSecondaryText: {
    fontSize: 14,
    fontWeight: "600",
    color: GatiMitraMerchant.textPrimary,
  },
  modalBtnPrimaryText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#fff",
  },
  modalBtnPressed: { opacity: 0.8 },
});

