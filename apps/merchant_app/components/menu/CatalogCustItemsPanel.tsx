/**
 * Add-ons catalog tab — Partner Site "Cust" view: variants, customization add-ons, linked modifier groups with OOS toggles.
 */

import { useMemo, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  Switch,
  Image,
  ActivityIndicator,
  Pressable,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { MenuItemRow, MenuItemDetail } from "@/services/menuApi";
import {
  updateVariant,
  updateCustomizationOption,
  updateModifierOption,
} from "@/services/menuApi";
import { resolveImageUrl } from "@/services/outletApi";
import { GatiMitraMerchant, CARD_RADIUS } from "@/constants/theme";

export function itemHasCustomizationContent(item: MenuItemRow): boolean {
  return Boolean(item.has_customizations || item.has_variants || item.has_addons);
}

type CustTargetType = "variant" | "addon" | "modifier_option";

type Props = {
  items: MenuItemRow[];
  detailsById: Record<number, MenuItemDetail>;
  storeId: string;
  token: string;
  categoryNameById: Map<number, string>;
  searchQuery: string;
  onOpenItem: (itemId: number) => void;
  onDetailsChange: (itemId: number, detail: MenuItemDetail) => void;
};

function formatRs(value: string | number | null | undefined): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return "₹0";
  return `₹${Math.round(n)}`;
}

