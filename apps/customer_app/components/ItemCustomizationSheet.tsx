/**
 * DB-driven item customization bottom sheet — GatiMitra-style UI; CTA/controls use cartAction green.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppText } from "@/components/AppText";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { View, TouchableOpacity, StyleSheet, Modal, Pressable, ScrollView, Image, ActivityIndicator, useWindowDimensions, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons, Feather } from "@expo/vector-icons";
import { StoreTheme } from "@/constants/storeTheme";
import { DietIndicator } from "@/components/store/DietIndicator";
import { MenuItemImagePlaceholder } from "@/components/store/MenuItemImagePlaceholder";
import type { MenuItem, MenuItemFullConfig } from "@/services/merchant.service";
import { merchantService } from "@/services/merchant.service";
import { mapAnchorPairsToCompanionItems } from "@/components/store/storeMenuUtils";
import {
  clearCachedMenuItemFullConfig,
  menuItemConfigQueryKey,
  resolveFullConfigItemId,
} from "@/lib/menu-item-config-query";
import {
  normalizeMenuItemFullConfig,
  resolveInitialVariantId,
} from "@/lib/normalize-menu-item-full-config";
import {
  formatMenuOptionDisplayName,
  formatMenuPortionLabel,
} from "@/lib/format-menu-portion-label";
import {
  estimateBoostUnitPrice,
  formatOfferRupee,
  type ItemOfferDisplay,
} from "@/lib/itemOfferDisplay";

const SHEET_MAX_HEIGHT_RATIO = 0.84;

export type ItemCustomizationInitialSelection = {
  variantId?: string | null;
  variantName?: string | null;
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
  /** Full store menu — used to resolve co-purchase companion items. */
  storeMenu?: MenuItem[];
  onAddCompanionItem?: (item: MenuItem) => void;
  /** Pre-select variant/addons/qty when editing from checkout cart. */
  initialSelection?: ItemCustomizationInitialSelection | null;
  /** Item-surface Boost / BOGO — size rows show strike / badge. */
  itemOffer?: ItemOfferDisplay | null;
  onAdd: (params: {
    menuItemId: string;
    name: string;
    price: number;
    quantity: number;
    isVeg: boolean;
    basePrice?: number;
    variantId?: string;
    variantName?: string;
    variantSizeValue?: string | null;
    variantSizeUnit?: string | null;
    addons?: Array<{
      addonId: string;
      customizationId?: string;
      addonName: string;
      addonPrice: number;
      quantity: number;
      addonSizeValue?: string | null;
      addonSizeUnit?: string | null;
    }>;
    imageUrl?: string | null;
  }) => void;
};

function sectionSubtitle(isRequired: boolean, maxSelection: number): string {
  if (isRequired && maxSelection === 1) return "Select any 1 option";
  if (isRequired) return `Select up to ${maxSelection} options`;
  if (maxSelection === 1) return "Select any 1 option";
  return `Select up to ${maxSelection} options`;
}

function SectionHeader({
  title,
  subtitle,
  required,
}: {
  title: string;
  subtitle: string;
  required?: boolean;
}) {
  return (
    <View style={styles.sectionHeader}>
      <View style={styles.sectionTitleRow}>
        <AppText style={styles.sectionTitle}>{title}</AppText>
        {required ? (
          <View style={styles.requiredPill}>
            <AppText style={styles.requiredPillText}>Required</AppText>
          </View>
        ) : null}
      </View>
      <AppText style={styles.sectionSub}>{subtitle}</AppText>
    </View>
  );
}

type CustomizationOptionRowProps = {
  name: string;
  sizeValue?: string | null;
  sizeUnit?: string | null;
  price: number;
  /** Catalog price to strike when Boost applies. */
  strikePrice?: number | null;
  /** Payable price after Boost (shown instead of `price` when set). */
  offerPrice?: number | null;
  /** Compact BOGO chip next to the price. */
  bogoLabel?: string | null;
  selected: boolean;
  disabled?: boolean;
  singleSelect: boolean;
  imageUrl?: string | null;
  showImage?: boolean;
  highlight?: boolean;
  onPress: () => void;
};

