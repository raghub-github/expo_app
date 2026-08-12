/**
 * Addon Library — reusable modifier groups (addon groups) for the store.
 * Create, edit, delete groups; view "Used in X items"; add options inside each group.
 */

import { useCallback, useEffect, useState } from "react";
import { AppText as Text } from "@/components/AppText";
import { View, ScrollView, StyleSheet, TouchableOpacity, RefreshControl, ActivityIndicator, TextInput, Alert } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import {
  GatiMitraMerchant,
  H_PADDING,
  TAB_BAR_SCROLL_CONTENT_PADDING,
} from "@/constants/theme";
import { useAuth } from "@/context/AuthContext";
import { useSelectedStore } from "@/context/SelectedStoreContext";
import {
  fetchModifierGroups,
  createModifierGroup,
  deleteModifierGroup,
  type ModifierGroupRow,
} from "@/services/menuApi";

export default function AddonLibraryScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { token } = useAuth();
  const { selectedStore } = useSelectedStore();
  const storeId = selectedStore?.store_id ?? null;

  const [groups, setGroups] = useState<ModifierGroupRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDescription, setNewDescription] = useState("");

  const load = useCallback(async () => {
    if (!token || !storeId) return;
    try {
      const res = await fetchModifierGroups(storeId, token);
      setGroups(res.modifierGroups ?? []);
    } catch {
      setGroups([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token, storeId]);

  useEffect(() => {
    if (token && storeId) load();
    else setLoading(false);
  }, [token, storeId, load]);

  const filteredGroups = search.trim()
    ? groups.filter(
        (g) =>
          g.title.toLowerCase().includes(search.trim().toLowerCase()) ||
          (g.description ?? "").toLowerCase().includes(search.trim().toLowerCase())
      )
    : groups;

  const handleCreate = async () => {
    const title = newTitle.trim();
    if (!title || !storeId || !token) return;
    setCreating(true);
    try {
      await createModifierGroup(storeId, token, {
        title,
        description: newDescription.trim() || null,
        is_required: false,
        min_selection: 0,
        max_selection: 1,
      });
      setCreateModalVisible(false);
      setNewTitle("");
      setNewDescription("");
      await load();
      const res = await fetchModifierGroups(storeId, token);
      const created = res.modifierGroups?.find((g) => g.title === title);
      if (created) router.push({ pathname: "/menu/addon-library/[id]", params: { id: String(created.id) } } as any);
    } catch (e) {
      Alert.alert("Error", e instanceof Error ? e.message : "Could not create addon group.");
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = (g: ModifierGroupRow) => {
    if (!storeId || !token) return;
    Alert.alert(
      "Delete addon group?",
      `"${g.title}" will be removed from all items that use it. This cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteModifierGroup(storeId, g.id, token);
              await load();
            } catch (e) {
              Alert.alert("Error", e instanceof Error ? e.message : "Could not delete.");
            }
          },
        },
      ]
    );
  };

  const scrollBottom = TAB_BAR_SCROLL_CONTENT_PADDING + 16;

  if (!storeId || !token) {
    return (
      <View style={[styles.container, styles.centered]}>
        <Text style={styles.emptyText}>Select a store and sign in.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} hitSlop={8}>
          <Ionicons name="chevron-back" size={20} color={GatiMitraMerchant.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.title}>Addon Library</Text>
        <TouchableOpacity onPress={() => setCreateModalVisible(true)} style={styles.addBtn}>
          <Ionicons name="add" size={24} color={GatiMitraMerchant.primary} />
        </TouchableOpacity>
      </View>

      <View style={styles.searchWrap}>
        <Ionicons name="search-outline" size={20} color={GatiMitraMerchant.textTertiary} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search addon groups..."
          placeholderTextColor={GatiMitraMerchant.textTertiary}
          value={search}
          onChangeText={setSearch}
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch("")} hitSlop={8}>
            <Ionicons name="close-circle" size={20} color={GatiMitraMerchant.textTertiary} />
          </TouchableOpacity>
        )}
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: scrollBottom }]}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={GatiMitraMerchant.primary} />
        }
      >
        {loading && groups.length === 0 ? (
          <ActivityIndicator size="large" color={GatiMitraMerchant.primary} style={styles.loader} />
        ) : filteredGroups.length === 0 ? (
          <View style={styles.emptyCard}>
            <Ionicons name="layers-outline" size={48} color={GatiMitraMerchant.textTertiary} />
            <Text style={styles.emptyText}>
              {search.trim() ? "No addon groups match your search." : "No addon groups yet. Create one to reuse across items."}
            </Text>
            {!search.trim() && (
              <TouchableOpacity style={styles.emptyCta} onPress={() => setCreateModalVisible(true)}>
                <Text style={styles.emptyCtaText}>Create addon group</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          <View style={styles.list}>
            {filteredGroups.map((g) => (
              <TouchableOpacity
                key={g.id}
                style={styles.card}
                onPress={() => router.push({ pathname: "/menu/addon-library/[id]", params: { id: String(g.id) } } as any)}
                onLongPress={() => handleDelete(g)}
                activeOpacity={0.7}
              >
                <View style={styles.cardMain}>
                  <Text style={styles.cardTitle} numberOfLines={1}>{g.title}</Text>
                  {g.description ? (
                    <Text style={styles.cardDesc} numberOfLines={2}>{g.description}</Text>
                  ) : null}
                  <View style={styles.cardMeta}>
                    <Text style={styles.cardMetaText}>{g.options_count} option{g.options_count !== 1 ? "s" : ""}</Text>
                    <Text style={styles.cardMetaText}> · Used in {g.used_in_items_count} item{g.used_in_items_count !== 1 ? "s" : ""}</Text>
                  </View>
                </View>
                <Ionicons name="chevron-forward" size={22} color={GatiMitraMerchant.textTertiary} />
              </TouchableOpacity>
            ))}
          </View>
        )}
      </ScrollView>

      {createModalVisible && (
        <View style={styles.modalOverlay}>
          <TouchableOpacity style={StyleSheet.absoluteFill} onPress={() => setCreateModalVisible(false)} activeOpacity={1} />
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>New addon group</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Group title (e.g. Extra cheese)"
              placeholderTextColor={GatiMitraMerchant.textTertiary}
              value={newTitle}
              onChangeText={setNewTitle}
            />
            <TextInput
              style={[styles.modalInput, styles.modalInputArea]}
              placeholder="Description (optional)"
              placeholderTextColor={GatiMitraMerchant.textTertiary}
              value={newDescription}
              onChangeText={setNewDescription}
              multiline
            />
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancel} onPress={() => setCreateModalVisible(false)}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalCreate, !newTitle.trim() && styles.modalCreateDisabled]}
                onPress={handleCreate}
                disabled={!newTitle.trim() || creating}
              >
                {creating ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.modalCreateText}>Create</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}
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
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: GatiMitraMerchant.border,
    backgroundColor: GatiMitraMerchant.cardBg,
  },
  backBtn: { marginRight: 12 },
  title: { flex: 1, fontSize: 18, fontWeight: "700", color: GatiMitraMerchant.textPrimary },
  addBtn: { padding: 4 },
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: H_PADDING,
    marginTop: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: GatiMitraMerchant.surfaceSubtle,
    borderRadius: 12,
    gap: 8,
  },
  searchInput: { flex: 1, fontSize: 15, color: GatiMitraMerchant.textPrimary, paddingVertical: 0 },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: H_PADDING, paddingTop: 16 },
  loader: { marginTop: 40 },
  emptyCard: {
    alignItems: "center",
    paddingVertical: 40,
    paddingHorizontal: 24,
  },
  emptyText: { fontSize: 14, color: GatiMitraMerchant.textSecondary, textAlign: "center", marginTop: 12 },
  emptyCta: { marginTop: 20, paddingVertical: 12, paddingHorizontal: 20, backgroundColor: GatiMitraMerchant.primary, borderRadius: 12 },
  emptyCtaText: { fontSize: 15, fontWeight: "700", color: "#fff" },
  list: { gap: 12 },
  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: GatiMitraMerchant.cardBg,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
    ...GatiMitraMerchant.shadowSm,
  },
  cardMain: { flex: 1, minWidth: 0 },
  cardTitle: { fontSize: 16, fontWeight: "700", color: GatiMitraMerchant.textPrimary },
  cardDesc: { fontSize: 13, color: GatiMitraMerchant.textSecondary, marginTop: 4 },
  cardMeta: { flexDirection: "row", marginTop: 6 },
  cardMetaText: { fontSize: 12, color: GatiMitraMerchant.textTertiary },
  modalOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "center",
    padding: 24,
  },
  modalCard: {
    backgroundColor: GatiMitraMerchant.cardBg,
    borderRadius: 16,
    padding: 20,
    ...GatiMitraMerchant.shadowSm,
  },
  modalTitle: { fontSize: 18, fontWeight: "800", color: GatiMitraMerchant.textPrimary, marginBottom: 16 },
  modalInput: {
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: GatiMitraMerchant.textPrimary,
    marginBottom: 12,
  },
  modalInputArea: { minHeight: 60, textAlignVertical: "top" },
  modalActions: { flexDirection: "row", gap: 12, marginTop: 8 },
  modalCancel: { flex: 1, paddingVertical: 12, alignItems: "center" },
  modalCancelText: { fontSize: 15, fontWeight: "600", color: GatiMitraMerchant.textSecondary },
  modalCreate: { flex: 1, paddingVertical: 12, backgroundColor: GatiMitraMerchant.primary, borderRadius: 10, alignItems: "center" },
  modalCreateDisabled: { opacity: 0.5 },
  modalCreateText: { fontSize: 15, fontWeight: "700", color: "#fff" },
});
