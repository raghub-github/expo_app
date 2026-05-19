/**
 * DB-driven item customization bottom sheet. Renders variants (radio), customizations with addons (checkboxes), quantity, live price.
 * No hardcoded options – all from GET .../full-config.
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
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { GatiMitraColors } from "@/constants/gatimitra";
import type { MenuItem, MenuItemFullConfig } from "@/services/merchant.service";
import { merchantService } from "@/services/merchant.service";

const CARD_RADIUS = 12;
const SECTION_SPACING = 12;
const SHEET_MAX_HEIGHT_PERCENT = 0.6;
const SHEET_TOP_RADIUS = 22;
/** Bottom padding only for safe area so sheet extends to screen edge */

export type ItemCustomizationSheetProps = {
  visible: boolean;
  onClose: () => void;
  storeId: string;
  item: MenuItem;
  merchantName: string;
  isStoreClosed?: boolean;
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

export function ItemCustomizationSheet({
  visible,
  onClose,
  storeId,
  item,
  merchantName,
  isStoreClosed = false,
  onAdd,
}: ItemCustomizationSheetProps) {
  const insets = useSafeAreaInsets();
  const { height: screenHeight } = useWindowDimensions();
  const sheetMaxHeight = Math.round(screenHeight * SHEET_MAX_HEIGHT_PERCENT);
  const safeBottom = insets.bottom;
  const [config, setConfig] = useState<MenuItemFullConfig | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(null);
  const [selectedAddons, setSelectedAddons] = useState<Record<string, string[]>>({});
  const [quantity, setQuantity] = useState(1);

  const hasConfig = item.hasVariants || item.hasAddons || item.hasCustomizations;

  const configItemKey = String(item.id ?? item.menuItemId ?? "").trim();

  useEffect(() => {
    if (!visible || !storeId || !configItemKey || !hasConfig) {
      setConfig(null);
      return;
    }
    setLoading(true);
    setSelectedAddons({});
    setQuantity(1);
    setSelectedVariantId(null);
    merchantService
      .getMenuItemFullConfig(storeId, configItemKey)
      .then((c) => {
        setConfig(c);
        if (c?.variants?.length) {
          const defaultVariant = c.variants.find((v) => v.isDefault) ?? c.variants[0];
          setSelectedVariantId(defaultVariant?.id ?? null);
        }
      })
      .finally(() => setLoading(false));
  }, [visible, storeId, configItemKey, hasConfig]);

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

  const toggleAddon = useCallback((customizationId: string, addonId: string) => {
    setSelectedAddons((prev) => {
      const list = prev[customizationId] ?? [];
      const max = config?.customizations.find((c) => c.id === customizationId)?.maxSelection ?? 1;
      if (list.includes(addonId)) {
        return { ...prev, [customizationId]: list.filter((id) => id !== addonId) };
      }
      if (list.length >= max) return prev;
      return { ...prev, [customizationId]: [...list, addonId] };
    });
  }, [config?.customizations]);

  const handleAdd = useCallback(() => {
    if (!canAdd) return;
    const addonIds = config?.customizations?.flatMap((c) => selectedAddons[c.id] ?? []) ?? [];
    const addonsList: Array<{ addonId: string; addonName: string; addonPrice: number; quantity: number }> = [];
    config?.customizations?.forEach((c) => {
      (selectedAddons[c.id] ?? []).forEach((addonId) => {
        const addon = c.addons.find((a) => a.id === addonId);
        if (addon) addonsList.push({ addonId: addon.id, addonName: addon.name, addonPrice: addon.price, quantity: 1 });
      });
    });
    const variant = config?.variants?.length && selectedVariantId
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
    <Modal visible={visible} transparent animationType="slide" statusBarTranslucent={Platform.OS === "android"}>
      <View style={styles.overlayWrap}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        {/* Zomato-style floating close: 10px above sheet, dark circle, white X */}
        <TouchableOpacity
          style={[styles.closeBtnFloating, { bottom: sheetMaxHeight + 10 }]}
          onPress={onClose}
          hitSlop={12}
          activeOpacity={0.8}
        >
          <Ionicons name="close" size={22} color="#fff" />
        </TouchableOpacity>
        <View style={[styles.sheetAnchor, { height: sheetMaxHeight }]}>
          <Pressable
            style={[styles.sheet, styles.sheetFlex, { borderTopLeftRadius: SHEET_TOP_RADIUS, borderTopRightRadius: SHEET_TOP_RADIUS }]}
            onPress={(e) => e.stopPropagation()}
          >
            {/* Subtle top drag handle */}
            <View style={styles.handleWrap}>
              <View style={styles.handle} />
            </View>

            {loading ? (
              <View style={[styles.loadingWrap, styles.loadingWrapFlex]}>
                <ActivityIndicator size="large" color={GatiMitraColors.emerald} />
                <Text style={styles.loadingText}>Loading options…</Text>
              </View>
            ) : (
              <>
                {/* Scrollable content only — NOT the action bar */}
                <View style={styles.contentWrap}>
                  {/* Header: Zomato-style — thumbnail + title + circular bookmark/share only */}
                  <View style={styles.header}>
                    <View style={styles.headerImageWrap}>
                      {item.imageUrl ? (
                        <Image source={{ uri: item.imageUrl }} style={styles.headerImage} resizeMode="cover" />
                      ) : (
                        <View style={styles.headerImagePlaceholder}>
                          <Ionicons name="restaurant" size={28} color={GatiMitraColors.textSecondary} />
                        </View>
                      )}
                      {/* Veg / Non-veg badge on thumbnail (Zomato-style) */}
                      <View style={[styles.vegBadge, item.isVeg ? styles.vegBadgeVeg : styles.vegBadgeNonVeg]} />
                    </View>
                    <View style={styles.headerRight}>
                      <Text style={styles.headerName} numberOfLines={2}>{item.name}</Text>
                      <View style={styles.headerIcons}>
                        <TouchableOpacity hitSlop={8} style={styles.headerIconCircle}>
                          <Ionicons name="bookmark-outline" size={20} color={GatiMitraColors.textSecondary} />
                        </TouchableOpacity>
                        <TouchableOpacity hitSlop={8} style={styles.headerIconCircle}>
                          <Ionicons name="share-outline" size={20} color={GatiMitraColors.textSecondary} />
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>

                  <View style={styles.scrollArea}>
                    <ScrollView
                      style={styles.scroll}
                      contentContainerStyle={styles.scrollContent}
                      showsVerticalScrollIndicator={true}
                      keyboardShouldPersistTaps="handled"
                      bounces={true}
                    >
                      {config?.variants && config.variants.length > 0 && (
                        <View style={styles.section}>
                          <Text style={styles.sectionTitle}>Quantity</Text>
                          <Text style={styles.sectionSub}>Required • Select any 1 option</Text>
                          <View style={styles.optionList}>
                            {config.variants.map((v) => (
                              <TouchableOpacity
                                key={v.id}
                                style={styles.radioRow}
                                onPress={() => setSelectedVariantId(v.id)}
                                activeOpacity={0.7}
                              >
                                <View style={[styles.radioOuter, selectedVariantId === v.id && styles.radioOuterSelected]}>
                                  {selectedVariantId === v.id && <View style={styles.radioInner} />}
                                </View>
                                <Text style={styles.radioLabel} numberOfLines={1}>{v.name}</Text>
                                <Text style={styles.radioPrice}>₹{v.price}</Text>
                              </TouchableOpacity>
                            ))}
                          </View>
                        </View>
                      )}

                      {!loading &&
                        (!config?.variants?.length) &&
                        (!config?.customizations?.length) && (
                          <View style={styles.section}>
                            <Text style={styles.sectionSub}>
                              No customization options are available for this item right now.
                            </Text>
                          </View>
                        )}

                      {config?.customizations?.map((c) => (
                        <View key={c.id} style={styles.section}>
                          <Text style={styles.sectionTitle}>{c.title}</Text>
                          <Text style={styles.sectionSub}>
                            {c.isRequired ? "Required • " : ""}Select {c.maxSelection === 1 ? "1 option" : `up to ${c.maxSelection} options`}
                          </Text>
                          <View style={styles.optionList}>
                            {c.addons.map((a) => {
                              const selected = (selectedAddons[c.id] ?? []).includes(a.id);
                              const atMax = (selectedAddons[c.id] ?? []).length >= c.maxSelection;
                              const disabled = !selected && atMax;
                              return (
                                <TouchableOpacity
                                  key={a.id}
                                  style={[styles.checkboxRow, disabled && styles.checkboxRowDisabled]}
                                  onPress={() => !disabled && toggleAddon(c.id, a.id)}
                                  activeOpacity={0.7}
                                  disabled={disabled}
                                >
                                  <View style={[styles.checkboxOuter, selected && styles.checkboxOuterSelected]}>
                                    {selected && <Ionicons name="checkmark" size={12} color="#fff" />}
                                  </View>
                                  <Text style={styles.checkboxLabel} numberOfLines={1}>{a.name}</Text>
                                  <Text style={styles.checkboxPrice}>₹{a.price}</Text>
                                </TouchableOpacity>
                              );
                            })}
                          </View>
                        </View>
                      ))}

                      <View style={styles.scrollBottomSpacer} />
                    </ScrollView>
                  </View>
                </View>

                {/* Floating CTA bar — flush to sheet bottom, safe area inside (same style as GroupOrderStartSheet) */}
                <View style={[styles.stickyBottom, { paddingBottom: safeBottom + 12 }]}>
                  <View style={styles.qtyRow}>
                    <TouchableOpacity
                      style={styles.qtyBtn}
                      onPress={() => setQuantity((q) => Math.max(1, q - 1))}
                      disabled={quantity <= 1}
                    >
                      <Ionicons name="remove" size={20} color={quantity <= 1 ? "#9ca3af" : GatiMitraColors.textPrimary} />
                    </TouchableOpacity>
                    <Text style={styles.qtyValue}>{quantity}</Text>
                    <TouchableOpacity style={styles.qtyBtn} onPress={() => setQuantity((q) => q + 1)}>
                      <Ionicons name="add" size={20} color={GatiMitraColors.textPrimary} />
                    </TouchableOpacity>
                  </View>
                  <TouchableOpacity
                    onPress={handleAdd}
                    disabled={!canAdd}
                    style={[styles.addBtnWrap, !canAdd && styles.addBtnDisabled]}
                    activeOpacity={0.9}
                  >
                    <LinearGradient
                      colors={canAdd ? (GatiMitraColors.mintGradient as unknown as [string, string]) : ["#9ca3af", "#6b7280"]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={styles.addBtn}
                    >
                      <Text style={styles.addBtnText}>
                        {isStoreClosed ? "Store closed" : `Add item ₹${Math.round(totalPrice)}`}
                      </Text>
                    </LinearGradient>
                  </TouchableOpacity>
                </View>
              </>
            )}

          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlayWrap: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.88)",
    justifyContent: "flex-end",
  },
  closeBtnFloating: {
    position: "absolute",
    left: "50%",
    marginLeft: -22,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(0,0,0,0.78)",
    alignItems: "center",
    justifyContent: "center",
    ...(Platform.OS === "android" ? { elevation: 8 } : { shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 4 }),
  },
  sheetAnchor: {
    width: "100%",
    alignSelf: "flex-end",
  },
  sheet: {
    width: "100%",
    backgroundColor: "#fff",
    overflow: "hidden",
  },
  sheetFlex: {
    flex: 1,
    flexDirection: "column",
    ...(Platform.OS === "android"
      ? { elevation: 24, shadowColor: "#000" }
      : {
          shadowColor: "#000",
          shadowOffset: { width: 0, height: -4 },
          shadowOpacity: 0.12,
          shadowRadius: 16,
        }),
  },
  handleWrap: { alignItems: "center", paddingTop: 10, paddingBottom: 6 },
  handle: {
    width: 40,
    height: 4,
    backgroundColor: "rgba(0,0,0,0.18)",
    borderRadius: 2,
  },
  loadingWrap: {
    paddingVertical: 32,
    alignItems: "center",
    gap: 10,
  },
  loadingWrapFlex: { flex: 1 },
  loadingText: { fontSize: 14, color: GatiMitraColors.textSecondary },
  contentWrap: {
    flex: 1,
    minHeight: 0,
    flexDirection: "column",
  },
  header: {
    flexDirection: "row",
    paddingHorizontal: 14,
    paddingBottom: SECTION_SPACING,
    gap: 12,
    alignItems: "center",
  },
  headerImageWrap: {
    width: 72,
    height: 72,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: "#f3f4f6",
  },
  headerImage: { width: "100%", height: "100%" },
  headerImagePlaceholder: {
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  vegBadge: {
    position: "absolute",
    top: 6,
    left: 6,
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: "#fff",
  },
  vegBadgeVeg: { backgroundColor: "#22c55e" },
  vegBadgeNonVeg: { backgroundColor: "#ef4444" },
  headerRight: { flex: 1, flexDirection: "row", alignItems: "center", gap: 10, minWidth: 0 },
  headerName: { fontSize: 16, fontWeight: "700", color: GatiMitraColors.textPrimary, flex: 1 },
  headerIcons: { flexDirection: "row", gap: 8, flexShrink: 0 },
  headerIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#d1d5db",
    alignItems: "center",
    justifyContent: "center",
  },
  iconBtn: { padding: 2 },
  scrollArea: {
    flex: 1,
    minHeight: 120,
  },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 14, paddingBottom: 12 },
  scrollBottomSpacer: { height: 80 },
  section: {
    marginBottom: SECTION_SPACING,
  },
  sectionTitle: { fontSize: 14, fontWeight: "600", color: GatiMitraColors.textPrimary, marginBottom: 1 },
  sectionSub: { fontSize: 11, color: GatiMitraColors.textSecondary, marginBottom: 6 },
  optionList: { gap: 0 },
  radioRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 10,
    backgroundColor: "#f9fafb",
    borderRadius: 8,
    marginBottom: 4,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.06)",
  },
  radioOuter: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: "#d1d5db",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  radioOuterSelected: { borderColor: GatiMitraColors.emerald },
  radioInner: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: GatiMitraColors.emerald,
  },
  radioLabel: { flex: 1, fontSize: 13, color: GatiMitraColors.textPrimary },
  radioPrice: { fontSize: 13, fontWeight: "700", color: GatiMitraColors.textPrimary },
  checkboxRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 10,
    backgroundColor: "#f9fafb",
    borderRadius: 8,
    marginBottom: 4,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.06)",
  },
  checkboxRowDisabled: { opacity: 0.6 },
  checkboxOuter: {
    width: 18,
    height: 18,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: "#d1d5db",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  checkboxOuterSelected: { backgroundColor: GatiMitraColors.emerald, borderColor: GatiMitraColors.emerald },
  checkboxLabel: { flex: 1, fontSize: 13, color: GatiMitraColors.textPrimary },
  checkboxPrice: { fontSize: 13, fontWeight: "600", color: GatiMitraColors.textPrimary },
  stickyBottom: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingTop: 14,
    backgroundColor: "#fff",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#e5e7eb",
    gap: 14,
    ...(Platform.OS === "android"
      ? { elevation: 8 }
      : { shadowColor: "#000", shadowOffset: { width: 0, height: -2 }, shadowOpacity: 0.08, shadowRadius: 8 }),
  },
  qtyRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f3f4f6",
    borderRadius: 12,
    paddingVertical: 6,
    paddingHorizontal: 8,
    gap: 12,
  },
  qtyBtn: { padding: 4 },
  qtyValue: { fontSize: 16, fontWeight: "700", color: GatiMitraColors.textPrimary, minWidth: 24, textAlign: "center" },
  addBtnWrap: { flex: 1, borderRadius: CARD_RADIUS, overflow: "hidden" },
  addBtnDisabled: { opacity: 0.85 },
  addBtn: { paddingVertical: 16, alignItems: "center", justifyContent: "center" },
  addBtnText: { fontSize: 17, fontWeight: "700", color: "#fff" },
});
