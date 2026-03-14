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
  Switch,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
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
import type { MenuItemRow, MenuCategory, MenuItemDetail } from "@/services/menuApi";
import type { ComboRow, ComboDetail } from "@/services/menuApi";
import {
  deleteMenuItem,
  createDeleteRequest,
  deleteCombo,
  fetchCombos,
  fetchCombo,
  fetchMenuItem,
} from "@/services/menuApi";
import { resolveImageUrl } from "@/services/outletApi";
import { useRouter } from "expo-router";

type ApprovalFilter = "ALL" | "PENDING" | "APPROVED" | "REJECTED";
type StockFilter = "ALL" | "IN_STOCK" | "OUT_OF_STOCK";
type ChangeRequestFilter = "ALL" | "DELETE" | "UPDATE";
type ItemKindFilter = "ALL" | "ITEMS" | "COMBOS";

const FOOD_TYPE_LABELS: Record<string, string> = {
  VEG: "Veg",
  NON_VEG: "Non-Veg",
  EGG: "Egg",
  VEGAN: "Vegan",
};

function MenuItemCard({
  item,
  categoryName,
  onToggleStock,
  onEdit,
  onMoreOptions,
  storeId,
  token,
}: {
  item: MenuItemRow;
  categoryName: string | null;
  onToggleStock: (id: number, inStock: boolean) => void;
  onEdit: (id: number) => void;
  onMoreOptions: (item: MenuItemRow) => void;
  storeId: string | null;
  token: string | null;
}) {
  const [toggling, setToggling] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [showOptions, setShowOptions] = useState(false);
  const sellingNum = Number(item.selling_price);
  const baseNum = Number(item.base_price);
  const hasDiscount = baseNum > sellingNum && baseNum > 0;
  const sellingFormatted = `₹${sellingNum.toFixed(0)}`;
  const baseFormatted = baseNum > 0 ? `₹${baseNum.toFixed(0)}` : null;
  const prepMins = item.preparation_time_minutes != null ? item.preparation_time_minutes : null;
  const foodTypeLabel = item.food_type ? (FOOD_TYPE_LABELS[item.food_type] ?? item.food_type) : null;
  const tags: string[] = [];
  if (item.has_variants) tags.push("Variants");
  if (item.has_customizations) tags.push("Customizations");
  if (item.has_addons) tags.push("Add-ons");

  const imageUri = resolveImageUrl(item.item_image_url);
  const showImage = imageUri && !imageError;

  const handleToggle = () => {
    if (toggling) return;

    const nextInStock = !item.in_stock;
    const title = nextInStock ? "Mark item as in stock?" : "Mark item as out of stock?";
    const message = nextInStock
      ? `Customers will be able to order "${item.item_name}".`
      : `Customers will not be able to order "${item.item_name}".`;

    Alert.alert(title, message, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Yes, proceed",
        style: "default",
        onPress: () => {
          setToggling(true);
          onToggleStock(item.id, nextInStock);
          setToggling(false);
        },
      },
    ]);
  };

  const {
    data: detail,
    isLoading: detailLoading,
  } = useQuery<MenuItemDetail | null>({
    queryKey: ["menu", "item-card", storeId, item.id],
    queryFn: () => fetchMenuItem(storeId!, item.id, token!),
    enabled: Boolean(showOptions && storeId && token),
  });

  const variantsCount = detail?.variants?.length ?? 0;
  const groupsCount = detail?.customizations?.length ?? 0;
  const addonsCount =
    detail?.customizations?.reduce((acc, g) => acc + (g.options?.length ?? 0), 0) ?? 0;
  const hasAnyOptions = variantsCount + groupsCount + addonsCount > 0;

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
              <Ionicons name="restaurant-outline" size={32} color={GatiMitraMerchant.primary} />
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
          {item.has_pending_change_request && (
            <View style={styles.changeRequestedBadge}>
              <Text style={styles.changeRequestedBadgeText}>
                {item.pending_change_request_type === "DELETE" ? "Delete requested" : item.pending_change_request_type === "UPDATE" ? "Edit requested" : "Change requested"}
              </Text>
            </View>
          )}
        </View>
        <View style={styles.itemBody}>
          <View style={styles.itemHeaderRow}>
            <Text style={styles.itemName} numberOfLines={2}>
              {item.item_name}
            </Text>
            <View style={styles.itemHeaderActions}>
              <TouchableOpacity
                onPress={() => onMoreOptions(item)}
                style={styles.moreBtn}
                hitSlop={8}
              >
                <Ionicons
                  name="ellipsis-vertical"
                  size={18}
                  color={GatiMitraMerchant.textSecondary}
                />
              </TouchableOpacity>
              <View style={styles.stockToggleWrap}>
                <Switch
                  value={item.in_stock}
                  onValueChange={handleToggle}
                  disabled={toggling}
                  trackColor={{
                    false: GatiMitraMerchant.border,
                    true: GatiMitraMerchant.primary,
                  }}
                  thumbColor="#fff"
                />
              </View>
            </View>
          </View>
          {item.item_description?.trim() ? (
            <Text style={styles.itemDescription} numberOfLines={2}>
              {item.item_description.trim()}
            </Text>
          ) : null}
          <View style={styles.itemMetaRow}>
            <Text style={styles.itemMetaText} numberOfLines={1}>
              {categoryName ?? "Uncategorised"}
              {foodTypeLabel ? ` · ${foodTypeLabel}` : ""}
              {prepMins != null && prepMins > 0 ? ` · ${prepMins} min` : ""}
            </Text>
          </View>
          {(item.serves_label != null && item.serves_label.trim() !== "") || (item.serves != null && item.serves > 0) || (item.item_size_value != null && item.item_size_value > 0) || (item.item_size_unit != null && item.item_size_unit.trim() !== "") ? (
            <View style={styles.itemServeSizeRow}>
              {item.serves_label != null && item.serves_label.trim() !== "" ? (
                <Text style={styles.itemServeSizeText}>{item.serves_label.trim()}</Text>
              ) : item.serves != null && item.serves > 0 ? (
                <Text style={styles.itemServeSizeText}>{item.serves} {item.serves === 1 ? "person" : "people"}</Text>
              ) : null}
              {((item.serves_label != null && item.serves_label.trim() !== "") || (item.serves != null && item.serves > 0)) && (item.item_size_value != null || (item.item_size_unit != null && item.item_size_unit.trim() !== "")) ? (
                <Text style={styles.itemServeSizeText}> · </Text>
              ) : null}
              {item.item_size_value != null && item.item_size_value > 0 && item.item_size_unit != null && item.item_size_unit.trim() !== "" ? (
                <Text style={styles.itemServeSizeText}>{Number(item.item_size_value) === Math.floor(Number(item.item_size_value)) ? String(Math.floor(Number(item.item_size_value))) : Number(item.item_size_value)} {item.item_size_unit.trim()}</Text>
              ) : item.item_size_value != null && item.item_size_value > 0 ? (
                <Text style={styles.itemServeSizeText}>{Number(item.item_size_value) === Math.floor(Number(item.item_size_value)) ? String(Math.floor(Number(item.item_size_value))) : Number(item.item_size_value)}</Text>
              ) : item.item_size_unit != null && item.item_size_unit.trim() !== "" ? (
                <Text style={styles.itemServeSizeText}>{item.item_size_unit.trim()}</Text>
              ) : null}
            </View>
          ) : null}
          <View style={styles.priceRow}>
            <Text style={styles.sellingPrice}>{sellingFormatted}</Text>
            {hasDiscount && baseFormatted ? (
              <Text style={styles.basePriceStrike}>{baseFormatted}</Text>
            ) : null}
          </View>
          {hasAnyOptions && (
            <TouchableOpacity
              onPress={() => setShowOptions((v) => !v)}
              activeOpacity={0.8}
            >
              <Text style={styles.optionsSummaryText} numberOfLines={1}>
                {variantsCount
                  ? `${variantsCount} variant${variantsCount > 1 ? "s" : ""}`
                  : ""}
                {groupsCount
                  ? `${variantsCount ? " · " : ""}${groupsCount} customization group${
                      groupsCount > 1 ? "s" : ""
                    }`
                  : ""}
                {addonsCount
                  ? `${variantsCount || groupsCount ? " · " : ""}${addonsCount} add-on${
                      addonsCount > 1 ? "s" : ""
                    }`
                  : ""}
                {showOptions ? " · Hide" : " · See details"}
              </Text>
            </TouchableOpacity>
          )}
          {showOptions && (
            <View style={styles.optionsDetails}>
              {detailLoading ? (
                <ActivityIndicator
                  size="small"
                  color={GatiMitraMerchant.primary}
                />
              ) : detail ? (
                <>
                  {detail.variants?.length ? (
                    <View style={styles.optionsRow}>
                      <Text style={styles.optionsLabel}>Variants:</Text>
                      <Text style={styles.optionsValue} numberOfLines={2}>
                        {detail.variants.map((v) => v.variant_name).join(", ")}
                      </Text>
                    </View>
                  ) : null}
                  {detail.customizations?.length ? (
                    <View style={styles.optionsRow}>
                      <Text style={styles.optionsLabel}>Customizations:</Text>
                      <View style={styles.optionsValueColumn}>
                        {detail.customizations.slice(0, 3).map((g) => (
                          <Text
                            key={g.id}
                            style={styles.optionsValue}
                            numberOfLines={1}
                          >
                            {g.customization_title} · {g.options.length} option
                            {g.options.length > 1 ? "s" : ""}
                          </Text>
                        ))}
                        {detail.customizations.length > 3 && (
                          <Text style={styles.optionsMoreText}>
                            +{detail.customizations.length - 3} more groups
                          </Text>
                        )}
                      </View>
                    </View>
                  ) : null}
                </>
              ) : null}
            </View>
          )}
          {tags.length > 0 ? (
            <View style={styles.tagsRow}>
              {tags.map((t) => (
                <View key={t} style={styles.tag}>
                  <Text style={styles.tagText}>{t}</Text>
                </View>
              ))}
            </View>
          ) : null}
        </View>
      </TouchableOpacity>
    </View>
  );
}

