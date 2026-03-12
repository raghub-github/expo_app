/**
 * Catalog — categories and items from merchant-menu API.
 * Data layer: useMenuQueries (backend is source of truth; cache + invalidation here).
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  RefreshControl,
  ActivityIndicator,
  Image,
  Modal,
  Alert,
  Pressable,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import {
  GatiMitraMerchant,
  H_PADDING,
  TAB_BAR_HEIGHT,
  SCROLL_BOTTOM_SAFE,
  CARD_RADIUS,
} from "@/constants/theme";
import { useAuth } from "@/context/AuthContext";
import { useSelectedStore } from "@/context/SelectedStoreContext";
import { useMenuCategories, useMenuItems, usePatchItemStock, useDeleteCategory } from "@/hooks/useMenuQueries";
import type { MenuItemRow } from "@/services/menuApi";
import type { MenuCategory } from "@/services/menuApi";
import { resolveImageUrl } from "@/services/outletApi";
import { useRouter } from "expo-router";

type ApprovalFilter = "ALL" | "PENDING" | "APPROVED" | "REJECTED";
type StockFilter = "ALL" | "IN_STOCK" | "OUT_OF_STOCK";

function MenuItemCard({
  item,
  categoryName,
  onToggleStock,
  onEdit,
}: {
  item: MenuItemRow;
  categoryName: string | null;
  onToggleStock: (id: number, inStock: boolean) => void;
  onEdit: (id: number) => void;
}) {
  const [toggling, setToggling] = useState(false);
  const [imageError, setImageError] = useState(false);
  const price = `₹${Number(item.selling_price).toFixed(0)}`;
  const tags: string[] = [];
  if (item.has_variants) tags.push("Variants");
  if (item.has_customizations) tags.push("Customizations");
  if (item.has_addons) tags.push("Add-ons");

  const imageUri = resolveImageUrl(item.item_image_url);
  const showImage = imageUri && !imageError;

  const handleToggle = () => {
    if (toggling) return;
    setToggling(true);
    onToggleStock(item.id, !item.in_stock);
    setToggling(false);
  };

  return (
    <View style={styles.itemCard}>
      <TouchableOpacity
        style={styles.itemTouchable}
        onPress={() => onEdit(item.id)}
        activeOpacity={0.85}
      >
        <View style={styles.itemImageWrap}>
          {showImage ? (
            <Image
              source={{ uri: imageUri }}
              style={styles.itemImage}
              resizeMode="cover"
              onError={() => setImageError(true)}
            />
          ) : (
            <View style={styles.itemImagePlaceholder}>
              <Ionicons name="restaurant-outline" size={28} color={GatiMitraMerchant.primary} />
            </View>
          )}
          {item.approval_status === "PENDING" && (
            <View style={styles.pendingBadge}>
              <Text style={styles.pendingBadgeText}>Pending</Text>
            </View>
          )}
          {item.approval_status === "REJECTED" && (
            <View style={styles.rejectedBadge}>
              <Text style={styles.rejectedBadgeText}>Rejected</Text>
            </View>
          )}
        </View>
        <View style={styles.itemBody}>
          <Text style={styles.itemName} numberOfLines={2}>
            {item.item_name}
          </Text>
          <Text style={styles.itemMeta} numberOfLines={1}>
            {categoryName ?? "Uncategorised"} · {price}
          </Text>
          {tags.length > 0 && (
            <View style={styles.tagsRow}>
              {tags.map((t) => (
                <View key={t} style={styles.tag}>
                  <Text style={styles.tagText}>{t}</Text>
                </View>
              ))}
            </View>
          )}
        </View>
      </TouchableOpacity>
      <View style={styles.itemFooter}>
        <TouchableOpacity
          onPress={() => onEdit(item.id)}
          style={[styles.editBtn, GatiMitraMerchant.cursorPointer]}
          hitSlop={8}
        >
          <Ionicons name="pencil" size={18} color={GatiMitraMerchant.primary} />
          <Text style={styles.editBtnText}>Edit</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={handleToggle}
          disabled={toggling}
          style={[
            styles.stockChip,
            !item.in_stock && styles.stockChipOff,
            GatiMitraMerchant.cursorPointer,
          ]}
          hitSlop={8}
        >
          {toggling ? (
            <ActivityIndicator size="small" color={item.in_stock ? GatiMitraMerchant.success : GatiMitraMerchant.error} />
          ) : (
            <>
              <View style={[styles.stockDot, !item.in_stock && styles.stockDotOff]} />
              <Text style={[styles.stockChipText, !item.in_stock && styles.stockChipTextOff]}>
                {item.in_stock ? "In stock" : "Out of stock"}
              </Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

export default function MenuScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const scrollBottomPadding = TAB_BAR_HEIGHT + SCROLL_BOTTOM_SAFE + insets.bottom;

  const { token } = useAuth();
  const { selectedStore } = useSelectedStore();
  const storeId = selectedStore?.store_id ?? null;

  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null);
  const [selectedSubcategoryId, setSelectedSubcategoryId] = useState<number | null>(null);
  const [approvalFilter, setApprovalFilter] = useState<ApprovalFilter>("ALL");
  const [stockFilter, setStockFilter] = useState<StockFilter>("ALL");
  const [search, setSearch] = useState("");
  const [searchDebounced, setSearchDebounced] = useState("");
  const [addMenuVisible, setAddMenuVisible] = useState(false);
  const [manageSheetVisible, setManageSheetVisible] = useState(false);
  const [categoryFilterSheetVisible, setCategoryFilterSheetVisible] = useState(false);
  const [subcategoryFilterSheetVisible, setSubcategoryFilterSheetVisible] = useState(false);
  const [categorySearch, setCategorySearch] = useState("");
  const [manageSheetExpandedIds, setManageSheetExpandedIds] = useState<Set<number>>(new Set());

  useEffect(() => {
    const t = setTimeout(() => setSearchDebounced(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const { data: categories = [], refetch: refetchCategories, isRefetching: categoriesRefetching } = useMenuCategories(storeId, token);
  const selectedCategory = selectedCategoryId != null ? categories.find((c) => c.id === selectedCategoryId) : null;
  const isMainCategory = selectedCategory != null && selectedCategory.parent_category_id == null;
  const subcategoriesOfSelected = isMainCategory && selectedCategoryId != null
    ? categories.filter((c) => c.parent_category_id === selectedCategoryId)
    : [];
  const effectiveCategoryId = selectedSubcategoryId ?? selectedCategoryId;
  const manageParentCategories = useMemo(
    () => categories.filter((c) => !c.parent_category_id).sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0)),
    [categories]
  );
  const manageChildrenByParentId = useMemo(() => {
    const map = new Map<number, MenuCategory[]>();
    for (const c of categories) {
      if (c.parent_category_id == null) continue;
      const list = map.get(c.parent_category_id) ?? [];
      list.push(c);
      map.set(c.parent_category_id, list);
    }
    for (const list of map.values()) list.sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0));
    return map;
  }, [categories]);
  const toggleManageSheetExpanded = useCallback((parentId: number) => {
    setManageSheetExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(parentId)) next.delete(parentId);
      else next.add(parentId);
      return next;
    });
  }, []);

  useEffect(() => {
    if (manageSheetVisible && manageParentCategories.length > 0) {
      setManageSheetExpandedIds((prev) => {
        const next = new Set(prev);
        manageParentCategories.forEach((p) => next.add(p.id));
        return next;
      });
    }
  }, [manageSheetVisible, manageParentCategories.length]);
  const itemsFilters = {
    categoryId: effectiveCategoryId ?? undefined,
    search: searchDebounced || undefined,
    limit: 100,
    offset: 0,
    approvalStatus: approvalFilter === "ALL" ? undefined : approvalFilter,
    inStock: stockFilter === "ALL" ? undefined : stockFilter === "IN_STOCK",
  };
  const { data: itemsData, isLoading: itemsLoading, error: itemsError, refetch: refetchItems, isRefetching: itemsRefetching } = useMenuItems(storeId, token, itemsFilters);
  const items = itemsData?.items ?? [];
  const total = itemsData?.total ?? 0;

  const patchStock = usePatchItemStock(storeId, token);
  const deleteCat = useDeleteCategory(storeId, token);
  const refreshing = categoriesRefetching || itemsRefetching;

  const handleDeleteCategoryFromSheet = (c: MenuCategory) => {
    Alert.alert("Delete category", `Remove "${c.category_name}"? You can only delete when it has no items.`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: async () => {
        setManageSheetVisible(false);
        try {
          await deleteCat.mutateAsync(c.id);
        } catch (e) {
          Alert.alert("Cannot delete", e instanceof Error ? e.message : "Delete failed.");
        }
      } },
    ]);
  };

  const handleAddItem = useCallback(() => {
    setAddMenuVisible(false);
    if (categories.length === 0) {
      Alert.alert(
        "Add a category first",
        "You need at least one category before adding menu items. Add a category now?",
        [
          { text: "Cancel", style: "cancel" },
          { text: "Add category", onPress: () => router.push("/menu/categories" as any) },
        ]
      );
      return;
    }
    router.push("/menu/add-edit-item" as any);
  }, [categories.length, router]);

  const onRefresh = useCallback(() => {
    if (!storeId || !token) return;
    refetchCategories();
    refetchItems();
  }, [storeId, token, refetchCategories, refetchItems]);

  const handleToggleStock = useCallback(
    async (itemId: number, inStock: boolean) => {
      try {
        await patchStock.mutateAsync({ itemId, inStock });
      } catch {
        // Cache invalidated; list will refetch. Could toast on error.
      }
    },
    [patchStock]
  );

  const handleEditItem = useCallback(
    (itemId: number) => {
      router.push({ pathname: "/menu/add-edit-item", params: { itemId: String(itemId) } } as any);
    },
    [router]
  );

  const categoryMap = new Map(categories.map((c) => [c.id, c.category_name]));
  const getCategoryDisplayName = useCallback((c: MenuCategory) => {
    const parent = c.parent_category_id ? categories.find((p) => p.id === c.parent_category_id) : null;
    return parent ? `${parent.category_name} › ${c.category_name}` : c.category_name;
  }, [categories]);
  const selectedCategoryLabel = selectedCategoryId == null
    ? "All categories"
    : (() => {
        const c = categories.find((x) => x.id === selectedCategoryId);
        return c ? getCategoryDisplayName(c) : "Category";
      })();
  const selectedSubcategoryLabel = selectedSubcategoryId == null
    ? "All subcategories"
    : (categoryMap.get(selectedSubcategoryId) ?? "Subcategory");
  const filteredCategoriesForSheet = categorySearch.trim()
    ? categories.filter((c) => {
        const label = getCategoryDisplayName(c).toLowerCase();
        return label.includes(categorySearch.trim().toLowerCase());
      })
    : categories;
  const canFetch = Boolean(token && storeId);
  const error = itemsError ? (itemsError instanceof Error ? itemsError.message : "Failed to load items") : null;
  const loading = itemsLoading;

  if (!canFetch) {
    return (
      <View style={[styles.container, styles.centered]}>
        <Text style={styles.emptyText}>
          {!selectedStore ? "Select a store" : "Sign in to manage menu"}
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
    <ScrollView
      style={styles.scrollView}
      contentContainerStyle={[styles.content, { paddingBottom: scrollBottomPadding }]}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={GatiMitraMerchant.primary} />
      }
    >
      {/* Top bar: search + add — single row, modern */}
      <View style={styles.topBar}>
        <View style={styles.searchWrap}>
          <Ionicons name="search-outline" size={18} color={GatiMitraMerchant.textTertiary} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search items..."
            placeholderTextColor={GatiMitraMerchant.textTertiary}
            value={search}
            onChangeText={setSearch}
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch("")} hitSlop={8}>
              <Ionicons name="close-circle" size={18} color={GatiMitraMerchant.textTertiary} />
            </TouchableOpacity>
          )}
        </View>
        <TouchableOpacity
          style={[styles.addBtn, GatiMitraMerchant.cursorPointer]}
          onPress={() => setAddMenuVisible(true)}
          activeOpacity={0.85}
        >
          <Ionicons name="add" size={20} color="#fff" />
          <Text style={styles.addBtnText}>Add</Text>
        </TouchableOpacity>
      </View>

      {/* Add menu: what to add + view existing */}
      <Modal visible={addMenuVisible} transparent animationType="fade">
        <Pressable style={styles.modalOverlay} onPress={() => setAddMenuVisible(false)}>
          <View style={styles.addMenuCard} onStartShouldSetResponder={() => true}>
            <Text style={styles.addMenuTitle}>What do you want to add?</Text>
            <TouchableOpacity style={styles.addMenuOption} onPress={() => { setAddMenuVisible(false); router.push("/menu/categories" as any); }} activeOpacity={0.7}>
              <Ionicons name="folder-open-outline" size={22} color={GatiMitraMerchant.primary} />
              <Text style={styles.addMenuOptionText}>Category</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.addMenuOption} onPress={() => { setAddMenuVisible(false); router.push("/menu/categories?addSubcategory=1" as any); }} activeOpacity={0.7}>
              <Ionicons name="git-branch-outline" size={22} color={GatiMitraMerchant.primary} />
              <Text style={styles.addMenuOptionText}>Subcategory</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.addMenuOption} onPress={() => { setAddMenuVisible(false); router.push("/menu/combos" as any); }} activeOpacity={0.7}>
              <Ionicons name="layers-outline" size={22} color={GatiMitraMerchant.primary} />
              <Text style={styles.addMenuOptionText}>Combo</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.addMenuOption} onPress={handleAddItem} activeOpacity={0.7}>
              <Ionicons name="restaurant-outline" size={22} color={GatiMitraMerchant.primary} />
              <Text style={styles.addMenuOptionText}>Menu item</Text>
            </TouchableOpacity>
            <View style={styles.addMenuDivider} />
            <Text style={styles.addMenuSubtitle}>View or manage existing</Text>
            <TouchableOpacity style={styles.addMenuOption} onPress={() => { setAddMenuVisible(false); router.push("/menu/categories" as any); }} activeOpacity={0.7}>
              <Ionicons name="list-outline" size={22} color={GatiMitraMerchant.textSecondary} />
              <Text style={styles.addMenuOptionText}>Categories & subcategories</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.addMenuOption} onPress={() => { setAddMenuVisible(false); router.push("/menu/combos" as any); }} activeOpacity={0.7}>
              <Ionicons name="layers-outline" size={22} color={GatiMitraMerchant.textSecondary} />
              <Text style={styles.addMenuOptionText}>Combos</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.addMenuCancel} onPress={() => setAddMenuVisible(false)}>
              <Text style={styles.addMenuCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>

      {/* Filters: Category + Subcategory (same line when applicable), then Status + Stock — compact */}
      <View style={styles.filterSection}>
        <View style={styles.filterRow}>
          <View style={[styles.filterTriggerWrap, subcategoriesOfSelected.length > 0 ? styles.filterTriggerHalf : undefined]}>
            <Text style={styles.filterLabel}>Category</Text>
            <TouchableOpacity
              style={styles.filterCategoryTrigger}
              onPress={() => setCategoryFilterSheetVisible(true)}
              activeOpacity={0.8}
            >
              <Ionicons name="folder-open-outline" size={16} color={GatiMitraMerchant.primary} />
              <Text style={styles.filterCategoryTriggerText} numberOfLines={1}>{selectedCategoryLabel}</Text>
              <Ionicons name="chevron-down" size={16} color={GatiMitraMerchant.textSecondary} />
            </TouchableOpacity>
          </View>
          {subcategoriesOfSelected.length > 0 ? (
            <View style={styles.filterTriggerHalf}>
              <Text style={styles.filterLabel}>Subcategory</Text>
              <TouchableOpacity
                style={styles.filterCategoryTrigger}
                onPress={() => setSubcategoryFilterSheetVisible(true)}
                activeOpacity={0.8}
              >
                <Ionicons name="git-branch-outline" size={16} color={GatiMitraMerchant.primary} />
                <Text style={styles.filterCategoryTriggerText} numberOfLines={1}>{selectedSubcategoryLabel}</Text>
                <Ionicons name="chevron-down" size={16} color={GatiMitraMerchant.textSecondary} />
              </TouchableOpacity>
            </View>
          ) : null}
        </View>
        <View style={styles.filterChipsRow}>
          <Text style={styles.filterChipLabel}>Status</Text>
          {(["ALL", "PENDING", "APPROVED", "REJECTED"] as ApprovalFilter[]).map((f) => (
            <TouchableOpacity
              key={f}
              style={[styles.filterChip, approvalFilter === f && styles.filterChipActive, GatiMitraMerchant.cursorPointer]}
              onPress={() => setApprovalFilter(f)}
            >
              <Text style={[styles.filterChipText, approvalFilter === f && styles.filterChipTextActive]}>{f === "ALL" ? "Any" : f.charAt(0) + f.slice(1).toLowerCase()}</Text>
            </TouchableOpacity>
          ))}
          <Text style={[styles.filterChipLabel, { marginLeft: 12 }]}>Stock</Text>
          {(["ALL", "IN_STOCK", "OUT_OF_STOCK"] as StockFilter[]).map((f) => (
            <TouchableOpacity
              key={f}
              style={[styles.filterChip, stockFilter === f && styles.filterChipActive, GatiMitraMerchant.cursorPointer]}
              onPress={() => setStockFilter(f)}
            >
              <Text style={[styles.filterChipText, stockFilter === f && styles.filterChipTextActive]}>
                {f === "ALL" ? "All" : f === "IN_STOCK" ? "In stock" : "Out"}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Subcategory picker sheet */}
      <Modal visible={subcategoryFilterSheetVisible} transparent animationType="slide">
        <View style={styles.sheetOverlay}>
          <Pressable style={styles.sheetBackdrop} onPress={() => setSubcategoryFilterSheetVisible(false)} />
          <View style={[styles.filterSheet, { paddingBottom: insets.bottom + 24 }]}>
            <View style={styles.sheetHandle} />
            <Text style={styles.filterSheetTitle}>Filter by subcategory</Text>
            <ScrollView style={styles.filterSheetList} showsVerticalScrollIndicator={false}>
              <TouchableOpacity
                style={[styles.filterSheetItem, selectedSubcategoryId === null && styles.filterSheetItemActive]}
                onPress={() => { setSelectedSubcategoryId(null); setSubcategoryFilterSheetVisible(false); }}
              >
                <Text style={[styles.filterSheetItemText, selectedSubcategoryId === null && styles.filterSheetItemTextActive]}>All subcategories</Text>
                {selectedSubcategoryId === null && <Ionicons name="checkmark-circle" size={20} color={GatiMitraMerchant.primary} />}
              </TouchableOpacity>
              {subcategoriesOfSelected.map((c) => (
                <TouchableOpacity
                  key={c.id}
                  style={[styles.filterSheetItem, selectedSubcategoryId === c.id && styles.filterSheetItemActive]}
                  onPress={() => { setSelectedSubcategoryId(c.id); setSubcategoryFilterSheetVisible(false); }}
                >
                  <Text style={[styles.filterSheetItemText, selectedSubcategoryId === c.id && styles.filterSheetItemTextActive]}>{c.category_name}</Text>
                  {selectedSubcategoryId === c.id && <Ionicons name="checkmark-circle" size={20} color={GatiMitraMerchant.primary} />}
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity style={styles.filterSheetDone} onPress={() => setSubcategoryFilterSheetVisible(false)}>
              <Text style={styles.filterSheetDoneText}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Category picker sheet: search + full list (handles 20+ categories) */}
      <Modal visible={categoryFilterSheetVisible} transparent animationType="slide">
        <View style={styles.sheetOverlay}>
          <Pressable style={styles.sheetBackdrop} onPress={() => setCategoryFilterSheetVisible(false)} />
          <View style={[styles.filterSheet, { paddingBottom: insets.bottom + 24 }]}>
            <View style={styles.sheetHandle} />
            <Text style={styles.filterSheetTitle}>Filter by category</Text>
            <View style={styles.filterSheetSearchWrap}>
              <Ionicons name="search-outline" size={20} color={GatiMitraMerchant.textTertiary} />
              <TextInput
                style={styles.filterSheetSearchInput}
                placeholder="Search categories..."
                placeholderTextColor={GatiMitraMerchant.textTertiary}
                value={categorySearch}
                onChangeText={setCategorySearch}
              />
              {categorySearch.length > 0 && (
                <TouchableOpacity onPress={() => setCategorySearch("")} hitSlop={8}>
                  <Ionicons name="close-circle" size={20} color={GatiMitraMerchant.textTertiary} />
                </TouchableOpacity>
              )}
            </View>
            <ScrollView style={styles.filterSheetList} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <TouchableOpacity
                style={[styles.filterSheetItem, selectedCategoryId === null && styles.filterSheetItemActive]}
                onPress={() => { setSelectedCategoryId(null); setSelectedSubcategoryId(null); setCategoryFilterSheetVisible(false); }}
              >
                <Text style={[styles.filterSheetItemText, selectedCategoryId === null && styles.filterSheetItemTextActive]}>All categories</Text>
                {selectedCategoryId === null && <Ionicons name="checkmark-circle" size={20} color={GatiMitraMerchant.primary} />}
              </TouchableOpacity>
              {filteredCategoriesForSheet.map((c) => (
                <TouchableOpacity
                  key={c.id}
                  style={[styles.filterSheetItem, selectedCategoryId === c.id && styles.filterSheetItemActive]}
                  onPress={() => { setSelectedCategoryId(c.id); setSelectedSubcategoryId(null); setCategoryFilterSheetVisible(false); }}
                >
                  <Text style={[styles.filterSheetItemText, selectedCategoryId === c.id && styles.filterSheetItemTextActive]} numberOfLines={2}>{getCategoryDisplayName(c)}</Text>
                  {selectedCategoryId === c.id && <Ionicons name="checkmark-circle" size={20} color={GatiMitraMerchant.primary} />}
                </TouchableOpacity>
              ))}
              {filteredCategoriesForSheet.length === 0 && (
                <Text style={styles.filterSheetEmpty}>No categories match</Text>
              )}
            </ScrollView>
            <TouchableOpacity style={styles.filterSheetDone} onPress={() => setCategoryFilterSheetVisible(false)}>
              <Text style={styles.filterSheetDoneText}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {error ? (
        <View style={styles.errorWrap}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>
          {effectiveCategoryId != null ? categoryMap.get(effectiveCategoryId) ?? "Items" : "All items"} · {total}
        </Text>
        {loading && items.length === 0 ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator size="large" color={GatiMitraMerchant.primary} />
          </View>
        ) : !loading && items.length === 0 ? (
          <View style={styles.emptyCard}>
            <Ionicons name="restaurant-outline" size={36} color={GatiMitraMerchant.textTertiary} />
            <Text style={styles.emptyText}>No items match. Add an item or change filters.</Text>
          </View>
        ) : (
          <View style={styles.itemGrid}>
            {items.map((item) => (
              <MenuItemCard
                key={item.id}
                item={item}
                categoryName={item.category_id != null ? categoryMap.get(item.category_id) ?? null : null}
                onToggleStock={handleToggleStock}
                onEdit={handleEditItem}
              />
            ))}
          </View>
        )}
      </View>
    </ScrollView>

      {/* FAB: fixed position above tab bar — outside ScrollView so it does not scroll */}
      <TouchableOpacity
        style={[styles.fab, { bottom: TAB_BAR_HEIGHT + 6 }]}
        onPress={() => setManageSheetVisible(true)}
        activeOpacity={0.9}
      >
        <Ionicons name="list" size={24} color="#fff" />
      </TouchableOpacity>

      {/* Manage sheet: existing categories & combos with edit/delete/add */}
      <Modal visible={manageSheetVisible} transparent animationType="slide">
        <View style={styles.sheetOverlay}>
          <Pressable style={styles.sheetBackdrop} onPress={() => setManageSheetVisible(false)} />
          <View style={[styles.sheet, { paddingBottom: insets.bottom + 20 }]}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Manage catalog</Text>
            <ScrollView style={styles.sheetScroll} showsVerticalScrollIndicator={false}>
              <Text style={styles.sheetSectionLabel}>Categories & subcategories</Text>
              {categories.length === 0 ? (
                <Text style={styles.sheetEmpty}>No categories yet</Text>
              ) : (
                manageParentCategories.map((parent) => {
                  const children = manageChildrenByParentId.get(parent.id) ?? [];
                  const isExpanded = manageSheetExpandedIds.has(parent.id);
                  return (
                    <View key={parent.id}>
                      <View style={styles.sheetRow}>
                        <TouchableOpacity onPress={() => toggleManageSheetExpanded(parent.id)} style={styles.sheetRowExpand}>
                          <Ionicons name={isExpanded ? "chevron-down" : "chevron-forward"} size={18} color={GatiMitraMerchant.textSecondary} />
                        </TouchableOpacity>
                        <Text style={styles.sheetRowLabel} numberOfLines={1}>{parent.category_name}</Text>
                        <View style={styles.sheetRowActions}>
                          <TouchableOpacity onPress={() => { setManageSheetVisible(false); router.push("/menu/categories" as any); }} hitSlop={8}>
                            <Ionicons name="pencil" size={18} color={GatiMitraMerchant.primary} />
                          </TouchableOpacity>
                          <TouchableOpacity onPress={() => handleDeleteCategoryFromSheet(parent)} hitSlop={8}>
                            <Ionicons name="trash-outline" size={18} color={GatiMitraMerchant.error} />
                          </TouchableOpacity>
                        </View>
                      </View>
                      {isExpanded && children.map((child) => (
                        <View key={child.id} style={styles.sheetSubRow}>
                          <Text style={styles.sheetSubRowLabel} numberOfLines={1}>{child.category_name}</Text>
                          <View style={styles.sheetRowActions}>
                            <TouchableOpacity onPress={() => { setManageSheetVisible(false); router.push("/menu/categories" as any); }} hitSlop={8}>
                              <Ionicons name="pencil" size={16} color={GatiMitraMerchant.primary} />
                            </TouchableOpacity>
                            <TouchableOpacity onPress={() => handleDeleteCategoryFromSheet(child)} hitSlop={8}>
                              <Ionicons name="trash-outline" size={16} color={GatiMitraMerchant.error} />
                            </TouchableOpacity>
                          </View>
                        </View>
                      ))}
                    </View>
                  );
                })
              )}
              <TouchableOpacity style={styles.sheetAddRow} onPress={() => { setManageSheetVisible(false); router.push("/menu/categories" as any); }}>
                <Ionicons name="add-circle-outline" size={20} color={GatiMitraMerchant.primary} />
                <Text style={styles.sheetAddRowText}>Add or edit categories & subcategories</Text>
              </TouchableOpacity>
              <Text style={[styles.sheetSectionLabel, { marginTop: 20 }]}>Combos</Text>
              <TouchableOpacity style={styles.sheetAddRow} onPress={() => { setManageSheetVisible(false); router.push("/menu/combos" as any); }}>
                <Ionicons name="layers-outline" size={20} color={GatiMitraMerchant.primary} />
                <Text style={styles.sheetAddRowText}>View & manage combos</Text>
              </TouchableOpacity>
            </ScrollView>
            <TouchableOpacity style={styles.sheetCloseBtn} onPress={() => setManageSheetVisible(false)}>
              <Text style={styles.sheetCloseBtnText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: GatiMitraMerchant.background },
  scrollView: { flex: 1 },
  content: { paddingHorizontal: H_PADDING, paddingTop: 20 },
  centered: { justifyContent: "center", alignItems: "center" },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 12,
  },
  searchWrap: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: GatiMitraMerchant.surfaceSubtle,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: "transparent",
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: GatiMitraMerchant.textPrimary,
    paddingVertical: 0,
  },
  addBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: GatiMitraMerchant.primary,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    ...GatiMitraMerchant.shadowSm,
  },
  addBtnText: { color: "#fff", fontWeight: "700", fontSize: 14 },
  filterSection: { marginBottom: 16 },
  filterRow: { flexDirection: "row", gap: 10, alignItems: "flex-end" },
  filterTriggerWrap: { flex: 1, minWidth: 0 },
  filterTriggerHalf: { flex: 1, minWidth: 0 },
  filterLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: GatiMitraMerchant.textTertiary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  filterCategoryTrigger: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: GatiMitraMerchant.cardBg,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    minHeight: 42,
  },
  filterCategoryTriggerText: {
    flex: 1,
    fontSize: 14,
    fontWeight: "600",
    color: GatiMitraMerchant.textPrimary,
  },
  filterChipsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 6,
    marginTop: 10,
  },
  filterChipLabel: {
    fontSize: 10,
    fontWeight: "700",
    color: GatiMitraMerchant.textTertiary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginRight: 4,
  },
  filterChip: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: GatiMitraMerchant.surfaceSubtle,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
  },
  filterChipActive: {
    backgroundColor: GatiMitraMerchant.primary,
    borderColor: GatiMitraMerchant.primary,
  },
  filterChipText: { fontSize: 13, fontWeight: "600", color: GatiMitraMerchant.textSecondary },
  filterChipTextActive: { color: "#fff" },
  filterSheet: {
    backgroundColor: GatiMitraMerchant.cardBg,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: H_PADDING,
    paddingTop: 12,
    maxHeight: "75%",
  },
  filterSheetTitle: { fontSize: 18, fontWeight: "800", color: GatiMitraMerchant.textPrimary, marginBottom: 12 },
  filterSheetSearchWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: GatiMitraMerchant.surfaceSubtle,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
  },
  filterSheetSearchInput: {
    flex: 1,
    fontSize: 15,
    color: GatiMitraMerchant.textPrimary,
    paddingVertical: 0,
  },
  filterSheetList: { maxHeight: 320 },
  filterSheetItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: GatiMitraMerchant.border,
  },
  filterSheetItemActive: { backgroundColor: GatiMitraMerchant.surfaceSubtle },
  filterSheetItemText: { fontSize: 15, fontWeight: "500", color: GatiMitraMerchant.textPrimary, flex: 1 },
  filterSheetItemTextActive: { fontWeight: "700", color: GatiMitraMerchant.primary },
  filterSheetEmpty: { fontSize: 14, color: GatiMitraMerchant.textSecondary, paddingVertical: 20, textAlign: "center" },
  filterSheetDone: {
    marginTop: 16,
    paddingVertical: 14,
    backgroundColor: GatiMitraMerchant.primary,
    borderRadius: 12,
    alignItems: "center",
  },
  filterSheetDoneText: { fontSize: 16, fontWeight: "700", color: "#fff" },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "center", alignItems: "center", padding: 24 },
  addMenuCard: {
    width: "100%",
    maxWidth: 340,
    backgroundColor: GatiMitraMerchant.cardBg,
    borderRadius: 20,
    padding: 24,
    ...GatiMitraMerchant.shadowSm,
  },
  addMenuTitle: { fontSize: 18, fontWeight: "800", color: GatiMitraMerchant.textPrimary, marginBottom: 16 },
  addMenuOption: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingVertical: 14,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: GatiMitraMerchant.border,
  },
  addMenuOptionText: { fontSize: 16, fontWeight: "600", color: GatiMitraMerchant.textPrimary, flex: 1 },
  addMenuDivider: { height: 1, backgroundColor: GatiMitraMerchant.border, marginVertical: 12 },
  addMenuSubtitle: { fontSize: 12, fontWeight: "700", color: GatiMitraMerchant.textTertiary, marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.5 },
  addMenuCancel: { marginTop: 16, paddingVertical: 12, alignItems: "center" },
  addMenuCancelText: { fontSize: 15, fontWeight: "600", color: GatiMitraMerchant.textSecondary },
  fab: {
    position: "absolute",
    right: H_PADDING,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: GatiMitraMerchant.primary,
    alignItems: "center",
    justifyContent: "center",
    ...GatiMitraMerchant.shadowSm,
  },
  sheetOverlay: { flex: 1, justifyContent: "flex-end" },
  sheetBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.35)" },
  sheet: {
    backgroundColor: GatiMitraMerchant.cardBg,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: H_PADDING,
    paddingTop: 12,
    maxHeight: "70%",
  },
  sheetHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: GatiMitraMerchant.border, alignSelf: "center", marginBottom: 16 },
  sheetTitle: { fontSize: 20, fontWeight: "800", color: GatiMitraMerchant.textPrimary, marginBottom: 16 },
  sheetScroll: { maxHeight: 320 },
  sheetSectionLabel: { fontSize: 12, fontWeight: "700", color: GatiMitraMerchant.textTertiary, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 },
  sheetEmpty: { fontSize: 14, color: GatiMitraMerchant.textSecondary, marginBottom: 12 },
  sheetRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: GatiMitraMerchant.border,
  },
  sheetRowExpand: { padding: 4, marginRight: 4 },
  sheetRowLabel: { fontSize: 15, fontWeight: "600", color: GatiMitraMerchant.textPrimary, flex: 1 },
  sheetRowActions: { flexDirection: "row", alignItems: "center", gap: 16 },
  sheetSubRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingLeft: 28,
    borderBottomWidth: 1,
    borderBottomColor: GatiMitraMerchant.border,
    backgroundColor: GatiMitraMerchant.surfaceSubtle,
  },
  sheetSubRowLabel: { fontSize: 14, color: GatiMitraMerchant.textPrimary, flex: 1 },
  sheetAddRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 14,
    marginTop: 4,
  },
  sheetAddRowText: { fontSize: 15, fontWeight: "600", color: GatiMitraMerchant.primary },
  sheetCloseBtn: { marginTop: 16, paddingVertical: 14, backgroundColor: GatiMitraMerchant.surfaceSubtle, borderRadius: 12, alignItems: "center" },
  sheetCloseBtnText: { fontSize: 15, fontWeight: "700", color: GatiMitraMerchant.textPrimary },
  errorWrap: { marginBottom: 12 },
  errorText: { fontSize: 13, color: GatiMitraMerchant.error },
  section: { gap: 12 },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: GatiMitraMerchant.textPrimary,
    marginBottom: 10,
    letterSpacing: -0.2,
  },
  loadingWrap: { paddingVertical: 40, alignItems: "center" },
  emptyCard: {
    backgroundColor: GatiMitraMerchant.surfaceSubtle,
    borderRadius: CARD_RADIUS,
    paddingVertical: 32,
    alignItems: "center",
    gap: 12,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
  },
  emptyText: { fontSize: 14, color: GatiMitraMerchant.textSecondary, textAlign: "center" },
  itemGrid: { gap: 12 },
  itemCard: {
    backgroundColor: GatiMitraMerchant.cardBg,
    borderRadius: CARD_RADIUS,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
    ...GatiMitraMerchant.shadowSm,
  },
  itemTouchable: { flexDirection: "row", padding: 14 },
  itemImageWrap: { position: "relative", marginRight: 14 },
  itemImage: { width: 72, height: 72, borderRadius: 12 },
  itemImagePlaceholder: {
    width: 72,
    height: 72,
    borderRadius: 12,
    backgroundColor: GatiMitraMerchant.surfaceWarm,
    alignItems: "center",
    justifyContent: "center",
  },
  pendingBadge: {
    position: "absolute",
    top: 4,
    right: 4,
    backgroundColor: GatiMitraMerchant.warning,
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 6,
  },
  pendingBadgeText: { fontSize: 10, fontWeight: "700", color: "#fff" },
  rejectedBadge: {
    position: "absolute",
    top: 4,
    right: 4,
    backgroundColor: GatiMitraMerchant.error,
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 6,
  },
  rejectedBadgeText: { fontSize: 10, fontWeight: "700", color: "#fff" },
  itemBody: { flex: 1, minWidth: 0, justifyContent: "center" },
  itemName: { fontSize: 16, fontWeight: "700", color: GatiMitraMerchant.textPrimary },
  itemMeta: { fontSize: 13, color: GatiMitraMerchant.textSecondary, marginTop: 2 },
  tagsRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 8 },
  tag: { backgroundColor: GatiMitraMerchant.surfaceWarm, paddingVertical: 2, paddingHorizontal: 8, borderRadius: 6 },
  tagText: { fontSize: 11, fontWeight: "600", color: GatiMitraMerchant.textSecondary },
  itemFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: GatiMitraMerchant.border,
    backgroundColor: GatiMitraMerchant.surfaceSubtle,
  },
  editBtn: { flexDirection: "row", alignItems: "center", gap: 4 },
  editBtnText: { fontSize: 13, fontWeight: "600", color: GatiMitraMerchant.primary },
  stockChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 14,
    backgroundColor: "#d1fae5",
  },
  stockChipOff: { backgroundColor: "#fee2e2" },
  stockDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: GatiMitraMerchant.success },
  stockDotOff: { backgroundColor: GatiMitraMerchant.error },
  stockChipText: { fontSize: 12, fontWeight: "600", color: GatiMitraMerchant.success },
  stockChipTextOff: { color: GatiMitraMerchant.error },
});
