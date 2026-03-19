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
  Image,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { GatiMitraMerchant, H_PADDING, CARD_RADIUS } from "@/constants/theme";
import { useAuth } from "@/context/AuthContext";
import { useSelectedStore } from "@/context/SelectedStoreContext";
import { useMenuItems } from "@/hooks/useMenuQueries";
import {
  fetchCombo,
  updateCombo,
  deleteCombo,
  addComboComponent,
  deleteComboComponent,
  fetchMenuItem,
  type ComboDetail,
} from "@/services/menuApi";
import { resolveImageUrl } from "@/services/outletApi";

export default function ComboEditScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string; mode?: string }>();
  const id = params.id != null ? parseInt(params.id, 10) : null;
  const isNew = id == null || Number.isNaN(id);
  const readOnly = params.mode === "view";

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
  const [extraItemsById, setExtraItemsById] = useState<Map<number, any>>(new Map());

  const {
    data: itemsData,
    isLoading: itemsLoading,
  } = useMenuItems(storeId, token, {
    approvalStatus: "APPROVED",
    limit: 200,
  });

  const availableItems = (itemsData?.items ?? []) as any[];
  const itemById = useMemo(() => {
    const map = new Map<number, any>();
    for (const it of availableItems) {
      if (typeof it.id === "number") map.set(it.id, it);
    }
     // merge in any lazily-fetched items that aren't in the main list
    for (const [id, value] of extraItemsById.entries()) {
      if (!map.has(id)) map.set(id, value);
    }
    return map;
  }, [availableItems, extraItemsById]);

  const existingItemIds = useMemo(() => {
    return new Set<number>(combo?.components?.map((c) => c.menu_item_id) ?? []);
  }, [combo?.components]);

  // Lazily fetch item details for combo components that are not present in availableItems
  useEffect(() => {
    if (!token || !storeId || !combo?.components?.length) return;
    const missingIds = combo.components
      .map((c) => c.menu_item_id)
      .filter((id) => !itemById.has(id) && !extraItemsById.has(id));
    if (missingIds.length === 0) return;

    let cancelled = false;
    (async () => {
      const entries: [number, any][] = [];
      for (const mid of missingIds) {
        try {
          const data = await fetchMenuItem(storeId, mid, token);
          if (data) entries.push([mid, data]);
        } catch {
          // ignore individual failures
        }
      }
      if (cancelled || entries.length === 0) return;
      setExtraItemsById((prev) => {
        const next = new Map(prev);
        for (const [id, value] of entries) {
          if (!next.has(id)) next.set(id, value);
        }
        return next;
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [combo?.components, itemById, extraItemsById, storeId, token]);

  // Auto-calculate combo price as sum of component item prices × quantity
  useEffect(() => {
    if (!combo?.components?.length) {
      setPrice("");
      return;
    }
    let total = 0;
    for (const comp of combo.components) {
      const item = itemById.get(comp.menu_item_id);
      const priceNum = item ? Number(item.selling_price) || 0 : 0;
      const qty = comp.quantity ?? 1;
      total += priceNum * qty;
    }
    setPrice(total > 0 ? total.toFixed(2) : "");
  }, [combo?.components, itemById]);

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
    if (readOnly) return;
    if (!token || !storeId || id == null || Number.isNaN(id)) return;
    setSaving(true);
    try {
      await updateCombo(storeId, id, token, {
        combo_name: name.trim(),
        description: description.trim() || null,
        // combo_price is derived from components; do not allow manual override here
      });
      setCombo((prev) => prev ? { ...prev, combo_name: name.trim(), description: description.trim() || null, combo_price: price } : null);
    } catch (e) {
      Alert.alert("Error", e instanceof Error ? e.message : "Update failed");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = () => {
    if (readOnly) return;
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
    if (existingItemIds.has(itemId)) {
      Alert.alert("Already added", "This item is already part of the combo.");
      return;
    }
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
    const menuItemIdNum = Number(menuItemId);
    if (!Number.isFinite(menuItemIdNum) || menuItemIdNum < 1) return;
    if (existingItemIds.has(menuItemIdNum)) {
      Alert.alert("Already added", "This item is already part of the combo.");
      return;
    }
    setAddingItemId(menuItemIdNum);
    try {
      await addComboComponent(storeId, id, token, { menu_item_id: menuItemIdNum, quantity: 1 });
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
        <Text style={styles.title}>{readOnly ? "Combo details" : "Edit combo"}</Text>
        {readOnly ? (
          <View style={styles.headerActions}>
            <TouchableOpacity
              onPress={() =>
                router.push({ pathname: "/menu/combos/[id]", params: { id: String(id) } } as any)
              }
              style={styles.editBtn}
              hitSlop={8}
            >
              <Ionicons
                name="pencil-outline"
                size={20}
                color={GatiMitraMerchant.primary}
              />
              <Text style={styles.editBtnText}>Edit</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity onPress={handleDelete} style={styles.deleteBtn}>
            <Ionicons name="trash-outline" size={22} color={GatiMitraMerchant.error} />
          </TouchableOpacity>
        )}
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        <TextInput
          style={styles.input}
          placeholder="Combo name *"
          placeholderTextColor={GatiMitraMerchant.textTertiary}
          value={name}
          onChangeText={setName}
          editable={!readOnly}
        />
        <TextInput
          style={[styles.input, styles.textArea]}
          placeholder="Description"
          placeholderTextColor={GatiMitraMerchant.textTertiary}
          value={description}
          onChangeText={setDescription}
          editable={!readOnly}
          multiline
        />
        <TextInput
          style={[styles.input, styles.readOnlyInput]}
          placeholder="Price (₹) *"
          placeholderTextColor={GatiMitraMerchant.textTertiary}
          value={price}
          editable={false}
          keyboardType="decimal-pad"
        />
        {!readOnly && (
          <TouchableOpacity
            onPress={handleSave}
            disabled={saving}
            style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
          >
            {saving ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.saveBtnText}>Save</Text>}
          </TouchableOpacity>
        )}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Items in combo</Text>
          {combo.components?.length ? (
            combo.components.map((comp) => (
              <View key={comp.id} style={styles.componentRow}>
                <View style={styles.componentMain}>
                  <View style={styles.componentImageWrap}>
                    {itemById.get(comp.menu_item_id)?.item_image_url ? (
                      <Image
                        source={{
                          uri:
                            resolveImageUrl(itemById.get(comp.menu_item_id).item_image_url) ??
                            itemById.get(comp.menu_item_id).item_image_url,
                        }}
                        style={styles.componentImage}
                        resizeMode="cover"
                      />
                    ) : (
                      <View style={styles.componentImagePlaceholder}>
                        <Ionicons
                          name="restaurant-outline"
                          size={20}
                          color={GatiMitraMerchant.primary}
                        />
                      </View>
                    )}
                  </View>
                  <View style={styles.componentBody}>
                    <Text style={styles.componentText} numberOfLines={1}>
                      {itemById.get(comp.menu_item_id)?.item_name ?? `Menu item #${comp.menu_item_id}`}
                    </Text>
                    <Text style={styles.componentMeta} numberOfLines={1}>
                      ID {comp.menu_item_id} · Qty {comp.quantity}
                      {itemById.get(comp.menu_item_id)?.selling_price
                        ? ` · ₹${Number(itemById.get(comp.menu_item_id).selling_price).toFixed(0)}`
                        : ""}
                    </Text>
                  </View>
                </View>
                {!readOnly && (
                  <TouchableOpacity onPress={() => handleRemoveComponent(comp.id)}>
                    <Ionicons name="close-circle" size={22} color={GatiMitraMerchant.error} />
                  </TouchableOpacity>
                )}
              </View>
            ))
          ) : (
            <Text style={styles.hint}>No items yet. Add by menu item ID below.</Text>
          )}
          {!readOnly && (
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
          )}

          {!readOnly && (
            <>
              <Text style={[styles.sectionTitle, { marginTop: 24 }]}>
                Add from existing items
              </Text>
              {itemsLoading ? (
                <View style={styles.loadingRow}>
                  <ActivityIndicator
                    size="small"
                    color={GatiMitraMerchant.primary}
                  />
                  <Text style={styles.loadingText}>Loading items…</Text>
                </View>
              ) : availableItems.length === 0 ? (
                <Text style={styles.hint}>
                  No approved items found. Create and approve menu items first,
                  then add them to this combo.
                </Text>
              ) : (
                <View style={styles.availableList}>
                  {availableItems.map((item: any) => {
                    const alreadyInCombo = existingItemIds.has(item.id);
                    const imageUri =
                      item.item_image_url &&
                      (resolveImageUrl(item.item_image_url) ??
                        item.item_image_url);
                    return (
                      <View key={item.id} style={styles.availableItemRow}>
                        <View style={styles.availableItemImageWrap}>
                          {imageUri ? (
                            <Image
                              source={{ uri: imageUri }}
                              style={styles.availableItemImage}
                              resizeMode="cover"
                            />
                          ) : (
                            <View style={styles.availableItemImagePlaceholder}>
                              <Ionicons
                                name="restaurant-outline"
                                size={18}
                                color={GatiMitraMerchant.primary}
                              />
                            </View>
                          )}
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text
                            style={styles.availableItemName}
                            numberOfLines={1}
                          >
                            {item.item_name}
                          </Text>
                          <Text
                            style={styles.availableItemMeta}
                            numberOfLines={1}
                          >
                            ID {item.id}
                            {item.category_id != null
                              ? " · Category ID " + item.category_id
                              : ""}
                            {item.selling_price
                              ? " · ₹" +
                                Number(item.selling_price).toFixed(0)
                              : ""}
                          </Text>
                        </View>
                        <TouchableOpacity
                          onPress={() => handleAddComponentFromList(item.id)}
                          style={[
                            styles.availableItemAddBtn,
                            (addingItemId === item.id || alreadyInCombo) &&
                              styles.availableItemAddBtnDisabled,
                          ]}
                          activeOpacity={0.8}
                          disabled={addingItemId === item.id || alreadyInCombo}
                        >
                          {addingItemId === item.id ? (
                            <ActivityIndicator size="small" color="#fff" />
                          ) : (
                            <Text style={styles.availableItemAddText}>
                              {alreadyInCombo ? "Added" : "Add"}
                            </Text>
                          )}
                        </TouchableOpacity>
                      </View>
                    );
                  })}
                </View>
              )}
            </>
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
  headerActions: { flexDirection: "row", alignItems: "center", gap: 8 },
  deleteBtn: { padding: 4 },
  editBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 4, paddingVertical: 2 },
  editBtnText: { fontSize: 13, fontWeight: "600", color: GatiMitraMerchant.primary },
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
  readOnlyInput: {
    backgroundColor: GatiMitraMerchant.surfaceSubtle,
    color: GatiMitraMerchant.textSecondary,
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
    borderRadius: CARD_RADIUS,
    marginBottom: 8,
    paddingHorizontal: 10,
    backgroundColor: GatiMitraMerchant.cardBg,
    ...GatiMitraMerchant.shadowSm,
  },
  componentMain: { flex: 1, flexDirection: "row", alignItems: "center", gap: 10, marginRight: 8 },
  componentImageWrap: {
    width: 40,
    height: 40,
    borderRadius: 8,
    overflow: "hidden",
    backgroundColor: GatiMitraMerchant.surfaceSubtle,
  },
  componentImage: { width: "100%", height: "100%" },
  componentImagePlaceholder: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  componentBody: { flex: 1 },
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
    backgroundColor: GatiMitraMerchant.cardBg,
  },
  availableItemImageWrap: {
    width: 38,
    height: 38,
    borderRadius: 8,
    overflow: "hidden",
    backgroundColor: GatiMitraMerchant.surfaceSubtle,
    marginRight: 10,
  },
  availableItemImage: { width: "100%", height: "100%" },
  availableItemImagePlaceholder: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  availableItemName: { fontSize: 14, fontWeight: "600", color: GatiMitraMerchant.textPrimary },
  availableItemMeta: { fontSize: 12, color: GatiMitraMerchant.textTertiary, marginTop: 2 },
  availableItemAddBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: GatiMitraMerchant.primary,
  },
  availableItemAddBtnDisabled: {
    backgroundColor: GatiMitraMerchant.border,
  },
  availableItemAddText: { color: "#fff", fontSize: 12, fontWeight: "600" },
});