function CustomizationOptionRow({
  name,
  sizeValue,
  sizeUnit,
  price,
  strikePrice = null,
  offerPrice = null,
  bogoLabel = null,
  selected,
  disabled = false,
  singleSelect,
  imageUrl,
  showImage = false,
  highlight = false,
  onPress,
}: CustomizationOptionRowProps) {
  const showOfferStrike =
    offerPrice != null && strikePrice != null && strikePrice > offerPrice + 0.001;
  const displayPayable = showOfferStrike ? offerPrice! : price;
  const showPrice = displayPayable > 0 || price > 0;
  const portionLabel = formatMenuPortionLabel(sizeValue, sizeUnit);
  const a11yLabel = formatMenuOptionDisplayName(name, sizeValue, sizeUnit);

  const control = singleSelect ? (
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
      {selected ? <Ionicons name="checkmark" size={14} color="#fff" /> : null}
    </View>
  );

  const labelLine = portionLabel ? (
    <AppText
      style={[styles.optionLineText, disabled && styles.optionNameDisabled]}
      numberOfLines={1}
      ellipsizeMode="tail"
    >
      <AppText style={styles.optionNameInline}>{name.trim()}</AppText>
      <AppText style={styles.optionQtyInline}> · {portionLabel}</AppText>
    </AppText>
  ) : (
    <AppText
      style={[styles.optionNameInline, styles.optionLineText, disabled && styles.optionNameDisabled]}
      numberOfLines={1}
      ellipsizeMode="tail"
    >
      {name.trim()}
    </AppText>
  );

  return (
    <Pressable
      style={({ pressed }) => [
        styles.optionRowCard,
        selected && styles.optionRowCardSelected,
        highlight && !selected && styles.optionRowCardHighlight,
        pressed && !disabled && styles.rowPressed,
        disabled && styles.optionRowDisabled,
      ]}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole={singleSelect ? "radio" : "checkbox"}
      accessibilityState={{ selected, disabled }}
      accessibilityLabel={a11yLabel}
    >
      <View style={styles.optionRowInner}>
        {showImage ? (
          <View style={styles.optionThumbWrap}>
            {highlight ? (
              <View style={styles.mostOrderedBadge}>
                <AppText style={styles.mostOrderedText} numberOfLines={1}>
                  Most Ordered
                </AppText>
              </View>
            ) : null}
            <View style={styles.optionThumb}>
              {imageUrl ? (
                <Image source={{ uri: imageUrl }} style={styles.optionThumbImage} resizeMode="cover" />
              ) : (
                <View style={styles.optionThumbPlaceholder}>
                  <MenuItemImagePlaceholder size="sm" />
                </View>
              )}
              <View style={styles.dietOnThumbSmall}>
                <DietIndicator type="veg" />
              </View>
            </View>
          </View>
        ) : null}

        <View style={styles.optionCenter}>{labelLine}</View>

        <View style={styles.optionTrailing}>
          {showPrice ? (
            <View style={styles.optionPriceCol}>
              {bogoLabel ? (
                <View style={styles.bogoChip}>
                  <AppText style={styles.bogoChipText} numberOfLines={1}>
                    {bogoLabel}
                  </AppText>
                </View>
              ) : null}
              {showOfferStrike ? (
                <View style={styles.optionPriceStrikeRow}>
                  <AppText style={styles.optionPriceStrike}>{formatOfferRupee(strikePrice!)}</AppText>
                  <AppText style={styles.optionPriceOffer}>{formatOfferRupee(displayPayable)}</AppText>
                </View>
              ) : (
                <AppText style={styles.optionPrice}>{formatOfferRupee(displayPayable)}</AppText>
              )}
            </View>
          ) : null}
          {control}
        </View>
      </View>
    </Pressable>
  );
}

function applyInitialSelection(
  c: MenuItemFullConfig,
  initialSelection: ItemCustomizationInitialSelection | null | undefined,
  setSelectedVariantId: (id: string | null) => void,
  setSelectedAddons: (v: Record<string, string[]>) => void,
  setQuantity: (n: number) => void
) {
  setQuantity(initialSelection?.quantity ?? 1);
  const addonIdsFromCart = new Set(
    (initialSelection?.addons ?? []).map((a) => String(a.addonId))
  );

  setSelectedVariantId(resolveInitialVariantId(c.variants ?? [], initialSelection));

  if (c.customizations?.length && addonIdsFromCart.size > 0) {
    const next: Record<string, string[]> = {};
    for (const group of c.customizations) {
      const picked = group.addons
        .filter((a) => addonIdsFromCart.has(String(a.id)))
        .map((a) => a.id);
      if (picked.length) next[group.id] = picked;
    }
    setSelectedAddons(next);
  } else {
    setSelectedAddons({});
  }
}

