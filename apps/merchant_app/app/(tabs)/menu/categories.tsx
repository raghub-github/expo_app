/**
 * Category management — list, add, edit, delete. Data from useMenuQueries (backend source of truth).
 */

import { useState, useRef, useEffect, useMemo } from "react";
import { AppText as Text } from "@/components/AppText";
import { View, ScrollView, StyleSheet, TouchableOpacity, TextInput, RefreshControl, ActivityIndicator, Alert, Modal } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { GatiMitraMerchant, H_PADDING, CARD_RADIUS, BUTTON_RADIUS } from "@/constants/theme";
import { useAuth } from "@/context/AuthContext";
import { useSelectedStore } from "@/context/SelectedStoreContext";
import {
  useMenuCategories,
  useCreateCategory,
  useUpdateCategory,
  useDeleteCategory,
} from "@/hooks/useMenuQueries";
import {
  fetchCategoryAvailabilitySummary,
  fetchCategoryNameSuggestions,
  fetchSubcategoryNameSuggestions,
  type MenuCategory,
} from "@/services/menuApi";
import { useDebouncedValue } from "@/lib/hooks/useDebouncedValue";

export default function CategoriesScreen() {
  const router = useRouter();
  const { token } = useAuth();
  const { selectedStore } = useSelectedStore();
  const storeId = selectedStore?.store_id ?? null;

  const { data: categories = [], isLoading: loading, error: categoriesError, refetch, isRefetching: refreshing } = useMenuCategories(storeId, token);
  const createCat = useCreateCategory(storeId, token);
  const updateCat = useUpdateCategory(storeId, token);
  const deleteCat = useDeleteCategory(storeId, token);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<MenuCategory | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [displayOrder, setDisplayOrder] = useState("");
  const [parentCategoryId, setParentCategoryId] = useState<number | null>(null);
  const [parentPickerOpen, setParentPickerOpen] = useState(false);
  const [availabilityCounts, setAvailabilityCounts] = useState<Record<string, number>>({});
  const [expandedParentIds, setExpandedParentIds] = useState<Set<number>>(new Set());
  const [peerSuggestions, setPeerSuggestions] = useState<string[]>([]);
  const [peerSuggestionsLoading, setPeerSuggestionsLoading] = useState(false);
  const debouncedName = useDebouncedValue(name, 280);
  const saving = createCat.isPending || updateCat.isPending;

  const params = useLocalSearchParams<{ addSubcategory?: string; add?: string }>();
  const parentCategories = categories
    .filter((c) => !c.parent_category_id)
    .sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0));
  const childrenByParentId = useMemo(() => {
    const map = new Map<number, MenuCategory[]>();
    for (const c of categories) {
      if (c.parent_category_id == null) continue;
      const list = map.get(c.parent_category_id) ?? [];
      list.push(c);
      map.set(c.parent_category_id, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0));
    }
    return map;
  }, [categories]);
  const toggleExpanded = (parentId: number) => {
    setExpandedParentIds((prev) => {
      const next = new Set(prev);
      if (next.has(parentId)) next.delete(parentId);
      else next.add(parentId);
      return next;
    });
  };

  const didOpenParentPicker = useRef(false);
  const didOpenAddFromQuery = useRef(false);
  useEffect(() => {
    if (params.addSubcategory === "1" && parentCategories.length > 0 && !didOpenParentPicker.current) {
      didOpenParentPicker.current = true;
      setParentPickerOpen(true);
    }
  }, [params.addSubcategory, parentCategories.length]);
  const categoryById = new Map(categories.map((c) => [c.id, c]));

  /** Same scope as DB unique (store + parent + lower(name)). */
  const categoryNameConflictSet = useMemo(() => {
    const set = new Set<string>();
    const scopeParent = parentCategoryId ?? null;
    for (const c of categories) {
      if (editingCategory && c.id === editingCategory.id) continue;
      const rowParent = c.parent_category_id ?? null;
      if (rowParent !== scopeParent) continue;
      const n = c.category_name.toLowerCase().trim();
      if (n) set.add(n);
    }
    return set;
  }, [categories, editingCategory, parentCategoryId]);

  const displayCategoryName = (c: MenuCategory) => {
    if (c.parent_category_id) {
      const parent = categoryById.get(c.parent_category_id);
      return parent ? `${parent.category_name} › ${c.category_name}` : c.category_name;
    }
    return c.category_name;
  };

  const canFetch = Boolean(token && storeId);
  const mutationError = createCat.error ?? updateCat.error ?? deleteCat.error;
  const error = categoriesError
    ? (categoriesError instanceof Error ? categoriesError.message : "Failed to load categories")
    : mutationError instanceof Error ? mutationError.message : mutationError ? "Action failed" : null;

  const onRefresh = () => {
    refetch();
    if (storeId && token) {
      fetchCategoryAvailabilitySummary(storeId, token).then((counts) => setAvailabilityCounts(counts)).catch(() => setAvailabilityCounts({}));
    }
  };

  useEffect(() => {
    if (!storeId || !token) return;
    fetchCategoryAvailabilitySummary(storeId, token).then((counts) => setAvailabilityCounts(counts)).catch(() => setAvailabilityCounts({}));
  }, [storeId, token, categories.length]);

  useEffect(() => {
    if (!modalOpen || !storeId || !token) {
      setPeerSuggestions([]);
      setPeerSuggestionsLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setPeerSuggestionsLoading(true);
      try {
        const list =
          parentCategoryId != null
            ? await fetchSubcategoryNameSuggestions(storeId, token, {
                q: debouncedName,
                limit: 12,
                parentCategoryId: parentCategoryId,
                editingCategoryId: editingCategory?.id ?? null,
              })
            : await fetchCategoryNameSuggestions(storeId, token, {
                q: debouncedName,
                limit: 12,
                editingCategoryId: editingCategory?.id ?? null,
              });
        if (!cancelled) setPeerSuggestions(list);
      } catch {
        if (!cancelled) setPeerSuggestions([]);
      } finally {
        if (!cancelled) setPeerSuggestionsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [modalOpen, storeId, token, debouncedName, editingCategory, parentCategoryId]);

  const parentIdsKey = useMemo(() => parentCategories.map((p) => p.id).join(","), [parentCategories]);
  useEffect(() => {
    if (parentCategories.length > 0) {
      setExpandedParentIds((prev) => {
        const next = new Set(prev);
        parentCategories.forEach((p) => next.add(p.id));
        return next;
      });
    }
  }, [parentIdsKey]);

  const openAdd = () => {
    setEditingCategory(null);
    setName("");
    setDescription("");
    setDisplayOrder(String(categories.length));
    setParentCategoryId(null);
    setModalOpen(true);
  };

  useEffect(() => {
    if (params.add === "1" && !didOpenAddFromQuery.current && !loading) {
      didOpenAddFromQuery.current = true;
      openAdd();
    }
  }, [params.add, loading, categories.length]);

  const openAddSubcategory = (parent: MenuCategory) => {
    setEditingCategory(null);
    setName("");
    setDescription("");
    const siblings = categories.filter((x) => x.parent_category_id === parent.id);
    setDisplayOrder(String(siblings.length));
    setParentCategoryId(parent.id);
    setModalOpen(true);
  };

  const openEdit = (c: MenuCategory) => {
    setEditingCategory(c);
    setName(c.category_name);
    setDescription(c.category_description ?? "");
    setDisplayOrder(String(c.display_order ?? 0));
    setParentCategoryId(c.parent_category_id ?? null);
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!storeId || !name.trim()) return;
    const order = parseInt(displayOrder, 10) || 0;
    try {
      if (editingCategory) {
        await updateCat.mutateAsync({
          categoryId: editingCategory.id,
          body: {
            category_name: name.trim(),
            category_description: description.trim() || null,
            display_order: order,
          },
        });
      } else {
        await createCat.mutateAsync({
          category_name: name.trim(),
          category_description: description.trim() || null,
          display_order: order,
          parent_category_id:
            parentCategoryId != null ? Number(parentCategoryId) : undefined,
        });
      }
      setModalOpen(false);
    } catch {
      // Error shown via mutation.error / error state
    }
  };

  const handleDelete = (c: MenuCategory) => {
    Alert.alert(
      "Delete category",
      `Remove "${c.category_name}"? You can only delete a category when it has no items.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            if (!storeId) return;
            try {
              await deleteCat.mutateAsync(c.id);
            } catch (e) {
              const msg = e instanceof Error ? e.message : "Delete failed.";
              Alert.alert("Cannot delete", msg);
            }
          },
        },
      ]
    );
  };

  const moveOrder = async (c: MenuCategory, delta: number) => {
    if (!storeId) return;
    const idx = categories.findIndex((x) => x.id === c.id);
    if (idx < 0) return;
    const newIdx = Math.max(0, Math.min(categories.length - 1, idx + delta));
    if (newIdx === idx) return;
    try {
      await updateCat.mutateAsync({ categoryId: c.id, body: { display_order: newIdx } });
    } catch {
      // Error shown via mutation.error
    }
  };

  if (!canFetch) {
    return (
      <View style={[styles.container, styles.centered]}>
        <Text style={styles.emptyText}>Select a store and sign in.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} hitSlop={8}>
          <Ionicons name="arrow-back" size={24} color={GatiMitraMerchant.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.title}>Categories</Text>
        <TouchableOpacity onPress={openAdd} style={styles.addHeaderBtn}>
          <Ionicons name="add" size={24} color={GatiMitraMerchant.primary} />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={GatiMitraMerchant.primary} />
        }
      >
        {error ? (
          <View style={styles.errorWrap}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}
        {loading && categories.length === 0 ? (
          <ActivityIndicator size="large" color={GatiMitraMerchant.primary} style={styles.loader} />
        ) : categories.length === 0 ? (
          <Text style={styles.emptyText}>No categories yet. Tap + to add one.</Text>
        ) : (
          parentCategories.map((parent) => {
            const children = childrenByParentId.get(parent.id) ?? [];
            const isExpanded = expandedParentIds.has(parent.id);
            const parentHoursCount = availabilityCounts[String(parent.id)] ?? 0;
            return (
              <View key={parent.id} style={styles.parentBlock}>
                <View style={styles.card}>
                  <View style={styles.cardLeft}>
                    <TouchableOpacity onPress={() => toggleExpanded(parent.id)} style={styles.chevronBtn}>
                      <Ionicons name={isExpanded ? "chevron-down" : "chevron-forward"} size={22} color={GatiMitraMerchant.textSecondary} />
                    </TouchableOpacity>
                    <View style={styles.cardText}>
                      <Text style={styles.cardName}>{parent.category_name}</Text>
                      {parent.category_description ? (
                        <Text style={styles.cardDesc} numberOfLines={1}>{parent.category_description}</Text>
                      ) : null}
                      <TouchableOpacity onPress={() => openAddSubcategory(parent)} style={styles.addSubBtn} hitSlop={4}>
                        <Ionicons name="git-branch-outline" size={14} color={GatiMitraMerchant.primary} />
                        <Text style={styles.addSubBtnText}>Add subcategory</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                  <View style={styles.cardActions}>
                    {parentHoursCount > 0 ? (
                      <View style={styles.hoursBadge}>
                        <Text style={styles.hoursBadgeText}>{parentHoursCount} time{parentHoursCount !== 1 ? "s" : ""}</Text>
                      </View>
                    ) : null}
                    <TouchableOpacity
                      onPress={() => router.push({ pathname: "/menu/category-availability", params: { categoryId: String(parent.id), categoryName: parent.category_name } } as any)}
                      style={styles.iconBtn}
                    >
                      <Ionicons name="time-outline" size={22} color={GatiMitraMerchant.primary} />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => openEdit(parent)} style={styles.iconBtn}>
                      <Ionicons name="pencil-outline" size={22} color={GatiMitraMerchant.primary} />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => handleDelete(parent)} style={styles.iconBtn}>
                      <Ionicons name="trash-outline" size={22} color={GatiMitraMerchant.error} />
                    </TouchableOpacity>
                  </View>
                </View>
                {isExpanded && (
                  <View style={styles.childrenBlock}>
                    {children.map((child) => {
                      const childHoursCount = availabilityCounts[String(child.id)] ?? 0;
                      return (
                        <View key={child.id} style={styles.childRow}>
                          <View style={styles.childCard}>
                            <Text style={styles.childName}>{child.category_name}</Text>
                            {child.category_description ? (
                              <Text style={styles.childDesc} numberOfLines={1}>{child.category_description}</Text>
                            ) : null}
                            <View style={styles.cardActions}>
                              {childHoursCount > 0 ? (
                                <View style={styles.hoursBadge}>
                                  <Text style={styles.hoursBadgeText}>{childHoursCount} time{childHoursCount !== 1 ? "s" : ""}</Text>
                                </View>
                              ) : null}
                              <TouchableOpacity
                                onPress={() => router.push({ pathname: "/menu/category-availability", params: { categoryId: String(child.id), categoryName: child.category_name } } as any)}
                                style={styles.iconBtn}
                              >
                                <Ionicons name="time-outline" size={20} color={GatiMitraMerchant.primary} />
                              </TouchableOpacity>
                              <TouchableOpacity onPress={() => openEdit(child)} style={styles.iconBtn}>
                                <Ionicons name="pencil-outline" size={20} color={GatiMitraMerchant.primary} />
                              </TouchableOpacity>
                              <TouchableOpacity onPress={() => handleDelete(child)} style={styles.iconBtn}>
                                <Ionicons name="trash-outline" size={20} color={GatiMitraMerchant.error} />
                              </TouchableOpacity>
                            </View>
                          </View>
                        </View>
                      );
                    })}
                    <TouchableOpacity onPress={() => openAddSubcategory(parent)} style={styles.addSubRow}>
                      <Ionicons name="add-circle-outline" size={18} color={GatiMitraMerchant.primary} />
                      <Text style={styles.addSubRowText}>Add subcategory under {parent.category_name}</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            );
          })
        )}
      </ScrollView>

      <Modal visible={parentPickerOpen} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Select parent category</Text>
            <Text style={styles.inputLabel}>Choose the category under which to add a subcategory.</Text>
            <ScrollView style={{ maxHeight: 280 }} showsVerticalScrollIndicator={false}>
              {parentCategories.map((p) => (
                <TouchableOpacity
                  key={p.id}
                  style={styles.pickerBtnFull}
                  onPress={() => {
                    setParentCategoryId(p.id);
                    setParentPickerOpen(false);
                    setEditingCategory(null);
                    setName("");
                    setDescription("");
                    const siblings = categories.filter((x) => x.parent_category_id === p.id);
                    setDisplayOrder(String(siblings.length));
                    setModalOpen(true);
                  }}
                >
                  <Text style={styles.pickerBtnText}>{p.category_name}</Text>
                  <Ionicons name="chevron-forward" size={18} color={GatiMitraMerchant.textTertiary} />
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity onPress={() => setParentPickerOpen(false)} style={[styles.modalBtnCancel, { marginTop: 12 }]}>
              <Text style={styles.modalBtnCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={modalOpen} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>
              {editingCategory ? "Edit category" : parentCategoryId != null ? "Add subcategory" : "Add category"}
            </Text>
            {parentCategoryId != null && !editingCategory && (
              <View style={styles.subcategoryBanner}>
                <Text style={styles.subcategoryBannerText}>
                  Subcategory under{" "}
                  <Text style={styles.subcategoryBannerStrong}>
                    {parentCategories.find((p) => p.id === parentCategoryId)?.category_name ?? "—"}
                  </Text>
                </Text>
              </View>
            )}
            {editingCategory && (
              <>
                <Text style={styles.inputLabel}>Parent category (optional)</Text>
                <View style={styles.pickerWrap}>
                  <TouchableOpacity
                    style={styles.pickerBtn}
                    onPress={() => setParentCategoryId(null)}
                  >
                    <Text style={[styles.pickerBtnText, parentCategoryId === null && styles.pickerBtnTextActive]}>
                      None (main category)
                    </Text>
                  </TouchableOpacity>
                  {parentCategories
                    .filter((p) => editingCategory?.id !== p.id)
                    .map((p) => (
                      <TouchableOpacity
                        key={p.id}
                        style={[styles.pickerBtn, parentCategoryId === p.id && styles.pickerBtnActive]}
                        onPress={() => setParentCategoryId(p.id)}
                      >
                        <Text
                          style={[styles.pickerBtnText, parentCategoryId === p.id && styles.pickerBtnTextActive]}
                        >
                          {p.category_name}
                        </Text>
                      </TouchableOpacity>
                    ))}
                </View>
              </>
            )}
            <Text style={styles.inputLabel}>
              {parentCategoryId != null ? "Subcategory name *" : "Category name *"}
            </Text>
            <TextInput
              style={styles.input}
              placeholder={
                parentCategoryId != null
                  ? "Start typing — subcategory names from other stores"
                  : "Start typing — category names from other stores"
              }
              placeholderTextColor={GatiMitraMerchant.textTertiary}
              value={name}
              onChangeText={setName}
              maxLength={30}
            />
            {peerSuggestionsLoading ? (
              <ActivityIndicator style={{ marginVertical: 10 }} color={GatiMitraMerchant.primary} />
            ) : (
              <ScrollView style={styles.suggestionScroll} keyboardShouldPersistTaps="handled" nestedScrollEnabled>
                {peerSuggestions
                  .filter((s) => !categoryNameConflictSet.has(String(s).toLowerCase().trim()))
                  .map((s) => (
                    <TouchableOpacity
                      key={s}
                      onPress={() => setName(s.slice(0, 30))}
                      style={styles.suggestionRow}
                    >
                      <Text style={styles.suggestionRowText}>{s}</Text>
                    </TouchableOpacity>
                  ))}
                {!peerSuggestionsLoading &&
                  peerSuggestions.filter((s) => !categoryNameConflictSet.has(String(s).toLowerCase().trim()))
                    .length === 0 && (
                    <Text style={styles.suggestionHint}>
                      {name.trim()
                        ? "No matches from other stores — use your own name."
                        : parentCategoryId != null
                          ? "Popular subcategory names from other stores."
                          : "Popular category names from other stores."}
                    </Text>
                  )}
              </ScrollView>
            )}
            {name.trim().length > 0 &&
              categoryNameConflictSet.has(name.trim().toLowerCase()) && (
                <Text style={styles.duplicateWarning}>
                  {parentCategoryId != null
                    ? "This name is already used under this category."
                    : "This store already uses this category name."}
                </Text>
              )}
            <Text style={styles.inputLabel}>Description (optional)</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              placeholder="Short description"
              placeholderTextColor={GatiMitraMerchant.textTertiary}
              value={description}
              onChangeText={setDescription}
              multiline
            />
            <Text style={styles.inputLabel}>Display order (0, 1, 2...)</Text>
            <TextInput
              style={styles.input}
              placeholder="0"
              placeholderTextColor={GatiMitraMerchant.textTertiary}
              value={displayOrder}
              onChangeText={setDisplayOrder}
              keyboardType="number-pad"
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity onPress={() => setModalOpen(false)} style={styles.modalBtnCancel}>
                <Text style={styles.modalBtnCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleSave}
                disabled={!name.trim() || saving}
                style={[styles.modalBtnSave, (!name.trim() || saving) && styles.modalBtnDisabled]}
              >
                {saving ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.modalBtnSaveText}>Save</Text>
                )}
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
    backgroundColor: GatiMitraMerchant.cardBg,
    ...GatiMitraMerchant.shadowSm,
  },
  backBtn: { marginRight: 12 },
  title: { flex: 1, fontSize: 18, fontWeight: "700", color: GatiMitraMerchant.textPrimary },
  addHeaderBtn: { padding: 4 },
  scroll: { flex: 1 },
  scrollContent: { padding: H_PADDING },
  loader: { marginTop: 24 },
  errorWrap: { marginBottom: 12 },
  errorText: { fontSize: 14, color: GatiMitraMerchant.error },
  emptyText: { fontSize: 14, color: GatiMitraMerchant.textSecondary, textAlign: "center", paddingVertical: 24 },
  card: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: GatiMitraMerchant.cardBg,
    padding: 16,
    borderRadius: CARD_RADIUS,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
    ...GatiMitraMerchant.shadowSm,
  },
  cardLeft: { flexDirection: "row", alignItems: "center", flex: 1, minWidth: 0 },
  orderBtns: { marginRight: 12 },
  orderBtn: { padding: 4 },
  orderBtnDisabled: { opacity: 0.5 },
  cardText: { flex: 1, minWidth: 0 },
  cardName: { fontSize: 15, fontWeight: "700", color: GatiMitraMerchant.textPrimary },
  cardDesc: { fontSize: 13, color: GatiMitraMerchant.textSecondary, marginTop: 2 },
  addSubBtn: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 6 },
  addSubBtnText: { fontSize: 13, fontWeight: "600", color: GatiMitraMerchant.primary },
  cardActions: { flexDirection: "row", gap: 8, alignItems: "center" },
  iconBtn: { padding: 4 },
  chevronBtn: { padding: 4, marginRight: 4 },
  parentBlock: { marginBottom: 12 },
  childrenBlock: { marginLeft: 20, marginTop: -4, marginBottom: 8, borderLeftWidth: 2, borderLeftColor: GatiMitraMerchant.border, paddingLeft: 12 },
  childRow: { marginBottom: 8 },
  childCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: GatiMitraMerchant.surfaceSubtle,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
  },
  childName: { fontSize: 14, fontWeight: "600", color: GatiMitraMerchant.textPrimary, flex: 1 },
  childDesc: { fontSize: 12, color: GatiMitraMerchant.textSecondary, marginTop: 2 },
  addSubRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 10, paddingHorizontal: 4 },
  addSubRowText: { fontSize: 13, fontWeight: "600", color: GatiMitraMerchant.primary },
  hoursBadge: { backgroundColor: GatiMitraMerchant.primaryLight, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  hoursBadgeText: { fontSize: 11, fontWeight: "700", color: GatiMitraMerchant.navy },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    padding: 24,
  },
  modalContent: {
    backgroundColor: GatiMitraMerchant.cardBg,
    borderRadius: CARD_RADIUS,
    padding: 24,
    ...GatiMitraMerchant.shadowCard,
  },
  modalTitle: { fontSize: 18, fontWeight: "700", color: GatiMitraMerchant.textPrimary, marginBottom: 20 },
  inputLabel: { fontSize: 12, fontWeight: "600", color: GatiMitraMerchant.textSecondary, marginBottom: 6 },
  pickerWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 12 },
  pickerBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: GatiMitraMerchant.surfaceSubtle,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
  },
  pickerBtnActive: { backgroundColor: GatiMitraMerchant.primaryLight, borderColor: GatiMitraMerchant.primary },
  pickerBtnText: { fontSize: 13, fontWeight: "600", color: GatiMitraMerchant.textSecondary },
  pickerBtnFull: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: GatiMitraMerchant.surfaceSubtle,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
    marginBottom: 8,
  },
  pickerBtnTextActive: { color: GatiMitraMerchant.navy },
  input: {
    backgroundColor: GatiMitraMerchant.cardBg,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
    borderRadius: BUTTON_RADIUS,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: GatiMitraMerchant.textPrimary,
    marginBottom: 12,
  },
  textArea: { minHeight: 72, textAlignVertical: "top" },
  modalButtons: { flexDirection: "row", gap: 12, marginTop: 16 },
  modalBtnCancel: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: BUTTON_RADIUS,
    alignItems: "center",
    backgroundColor: GatiMitraMerchant.surfaceSubtle,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
  },
  modalBtnCancelText: { fontSize: 15, fontWeight: "600", color: GatiMitraMerchant.textSecondary },
  modalBtnSave: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: BUTTON_RADIUS,
    alignItems: "center",
    backgroundColor: GatiMitraMerchant.primary,
  },
  modalBtnDisabled: { opacity: 0.5 },
  modalBtnSaveText: { fontSize: 15, fontWeight: "600", color: "#fff" },
  subcategoryBanner: {
    backgroundColor: GatiMitraMerchant.primaryLight,
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
  },
  subcategoryBannerText: { fontSize: 13, color: GatiMitraMerchant.textSecondary },
  subcategoryBannerStrong: { fontWeight: "700", color: GatiMitraMerchant.textPrimary },
  suggestionScroll: { maxHeight: 140, marginBottom: 8 },
  suggestionRow: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: GatiMitraMerchant.border,
  },
  suggestionRowText: { fontSize: 14, color: GatiMitraMerchant.textPrimary },
  suggestionHint: { fontSize: 12, color: GatiMitraMerchant.textTertiary, paddingVertical: 8, paddingHorizontal: 4 },
  duplicateWarning: { fontSize: 12, color: GatiMitraMerchant.error, marginBottom: 8 },
});