function ComboCard({
  combo,
  detail,
  itemById,
  onPress,
  isDisabled,
  onMoreOptions,
}: {
  combo: ComboRow;
  detail: ComboDetail | null;
  itemById: Map<number, MenuItemRow>;
  onPress: () => void;
  isDisabled: boolean;
  onMoreOptions: () => void;
}) {
  const [imageError, setImageError] = useState(false);

  const components = detail?.components ?? [];
  const componentItems = components.map((comp) => {
    const item = itemById.get(comp.menu_item_id);
    const price = item ? Number(item.selling_price) || 0 : 0;
    return { comp, item, price };
  });

  componentItems.sort((a, b) => b.price - a.price);
  const topComponents = componentItems.slice(0, 3);

  const imageUris = topComponents
    .map((ci) =>
      ci.item?.item_image_url
        ? resolveImageUrl(ci.item.item_image_url) ?? ci.item.item_image_url
        : null
    )
    .filter((u): u is string => Boolean(u) && !imageError);

  const lines = components.map((comp) => {
    const item = itemById.get(comp.menu_item_id);
    const name = item?.item_name ?? `Item #${comp.menu_item_id}`;
    const qty = comp.quantity ?? 1;
    return `${name} × ${qty}`;
  });

  const maxLinesToShow = 3;
  const shownLines = lines.slice(0, maxLinesToShow);
  const remainingCount = lines.length - shownLines.length;

  const comboPrice = `₹${Number(combo.combo_price).toFixed(0)}`;

  return (
    <View style={[styles.itemCard, isDisabled && styles.comboCardDisabled]}>
      <TouchableOpacity
        style={styles.itemTouchable}
        onPress={onPress}
        activeOpacity={0.85}
      >
        <View style={styles.itemImageWrap}>
          <View style={styles.comboImageStack}>
            {imageUris.length === 0 ? (
              <View style={styles.itemImagePlaceholder}>
                <Ionicons
                  name="layers-outline"
                  size={32}
                  color={GatiMitraMerchant.primary}
                />
              </View>
            ) : imageUris.length === 1 ? (
              <Image
                source={{ uri: imageUris[0] }}
                style={styles.comboImageSingle}
                resizeMode="cover"
                onError={() => setImageError(true)}
              />
            ) : (
              <View style={styles.comboImageGrid}>
                {imageUris.slice(0, 3).map((uri, idx) => (
                  <Image
                    key={`${uri}-${idx}`}
                    source={{ uri }}
                    style={styles.comboImageGridCell}
                    resizeMode="cover"
                    onError={() => setImageError(true)}
                  />
                ))}
              </View>
            )}
          </View>
          <View style={styles.comboBadge}>
            <Text style={styles.comboBadgeText}>Combo</Text>
          </View>
        </View>
        <View style={styles.itemBody}>
          <View style={styles.itemHeaderRow}>
            <Text style={styles.itemName} numberOfLines={2}>
              {combo.combo_name}
            </Text>
            <View style={styles.itemHeaderActions}>
              <TouchableOpacity
                onPress={onMoreOptions}
                style={styles.moreBtn}
                hitSlop={8}
              >
                <Ionicons
                  name="ellipsis-vertical"
                  size={18}
                  color={GatiMitraMerchant.textSecondary}
                />
              </TouchableOpacity>
            </View>
          </View>
          {combo.description?.trim() ? (
            <Text style={styles.itemDescription} numberOfLines={2}>
              {combo.description.trim()}
            </Text>
          ) : null}
          {shownLines.length > 0 ? (
            <View style={styles.comboItemsList}>
              {shownLines.map((line) => (
                <Text key={line} style={styles.comboItemLine} numberOfLines={1}>
                  {line}
                </Text>
              ))}
              {remainingCount > 0 && (
                <Text style={styles.comboItemMore} numberOfLines={1}>
                  +{remainingCount} more
                </Text>
              )}
            </View>
          ) : null}
          <View style={styles.priceRow}>
            <Text
              style={[
                styles.sellingPrice,
                isDisabled && styles.comboPriceDisabled,
              ]}
            >
              {comboPrice}
            </Text>
            {isDisabled && (
              <Text style={styles.comboUnavailableText}>
                Not available · an item is out of stock
              </Text>
            )}
          </View>
        </View>
      </TouchableOpacity>
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
  const [changeRequestFilter, setChangeRequestFilter] = useState<ChangeRequestFilter>("ALL");
  const [kindFilter, setKindFilter] = useState<ItemKindFilter>("ALL");
  const [filtersVisible, setFiltersVisible] = useState(false);
  const [search, setSearch] = useState("");
  const [searchDebounced, setSearchDebounced] = useState("");
  const [addMenuVisible, setAddMenuVisible] = useState(false);
  const [manageSheetVisible, setManageSheetVisible] = useState(false);
  const [categoryFilterSheetVisible, setCategoryFilterSheetVisible] = useState(false);
  const [subcategoryFilterSheetVisible, setSubcategoryFilterSheetVisible] = useState(false);
  const [statusFilterSheetVisible, setStatusFilterSheetVisible] = useState(false);
  const [stockFilterSheetVisible, setStockFilterSheetVisible] = useState(false);
  const [changeRequestFilterSheetVisible, setChangeRequestFilterSheetVisible] = useState(false);
  const [categorySearch, setCategorySearch] = useState("");
  const [manageSheetExpandedIds, setManageSheetExpandedIds] = useState<Set<number>>(new Set());
  const [itemAction, setItemAction] = useState<{ type: "delete" | "request-delete"; itemId: number; itemName: string } | null>(null);

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
    changeRequestType: changeRequestFilter === "ALL" ? undefined : changeRequestFilter,
  };
  const { data: itemsData, isLoading: itemsLoading, error: itemsError, refetch: refetchItems, isRefetching: itemsRefetching } = useMenuItems(storeId, token, itemsFilters);
  const items = itemsData?.items ?? [];
  const total = itemsData?.total ?? 0;

  const itemById = useMemo(() => {
    const map = new Map<number, MenuItemRow>();
    for (const it of items) map.set(it.id, it);
    return map;
  }, [items]);

  const [combos, setCombos] = useState<ComboRow[]>([]);
  const [comboDetails, setComboDetails] = useState<Map<number, ComboDetail>>(new Map());
  const [combosLoading, setCombosLoading] = useState(false);

  useEffect(() => {
    if (!storeId || !token) return;
    const canShowCombosUnderFilters = effectiveCategoryId == null && !searchDebounced;
    if (!canShowCombosUnderFilters) {
      setCombos([]);
      setComboDetails(new Map());
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        setCombosLoading(true);
        const res = await fetchCombos(storeId, token);
        if (cancelled) return;
        const rows = res.combos ?? [];
        setCombos(rows);

        const detailEntries = await Promise.all(
          rows.map(async (c) => {
            try {
              const d = await fetchCombo(storeId, c.id, token);
              return d ? [c.id, d] as const : null;
            } catch {
              return null;
            }
          })
        );
        if (cancelled) return;
        const map = new Map<number, ComboDetail>();
        for (const entry of detailEntries) {
          if (!entry) continue;
          map.set(entry[0], entry[1]);
        }
        setComboDetails(map);
      } finally {
        if (!cancelled) setCombosLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [storeId, token, effectiveCategoryId, searchDebounced]);

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

  const handleOpenItemDetails = useCallback(
    (itemId: number) => {
      router.push({ pathname: "/menu/item-details/[id]", params: { id: String(itemId) } } as any);
    },
    [router]
  );

  const handleMoreOptions = useCallback(
    (item: MenuItemRow) => {
      const isApproved = item.approval_status === "APPROVED";
      const deleteAction = isApproved
        ? {
            text: "Request delete",
            style: "destructive" as const,
            onPress: () => {
              Alert.alert(
                "Request delete?",
                `Submit a delete request for "${item.item_name}"? An agent will review it.`,
                [
                  { text: "Cancel", style: "cancel" },
                  {
                    text: "Request delete",
                    style: "destructive",
                    onPress: () => {
                      if (!storeId || !token) return;
                      setItemAction({ type: "request-delete", itemId: item.id, itemName: item.item_name });
                      (async () => {
                        try {
                          await createDeleteRequest(storeId, item.id, token);
                          await refetchItems();
                          setItemAction(null);
                          Alert.alert("Request sent", "Delete request submitted. An agent will review it.");
                        } catch (e) {
                          setItemAction(null);
                          Alert.alert(
                            "Request failed",
                            e instanceof Error ? e.message : "Could not submit delete request."
                          );
                        }
                      })();
                    },
                  },
                ]
              );
            },
          }
        : {
            text: "Delete item",
            style: "destructive" as const,
            onPress: () => {
              Alert.alert(
                "Delete item?",
                `Remove "${item.item_name}" from your menu? This cannot be undone.`,
                [
                  { text: "Cancel", style: "cancel" },
                  {
                    text: "Delete",
                    style: "destructive",
                    onPress: () => {
                      if (!storeId || !token) return;
                      setItemAction({ type: "delete", itemId: item.id, itemName: item.item_name });
                      (async () => {
                        try {
                          await deleteMenuItem(storeId, item.id, token);
                          await refetchItems();
                          setItemAction(null);
                        } catch (e) {
                          setItemAction(null);
                          Alert.alert(
                            "Delete failed",
                            e instanceof Error ? e.message : "Could not delete item. Please try again."
                          );
                        }
                      })();
                    },
                  },
                ]
              );
            },
          };
      Alert.alert(
        "Item options",
        item.item_name,
        [
          {
            text: "Edit details & images",
            onPress: () =>
              router.push({
                pathname: "/menu/add-edit-item",
                params: { itemId: String(item.id) },
              } as any),
          },
          deleteAction,
          { text: "Cancel", style: "cancel" },
        ],
        { cancelable: true }
      );
    },
    [storeId, token, refetchItems, router]
  );

  const handleComboOptions = useCallback(
    (combo: ComboRow) => {
      Alert.alert(
        "Combo options",
        combo.combo_name,
        [
          {
            text: "Edit combo",
            onPress: () =>
              router.push({
                pathname: "/menu/combos/[id]",
                params: { id: String(combo.id) },
              } as any),
          },
          {
            text: "Delete combo",
            style: "destructive",
            onPress: () => {
              if (!storeId || !token) return;
              Alert.alert(
                "Delete combo?",
                `Remove "${combo.combo_name}" from your catalog? This cannot be undone.`,
                [
                  { text: "Cancel", style: "cancel" },
                  {
                    text: "Delete",
                    style: "destructive",
                    onPress: async () => {
                      try {
                        await deleteCombo(storeId, combo.id, token);
                        const res = await fetchCombos(storeId, token);
                        setCombos(res.combos ?? []);
                      } catch (e) {
                        Alert.alert(
                          "Delete failed",
                          e instanceof Error
                            ? e.message
                            : "Could not delete combo. Please try again."
                        );
                      }
                    },
                  },
                ]
              );
            },
          },
          { text: "Cancel", style: "cancel" },
        ],
        { cancelable: true }
      );
    },
    [router, storeId, token]
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

  const canShowCombosUnderFilters = effectiveCategoryId == null && !searchDebounced;
  const showItems = kindFilter !== "COMBOS";
  const showCombos = kindFilter !== "ITEMS" && canShowCombosUnderFilters;
  const validCombos = useMemo(
    () =>
      combos.filter((c) => {
        const detail = comboDetails.get(c.id);
        return detail?.components && detail.components.length >= 2;
      }),
    [combos, comboDetails]
  );
  const totalDisplayed = (showItems ? total : 0) + (showCombos ? validCombos.length : 0);

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
      {itemAction != null && (
        <Modal visible transparent animationType="fade" statusBarTranslucent>
          <View style={styles.actionOverlay}>
            <View style={styles.actionLoaderCard}>
              <ActivityIndicator size="large" color={GatiMitraMerchant.primary} />
              <Text style={styles.actionLoaderText}>
                {itemAction.type === "delete" ? "Deleting item…" : "Submitting request…"}
              </Text>
            </View>
          </View>
        </Modal>
      )}
    <ScrollView
      style={styles.scrollView}
      contentContainerStyle={[styles.content, { paddingBottom: scrollBottomPadding }]}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={GatiMitraMerchant.primary} />
      }
    >
      {/* Top bar: add + search + filter icon — compact row */}
      <View style={styles.topBar}>
        <TouchableOpacity
          style={[styles.addBtn, GatiMitraMerchant.cursorPointer]}
          onPress={() => setAddMenuVisible(true)}
          activeOpacity={0.85}
        >
          <Ionicons name="add" size={20} color="#fff" />
          <Text style={styles.addBtnText}>Add</Text>
        </TouchableOpacity>
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
          style={styles.filterIconBtn}
          onPress={() => setFiltersVisible((v) => !v)}
          activeOpacity={0.85}
          hitSlop={8}
        >
          <Ionicons
            name="options-outline"
            size={20}
            color={filtersVisible ? GatiMitraMerchant.primary : GatiMitraMerchant.textSecondary}
          />
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
            <TouchableOpacity style={styles.addMenuOption} onPress={() => { setAddMenuVisible(false); router.push("/menu/addon-library" as any); }} activeOpacity={0.7}>
              <Ionicons name="pricetag-outline" size={22} color={GatiMitraMerchant.primary} />
              <Text style={styles.addMenuOptionText}>Addon group</Text>
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
            <TouchableOpacity style={styles.addMenuOption} onPress={() => { setAddMenuVisible(false); router.push("/menu/addon-library" as any); }} activeOpacity={0.7}>
              <Ionicons name="pricetag-outline" size={22} color={GatiMitraMerchant.textSecondary} />
              <Text style={styles.addMenuOptionText}>Addon Library</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.addMenuCancel} onPress={() => setAddMenuVisible(false)}>
              <Text style={styles.addMenuCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>

      {/* Filters: revealed by filter icon — compact layout */}
      {filtersVisible && (
        <View style={styles.filterSection}>
          <View style={styles.filterRow}>
            <View style={[styles.filterTriggerWrap, subcategoriesOfSelected.length > 0 ? styles.filterTriggerHalf : undefined]}>
              <Text style={styles.filterLabel}>Category</Text>
              <TouchableOpacity
                style={styles.filterCategoryTrigger}
                onPress={() => setCategoryFilterSheetVisible(true)}
                activeOpacity={0.8}
              >
                <Ionicons name="folder-open-outline" size={14} color={GatiMitraMerchant.primary} />
                <Text style={styles.filterCategoryTriggerText} numberOfLines={1}>{selectedCategoryLabel}</Text>
                <Ionicons name="chevron-down" size={14} color={GatiMitraMerchant.textSecondary} />
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
                  <Ionicons name="git-branch-outline" size={14} color={GatiMitraMerchant.primary} />
                  <Text style={styles.filterCategoryTriggerText} numberOfLines={1}>{selectedSubcategoryLabel}</Text>
                  <Ionicons name="chevron-down" size={14} color={GatiMitraMerchant.textSecondary} />
                </TouchableOpacity>
              </View>
            ) : null}
          </View>
          <View style={styles.filterRow}>
            <View style={styles.filterTriggerThird}>
              <Text style={styles.filterLabel}>Status</Text>
              <TouchableOpacity
                style={styles.filterCategoryTrigger}
                onPress={() => setStatusFilterSheetVisible(true)}
                activeOpacity={0.8}
              >
                <Text style={styles.filterCategoryTriggerText} numberOfLines={1}>
                  {approvalFilter === "ALL" ? "All" : approvalFilter === "PENDING" ? "Pending" : approvalFilter === "APPROVED" ? "Approved" : "Rejected"}
                </Text>
                <Ionicons name="chevron-down" size={14} color={GatiMitraMerchant.textSecondary} />
              </TouchableOpacity>
            </View>
            <View style={styles.filterTriggerThird}>
              <Text style={styles.filterLabel}>Stock</Text>
              <TouchableOpacity
                style={styles.filterCategoryTrigger}
                onPress={() => setStockFilterSheetVisible(true)}
                activeOpacity={0.8}
              >
                <Text style={styles.filterCategoryTriggerText} numberOfLines={1}>
                  {stockFilter === "ALL" ? "All" : stockFilter === "IN_STOCK" ? "In stock" : "Out of stock"}
                </Text>
                <Ionicons name="chevron-down" size={14} color={GatiMitraMerchant.textSecondary} />
              </TouchableOpacity>
            </View>
            <View style={styles.filterTriggerThird}>
              <Text style={styles.filterLabel}>Change</Text>
              <TouchableOpacity
                style={styles.filterCategoryTrigger}
                onPress={() => setChangeRequestFilterSheetVisible(true)}
                activeOpacity={0.8}
              >
                <Text style={styles.filterCategoryTriggerText} numberOfLines={1}>
                  {changeRequestFilter === "ALL" ? "All" : changeRequestFilter === "DELETE" ? "Delete requested" : "Edit requested"}
                </Text>
                <Ionicons name="chevron-down" size={14} color={GatiMitraMerchant.textSecondary} />
              </TouchableOpacity>
            </View>
          </View>
          <View style={styles.filterChipsRow}>
            <Text style={styles.filterChipLabel}>Show</Text>
            {(["ALL", "ITEMS", "COMBOS"] as ItemKindFilter[]).map((k) => (
              <TouchableOpacity
                key={k}
                style={[
                  styles.filterChip,
                  kindFilter === k && styles.filterChipActive,
                ]}
                onPress={() => setKindFilter(k)}
                activeOpacity={0.8}
              >
                <Text
                  style={[
                    styles.filterChipText,
                    kindFilter === k && styles.filterChipTextActive,
                  ]}
                >
                  {k === "ALL" ? "Items & combos" : k === "ITEMS" ? "Items only" : "Combos only"}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}

      {/* Status filter sheet */}
      <Modal visible={statusFilterSheetVisible} transparent animationType="slide">
        <View style={styles.sheetOverlay}>
          <Pressable style={styles.sheetBackdrop} onPress={() => setStatusFilterSheetVisible(false)} />
          <View style={[styles.filterSheet, { paddingBottom: insets.bottom + 24 }]}>
            <View style={styles.sheetHandle} />
            <Text style={styles.filterSheetTitle}>Filter by status</Text>
            <ScrollView style={styles.filterSheetList} showsVerticalScrollIndicator={false}>
              {(["ALL", "PENDING", "APPROVED", "REJECTED"] as ApprovalFilter[]).map((f) => (
                <TouchableOpacity
                  key={f}
                  style={[styles.filterSheetItem, approvalFilter === f && styles.filterSheetItemActive]}
                  onPress={() => { setApprovalFilter(f); setStatusFilterSheetVisible(false); }}
                >
                  <Text style={[styles.filterSheetItemText, approvalFilter === f && styles.filterSheetItemTextActive]}>
                    {f === "ALL" ? "All" : f === "PENDING" ? "Pending" : f === "APPROVED" ? "Approved" : "Rejected"}
                  </Text>
                  {approvalFilter === f && <Ionicons name="checkmark-circle" size={20} color={GatiMitraMerchant.primary} />}
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity style={styles.filterSheetDone} onPress={() => setStatusFilterSheetVisible(false)}>
              <Text style={styles.filterSheetDoneText}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Stock filter sheet */}
      <Modal visible={stockFilterSheetVisible} transparent animationType="slide">
        <View style={styles.sheetOverlay}>
          <Pressable style={styles.sheetBackdrop} onPress={() => setStockFilterSheetVisible(false)} />
          <View style={[styles.filterSheet, { paddingBottom: insets.bottom + 24 }]}>
            <View style={styles.sheetHandle} />
            <Text style={styles.filterSheetTitle}>Filter by stock</Text>
            <ScrollView style={styles.filterSheetList} showsVerticalScrollIndicator={false}>
              {(["ALL", "IN_STOCK", "OUT_OF_STOCK"] as StockFilter[]).map((f) => (
                <TouchableOpacity
                  key={f}
                  style={[styles.filterSheetItem, stockFilter === f && styles.filterSheetItemActive]}
                  onPress={() => { setStockFilter(f); setStockFilterSheetVisible(false); }}
                >
                  <Text style={[styles.filterSheetItemText, stockFilter === f && styles.filterSheetItemTextActive]}>
                    {f === "ALL" ? "All" : f === "IN_STOCK" ? "In stock" : "Out of stock"}
                  </Text>
                  {stockFilter === f && <Ionicons name="checkmark-circle" size={20} color={GatiMitraMerchant.primary} />}
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity style={styles.filterSheetDone} onPress={() => setStockFilterSheetVisible(false)}>
              <Text style={styles.filterSheetDoneText}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Change request filter sheet */}
      <Modal visible={changeRequestFilterSheetVisible} transparent animationType="slide">
        <View style={styles.sheetOverlay}>
          <Pressable style={styles.sheetBackdrop} onPress={() => setChangeRequestFilterSheetVisible(false)} />
          <View style={[styles.filterSheet, { paddingBottom: insets.bottom + 24 }]}>
            <View style={styles.sheetHandle} />
            <Text style={styles.filterSheetTitle}>Filter by change request</Text>
            <ScrollView style={styles.filterSheetList} showsVerticalScrollIndicator={false}>
              {(["ALL", "DELETE", "UPDATE"] as ChangeRequestFilter[]).map((f) => (
                <TouchableOpacity
                  key={f}
                  style={[styles.filterSheetItem, changeRequestFilter === f && styles.filterSheetItemActive]}
                  onPress={() => { setChangeRequestFilter(f); setChangeRequestFilterSheetVisible(false); }}
                >
                  <Text style={[styles.filterSheetItemText, changeRequestFilter === f && styles.filterSheetItemTextActive]}>
                    {f === "ALL" ? "All" : f === "DELETE" ? "Delete requested" : "Edit requested"}
                  </Text>
                  {changeRequestFilter === f && <Ionicons name="checkmark-circle" size={20} color={GatiMitraMerchant.primary} />}
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity style={styles.filterSheetDone} onPress={() => setChangeRequestFilterSheetVisible(false)}>
              <Text style={styles.filterSheetDoneText}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

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
          {effectiveCategoryId != null
            ? categoryMap.get(effectiveCategoryId) ?? "Items"
            : "All items & combos"} · {totalDisplayed}
        </Text>
        {loading && !items.length && (!showCombos || combosLoading) ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator size="large" color={GatiMitraMerchant.primary} />
          </View>
        ) : !loading && !items.length && (!showCombos || combos.length === 0) ? (
          <View style={styles.emptyCard}>
            <Ionicons name="restaurant-outline" size={36} color={GatiMitraMerchant.textTertiary} />
            <Text style={styles.emptyText}>No items match. Add an item or change filters.</Text>
          </View>
        ) : (
          <View style={styles.itemGrid}>
            {showItems &&
              items.map((item) => (
                <MenuItemCard
                  key={item.id}
                  item={item}
                  categoryName={item.category_id != null ? categoryMap.get(item.category_id) ?? null : null}
                  onToggleStock={handleToggleStock}
                  onEdit={handleOpenItemDetails}
                  onMoreOptions={handleMoreOptions}
                  storeId={storeId}
                  token={token}
                />
              ))}
            {showCombos &&
              validCombos.map((combo) => {
                const detail = comboDetails.get(combo.id) ?? null;
                const hasUnavailableItem =
                  detail?.components?.some((c) => {
                    const item = itemById.get(c.menu_item_id);
                    return item && !item.in_stock;
                  }) ?? false;

                return (
                  <ComboCard
                    key={`combo-${combo.id}`}
                    combo={combo}
                    detail={detail}
                    itemById={itemById}
                    isDisabled={hasUnavailableItem}
                    onMoreOptions={() => handleComboOptions(combo)}
                    onPress={() =>
                      router.push({
                        pathname: "/menu/combos/[id]",
                        params: { id: String(combo.id) },
                      } as any)
                    }
                  />
                );
              })}
          </View>
        )}
      </View>
    </ScrollView>

      {/* FAB: fixed position just above tab bar — moved slightly lower so it does not cover item toggles */}
      <TouchableOpacity
        style={[styles.fab, { bottom: TAB_BAR_HEIGHT - 6 }]}
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
    gap: 8,
    marginBottom: 8,
  },
  searchWrap: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: GatiMitraMerchant.surfaceSubtle,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: "transparent",
    gap: 6,
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
    gap: 4,
    backgroundColor: GatiMitraMerchant.primary,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
    ...GatiMitraMerchant.shadowSm,
  },
  addBtnText: { color: "#fff", fontWeight: "700", fontSize: 14 },
  filterIconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: GatiMitraMerchant.cardBg,
  },
  filterSection: {
    marginBottom: 10,
    paddingHorizontal: 4,
  },
  filterRow: { flexDirection: "row", gap: 10, alignItems: "flex-end" },
  filterTriggerWrap: { flex: 1, minWidth: 0 },
  filterTriggerHalf: { flex: 1, minWidth: 0 },
  filterTriggerThird: { flex: 1, minWidth: 0 },
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
    gap: 6,
    backgroundColor: GatiMitraMerchant.cardBg,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
    borderRadius: 10,
    paddingVertical: 6,
    paddingHorizontal: 10,
    minHeight: 34,
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
    paddingVertical: 10,
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
  actionOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", alignItems: "center", padding: 24 },
  actionLoaderCard: {
    backgroundColor: GatiMitraMerchant.cardBg,
    borderRadius: 16,
    padding: 28,
    alignItems: "center",
    gap: 16,
    minWidth: 200,
    ...GatiMitraMerchant.shadowSm,
  },
  actionLoaderText: { fontSize: 15, fontWeight: "600", color: GatiMitraMerchant.textPrimary },
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
  itemImageWrap: { position: "relative", marginRight: 10 },
  itemImage: { width: 88, height: 88, borderRadius: 12 },
  itemImagePlaceholder: {
    width: 88,
    height: 88,
    borderRadius: 12,
    backgroundColor: GatiMitraMerchant.surfaceWarm,
    alignItems: "center",
    justifyContent: "center",
  },
  comboImageStack: {
    width: 88,
    height: 88,
    borderRadius: 12,
    backgroundColor: GatiMitraMerchant.surfaceWarm,
    overflow: "hidden",
    position: "relative",
  },
  comboImageSingle: { width: "100%", height: "100%" },
  comboImageGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    width: "100%",
    height: "100%",
  },
  comboImageGridCell: {
    width: "50%",
    height: "50%",
  },
  comboBadge: {
    position: "absolute",
    bottom: 4,
    right: 4,
    backgroundColor: "#0ea5e9",
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 6,
  },
  comboBadgeText: { fontSize: 10, fontWeight: "700", color: "#fff" },
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
  changeRequestedBadge: {
    position: "absolute",
    bottom: 4,
    left: 4,
    backgroundColor: "#6366f1",
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 6,
  },
  changeRequestedBadgeText: { fontSize: 9, fontWeight: "700", color: "#fff" },
  itemBody: { flex: 1, minWidth: 0, justifyContent: "center", gap: 2 },
  itemHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  itemHeaderActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  itemName: {
    flex: 1,
    fontSize: 17,
    fontWeight: "800",
    color: GatiMitraMerchant.textPrimary,
    letterSpacing: -0.3,
    lineHeight: 20,
  },
  itemDescription: { fontSize: 13, color: GatiMitraMerchant.textSecondary, lineHeight: 18, marginTop: 0 },
  itemMetaRow: { marginTop: 0 },
  itemMetaText: { fontSize: 12, color: GatiMitraMerchant.textSecondary },
  itemServeSizeRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", marginTop: 2 },
  itemServeSizeText: { fontSize: 12, color: GatiMitraMerchant.textTertiary },
  comboItemsList: { marginTop: 4, gap: 2 },
  comboItemLine: { fontSize: 12, color: GatiMitraMerchant.textSecondary },
  comboItemMore: { fontSize: 12, color: GatiMitraMerchant.textTertiary, fontStyle: "italic" },
  priceRow: { flexDirection: "row", alignItems: "baseline", gap: 8, marginTop: 6 },
  sellingPrice: { fontSize: 20, fontWeight: "800", color: GatiMitraMerchant.primary, letterSpacing: -0.3 },
  basePriceStrike: { fontSize: 14, color: GatiMitraMerchant.textSecondary, textDecorationLine: "line-through" },
  comboPriceDisabled: { color: GatiMitraMerchant.textSecondary },
  comboUnavailableText: {
    fontSize: 11,
    color: GatiMitraMerchant.error,
    fontWeight: "600",
  },
  optionsSummaryText: {
    marginTop: 4,
    fontSize: 12,
    color: GatiMitraMerchant.textSecondary,
  },
  optionsDetails: {
    marginTop: 4,
    padding: 6,
    borderRadius: 8,
    backgroundColor: GatiMitraMerchant.surfaceSubtle,
    gap: 4,
  },
  optionsRow: {
    flexDirection: "row",
    gap: 4,
    alignItems: "flex-start",
  },
  optionsLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: GatiMitraMerchant.textSecondary,
  },
  optionsValueColumn: {
    flex: 1,
    gap: 2,
  },
  optionsValue: {
    flex: 1,
    fontSize: 12,
    color: GatiMitraMerchant.textSecondary,
  },
  optionsMoreText: {
    fontSize: 11,
    color: GatiMitraMerchant.textTertiary,
    fontStyle: "italic",
  },
  tagsRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 8 },
  tag: { backgroundColor: GatiMitraMerchant.surfaceWarm, paddingVertical: 3, paddingHorizontal: 8, borderRadius: 6 },
  tagText: { fontSize: 11, fontWeight: "600", color: GatiMitraMerchant.textSecondary },
  comboCardDisabled: {
    opacity: 0.75,
  },
  moreBtn: { paddingHorizontal: 4, paddingVertical: 4 },
  stockToggleWrap: {},
});