export function ItemCustomizationSheet({
  visible,
  onClose,
  storeId,
  item,
  merchantName,
  isStoreClosed = false,
  storeMenu = [],
  onAddCompanionItem,
  initialSelection = null,
  itemOffer = null,
  onAdd,
}: ItemCustomizationSheetProps) {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { height: screenHeight } = useWindowDimensions();
  const sheetMaxHeight = Math.round(screenHeight * SHEET_MAX_HEIGHT_RATIO);

  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(null);
  const [selectedAddons, setSelectedAddons] = useState<Record<string, string[]>>({});
  const [quantity, setQuantity] = useState(1);
  const appliedConfigKeyRef = useRef<string | null>(null);

  const configItemKey = resolveFullConfigItemId(item);
  const isEditMode = initialSelection != null;
  const hasConfigFlags = item.hasVariants || item.hasAddons || item.hasCustomizations;

  useEffect(() => {
    if (visible && storeId && configItemKey) {
      clearCachedMenuItemFullConfig(storeId, configItemKey);
      void queryClient.invalidateQueries({
        queryKey: menuItemConfigQueryKey(storeId, configItemKey),
      });
    }
  }, [visible, storeId, configItemKey, queryClient]);

  const {
    data: config,
    isLoading: configLoading,
    isFetching: configFetching,
  } = useQuery({
    queryKey: menuItemConfigQueryKey(storeId, configItemKey),
    queryFn: () =>
      merchantService.getMenuItemFullConfig(storeId, configItemKey, { skipMemoryCache: true }),
    enabled: visible && !!storeId && !!configItemKey,
    staleTime: 0,
    gcTime: 30 * 60 * 1000,
    refetchOnMount: "always",
  });

  const displayConfig = useMemo(
    () => (config ? normalizeMenuItemFullConfig(config) : null),
    [config]
  );

  const loading = visible && !displayConfig && (configLoading || configFetching);

  const { data: anchorCoPurchasePairs = [] } = useQuery({
    queryKey: ["ordered-together", storeId, configItemKey],
    queryFn: () =>
      merchantService.getOrderedTogetherPairs(storeId, {
        anchorMenuItemId: configItemKey,
        limit: 6,
      }),
    enabled: visible && !!storeId && !!configItemKey,
    staleTime: 5 * 60 * 1000,
  });

  const companionItems = useMemo(
    () => mapAnchorPairsToCompanionItems(storeMenu, configItemKey, anchorCoPurchasePairs),
    [storeMenu, configItemKey, anchorCoPurchasePairs]
  );

  useEffect(() => {
    if (!visible) {
      appliedConfigKeyRef.current = null;
      return;
    }
    if (!displayConfig) return;
    const key = `${storeId}:${configItemKey}:${JSON.stringify(initialSelection ?? null)}`;
    if (appliedConfigKeyRef.current === key) return;
    appliedConfigKeyRef.current = key;
    applyInitialSelection(
      displayConfig,
      initialSelection,
      setSelectedVariantId,
      setSelectedAddons,
      setQuantity
    );
  }, [visible, displayConfig, storeId, configItemKey, initialSelection]);

  const variantPrice = useMemo(() => {
    if (!displayConfig?.variants?.length) return displayConfig?.item?.price ?? item.price;
    const v = displayConfig.variants.find((x) => x.id === selectedVariantId);
    return v ? v.price : displayConfig.variants[0]?.price ?? item.price;
  }, [displayConfig, selectedVariantId, item.price]);

  const boostVariantUnit = useMemo(
    () => estimateBoostUnitPrice(variantPrice, itemOffer),
    [variantPrice, itemOffer]
  );

  const addonsTotal = useMemo(() => {
    if (!displayConfig?.customizations) return 0;
    let total = 0;
    displayConfig.customizations.forEach((c) => {
      (selectedAddons[c.id] ?? []).forEach((addonId) => {
        const addon = c.addons.find((a) => a.id === addonId);
        if (addon) total += addon.price;
      });
    });
    return total;
  }, [displayConfig, selectedAddons]);

  const payableUnit = (boostVariantUnit ?? variantPrice) + addonsTotal;
  const totalPrice = payableUnit * quantity;
  const catalogTotalPrice = (variantPrice + addonsTotal) * quantity;
  const showCtaStrike = boostVariantUnit != null && boostVariantUnit < variantPrice - 0.001;

  const requiredVariantSelected = useMemo(() => {
    if (!displayConfig?.variants?.length) return true;
    return selectedVariantId != null;
  }, [displayConfig?.variants?.length, selectedVariantId]);

  const requiredCustomizationsMet = useMemo(() => {
    if (!displayConfig?.customizations) return true;
    return displayConfig.customizations.every((c) => {
      if (!c.isRequired) return true;
      const count = (selectedAddons[c.id] ?? []).length;
      return count >= Math.max(1, c.minSelection);
    });
  }, [displayConfig?.customizations, selectedAddons]);

  const canAdd = !isStoreClosed && requiredVariantSelected && requiredCustomizationsMet;

  const selectedVariant = useMemo(() => {
    if (!displayConfig?.variants?.length || !selectedVariantId) return null;
    return displayConfig.variants.find((v) => v.id === selectedVariantId) ?? null;
  }, [displayConfig?.variants, selectedVariantId]);

  const selectedVariantDisplayName = useMemo(
    () =>
      selectedVariant
        ? formatMenuOptionDisplayName(
            selectedVariant.name,
            selectedVariant.sizeValue,
            selectedVariant.sizeUnit
          )
        : null,
    [selectedVariant]
  );

  const toggleAddon = useCallback(
    (customizationId: string, addonId: string) => {
      setSelectedAddons((prev) => {
        const group = displayConfig?.customizations.find((c) => c.id === customizationId);
        const max = group?.maxSelection ?? 1;
        const list = prev[customizationId] ?? [];

        if (max === 1) {
          if (list[0] === addonId) {
            if (group?.isRequired && (group.minSelection ?? 1) >= 1) return prev;
            return { ...prev, [customizationId]: [] };
          }
          return { ...prev, [customizationId]: [addonId] };
        }

        if (list.includes(addonId)) {
          return { ...prev, [customizationId]: list.filter((id) => id !== addonId) };
        }
        if (list.length >= max) return prev;
        return { ...prev, [customizationId]: [...list, addonId] };
      });
    },
    [displayConfig?.customizations]
  );

  const handleAdd = useCallback(() => {
    if (!canAdd) return;
    const addonIds = displayConfig?.customizations?.flatMap((c) => selectedAddons[c.id] ?? []) ?? [];
    const addonsList: Array<{
      addonId: string;
      customizationId: string;
      addonName: string;
      addonPrice: number;
      quantity: number;
    }> = [];
    displayConfig?.customizations?.forEach((c) => {
      (selectedAddons[c.id] ?? []).forEach((addonId) => {
        const addon = c.addons.find((a) => a.id === addonId);
        if (addon) {
          const stableAddonId = String(addon.id ?? "").trim();
          if (!stableAddonId || stableAddonId === "0") return;
          addonsList.push({
            addonId: stableAddonId,
            customizationId: c.id,
            addonName: formatMenuOptionDisplayName(
              addon.name,
              addon.sizeValue,
              addon.sizeUnit
            ),
            addonPrice: addon.price,
            quantity: 1,
          });
        }
      });
    });
    const variant =
      displayConfig?.variants?.length && selectedVariantId
        ? displayConfig.variants.find((v) => v.id === selectedVariantId)
        : null;
    const catalogUnit = variantPrice + addonsTotal;
    const baseMenuItemId = String(item.menuItemId != null ? item.menuItemId : item.id);
    onAdd({
      menuItemId: displayConfig?.variants?.length
        ? `${baseMenuItemId}_${selectedVariantId ?? ""}_${addonIds.sort().join(",")}`
        : baseMenuItemId,
      name: item.name,
      // Catalog all-in — Boost is display-only; checkout/billing re-apply from offers.
      price: catalogUnit,
      quantity,
      isVeg: item.isVeg,
      basePrice: variant ? variant.price : (displayConfig?.item?.price ?? item.price),
      variantId: selectedVariantId ?? undefined,
      variantName: selectedVariantDisplayName ?? variant?.name,
      variantSizeValue: variant?.sizeValue ?? null,
      variantSizeUnit: variant?.sizeUnit ?? null,
      addons: addonsList.length
        ? addonsList.map((a) => {
            const src = displayConfig?.customizations
              ?.flatMap((c) => c.addons)
              .find((x) => String(x.id) === a.addonId);
            return {
              ...a,
              addonSizeValue: src?.sizeValue ?? null,
              addonSizeUnit: src?.sizeUnit ?? null,
            };
          })
        : undefined,
      imageUrl: displayConfig?.item?.imageUrl ?? item.imageUrl ?? null,
    });
    onClose();
  }, [
    canAdd,
    displayConfig,
    item,
    selectedVariantId,
    selectedVariantDisplayName,
    selectedAddons,
    quantity,
    totalPrice,
    onAdd,
    onClose,
  ]);

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
            <View style={styles.sheetHandle} />
            {loading ? (
              <View style={styles.loadingWrap}>
                <ActivityIndicator size="large" color={StoreTheme.accentMint} />
                <AppText style={styles.loadingText}>Loading options…</AppText>
              </View>
            ) : (
              <View style={styles.sheetBody}>
                <View style={styles.header}>
                  <View style={styles.headerTopRow}>
                    <View style={styles.headerImageWrap}>
                      {item.imageUrl ? (
                        <Image source={{ uri: item.imageUrl }} style={styles.headerImage} resizeMode="cover" />
                      ) : (
                        <View style={styles.headerImagePlaceholder}>
                          <MenuItemImagePlaceholder size="sm" />
                        </View>
                      )}
                      <View style={styles.dietOnThumb}>
                        <DietIndicator type={item.isVeg ? "veg" : "nonveg"} />
                      </View>
                    </View>

                    <View style={styles.headerTitleCol}>
                      <AppText style={styles.headerName} numberOfLines={2}>
                        {item.name}
                      </AppText>
                      {selectedVariantDisplayName ? (
                        <AppText style={styles.headerPortion} numberOfLines={2}>
                          {selectedVariantDisplayName}
                        </AppText>
                      ) : null}
                    </View>

                    <View style={styles.headerIcons}>
                      <TouchableOpacity hitSlop={8} style={styles.headerIconCircle} activeOpacity={0.75}>
                        <Ionicons name="bookmark-outline" size={18} color={StoreTheme.textPrimary} />
                      </TouchableOpacity>
                      <TouchableOpacity hitSlop={8} style={styles.headerIconCircle} activeOpacity={0.75}>
                        <Feather name="share-2" size={17} color={StoreTheme.textPrimary} />
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>

                <ScrollView
                  style={[styles.scroll, { maxHeight: Math.max(sheetMaxHeight - 200, 180) }]}
                  contentContainerStyle={styles.scrollContent}
                  showsVerticalScrollIndicator={false}
                  keyboardShouldPersistTaps="handled"
                >
                  {!loading &&
                  !displayConfig?.variants?.length &&
                  !displayConfig?.customizations?.length ? (
                    <View style={styles.sectionBlock}>
                      <AppText style={styles.sectionSub}>
                        {hasConfigFlags
                          ? "Customization options could not be loaded. Try again."
                          : "No customization options are available for this item right now."}
                      </AppText>
                    </View>
                  ) : null}

                  {displayConfig?.variants && displayConfig.variants.length > 0 ? (
                    <View style={styles.sectionBlock}>
                      <SectionHeader
                        title="Choose size"
                        subtitle={
                          itemOffer?.kind === "bogo"
                            ? `${sectionSubtitle(true, 1)} · ${itemOffer.label}`
                            : sectionSubtitle(true, 1)
                        }
                        required
                      />
                      <View style={styles.optionList}>
                        {displayConfig.variants.map((v) => {
                          const boostUnit = estimateBoostUnitPrice(v.price, itemOffer);
                          const showStrike =
                            boostUnit != null && boostUnit < v.price - 0.001;
                          return (
                            <CustomizationOptionRow
                              key={v.id}
                              name={v.name}
                              sizeValue={v.sizeValue}
                              sizeUnit={v.sizeUnit}
                              price={v.price}
                              strikePrice={showStrike ? Math.round(v.price) : null}
                              offerPrice={showStrike ? boostUnit : null}
                              bogoLabel={
                                itemOffer?.kind === "bogo" ? itemOffer.label : null
                              }
                              selected={selectedVariantId === v.id}
                              singleSelect
                              onPress={() => setSelectedVariantId(v.id)}
                            />
                          );
                        })}
                      </View>
                    </View>
                  ) : null}

                  {companionItems.length > 0 ? (
                    <View style={styles.companionSection}>
                      <AppText style={styles.companionTitle}>Most ordered together</AppText>
                      <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={styles.companionScroll}
                      >
                        {companionItems.map(({ item: companion, orderCount, source }) => (
                          <View key={companion.id} style={styles.companionCard}>
                            <AppText style={styles.companionName} numberOfLines={2}>
                              {companion.name}
                            </AppText>
                            <AppText style={styles.companionMeta}>
                              {source === "popular_fallback"
                                ? "Popular add-on"
                                : `${orderCount}+ orders together`}
                            </AppText>
                            <View style={styles.companionFooter}>
                              <AppText style={styles.companionPrice}>₹{Math.round(companion.price)}</AppText>
                              <TouchableOpacity
                                style={[
                                  styles.companionAddBtn,
                                  isStoreClosed && styles.companionAddBtnDisabled,
                                ]}
                                disabled={isStoreClosed}
                                onPress={() => onAddCompanionItem?.(companion)}
                                activeOpacity={0.85}
                              >
                                <AppText style={styles.companionAddText}>ADD</AppText>
                              </TouchableOpacity>
                            </View>
                          </View>
                        ))}
                      </ScrollView>
                    </View>
                  ) : null}

                  {displayConfig?.customizations?.map((c, groupIdx) => (
                    <View
                      key={c.id}
                      style={[styles.sectionBlock, groupIdx > 0 && styles.sectionBlockGap]}
                    >
                      <SectionHeader
                        title={c.title}
                        subtitle={sectionSubtitle(c.isRequired, c.maxSelection)}
                        required={c.isRequired}
                      />
                      <View style={styles.optionList}>
                        {c.addons.map((a) => {
                          const selected = (selectedAddons[c.id] ?? []).includes(a.id);
                          const isSingleSelect = c.maxSelection === 1;
                          const atMax = (selectedAddons[c.id] ?? []).length >= c.maxSelection;
                          const disabled = !isSingleSelect && !selected && atMax;
                          return (
                            <CustomizationOptionRow
                              key={`${c.id}-${a.id}`}
                              name={a.name}
                              sizeValue={a.sizeValue}
                              sizeUnit={a.sizeUnit}
                              price={a.price}
                              selected={selected}
                              disabled={disabled}
                              singleSelect={isSingleSelect}
                              imageUrl={a.imageUrl}
                              showImage
                              highlight={a.isMostOrdered === true}
                              onPress={() => toggleAddon(c.id, a.id)}
                            />
                          );
                        })}
                      </View>
                    </View>
                  ))}
                </ScrollView>

                <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 12) }]}>
                  <View style={styles.footerQtyBlock}>
                    <AppText style={styles.footerQtyLabel}>How many?</AppText>
                    <View style={styles.qtyRow}>
                      <TouchableOpacity
                        style={[styles.qtyBtnCircle, quantity <= 1 && styles.qtyBtnCircleDisabled]}
                        onPress={() => setQuantity((q) => Math.max(1, q - 1))}
                        disabled={quantity <= 1}
                        hitSlop={6}
                      >
                        <Ionicons
                          name="remove"
                          size={20}
                          color={quantity <= 1 ? StoreTheme.textMuted : StoreTheme.cartAction}
                        />
                      </TouchableOpacity>
                      <AppText style={styles.qtyValue}>{quantity}</AppText>
                      <TouchableOpacity
                        style={styles.qtyBtnCircle}
                        onPress={() => setQuantity((q) => q + 1)}
                        hitSlop={6}
                      >
                        <Ionicons name="add" size={20} color={StoreTheme.cartAction} />
                      </TouchableOpacity>
                    </View>
                  </View>

                  <TouchableOpacity
                    onPress={handleAdd}
                    disabled={!canAdd}
                    style={[styles.addBtn, !canAdd && styles.addBtnDisabled]}
                    activeOpacity={0.9}
                  >
                    <AppText style={[styles.addBtnText, !canAdd && styles.addBtnTextDisabled]}>
                      {isStoreClosed
                        ? "Store closed"
                        : isEditMode
                          ? "Update item"
                          : "Add item"}
                    </AppText>
                    {!isStoreClosed && canAdd ? (
                      showCtaStrike ? (
                        <View style={styles.addBtnPriceRow}>
                          <AppText style={styles.addBtnSubStrike}>
                            {formatOfferRupee(catalogTotalPrice)}
                          </AppText>
                          <AppText style={styles.addBtnSub}>
                            {formatOfferRupee(totalPrice)}
                            {quantity > 1
                              ? ` · ${quantity} × ${formatOfferRupee(payableUnit)}`
                              : ""}
                          </AppText>
                        </View>
                      ) : (
                        <AppText style={styles.addBtnSub}>
                          {formatOfferRupee(totalPrice)}
                          {quantity > 1
                            ? ` · ${quantity} × ${formatOfferRupee(payableUnit)}`
                            : ""}
                        </AppText>
                      )
                    ) : null}
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

