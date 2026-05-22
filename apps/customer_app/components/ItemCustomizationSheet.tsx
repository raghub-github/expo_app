/**
 * DB-driven item customization bottom sheet — Zomato-style UI, GatiMitra mint accents.
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Pressable,
  ScrollView,
  Image,
  ActivityIndicator,
  useWindowDimensions,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons, Feather } from "@expo/vector-icons";
import { StoreTheme } from "@/constants/storeTheme";
import { DietIndicator } from "@/components/store/DietIndicator";
import { MenuItemImagePlaceholder } from "@/components/store/MenuItemImagePlaceholder";
import type { MenuItem, MenuItemFullConfig } from "@/services/merchant.service";
import { merchantService } from "@/services/merchant.service";

const SHEET_MAX_HEIGHT_RATIO = 0.78;
const SECTION_CARD_RADIUS = 12;

export type ItemCustomizationInitialSelection = {
  variantId?: string | null;
  addons?: Array<{ addonId: string }>;
  quantity?: number;
};

export type ItemCustomizationSheetProps = {
  visible: boolean;
  onClose: () => void;
  storeId: string;
  item: MenuItem;
  merchantName: string;
  isStoreClosed?: boolean;
  /** Pre-select variant/addons/qty when editing from checkout cart. */
  initialSelection?: ItemCustomizationInitialSelection | null;
  onAdd: (params: {
    menuItemId: string;
    name: string;
    price: number;
    quantity: number;
    isVeg: boolean;
    basePrice?: number;
    variantId?: string;
    variantName?: string;
    addons?: Array<{ addonId: string; addonName: string; addonPrice: number; quantity: number }>;
    imageUrl?: string | null;
  }) => void;
};

function sectionSubtitle(isRequired: boolean, maxSelection: number): string {
  if (isRequired && maxSelection === 1) return "Required • Select any 1 option";
  if (isRequired) return `Required • Select up to ${maxSelection} options`;
  if (maxSelection === 1) return "Select any 1 option";
  return `Select up to ${maxSelection} options`;
}

/** API accepts merchant_menu_items.item_id; cart often stores numeric menuItemId PK instead. */
function resolveFullConfigItemId(item: MenuItem): string {
  const idStr = String(item.id ?? "").trim();
  const pkStr = item.menuItemId != null ? String(item.menuItemId) : "";
  if (idStr && idStr !== pkStr) return idStr;
  return pkStr || idStr;
}

