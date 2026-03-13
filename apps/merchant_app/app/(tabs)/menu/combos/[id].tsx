/**
 * Edit combo — name, description, price, components list.
 * Components can be added either by menu_item_id or by picking from a list of existing approved items.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { GatiMitraMerchant, H_PADDING } from "@/constants/theme";
import { useAuth } from "@/context/AuthContext";
import { useSelectedStore } from "@/context/SelectedStoreContext";
import { useMenuItems } from "@/hooks/useMenuQueries";
import {
  fetchCombo,
  updateCombo,
  deleteCombo,
  addComboComponent,
  deleteComboComponent,
  type ComboDetail,
} from "@/services/menuApi";

export default function ComboEditScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string }>();
  const id = params.id != null ? parseInt(params.id, 10) : null;
  const isNew = id == null || Number.isNaN(id);

  const { token } = useAuth();
  const { selectedStore } = useSelectedStore();
  const storeId = selectedStore?.store_id ?? null;

  const [combo, setCombo] = useState<ComboDetail | null>(null);
  const [loading, setLoading] = useState(!isNew);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [saving, setSaving] = useState(false);
  const [addItemId, setAddItemId] = useState("");
  const [adding, setAdding] = useState(false);
  const [addingItemId, setAddingItemId] = useState<number | null>(null);

  const {
    data: itemsData,
    isLoading: itemsLoading,
  } = useMenuItems(storeId, token, {
    approvalStatus: "APPROVED",
    inStock: true,
    limit: 200,
  });

  const availableItems = (itemsData?.items ?? []) as any[];
  const itemById = useMemo(() => {
    const map = new Map<number, any>();
    for (const it of availableItems) {
      if (typeof it.id === "number") map.set(it.id, it);
    }
    return map;
  }, [availableItems]);

  const load = useCallback(async () => {
    if (!token || !storeId || id == null || Number.isNaN(id)) return;
    try {
      const data = await fetchCombo(storeId, id, token);
      setCombo(data ?? null);
      if (data) {
        setName(data.combo_name);
        setDescription(data.description ?? "");
        setPrice(data.combo_price ?? "");
      }
    } catch {
      setCombo(null);
    } finally {
      setLoading(false);
    }
  }, [token, storeId, id]);

  useEffect(() => {
    if (isNew) setLoading(false);
    else load();
  }, [isNew, load]);

  const handleSave = async () => {
    if (!token || !storeId || id == null || Number.isNaN(id)) return;
    const p = parseFloat(price);
    if (Number.isNaN(p) || p < 0) return;
    setSaving(true);
    try {
      await updateCombo(storeId, id, token, {
        combo_name: name.trim(),
        description: description.trim() || null,
        combo_price: p,
      });
      setCombo((prev) => prev ? { ...prev, combo_name: name.trim(), description: description.trim() || null, combo_price: price } : null);
    } catch (e) {
      Alert.alert("Error", e instanceof Error ? e.message : "Update failed");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = () => {
    Alert.alert("Delete combo", "Remove this combo?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          if (!token || !storeId || id == null) return;
          try {
            await deleteCombo(storeId, id, token);
            router.back();
          } catch (e) {
            Alert.alert("Error", e instanceof Error ? e.message : "Delete failed");
          }
        },
      },
    ]);
  };

  const handleAddComponent = async () => {
    const itemId = parseInt(addItemId, 10);
    if (!token || !storeId || id == null || Number.isNaN(id) || Number.isNaN(itemId) || itemId < 1) return;
    setAdding(true);
    try {
    await addComboComponent(storeId, id, token, { menu_item_id: itemId, quantity: 1 });
    await load();
    setAddItemId("");
  } catch (e) {
    Alert.alert("Error", e instanceof Error ? e.message : "Add item failed. Use a valid menu item ID.");
  } finally {
    setAdding(false);
  }
};

  const handleAddComponentFromList = async (menuItemId: number) => {
    if (!token || !storeId || id == null || Number.isNaN(id)) return;
    setAddingItemId(menuItemId);
    try {
      await addComboComponent(storeId, id, token, { menu_item_id: menuItemId, quantity: 1 });
      await load();
    } catch (e) {
      Alert.alert("Error", e instanceof Error ? e.message : "Add item failed.");
    } finally {
      setAddingItemId(null);
    }
  };

  const handleRemoveComponent = async (componentId: number) => {
    if (!token || !storeId) return;
    try {
      await deleteComboComponent(storeId, componentId, token);
      await load();
    } catch (e) {
      Alert.alert("Error", e instanceof Error ? e.message : "Remove failed");
    }
  };

  if (!storeId || !token) {
    return (
      <View style={[styles.container, styles.centered]}>
        <Text style={styles.emptyText}>Select a store and sign in.</Text>
      </View>
    );
  }

  if (isNew) {
    router.replace("/menu/combos/new" as any);
    return null;
  }

  if (loading && !combo) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color={GatiMitraMerchant.primary} />
      </View>
    );
  }

  if (!combo) {
    return (
      <View style={[styles.container, styles.centered]}>
        <Text style={styles.emptyText}>Combo not found.</Text>
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
        <Text style={styles.title}>Edit combo</Text>
        <TouchableOpacity onPress={handleDelete} style={styles.deleteBtn}>
          <Ionicons name="trash-outline" size={22} color={GatiMitraMerchant.error} />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        <TextInput
          style={styles.input}
          placeholder="Combo name *"
          placeholderTextColor={GatiMitraMerchant.textTertiary}
          value={name}
          onChangeText={setName}
        />
        <TextInput
          style={[styles.input, styles.textArea]}
          placeholder="Description"
          placeholderTextColor={GatiMitraMerchant.textTertiary}
          value={description}
          onChangeText={setDescription}
          multiline
        />
        <TextInput
          style={styles.input}
          placeholder="Price (₹) *"
          placeholderTextColor={GatiMitraMerchant.textTertiary}
          value={price}
          onChangeText={setPrice}
          keyboardType="decimal-pad"
        />
        <TouchableOpacity
          onPress={handleSave}
          disabled={saving}
          style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
        >
          {saving ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.saveBtnText}>Save</Text>}
        </TouchableOpacity>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Items in combo</Text>
          {combo.components?.length ? (
            combo.components.map((comp) => (
              <View key={comp.id} style={styles.componentRow}>
                <View style={{ flex: 1, marginRight: 8 }}>
                  <Text style={styles.componentText}>
                    {itemById.get(comp.menu_item_id)?.item_name ?? "Menu item"} (ID {comp.menu_item_id})
                  </Text>
                  <Text style={styles.componentMeta}>
                    Qty {comp.quantity}
                    {itemById.get(comp.menu_item_id)?.selling_price
                      ? ` · ₹${Number(itemById.get(comp.menu_item_id).selling_price).toFixed(0)}`
                      : ""}
                  </Text>
                </View>
                <TouchableOpacity onPress={() => handleRemoveComponent(comp.id)}>
                  <Ionicons name="close-circle" size={22} color={GatiMitraMerchant.error} />
                </TouchableOpacity>
              </View>
            ))
          ) : (
            <Text style={styles.hint}>No items yet. Add by menu item ID below.</Text>
          )}
          <View style={styles.addRow}>
            <TextInput
              style={[styles.input, styles.addInput]}
              placeholder="Menu item ID (number)"
              placeholderTextColor={GatiMitraMerchant.textTertiary}
              value={addItemId}
              onChangeText={setAddItemId}
              keyboardType="number-pad"
            />
            <TouchableOpacity
              onPress={handleAddComponent}
              disabled={adding || !addItemId.trim()}
              style={[styles.addComponentBtn, (adding || !addItemId.trim()) && styles.addBtnDisabled]}
            >
              {adding ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.addComponentBtnText}>Add</Text>}
            </TouchableOpacity>
          </View>

          <Text style={[styles.sectionTitle, { marginTop: 24 }]}>Add from existing items</Text>
          {itemsLoading ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator size="small" color={GatiMitraMerchant.primary} />
              <Text style={styles.loadingText}>Loading items…</Text>
            </View>
          ) : availableItems.length === 0 ? (
            <Text style={styles.hint}>
              No approved items found. Create and approve menu items first, then add them to this combo.
            </Text>
          ) : (
            <View style={styles.availableList}>
              {availableItems.map((item: any) => (
                <TouchableOpacity
                  key={item.id}
                  onPress={() => handleAddComponentFromList(item.id)}
                  style={styles.availableItemRow}
                  activeOpacity={0.8}
                  disabled={addingItemId === item.id}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.availableItemName} numberOfLines={1}>
                      {item.item_name}
                    </Text>
                    <Text style={styles.availableItemMeta} numberOfLines={1}>
                      ID {item.id}
                      {item.category_id != null ? " · Category ID " + item.category_id : ""}
                      {item.selling_price ? " · ₹" + Number(item.selling_price).toFixed(0) : ""}
                    </Text>
                  </View>
                  <View style={styles.availableItemAddBtn}>
                    {addingItemId === item.id ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Text style={styles.availableItemAddText}>Add</Text>
                    )}
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>
      </ScrollView>
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
  deleteBtn: { padding: 4 },
  scroll: { flex: 1 },
  scrollContent: { padding: H_PADDING },
  input: {
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: GatiMitraMerchant.textPrimary,
    marginBottom: 12,
  },
  textArea: { minHeight: 60, textAlignVertical: "top" },
  saveBtn: {
    backgroundColor: GatiMitraMerchant.primary,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: "center",
    marginBottom: 24,
  },
  saveBtnDisabled: { opacity: 0.5 },
  saveBtnText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  section: { marginBottom: 24 },
  sectionTitle: { fontSize: 16, fontWeight: "700", color: GatiMitraMerchant.textPrimary, marginBottom: 12 },
  componentRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: GatiMitraMerchant.border,
  },
  componentText: { fontSize: 14, color: GatiMitraMerchant.textPrimary },
  componentMeta: { fontSize: 12, color: GatiMitraMerchant.textTertiary, marginTop: 2 },
  hint: { fontSize: 13, color: GatiMitraMerchant.textTertiary, marginBottom: 12 },
  addRow: { flexDirection: "row", gap: 8, alignItems: "center" },
  addInput: { flex: 1, marginBottom: 0 },
  addComponentBtn: {
    backgroundColor: GatiMitraMerchant.primary,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 10,
  },
  addBtnDisabled: { opacity: 0.5 },
  addComponentBtnText: { color: "#fff", fontWeight: "600" },
  emptyText: { fontSize: 14, color: GatiMitraMerchant.textSecondary },
  backLink: { marginTop: 12 },
  backLinkText: { fontSize: 14, color: GatiMitraMerchant.primary, fontWeight: "600" },
  loadingRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 8 },
  loadingText: { fontSize: 13, color: GatiMitraMerchant.textSecondary },
  availableList: { marginTop: 8, borderRadius: 10, borderWidth: 1, borderColor: GatiMitraMerchant.border },
  availableItemRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: GatiMitraMerchant.border,
  },
  availableItemName: { fontSize: 14, fontWeight: "600", color: GatiMitraMerchant.textPrimary },
  availableItemMeta: { fontSize: 12, color: GatiMitraMerchant.textTertiary, marginTop: 2 },
  availableItemAddBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: GatiMitraMerchant.primary,
  },
  availableItemAddText: { color: "#fff", fontSize: 12, fontWeight: "600" },
});
