/**
 * Category availability — set day/time windows for when a category is available.
 */

import { useCallback, useEffect, useState } from "react";
import { AppText as Text } from "@/components/AppText";
import { View, ScrollView, StyleSheet, TouchableOpacity, TextInput, RefreshControl, ActivityIndicator, Alert, Modal } from "react-native";
import { useRouter, useLocalSearchParams, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { GatiMitraMerchant, H_PADDING } from "@/constants/theme";
import { useAuth } from "@/context/AuthContext";
import { useSelectedStore } from "@/context/SelectedStoreContext";
import {
  fetchCategoryAvailability,
  addCategoryAvailability,
  deleteCategoryAvailability,
  type AvailabilityWindow,
} from "@/services/menuApi";

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function CategoryAvailabilityScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ categoryId: string; categoryName?: string }>();
  const categoryId = params.categoryId != null ? parseInt(params.categoryId, 10) : null;
  const categoryName = params.categoryName ?? "Category";

  const { token } = useAuth();
  const { selectedStore } = useSelectedStore();
  const storeId = selectedStore?.store_id ?? null;

  const [windows, setWindows] = useState<AvailabilityWindow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [dayOfWeek, setDayOfWeek] = useState(1);
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("17:00");
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);

  const load = useCallback(async () => {
    if (!token || !storeId || categoryId == null || Number.isNaN(categoryId)) return;
    try {
      const res = await fetchCategoryAvailability(storeId, categoryId, token);
      setWindows(res.windows ?? []);
    } catch {
      setWindows([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token, storeId, categoryId]);

  useEffect(() => {
    if (token && storeId && categoryId != null && !Number.isNaN(categoryId)) load();
    else setLoading(false);
  }, [token, storeId, categoryId, load]);

  useFocusEffect(
    useCallback(() => {
      if (token && storeId && categoryId != null && !Number.isNaN(categoryId)) load();
    }, [token, storeId, categoryId, load])
  );

  const onRefresh = () => {
    setRefreshing(true);
    load();
  };

  const handleAdd = async () => {
    if (!token || !storeId || categoryId == null) return;
    setSaving(true);
    try {
      await addCategoryAvailability(storeId, categoryId, token, {
        day_of_week: dayOfWeek,
        start_time: startTime,
        end_time: endTime,
      });
      await load();
      setModalOpen(false);
      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 2000);
    } catch (e) {
      Alert.alert("Error", e instanceof Error ? e.message : "Could not add window");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (w: AvailabilityWindow) => {
    Alert.alert(
      "Remove window",
      `${DAY_NAMES[w.day_of_week]} ${w.start_time}–${w.end_time}`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: async () => {
            if (!token || !storeId) return;
            try {
              await deleteCategoryAvailability(storeId, w.id, token);
              await load();
            } catch (e) {
              Alert.alert("Error", e instanceof Error ? e.message : "Could not remove");
            }
          },
        },
      ]
    );
  };

  if (!storeId || !token || categoryId == null || Number.isNaN(categoryId)) {
    return (
      <View style={[styles.container, styles.centered]}>
        <Text style={styles.emptyText}>Invalid category.</Text>
        <TouchableOpacity onPress={() => router.back()} style={styles.backLink}>
          <Text style={styles.backLinkText}>Go back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} hitSlop={8}>
          <Ionicons name="arrow-back" size={24} color={GatiMitraMerchant.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.title} numberOfLines={1}>{categoryName} — Hours</Text>
        <TouchableOpacity onPress={() => setModalOpen(true)} style={styles.addBtn}>
          <Ionicons name="add" size={24} color={GatiMitraMerchant.primary} />
        </TouchableOpacity>
      </View>
      {justSaved ? (
        <View style={styles.savedBar}>
          <Ionicons name="checkmark-circle" size={18} color={GatiMitraMerchant.success} />
          <Text style={styles.savedBarText}>Saved. Times are stored and will apply to this category.</Text>
        </View>
      ) : null}

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={GatiMitraMerchant.primary} />
        }
      >
        {loading && windows.length === 0 ? (
          <ActivityIndicator size="large" color={GatiMitraMerchant.primary} style={styles.loader} />
        ) : windows.length === 0 ? (
          <Text style={styles.emptyText}>No availability set. Tap + to add when this category is available.</Text>
        ) : (
          windows.map((w) => (
            <View key={w.id} style={styles.card}>
              <Text style={styles.cardText}>
                {DAY_NAMES[w.day_of_week]} {w.start_time} – {w.end_time}
              </Text>
              <TouchableOpacity onPress={() => handleDelete(w)}>
                <Ionicons name="trash-outline" size={22} color={GatiMitraMerchant.error} />
              </TouchableOpacity>
            </View>
          ))
        )}
      </ScrollView>

      <Modal visible={modalOpen} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Add availability window</Text>
            <Text style={styles.label}>Day</Text>
            <View style={styles.dayRow}>
              {DAY_NAMES.map((d, i) => (
                <TouchableOpacity
                  key={d}
                  onPress={() => setDayOfWeek(i)}
                  style={[styles.dayChip, dayOfWeek === i && styles.dayChipActive]}
                >
                  <Text style={[styles.dayChipText, dayOfWeek === i && styles.dayChipTextActive]}>{d}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.label}>Start (HH:MM)</Text>
            <TextInput
              style={styles.input}
              value={startTime}
              onChangeText={setStartTime}
              placeholder="09:00"
              placeholderTextColor={GatiMitraMerchant.textTertiary}
            />
            <Text style={styles.label}>End (HH:MM)</Text>
            <TextInput
              style={styles.input}
              value={endTime}
              onChangeText={setEndTime}
              placeholder="17:00"
              placeholderTextColor={GatiMitraMerchant.textTertiary}
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity onPress={() => setModalOpen(false)} style={styles.modalBtnCancel}>
                <Text style={styles.modalBtnCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleAdd}
                disabled={saving}
                style={[styles.modalBtnSave, saving && styles.modalBtnDisabled]}
              >
                {saving ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.modalBtnSaveText}>Add</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: GatiMitraMerchant.background },
  centered: { justifyContent: "center", alignItems: "center" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: H_PADDING,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: GatiMitraMerchant.border,
  },
  backBtn: { marginRight: 12 },
  title: { flex: 1, fontSize: 18, fontWeight: "700", color: GatiMitraMerchant.textPrimary },
  addBtn: { padding: 4 },
  scroll: { flex: 1 },
  scrollContent: { padding: H_PADDING },
  loader: { marginTop: 24 },
  emptyText: { fontSize: 14, color: GatiMitraMerchant.textSecondary, textAlign: "center", paddingVertical: 24 },
  card: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: GatiMitraMerchant.cardBg,
    padding: 14,
    borderRadius: 12,
    marginBottom: 12,
  },
  cardText: { fontSize: 15, color: GatiMitraMerchant.textPrimary },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", padding: 24 },
  modalContent: { backgroundColor: GatiMitraMerchant.cardBg, borderRadius: 16, padding: 24 },
  modalTitle: { fontSize: 18, fontWeight: "700", color: GatiMitraMerchant.textPrimary, marginBottom: 16 },
  label: { fontSize: 14, color: GatiMitraMerchant.textSecondary, marginBottom: 8 },
  dayRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 16 },
  dayChip: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 16, backgroundColor: GatiMitraMerchant.surfaceWarm },
  dayChipActive: { backgroundColor: GatiMitraMerchant.primary },
  dayChipText: { fontSize: 13, color: GatiMitraMerchant.textSecondary },
  dayChipTextActive: { color: "#fff" },
  input: {
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: GatiMitraMerchant.textPrimary,
    marginBottom: 16,
  },
  modalButtons: { flexDirection: "row", gap: 12 },
  modalBtnCancel: { flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: "center", backgroundColor: GatiMitraMerchant.surfaceWarm },
  modalBtnCancelText: { fontSize: 15, fontWeight: "600", color: GatiMitraMerchant.textSecondary },
  modalBtnSave: { flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: "center", backgroundColor: GatiMitraMerchant.primary },
  modalBtnDisabled: { opacity: 0.5 },
  modalBtnSaveText: { fontSize: 15, fontWeight: "600", color: "#fff" },
  backLink: { marginTop: 12 },
  backLinkText: { fontSize: 14, color: GatiMitraMerchant.primary, fontWeight: "600" },
  savedBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: H_PADDING,
    paddingVertical: 10,
    backgroundColor: GatiMitraMerchant.primaryLight,
    borderBottomWidth: 1,
    borderBottomColor: GatiMitraMerchant.border,
  },
  savedBarText: { fontSize: 13, color: GatiMitraMerchant.navy, fontWeight: "600" },
});