export function CatalogCustItemsPanel({
  items,
  detailsById,
  storeId,
  token,
  categoryNameById,
  searchQuery,
  onOpenItem,
  onDetailsChange,
}: Props) {
  const [stockBusy, setStockBusy] = useState<string | null>(null);

  const scopedItems = useMemo(() => {
    let list = items.filter(itemHasCustomizationContent);
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (i) =>
          i.item_name.toLowerCase().includes(q) ||
          String(i.item_id ?? "").toLowerCase().includes(q)
      );
    }
    return list;
  }, [items, searchQuery]);

  const handleOptionStockToggle = useCallback(
    async (
      itemId: number,
      detail: MenuItemDetail,
      targetType: CustTargetType,
      optionId: number,
      inStock: boolean
    ) => {
      const busyKey = `${targetType}-${optionId}`;
      setStockBusy(busyKey);
      try {
        if (targetType === "variant") {
          await updateVariant(storeId, optionId, token, { in_stock: inStock });
          onDetailsChange(itemId, {
            ...detail,
            variants: (detail.variants ?? []).map((v) =>
              v.id === optionId ? { ...v, in_stock: inStock } : v
            ),
          });
        } else if (targetType === "addon") {
          await updateCustomizationOption(storeId, optionId, token, { in_stock: inStock });
          onDetailsChange(itemId, {
            ...detail,
            customizations: (detail.customizations ?? []).map((g) => ({
              ...g,
              options: (g.options ?? []).map((o) =>
                o.id === optionId ? { ...o, in_stock: inStock } : o
              ),
            })),
          });
        } else {
          await updateModifierOption(storeId, optionId, token, { in_stock: inStock });
          onDetailsChange(itemId, {
            ...detail,
            linked_modifier_groups: (detail.linked_modifier_groups ?? []).map((g) => ({
              ...g,
              options: (g.options ?? []).map((o) =>
                o.id === optionId ? { ...o, in_stock: inStock } : o
              ),
            })),
          });
        }
      } finally {
        setStockBusy(null);
      }
    },
    [storeId, token, onDetailsChange]
  );

  if (scopedItems.length === 0) {
    return (
      <View style={styles.emptyCard}>
        <Ionicons name="options-outline" size={36} color={GatiMitraMerchant.textTertiary} />
        <Text style={styles.emptyText}>
          {searchQuery.trim()
            ? "No add-ons match your search"
            : "Items with variants or add-ons will appear here"}
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      {scopedItems.map((item) => {
        const detail = detailsById[item.id];
        const categoryName =
          item.category_id != null
            ? categoryNameById.get(item.category_id) ?? "Uncategorized"
            : "Uncategorized";
        const imageUri = resolveImageUrl(item.item_image_url);
        const variants = detail?.variants ?? [];
        const custGroups = detail?.customizations ?? [];
        const linkedGroups = detail?.linked_modifier_groups ?? [];
        const hasContent =
          variants.length > 0 || custGroups.length > 0 || linkedGroups.length > 0;

        return (
          <View key={item.id} style={styles.itemCard}>
            <Pressable
              onPress={() => onOpenItem(item.id)}
              style={({ pressed }) => [styles.itemHeader, pressed && styles.pressed]}
            >
              <View style={styles.itemThumb}>
                {imageUri ? (
                  <Image source={{ uri: imageUri }} style={styles.itemThumbImg} resizeMode="cover" />
                ) : (
                  <Ionicons name="restaurant-outline" size={22} color={GatiMitraMerchant.textTertiary} />
                )}
              </View>
              <View style={styles.itemHeaderText}>
                <Text style={styles.itemName} numberOfLines={2}>
                  {item.item_name}
                </Text>
                <Text style={styles.itemCategory} numberOfLines={1}>
                  {categoryName}
                </Text>
              </View>
              <Text style={styles.itemPrice}>{formatRs(item.selling_price)}</Text>
            </Pressable>

            {!detail ? (
              <View style={styles.itemLoadingRow}>
                <ActivityIndicator size="small" color={GatiMitraMerchant.primary} />
                <Text style={styles.itemLoadingText}>Loading options…</Text>
              </View>
            ) : !hasContent ? (
              <Text style={styles.noOptionsHint}>
                Customization flags set — open item to view full details.
              </Text>
            ) : (
              <View style={styles.optionsWrap}>
                {variants.length > 0 ? (
                  <View style={styles.section}>
                    <Text style={[styles.sectionLabel, styles.sectionLabelVariant]}>Variants</Text>
                    {variants.map((v) => {
                      const inStock = v.in_stock !== false;
                      const busy = stockBusy === `variant-${v.id}`;
                      return (
                        <View key={v.id ?? v.variant_id} style={[styles.optionRow, styles.optionRowVariant]}>
                          <Text style={styles.optionName} numberOfLines={2}>
                            {v.variant_name || v.variant_type || "Variant"}
                          </Text>
                          <Text style={styles.optionPrice}>{formatRs(v.variant_price)}</Text>
                          {v.id ? (
                            <Switch
                              value={inStock}
                              disabled={busy}
                              onValueChange={(next) =>
                                void handleOptionStockToggle(item.id, detail, "variant", v.id, next)
                              }
                              trackColor={{ false: "#E2E8F0", true: GatiMitraMerchant.primary }}
                              thumbColor="#FFFFFF"
                            />
                          ) : null}
                        </View>
                      );
                    })}
                  </View>
                ) : null}

                {custGroups.length > 0 ? (
                  <View style={styles.section}>
                    <Text style={[styles.sectionLabel, styles.sectionLabelCust]}>Add-ons / Customizations</Text>
                    {custGroups.map((group) => (
                      <View key={group.id ?? group.customization_id} style={styles.groupCard}>
                        <View style={styles.groupHeader}>
                          <Text style={styles.groupTitle} numberOfLines={1}>
                            {group.customization_title}
                          </Text>
                          <Text style={styles.groupType}>
                            {group.is_required ? "Required" : "Optional"}
                          </Text>
                        </View>
                        {(group.options ?? []).map((opt) => {
                          const inStock = opt.in_stock !== false;
                          const busy = stockBusy === `addon-${opt.id}`;
                          return (
                            <View key={opt.id ?? opt.addon_id} style={styles.optionRow}>
                              <Text style={styles.optionName} numberOfLines={2}>
                                {opt.addon_name}
                              </Text>
                              <Text style={styles.optionPrice}>{formatRs(opt.addon_price)}</Text>
                              {opt.id ? (
                                <Switch
                                  value={inStock}
                                  disabled={busy}
                                  onValueChange={(next) =>
                                    void handleOptionStockToggle(item.id, detail, "addon", opt.id, next)
                                  }
                                  trackColor={{ false: "#E2E8F0", true: GatiMitraMerchant.primary }}
                                  thumbColor="#FFFFFF"
                                />
                              ) : null}
                            </View>
                          );
                        })}
                      </View>
                    ))}
                  </View>
                ) : null}

                {linkedGroups.length > 0 ? (
                  <View style={styles.section}>
                    <Text style={[styles.sectionLabel, styles.sectionLabelLinked]}>Linked add-on groups</Text>
                    {linkedGroups.map((group) => (
                      <View key={group.id ?? group.modifier_group_id} style={[styles.groupCard, styles.groupCardLinked]}>
                        <View style={styles.groupHeader}>
                          <Text style={styles.groupTitle} numberOfLines={1}>
                            {group.title}
                          </Text>
                          <Text style={styles.groupType}>
                            {group.max_selection === 1 ? "Single" : "Multiple"}
                          </Text>
                        </View>
                        {(group.options ?? []).map((opt) => {
                          const inStock = opt.in_stock !== false;
                          const busy = stockBusy === `modifier_option-${opt.id}`;
                          return (
                            <View key={opt.id ?? opt.option_id} style={styles.optionRow}>
                              <Text style={styles.optionName} numberOfLines={2}>
                                {opt.name}
                              </Text>
                              <Text style={styles.optionPrice}>{formatRs(opt.price_delta)}</Text>
                              {opt.id ? (
                                <Switch
                                  value={inStock}
                                  disabled={busy}
                                  onValueChange={(next) =>
                                    void handleOptionStockToggle(
                                      item.id,
                                      detail,
                                      "modifier_option",
                                      opt.id,
                                      next
                                    )
                                  }
                                  trackColor={{ false: "#E2E8F0", true: GatiMitraMerchant.primary }}
                                  thumbColor="#FFFFFF"
                                />
                              ) : null}
                            </View>
                          );
                        })}
                      </View>
                    ))}
                  </View>
                ) : null}
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 12 },
  emptyCard: {
    backgroundColor: GatiMitraMerchant.surfaceSubtle,
    borderRadius: CARD_RADIUS,
    paddingVertical: 32,
    alignItems: "center",
    gap: 12,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
  },
  emptyText: {
    fontSize: 14,
    color: GatiMitraMerchant.textTertiary,
    textAlign: "center",
    paddingHorizontal: 24,
    lineHeight: 20,
  },
  itemCard: {
    backgroundColor: GatiMitraMerchant.cardBg,
    borderRadius: CARD_RADIUS,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
    overflow: "hidden",
    ...GatiMitraMerchant.shadowSm,
  },
  itemHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
    backgroundColor: GatiMitraMerchant.surfaceSubtle,
    borderBottomWidth: 1,
    borderBottomColor: GatiMitraMerchant.divider,
  },
  pressed: { opacity: 0.88 },
  itemThumb: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: GatiMitraMerchant.border,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  itemThumbImg: { width: "100%", height: "100%" },
  itemHeaderText: { flex: 1, minWidth: 0 },
  itemName: { fontSize: 14, fontWeight: "700", color: GatiMitraMerchant.textPrimary },
  itemCategory: {
    marginTop: 2,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.4,
    textTransform: "uppercase",
    color: GatiMitraMerchant.textTertiary,
  },
  itemPrice: { fontSize: 14, fontWeight: "800", color: GatiMitraMerchant.primaryDark },
  itemLoadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 14,
  },
  itemLoadingText: { fontSize: 13, color: GatiMitraMerchant.textSecondary },
  noOptionsHint: {
    padding: 14,
    fontSize: 12,
    color: GatiMitraMerchant.textTertiary,
  },
  optionsWrap: { padding: 12, gap: 12 },
  section: { gap: 8 },
  sectionLabel: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  sectionLabelVariant: { color: "#4338CA" },
  sectionLabelCust: { color: "#1D4ED8" },
  sectionLabelLinked: { color: "#6D28D9" },
  groupCard: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#BFDBFE",
    backgroundColor: "#EFF6FF",
    padding: 10,
    gap: 6,
  },
  groupCardLinked: {
    borderColor: "#DDD6FE",
    backgroundColor: "#F5F3FF",
  },
  groupHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    marginBottom: 2,
  },
  groupTitle: { flex: 1, fontSize: 13, fontWeight: "700", color: GatiMitraMerchant.textPrimary },
  groupType: {
    fontSize: 10,
    fontWeight: "600",
    color: GatiMitraMerchant.textSecondary,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    overflow: "hidden",
  },
  optionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#FFFFFF",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: GatiMitraMerchant.border,
  },
  optionRowVariant: {
    borderColor: "#C7D2FE",
    backgroundColor: "#EEF2FF",
  },
  optionName: { flex: 1, fontSize: 13, fontWeight: "600", color: GatiMitraMerchant.textPrimary },
  optionPrice: { fontSize: 13, fontWeight: "700", color: GatiMitraMerchant.textPrimary },
});