const THUMB = 48;
const ADDON_IMG = 40;

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
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    overflow: "hidden",
    ...StoreTheme.cardShadow,
  },
  sheetHandle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#D1D5DB",
    marginTop: 10,
    marginBottom: 4,
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
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: StoreTheme.border,
    backgroundColor: "#fff",
  },
  headerTopRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  headerTitleCol: {
    flex: 1,
    minWidth: 0,
    gap: 6,
  },
  headerPortion: {
    fontSize: 13,
    fontWeight: "500",
    color: StoreTheme.textSecondary,
    lineHeight: 18,
    marginTop: 2,
  },
  headerImageWrap: {
    width: THUMB,
    height: THUMB,
    borderRadius: 10,
    overflow: "hidden",
    backgroundColor: "#F5F5F5",
    borderWidth: 1,
    borderColor: "#EEEEEE",
    position: "relative",
  },
  headerImagePlaceholder: {
    width: THUMB,
    height: THUMB,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F5F5F5",
  },
  headerImage: {
    width: THUMB,
    height: THUMB,
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
    fontSize: 17,
    fontWeight: "800",
    color: StoreTheme.textPrimary,
    lineHeight: 22,
    letterSpacing: -0.2,
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
    backgroundColor: "#fff",
  },
  scrollContent: {
    paddingBottom: 8,
  },
  sectionBlock: {
    backgroundColor: "#fff",
    paddingHorizontal: 16,
    paddingBottom: 4,
  },
  sectionBlockGap: {
    borderTopWidth: 8,
    borderTopColor: "#F4F4F5",
  },
  companionSection: {
    marginTop: 16,
    marginBottom: 4,
    paddingHorizontal: 16,
  },
  companionTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: StoreTheme.textPrimary,
    marginBottom: 10,
  },
  companionScroll: {
    gap: 10,
    paddingRight: 8,
  },
  companionCard: {
    width: 148,
    borderWidth: 1,
    borderColor: StoreTheme.border,
    borderRadius: 10,
    padding: 10,
    backgroundColor: "#fff",
  },
  companionName: {
    fontSize: 13,
    fontWeight: "600",
    color: StoreTheme.textPrimary,
    minHeight: 34,
  },
  companionMeta: {
    fontSize: 10,
    color: StoreTheme.textSecondary,
    marginTop: 4,
    marginBottom: 8,
  },
  companionFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 6,
  },
  companionPrice: {
    fontSize: 13,
    fontWeight: "700",
    color: StoreTheme.textPrimary,
  },
  companionAddBtn: {
    borderWidth: 1,
    borderColor: StoreTheme.accentMint,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  companionAddBtnDisabled: {
    borderColor: "#9CA3AF",
    opacity: 0.7,
  },
  companionAddText: {
    fontSize: 12,
    fontWeight: "700",
    color: StoreTheme.accentMint,
  },
  sectionHeader: {
    paddingTop: 12,
    paddingBottom: 8,
    marginBottom: 2,
  },
  sectionTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: StoreTheme.textPrimary,
    letterSpacing: -0.2,
  },
  requiredPill: {
    backgroundColor: StoreTheme.accentMintSoft,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "rgba(34, 197, 94, 0.3)",
  },
  requiredPillText: {
    fontSize: 10,
    fontWeight: "800",
    color: StoreTheme.accentMintDark,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  sectionSub: {
    fontSize: 12,
    color: StoreTheme.textSecondary,
    marginTop: 4,
    lineHeight: 17,
  },
  rowPressed: {
    opacity: 0.92,
  },
  optionList: {
    gap: 8,
    paddingTop: 4,
    paddingBottom: 8,
    width: "100%",
  },
  optionRowCard: {
    width: "100%",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#F0F0F0",
    backgroundColor: "#FCFCFC",
    overflow: "hidden",
  },
  optionRowInner: {
    flexDirection: "row",
    alignItems: "center",
    width: "100%",
    paddingVertical: 12,
    paddingHorizontal: 12,
    minHeight: 52,
    flexWrap: "nowrap",
  },
  optionRowCardSelected: {
    borderColor: StoreTheme.cartAction,
    backgroundColor: "#ECFDF5",
  },
  optionRowCardHighlight: {
    borderColor: "rgba(21, 128, 61, 0.35)",
    backgroundColor: "#F6FEF9",
  },
  optionRowDisabled: {
    opacity: 0.45,
  },
  optionThumbWrap: {
    width: ADDON_IMG,
    height: ADDON_IMG,
    marginRight: 10,
    flexShrink: 0,
    flexGrow: 0,
    position: "relative",
  },
  optionThumb: {
    width: ADDON_IMG,
    height: ADDON_IMG,
    borderRadius: 8,
    overflow: "hidden",
    backgroundColor: "#F5F5F5",
    borderWidth: 1,
    borderColor: "#EEEEEE",
    position: "relative",
  },
  optionThumbPlaceholder: {
    width: ADDON_IMG,
    height: ADDON_IMG,
    overflow: "hidden",
    backgroundColor: "#F5F5F5",
    alignItems: "center",
    justifyContent: "center",
  },
  optionThumbImage: {
    width: ADDON_IMG,
    height: ADDON_IMG,
  },
  dietOnThumbSmall: {
    position: "absolute",
    top: 3,
    left: 3,
    backgroundColor: "#fff",
    borderRadius: 2,
    padding: 1,
  },
  optionCenter: {
    flex: 1,
    minWidth: 0,
    marginRight: 8,
    justifyContent: "center",
  },
  optionLineText: {
    fontSize: 15,
    lineHeight: 20,
  },
  optionNameInline: {
    fontSize: 15,
    fontWeight: "600",
    color: StoreTheme.textPrimary,
  },
  optionQtyInline: {
    fontSize: 14,
    fontWeight: "500",
    color: StoreTheme.textSecondary,
  },
  optionNameDisabled: {
    color: StoreTheme.textMuted,
  },
  optionTrailing: {
    flexDirection: "row",
    alignItems: "center",
    flexShrink: 0,
    flexGrow: 0,
    gap: 12,
    marginLeft: "auto",
  },
  optionPrice: {
    fontSize: 15,
    fontWeight: "700",
    color: StoreTheme.textPrimary,
    textAlign: "right",
    flexShrink: 0,
  },
  optionPriceCol: {
    alignItems: "flex-end",
    gap: 2,
    flexShrink: 0,
  },
  optionPriceStrikeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  optionPriceStrike: {
    fontSize: 13,
    fontWeight: "600",
    color: StoreTheme.textMuted,
    textDecorationLine: "line-through",
  },
  optionPriceOffer: {
    fontSize: 15,
    fontWeight: "800",
    color: StoreTheme.offerBlue,
  },
  bogoChip: {
    backgroundColor: StoreTheme.accentMintSoft,
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 1,
    maxWidth: 88,
    marginBottom: 2,
  },
  bogoChipText: {
    fontSize: 9,
    fontWeight: "800",
    color: StoreTheme.cartAction,
    letterSpacing: 0.2,
  },
  addBtnPriceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  addBtnSubStrike: {
    fontSize: 12,
    fontWeight: "600",
    color: "rgba(255,255,255,0.65)",
    textDecorationLine: "line-through",
  },
  radioOuter: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: "#CFCFCF",
    alignItems: "center",
    justifyContent: "center",
  },
  radioOuterSelected: {
    borderColor: StoreTheme.cartAction,
  },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: StoreTheme.cartAction,
  },
  mostOrderedBadge: {
    position: "absolute",
    top: -8,
    left: -4,
    right: -4,
    zIndex: 2,
    backgroundColor: StoreTheme.cartAction,
    borderRadius: 3,
    paddingHorizontal: 4,
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
  checkboxOuter: {
    width: 22,
    height: 22,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: StoreTheme.cartAction,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
  },
  checkboxOuterSelected: {
    backgroundColor: StoreTheme.cartAction,
    borderColor: StoreTheme.cartAction,
  },
  checkboxOuterDisabled: {
    opacity: 0.4,
  },
  footer: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: 16,
    paddingTop: 14,
    gap: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: StoreTheme.border,
    backgroundColor: "#fff",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: -2 },
        shadowOpacity: 0.06,
        shadowRadius: 6,
      },
      android: { elevation: 8 },
    }),
  },
  footerQtyBlock: {
    minWidth: 118,
    gap: 6,
  },
  footerQtyLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: StoreTheme.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  qtyRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1.5,
    borderColor: StoreTheme.cartAction,
    borderRadius: 12,
    paddingVertical: 6,
    paddingHorizontal: 8,
    backgroundColor: "#ECFDF5",
    gap: 4,
  },
  qtyBtnCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(21, 128, 61, 0.35)",
  },
  qtyBtnCircleDisabled: {
    backgroundColor: "#F9FAFB",
    borderColor: StoreTheme.border,
  },
  qtyValue: {
    fontSize: 17,
    fontWeight: "800",
    color: StoreTheme.textPrimary,
    minWidth: 28,
    textAlign: "center",
  },
  addBtn: {
    flex: 1,
    backgroundColor: StoreTheme.cartAction,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    minHeight: 52,
    ...Platform.select({
      ios: {
        shadowColor: StoreTheme.cartActionPressed,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.28,
        shadowRadius: 4,
      },
      android: { elevation: 3 },
    }),
  },
  addBtnDisabled: {
    backgroundColor: "#86EFAC",
    opacity: 0.75,
    ...Platform.select({
      ios: { shadowOpacity: 0 },
      android: { elevation: 0 },
    }),
  },
  addBtnText: {
    fontSize: 16,
    fontWeight: "800",
    color: "#fff",
    letterSpacing: 0.2,
  },
  addBtnTextDisabled: {
    color: StoreTheme.cartActionPressed,
  },
  addBtnSub: {
    fontSize: 13,
    fontWeight: "600",
    color: "rgba(255,255,255,0.92)",
  },
});