export function ItemCustomizationSheet({
  visible,
  onClose,
  storeId,
  item,
  merchantName,
  isStoreClosed = false,
  initialSelection = null,
  onAdd,
}: ItemCustomizationSheetProps) {
  const insets = useSafeAreaInsets();
  const { height: screenHeight } = useWindowDimensions();
  const sheetMaxHeight = Math.round(screenHeight * SHEET_MAX_HEIGHT_RATIO);

  const [config, setConfig] = useState<MenuItemFullConfig | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(null);
  const [selectedAddons, setSelectedAddons] = useState<Record<string, string[]>>({});
  const [quantity, setQuantity] = useState(1);

  const hasConfigFlags = item.hasVariants || item.hasAddons || item.hasCustomizations;
  const configItemKey = resolveFullConfigItemId(item);
  const isEditMode = initialSelection != null;

  useEffect(() => {
    if (!visible || !storeId || !configItemKey) {
      setConfig(null);
      return;
    }
    setLoading(true);
    setSelectedAddons({});
    setQuantity(initialSelection?.quantity ?? 1);
    setSelectedVariantId(null);
    merchantService
      .getMenuItemFullConfig(storeId, configItemKey)
      .then((c) => {
        setConfig(c);
        const addonIdsFromCart = new Set(
          (initialSelection?.addons ?? []).map((a) => String(a.addonId))
        );

        if (c?.variants?.length) {
          const fromCart =
            initialSelection?.variantId &&
            c.variants.some((v) => v.id === initialSelection.variantId)
              ? initialSelection.variantId
              : null;
          const defaultVariant = c.variants.find((v) => v.isDefault) ?? c.variants[0];
          setSelectedVariantId(fromCart ?? defaultVariant?.id ?? null);
        }

        if (c?.customizations?.length && addonIdsFromCart.size > 0) {
          const next: Record<string, string[]> = {};
          for (const group of c.customizations) {
            const picked = group.addons
              .filter((a) => addonIdsFromCart.has(String(a.id)))
              .map((a) => a.id);
            if (picked.length) next[group.id] = picked;
          }
          setSelectedAddons(next);
        }
      })
      .finally(() => setLoading(false));
  }, [visible, storeId, configItemKey, initialSelection]);

  const variantPrice = useMemo(() => {
    if (!config?.variants?.length) return config?.item?.price ?? item.price;
    const v = config.variants.find((x) => x.id === selectedVariantId);
    return v ? v.price : config.variants[0]?.price ?? item.price;
  }, [config, selectedVariantId, item.price]);

  const addonsTotal = useMemo(() => {
    if (!config?.customizations) return 0;
    let total = 0;
    config.customizations.forEach((c) => {
      (selectedAddons[c.id] ?? []).forEach((addonId) => {
        const addon = c.addons.find((a) => a.id === addonId);
        if (addon) total += addon.price;
      });
    });
    return total;
  }, [config, selectedAddons]);

  const totalPrice = (variantPrice + addonsTotal) * quantity;

  const requiredVariantSelected = useMemo(() => {
    if (!config?.variants?.length) return true;
    return selectedVariantId != null;
  }, [config?.variants?.length, selectedVariantId]);

  const requiredCustomizationsMet = useMemo(() => {
    if (!config?.customizations) return true;
    return config.customizations.every((c) => {
      if (!c.isRequired) return true;
      const count = (selectedAddons[c.id] ?? []).length;
      return count >= c.minSelection;
    });
  }, [config?.customizations, selectedAddons]);

  const canAdd = !isStoreClosed && requiredVariantSelected && requiredCustomizationsMet;

  const toggleAddon = useCallback(
    (customizationId: string, addonId: string) => {
      setSelectedAddons((prev) => {
        const list = prev[customizationId] ?? [];
        const max = config?.customizations.find((c) => c.id === customizationId)?.maxSelection ?? 1;
        if (list.includes(addonId)) {
          return { ...prev, [customizationId]: list.filter((id) => id !== addonId) };
        }
        if (max === 1) {
          return { ...prev, [customizationId]: [addonId] };
        }
        if (list.length >= max) return prev;
        return { ...prev, [customizationId]: [...list, addonId] };
      });
    },
    [config?.customizations]
  );

  const handleAdd = useCallback(() => {
    if (!canAdd) return;
    const addonIds = config?.customizations?.flatMap((c) => selectedAddons[c.id] ?? []) ?? [];
    const addonsList: Array<{ addonId: string; addonName: string; addonPrice: number; quantity: number }> = [];
    config?.customizations?.forEach((c) => {
      (selectedAddons[c.id] ?? []).forEach((addonId) => {
        const addon = c.addons.find((a) => a.id === addonId);
        if (addon) {
          addonsList.push({
            addonId: addon.id,
            addonName: addon.name,
            addonPrice: addon.price,
            quantity: 1,
          });
        }
      });
    });
    const variant =
      config?.variants?.length && selectedVariantId
        ? config.variants.find((v) => v.id === selectedVariantId)
        : null;
    const baseMenuItemId = String(item.menuItemId != null ? item.menuItemId : item.id);
    onAdd({
      menuItemId: config?.variants?.length
        ? `${baseMenuItemId}_${selectedVariantId ?? ""}_${addonIds.sort().join(",")}`
        : baseMenuItemId,
      name: item.name,
      price: totalPrice / quantity,
      quantity,
      isVeg: item.isVeg,
      basePrice: variant ? variant.price : (config?.item?.price ?? item.price),
      variantId: selectedVariantId ?? undefined,
      variantName: variant?.name,
      addons: addonsList.length ? addonsList : undefined,
      imageUrl: config?.item?.imageUrl ?? item.imageUrl ?? null,
    });
    onClose();
  }, [canAdd, config, item, selectedVariantId, selectedAddons, quantity, totalPrice, onAdd, onClose]);

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
      presentationStyle="overFullScreen"
    >
      <View style={styles.root}>
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityRole="button" />

        <View style={[styles.anchor, { maxHeight: sheetMaxHeight }]}>
          <TouchableOpacity style={styles.closeBtn} onPress={onClose} hitSlop={12} activeOpacity={0.85}>
            <Ionicons name="close" size={22} color="#fff" />
          </TouchableOpacity>

          <View style={[styles.sheet, { maxHeight: sheetMaxHeight - 54 }]}>
            {loading ? (
              <View style={styles.loadingWrap}>
                <ActivityIndicator size="large" color={StoreTheme.accentMint} />
                <Text style={styles.loadingText}>Loading options…</Text>
              </View>
            ) : (
              <View style={styles.sheetBody}>
                <View style={styles.header}>
                  <View style={styles.headerImageWrap}>
                    {item.imageUrl ? (
                      <Image source={{ uri: item.imageUrl }} style={styles.headerImage} resizeMode="cover" />
                    ) : (
                      <MenuItemImagePlaceholder size="sm" />
                    )}
                    <View style={styles.dietOnThumb}>
                      <DietIndicator type={item.isVeg ? "veg" : "nonveg"} />
                    </View>
                  </View>

                  <Text style={styles.headerName} numberOfLines={2}>
                    {item.name}
                  </Text>

                  <View style={styles.headerIcons}>
                    <TouchableOpacity hitSlop={8} style={styles.headerIconCircle} activeOpacity={0.75}>
                      <Ionicons name="bookmark-outline" size={18} color={StoreTheme.textPrimary} />
                    </TouchableOpacity>
                    <TouchableOpacity hitSlop={8} style={styles.headerIconCircle} activeOpacity={0.75}>
                      <Feather name="share-2" size={17} color={StoreTheme.textPrimary} />
                    </TouchableOpacity>
                  </View>
                </View>

                <ScrollView
                  style={[styles.scroll, { maxHeight: Math.max(sheetMaxHeight - 200, 180) }]}
                  contentContainerStyle={styles.scrollContent}
                  showsVerticalScrollIndicator={false}
                  keyboardShouldPersistTaps="handled"
                >
                  {config?.variants && config.variants.length > 0 ? (
                    <View style={styles.sectionCard}>
                      <Text style={styles.sectionTitle}>Quantity</Text>
                      <Text style={styles.sectionSub}>Required • Select any 1 option</Text>
                      {config.variants.map((v, idx) => {
                        const selected = selectedVariantId === v.id;
                        return (
                          <TouchableOpacity
                            key={v.id}
                            style={[styles.optionRow, idx > 0 && styles.optionRowBorder]}
                            onPress={() => setSelectedVariantId(v.id)}
                            activeOpacity={0.75}
                          >
                            <Text style={styles.optionLabel} numberOfLines={2}>
                              {v.name}
                            </Text>
                            <Text style={styles.optionPrice}>₹{Math.round(v.price)}</Text>
                            <View style={[styles.radioOuter, selected && styles.radioOuterSelected]}>
                              {selected ? <View style={styles.radioInner} /> : null}
                            </View>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  ) : null}

                  {!loading &&
                  !config?.variants?.length &&
                  !config?.customizations?.length ? (
                    <View style={styles.sectionCard}>
                      <Text style={styles.sectionSub}>
                        {hasConfigFlags
                          ? "Customization options could not be loaded. Try again."
                          : "No customization options are available for this item right now."}
                      </Text>
                    </View>
                  ) : null}

                  {config?.customizations?.map((c) => (
                    <View key={c.id} style={styles.sectionCard}>
                      <Text style={styles.sectionTitle}>{c.title}</Text>
                      <Text style={styles.sectionSub}>
                        {sectionSubtitle(c.isRequired, c.maxSelection)}
                      </Text>
                      {c.addons.map((a, idx) => {
                        const selected = (selectedAddons[c.id] ?? []).includes(a.id);
                        const atMax = (selectedAddons[c.id] ?? []).length >= c.maxSelection;
                        const disabled = !selected && atMax;
                        const showMostOrdered = a.isMostOrdered === true;
                        const isSingleSelect = c.maxSelection === 1;
                        return (
                          <TouchableOpacity
                            key={a.id}
                            style={[styles.addonRow, idx > 0 && styles.optionRowBorder]}
                            onPress={() => !disabled && toggleAddon(c.id, a.id)}
                            activeOpacity={0.75}
                            disabled={disabled}
                          >
                            <View style={styles.addonImageCol}>
                              {showMostOrdered ? (
                                <View style={styles.mostOrderedBadge}>
                                  <Text style={styles.mostOrderedText} numberOfLines={1}>
                                    Most Ordered
                                  </Text>
                                </View>
                              ) : null}
                              <View style={styles.addonImageWrap}>
                                {a.imageUrl ? (
                                  <Image
                                    source={{ uri: a.imageUrl }}
                                    style={styles.addonImage}
                                    resizeMode="cover"
                                  />
                                ) : (
                                  <MenuItemImagePlaceholder size="sm" />
                                )}
                                <View style={styles.dietOnAddon}>
                                  <DietIndicator type="veg" />
                                </View>
                              </View>
                            </View>
                            <Text
                              style={[styles.addonLabel, disabled && styles.addonLabelDisabled]}
                              numberOfLines={2}
                            >
                              {a.name}
                            </Text>
                            <Text style={styles.addonPrice}>₹{Math.round(a.price)}</Text>
                            {isSingleSelect ? (
                              <View style={[styles.radioOuter, selected && styles.radioOuterSelected]}>
                                {selected ? <View style={styles.radioInner} /> : null}
                              </View>
                            ) : (
                              <View
                                style={[
                                  styles.checkboxOuter,
                                  selected && styles.checkboxOuterSelected,
                                  disabled && styles.checkboxOuterDisabled,
                                ]}
                              >
                                {selected ? (
                                  <Ionicons name="checkmark" size={13} color="#fff" />
                                ) : null}
                              </View>
                            )}
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  ))}
                </ScrollView>

                <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 10) }]}>
                  <View style={styles.qtyRow}>
                    <TouchableOpacity
                      style={styles.qtyBtn}
                      onPress={() => setQuantity((q) => Math.max(1, q - 1))}
                      disabled={quantity <= 1}
                      hitSlop={6}
                    >
                      <Ionicons
                        name="remove"
                        size={18}
                        color={quantity <= 1 ? StoreTheme.textMuted : StoreTheme.accentMint}
                      />
                    </TouchableOpacity>
                    <Text style={styles.qtyValue}>{quantity}</Text>
                    <TouchableOpacity
                      style={styles.qtyBtn}
                      onPress={() => setQuantity((q) => q + 1)}
                      hitSlop={6}
                    >
                      <Ionicons name="add" size={18} color={StoreTheme.accentMint} />
                    </TouchableOpacity>
                  </View>

                  <TouchableOpacity
                    onPress={handleAdd}
                    disabled={!canAdd}
                    style={[styles.addBtn, !canAdd && styles.addBtnDisabled]}
                    activeOpacity={0.9}
                  >
                    <Text style={styles.addBtnText}>
                      {isStoreClosed
                        ? "Store closed"
                        : isEditMode
                          ? `Update item  ₹${Math.round(totalPrice)}`
                          : `Add item  ₹${Math.round(totalPrice)}`}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const THUMB = 56;
const ADDON_IMG = 44;

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: "flex-end",
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  anchor: {
    width: "100%",
    alignItems: "center",
  },
  closeBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(0,0,0,0.78)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
    ...(Platform.OS === "android"
      ? { elevation: 8 }
      : {
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.25,
          shadowRadius: 4,
        }),
  },
  sheet: {
    width: "100%",
    backgroundColor: "#fff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    overflow: "hidden",
  },
  sheetBody: {
    flexDirection: "column",
    flexShrink: 1,
    minHeight: 0,
  },
  loadingWrap: {
    paddingVertical: 48,
    alignItems: "center",
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
    color: StoreTheme.textSecondary,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: StoreTheme.border,
  },
  headerImageWrap: {
    width: THUMB,
    height: THUMB,
    borderRadius: 10,
    overflow: "hidden",
    backgroundColor: "#F3F4F6",
    position: "relative",
  },
  headerImage: {
    width: "100%",
    height: "100%",
  },
  dietOnThumb: {
    position: "absolute",
    top: 4,
    left: 4,
    backgroundColor: "#fff",
    borderRadius: 2,
    padding: 1,
  },
  headerName: {
    flex: 1,
    fontSize: 16,
    fontWeight: "700",
    color: StoreTheme.textPrimary,
    lineHeight: 21,
  },
  headerIcons: {
    flexDirection: "row",
    gap: 8,
    flexShrink: 0,
  },
  headerIconCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: StoreTheme.border,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
  },
  scroll: {
    flexGrow: 0,
    flexShrink: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 12,
    gap: 12,
  },
  sectionCard: {
    borderWidth: 1,
    borderColor: StoreTheme.border,
    borderRadius: SECTION_CARD_RADIUS,
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 6,
    backgroundColor: "#fff",
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: StoreTheme.textPrimary,
    marginBottom: 2,
  },
  sectionSub: {
    fontSize: 12,
    color: StoreTheme.textSecondary,
    marginBottom: 10,
    lineHeight: 16,
  },
  optionRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    gap: 10,
  },
  optionRowBorder: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: StoreTheme.border,
  },
  optionLabel: {
    flex: 1,
    fontSize: 14,
    fontWeight: "500",
    color: StoreTheme.textPrimary,
    lineHeight: 19,
  },
  optionPrice: {
    fontSize: 14,
    fontWeight: "600",
    color: StoreTheme.textPrimary,
    minWidth: 44,
    textAlign: "right",
  },
  radioOuter: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: "#D1D5DB",
    alignItems: "center",
    justifyContent: "center",
  },
  radioOuterSelected: {
    borderColor: StoreTheme.accentMint,
  },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: StoreTheme.accentMint,
  },
  addonRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    gap: 10,
  },
  addonImageCol: {
    width: ADDON_IMG,
    alignItems: "center",
    position: "relative",
    paddingTop: 8,
  },
  mostOrderedBadge: {
    position: "absolute",
    top: 0,
    left: -6,
    right: -6,
    zIndex: 2,
    backgroundColor: StoreTheme.accentRed,
    borderRadius: 3,
    paddingHorizontal: 3,
    paddingVertical: 2,
    alignItems: "center",
  },
  mostOrderedText: {
    fontSize: 7,
    fontWeight: "800",
    color: "#fff",
    letterSpacing: 0,
    includeFontPadding: false,
  },
  addonImageWrap: {
    width: ADDON_IMG,
    height: ADDON_IMG,
    borderRadius: 8,
    overflow: "hidden",
    backgroundColor: "#F3F4F6",
    position: "relative",
  },
  addonImage: {
    width: "100%",
    height: "100%",
  },
  dietOnAddon: {
    position: "absolute",
    top: 3,
    left: 3,
    backgroundColor: "#fff",
    borderRadius: 2,
    padding: 1,
  },
  addonLabel: {
    flex: 1,
    fontSize: 14,
    fontWeight: "500",
    color: StoreTheme.textPrimary,
    lineHeight: 19,
  },
  addonLabelDisabled: {
    opacity: 0.45,
  },
  addonPrice: {
    fontSize: 14,
    fontWeight: "600",
    color: StoreTheme.textPrimary,
    minWidth: 36,
    textAlign: "right",
  },
  checkboxOuter: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: "#D1D5DB",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
  },
  checkboxOuterSelected: {
    backgroundColor: StoreTheme.accentMint,
    borderColor: StoreTheme.accentMint,
  },
  checkboxOuterDisabled: {
    opacity: 0.4,
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 12,
    gap: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: StoreTheme.border,
    backgroundColor: "#fff",
  },
  qtyRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: StoreTheme.accentMint,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
    minWidth: 108,
    backgroundColor: "#fff",
  },
  qtyBtn: {
    padding: 2,
  },
  qtyValue: {
    fontSize: 15,
    fontWeight: "700",
    color: StoreTheme.textPrimary,
    minWidth: 22,
    textAlign: "center",
  },
  addBtn: {
    flex: 1,
    backgroundColor: StoreTheme.accentMint,
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  addBtnDisabled: {
    backgroundColor: "#D1D5DB",
  },
  addBtnText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#fff",
    letterSpacing: 0.2,
  },
});
