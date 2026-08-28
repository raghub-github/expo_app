import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Keyboard,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import Svg, { Path } from "react-native-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppText } from "@/components/AppText";
import { StoreTheme } from "@/constants/storeTheme";
import { StoreFonts } from "@/constants/storeTypography";
import { formatOfferRupee, computeCatalogDiscountPercent, resolveMenuOfferPriceDisplay, type ItemOfferDisplay } from "@/lib/itemOfferDisplay";
import type { MenuItem } from "@/services/merchant.service";
import { toAbsoluteImageUrl } from "@/utils/mediaUrl";
import { useCookingSheetKeyboardDock } from "@/hooks/useCookingSheetKeyboardDock";
import { DietIndicator } from "./DietIndicator";
import { getBasePrice, getItemDiet, getSellingPrice } from "./storeMenuUtils";
import { MerchantDarkPalette, useMerchantUiDark } from "@/features/merchant-detail/merchantUiTheme";
import {
  normalizeOrderItemSpecialInstructions,
  ORDER_ITEM_SPECIAL_INSTRUCTIONS_MAX_LENGTH,
} from "@/lib/order-item-special-instructions";
import { buildGrocerySheetCarouselItems } from "@/lib/buildGrocerySheetCarouselItems";
import {
  GrocerySheetProductCarousel,
  groceryCarouselBottomInset,
} from "./GrocerySheetProductCarousel";

/**
 * Item detail bottom sheet.
 *
 * Keyboard lifecycle (production rules):
 * - ONE stable React tree — TextInput never unmounts when the keyboard opens.
 * - ONE dock pipeline (`useCookingSheetKeyboardDock`) moves `bottom` only.
 * - No compact/full layout swap, no markCookingFocused remount, no auto dismiss.
 */
const ADD_GREEN = "#137243";
const QTY_FILL = "#E8F5EE";
const WAVE_HEIGHT = 36;
const WAVE_SIDE_Y = 28;
const WAVE_PEAK_Y = 2;
const MAX_NOTE_LENGTH = ORDER_ITEM_SPECIAL_INSTRUCTIONS_MAX_LENGTH;
const HERO_HEIGHT = 128;
const CTA_HEIGHT = 56;
const STEPPER_WIDTH = 118;
const FOOTER_H_PAD = 14;
const FOOTER_GAP = 10;

function WaveTopEdge({ width, fill }: { width: number; fill: string }) {
  const w = Math.max(320, width);
  const sy = WAVE_SIDE_Y;
  const py = WAVE_PEAK_Y;
  const fillPath = [
    `M 0 ${WAVE_HEIGHT}`,
    `L 0 ${sy}`,
    `L ${w * 0.18} ${sy}`,
    `C ${w * 0.28} ${sy} ${w * 0.3} ${py} ${w * 0.5} ${py}`,
    `C ${w * 0.7} ${py} ${w * 0.72} ${sy} ${w * 0.82} ${sy}`,
    `L ${w} ${sy}`,
    `L ${w} ${WAVE_HEIGHT}`,
    "Z",
  ].join(" ");
  const strokePath = [
    `M 0 ${sy}`,
    `L ${w * 0.18} ${sy}`,
    `C ${w * 0.28} ${sy} ${w * 0.3} ${py} ${w * 0.5} ${py}`,
    `C ${w * 0.7} ${py} ${w * 0.72} ${sy} ${w * 0.82} ${sy}`,
    `L ${w} ${sy}`,
  ].join(" ");

  return (
    <Svg width={w} height={WAVE_HEIGHT} style={styles.wave} pointerEvents="none">
      <Path d={fillPath} fill={fill} />
      <Path d={strokePath} stroke={ADD_GREEN} strokeWidth={1.5} fill="none" />
    </Svg>
  );
}

export type StoreMenuItemDetailInitialSelection = {
  quantity?: number;
  specialInstructions?: string | null;
};

export type StoreMenuItemDetailSheetProps = {
  visible: boolean;
  item: MenuItem | null;
  isBookmarked?: boolean;
  isStoreClosed?: boolean;
  /** FOOD | GROCERY — cooking request is hidden for grocery stores. */
  storeType?: string | null;
  itemOffer?: ItemOfferDisplay | null;
  initialSelection?: StoreMenuItemDetailInitialSelection | null;
  /** Full store menu — powers the grocery peek carousel. */
  storeMenu?: MenuItem[];
  /** Locks grocery carousel sheets to a stable height (never shrinks mid-session). */
  grocerySheetHeightMode?: "base" | "expanded";
  onSelectMenuItem?: (item: MenuItem) => void;
  onClose: () => void;
  onAdd: (item: MenuItem, quantity: number, specialInstructions?: string | null) => void;
  onBookmark?: (item: MenuItem) => void;
  onShare?: (item: MenuItem) => void;
};

export function StoreMenuItemDetailSheet({
  visible,
  item,
  isBookmarked: _isBookmarked = false,
  isStoreClosed = false,
  storeType = null,
  itemOffer = null,
  initialSelection = null,
  storeMenu = [],
  grocerySheetHeightMode,
  onSelectMenuItem,
  onClose,
  onAdd,
  onBookmark: _onBookmark,
  onShare,
}: StoreMenuItemDetailSheetProps) {
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const dark = useMerchantUiDark();
  const scrollRef = useRef<ScrollView>(null);
  const inputRef = useRef<TextInput>(null);
  const requestYRef = useRef(0);
  const addTapLockRef = useRef(false);
  const contentOpacity = useRef(new Animated.Value(1)).current;
  /** Lock sheet max-height for the keyboard session so window resize cannot resize the tree. */
  const { keyboardLift, isKeyboardVisibleRef, reset } = useCookingSheetKeyboardDock(visible);

  const [quantity, setQuantity] = useState(1);
  const [cookingRequest, setCookingRequest] = useState("");
  const [imageFailed, setImageFailed] = useState(false);
  /** Local focus flag — styles only; never used to remount trees. */
  const [inputFocused, setInputFocused] = useState(false);

  const imageUri = useMemo(() => {
    const raw = item?.imageUrl?.trim();
    return raw ? (toAbsoluteImageUrl(raw) ?? raw) : null;
  }, [item?.imageUrl]);

  useEffect(() => {
    if (!visible) {
      setInputFocused(false);
      return;
    }
    setQuantity(initialSelection?.quantity ?? 1);
    setCookingRequest(initialSelection?.specialInstructions ?? "");
    setImageFailed(false);
    setInputFocused(false);
    reset();
  }, [initialSelection?.quantity, initialSelection?.specialInstructions, item?.id, reset, visible]);

  useEffect(() => {
    if (!visible || !item?.id) return;
    scrollRef.current?.scrollTo({ y: 0, animated: false });
    contentOpacity.setValue(0.55);
    Animated.timing(contentOpacity, {
      toValue: 1,
      duration: 180,
      useNativeDriver: true,
    }).start();
  }, [contentOpacity, item?.id, visible]);

  const handleClose = useCallback(() => {
    inputRef.current?.blur();
    Keyboard.dismiss();
    setInputFocused(false);
    reset();
    onClose();
  }, [onClose, reset]);

  const enterCompact = useCallback(() => {
    // Fire on touch-DOWN — before focus, before the keyboard, before Android
    // adjustResize re-lays-out the heavy menu behind the modal. Committing the
    // compact layout here means it is already painted on the FIRST frame of the
    // keyboard animation, with zero window where the full sheet is visible.
    setInputFocused(true);
  }, []);

  const handleInputFocus = useCallback(() => {
    // Backup for programmatic / a11y focus that skips touch-down.
    setInputFocused(true);
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ y: 0, animated: false });
    });
  }, []);

  const handleInputBlur = useCallback(() => {
    // Restore the full layout, scrolled to the top (hero visible) — exactly as
    // before the keyboard opened.
    setInputFocused(false);
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({ y: 0, animated: false });
    });
  }, []);

  const isGroceryStore = (storeType ?? "FOOD").trim().toUpperCase() === "GROCERY";
  const carouselItems = useMemo(
    () =>
      isGroceryStore && item
        ? buildGrocerySheetCarouselItems(storeMenu, item)
        : [],
    [isGroceryStore, item, storeMenu]
  );
  const carouselInset = groceryCarouselBottomInset(carouselItems.length, insets.bottom);

  if (!item) return null;

  const hasImage = !!imageUri && !imageFailed;
  const isCustomisable = !!(
    item.hasVariants ||
    item.hasAddons ||
    item.hasCustomizations
  );
  const sellingPrice = getSellingPrice(item);
  const basePrice = getBasePrice(item);
  const { payable: payablePrice, strike: strikePrice, showStrike: showStrikePrice } =
    resolveMenuOfferPriceDisplay({ sellingPrice, basePrice, itemOffer });
  const catalogDiscountPct = computeCatalogDiscountPercent(basePrice, sellingPrice);
  const total = payablePrice * quantity;
  const diet = getItemDiet(item);

  // Safe-area only — sheet background extends to the physical screen edge.
  const footerPadBottom = insets.bottom;
  const footerBlockH = CTA_HEIGHT + 24 + footerPadBottom;
  const sheetMaxH = Math.round(windowHeight * (hasImage || isGroceryStore ? 0.88 : 0.7));
  const scrollMaxH = Math.max(
    140,
    sheetMaxH - WAVE_HEIGHT - footerBlockH - carouselInset
  );
  const useStableGroceryHero = isGroceryStore;

  const addBtnWidth = Math.max(
    140,
    windowWidth - FOOTER_H_PAD * 2 - FOOTER_GAP - STEPPER_WIDTH
  );

  const ctaLabel = isStoreClosed
    ? isGroceryStore
      ? "Store closed"
      : "Restaurant closed"
    : isCustomisable
      ? `Customise • ${formatOfferRupee(payablePrice)}`
      : `Add item ${formatOfferRupee(total)}`;

  const addItem = () => {
    if (isStoreClosed || addTapLockRef.current) return;
    addTapLockRef.current = true;
    inputRef.current?.blur();
    Keyboard.dismiss();
    const note = normalizeOrderItemSpecialInstructions(cookingRequest);
    onAdd(item, isCustomisable ? 1 : quantity, note);
    setTimeout(() => {
      addTapLockRef.current = false;
    }, 400);
  };

  // Bookmark + share — shared by the full and compact headers so the two states
  // stay visually consistent without duplicating handlers.
  const dishActions = (
    <View style={styles.actionRow}>
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel="Share dish"
        hitSlop={8}
        onPress={() => onShare?.(item)}
        activeOpacity={0.7}
        style={[styles.circleAction, dark && styles.circleActionDark]}
      >
        <Ionicons
          name="share-social-outline"
          size={20}
          color={dark ? MerchantDarkPalette.textMuted : StoreTheme.textSecondary}
        />
      </TouchableOpacity>
    </View>
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={handleClose}
      statusBarTranslucent
      navigationBarTranslucent
      presentationStyle="overFullScreen"
    >
      <View style={styles.root} pointerEvents="box-none">
        <Pressable
          style={styles.backdrop}
          onPress={handleClose}
          accessibilityRole="button"
          accessibilityLabel="Dismiss"
        />

        <Animated.View
          style={[
            styles.sheetWrap,
            {
              width: windowWidth,
              maxHeight: sheetMaxH,
              bottom: carouselInset > 0 ? Animated.add(keyboardLift, carouselInset) : keyboardLift,
            },
          ]}
          // Keep touches on the sheet from falling through to the backdrop during lift.
          onStartShouldSetResponder={() => true}
        >
          <WaveTopEdge
            width={windowWidth}
            fill={dark ? MerchantDarkPalette.surface : "#FFFFFF"}
          />

          <View
            style={[
              styles.body,
              dark && styles.bodyDark,
              { width: windowWidth },
            ]}
          >
            {/*
              SINGLE TREE — never branch on keyboard visibility.
              TextInput stays mounted for the lifetime of the open sheet.
            */}
            <Animated.View style={{ opacity: contentOpacity, maxHeight: scrollMaxH, width: windowWidth }}>
            <ScrollView
              ref={scrollRef}
              style={{ maxHeight: scrollMaxH, width: windowWidth }}
              bounces={false}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="always"
              keyboardDismissMode="none"
              contentContainerStyle={styles.scrollContent}
            >
              {/*
                TWO DISCRETE STATES, one keyed "header" slot:
                - Keyboard closed  → full header (hero + details + description).
                - Keyboard open     → compact header (thumbnail + name + actions).
                The header View keeps key="header" and the request card keeps
                key="request" in BOTH states, so React never remounts the TextInput
                (a remount is what dismissed the keyboard). No animation — an
                instant, deterministic swap driven purely by `inputFocused`.
              */}
              {inputFocused ? (
                <View key="header" style={[styles.compactHeaderCard, dark && styles.detailsCardDark]}>
                  <View style={styles.compactThumbWrap}>
                    {hasImage ? (
                      <Image
                        source={{ uri: imageUri! }}
                        style={styles.compactThumb}
                        contentFit="cover"
                        cachePolicy="memory-disk"
                        transition={0}
                        onError={() => setImageFailed(true)}
                      />
                    ) : null}
                    <View style={styles.compactDietBadge}>
                      <DietIndicator type={diet} />
                    </View>
                  </View>
                  <AppText style={[styles.compactName, dark && styles.titleDark]} numberOfLines={2}>
                    {item.name}
                  </AppText>
                  {dishActions}
                </View>
              ) : (
                <View key="header">
                  {hasImage || useStableGroceryHero ? (
                    <View style={styles.heroWrap}>
                      {hasImage ? (
                        <Image
                          source={{ uri: imageUri! }}
                          style={styles.heroImage}
                          contentFit="contain"
                          cachePolicy="memory-disk"
                          transition={120}
                          onError={() => setImageFailed(true)}
                        />
                      ) : (
                        <View style={[styles.heroPlaceholder, dark && styles.heroPlaceholderDark]} />
                      )}
                      <View style={[styles.dietOnImage, dark && styles.dietOnImageDark]}>
                        <DietIndicator type={diet} />
                      </View>
                    </View>
                  ) : null}

                  <View style={[styles.detailsCard, dark && styles.detailsCardDark]}>
                    {!hasImage && !useStableGroceryHero ? (
                      <View style={styles.dietRow}>
                        <DietIndicator type={diet} />
                      </View>
                    ) : null}
                    <View style={styles.titleActionsRow}>
                      <View style={styles.titleBlock}>
                        <AppText style={[styles.title, dark && styles.titleDark]}>{item.name}</AppText>
                        <View style={styles.priceRow}>
                          {showStrikePrice && strikePrice != null ? (
                            <AppText style={[styles.strikePrice, dark && styles.strikePriceDark]}>
                              {formatOfferRupee(strikePrice)}
                            </AppText>
                          ) : null}
                          <AppText style={[styles.price, dark && styles.titleDark]}>
                            {formatOfferRupee(payablePrice)}
                          </AppText>
                          {itemOffer ? (
                            <View style={styles.offerBadge}>
                              <AppText style={styles.offerBadgeText}>{itemOffer.label}</AppText>
                            </View>
                          ) : catalogDiscountPct != null ? (
                            <View style={styles.catalogDiscountBadge}>
                              <AppText style={styles.catalogDiscountBadgeText}>
                                {catalogDiscountPct}% OFF
                              </AppText>
                            </View>
                          ) : null}
                        </View>
                      </View>
                      {dishActions}
                    </View>

                    {item.description ? (
                      <AppText style={[styles.description, dark && styles.descriptionDark]}>{item.description}</AppText>
                    ) : null}
                    {isCustomisable ? (
                      <AppText style={styles.customisable}>Customisable</AppText>
                    ) : null}
                  </View>
                </View>
              )}

              {!isGroceryStore ? (
              <View
                key="request"
                style={[styles.requestCard, dark && styles.requestCardDark]}
                onLayout={(e) => {
                  requestYRef.current = e.nativeEvent.layout.y;
                }}
              >
                <AppText style={[styles.requestTitle, dark && styles.titleDark]}>Add a cooking request (optional)</AppText>
                <AppText style={[styles.requestHint, dark && styles.descriptionDark]}>
                  The restaurant will try its best to fulfil your requests. However, refunds
                  or cancellations related to such requests won&apos;t be possible.
                </AppText>
                <View style={[styles.inputWrap, dark && styles.inputWrapDark]} onTouchStart={enterCompact}>
                  <TextInput
                    ref={inputRef}
                    value={cookingRequest}
                    onChangeText={(value) =>
                      setCookingRequest(value.slice(0, MAX_NOTE_LENGTH))
                    }
                    onTouchStart={enterCompact}
                    onFocus={handleInputFocus}
                    onBlur={handleInputBlur}
                    placeholder="e.g. Don’t make it too spicy"
                    placeholderTextColor={dark ? MerchantDarkPalette.textDim : "#A7AAB3"}
                    multiline
                    textAlignVertical="top"
                    style={[styles.input, dark && styles.inputDark]}
                    maxLength={MAX_NOTE_LENGTH}
                    blurOnSubmit={false}
                    accessibilityLabel="Cooking request"
                  />
                  <AppText style={[styles.counter, dark && styles.counterDark]}>
                    {MAX_NOTE_LENGTH - cookingRequest.length}
                  </AppText>
                </View>
              </View>
              ) : null}
            </ScrollView>
            </Animated.View>

            <View
              style={[
                styles.footer,
                dark && styles.footerDark,
                {
                  width: windowWidth,
                  paddingBottom: footerPadBottom,
                },
              ]}
            >
              <View style={[styles.stepper, dark && styles.stepperDark]}>
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel="Decrease quantity"
                  disabled={quantity <= 1 || isCustomisable}
                  onPress={() => setQuantity((value) => Math.max(1, value - 1))}
                  style={styles.stepperButton}
                  activeOpacity={0.7}
                >
                  <AppText
                    style={[
                      styles.stepperGlyph,
                      dark && styles.stepperGlyphDark,
                      (quantity <= 1 || isCustomisable) && styles.stepperGlyphDisabled,
                    ]}
                  >
                    −
                  </AppText>
                </TouchableOpacity>
                <AppText style={[styles.quantity, dark && styles.quantityDark]}>{quantity}</AppText>
                <TouchableOpacity
                  accessibilityRole="button"
                  accessibilityLabel="Increase quantity"
                  disabled={isCustomisable}
                  onPress={() => setQuantity((value) => value + 1)}
                  style={styles.stepperButton}
                  activeOpacity={0.7}
                >
                  <AppText
                    style={[
                      styles.stepperGlyph,
                      dark && styles.stepperGlyphDark,
                      isCustomisable && styles.stepperGlyphDisabled,
                    ]}
                  >
                    +
                  </AppText>
                </TouchableOpacity>
              </View>

              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel={ctaLabel}
                disabled={isStoreClosed}
                onPress={addItem}
                activeOpacity={0.9}
                style={[
                  styles.addButton,
                  { width: addBtnWidth },
                  isStoreClosed && styles.addButtonDisabled,
                ]}
              >
                <AppText style={styles.addButtonText} numberOfLines={1}>
                  {ctaLabel}
                </AppText>
              </TouchableOpacity>
            </View>
          </View>
        </Animated.View>

        {carouselItems.length > 1 && onSelectMenuItem ? (
          <GrocerySheetProductCarousel
            items={carouselItems}
            activeItemId={String(item.id)}
            onSelectItem={onSelectMenuItem}
          />
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  sheetWrap: {
    position: "absolute",
    left: 0,
    right: 0,
    backgroundColor: "transparent",
    zIndex: 2,
    elevation: 16,
    overflow: "visible",
  },
  wave: {
    width: "100%",
  },
  body: {
    marginTop: -2,
    backgroundColor: "#FFFFFF",
    overflow: "hidden",
  },
  bodyDark: {
    backgroundColor: MerchantDarkPalette.surface,
  },
  scrollContent: {
    paddingTop: 6,
    paddingBottom: 10,
  },
  heroWrap: {
    alignSelf: "center",
    width: "58%",
    maxWidth: 240,
    height: HERO_HEIGHT,
    marginTop: 2,
    backgroundColor: "transparent",
  },
  heroImage: {
    width: "100%",
    height: "100%",
    backgroundColor: "transparent",
  },
  heroPlaceholder: {
    width: "100%",
    height: "100%",
    backgroundColor: "#F3F4F6",
    borderRadius: 12,
  },
  heroPlaceholderDark: {
    backgroundColor: MerchantDarkPalette.elevated,
  },
  dietOnImage: {
    position: "absolute",
    top: 8,
    left: 8,
    backgroundColor: "rgba(255,255,255,0.95)",
    borderRadius: 3,
    padding: 2,
  },
  dietOnImageDark: {
    backgroundColor: "rgba(18,18,18,0.88)",
  },
  detailsCard: {
    marginHorizontal: 14,
    marginTop: 10,
    borderRadius: 14,
    backgroundColor: "#F8FAFC",
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  detailsCardDark: {
    backgroundColor: MerchantDarkPalette.card,
  },
  // Compact keyboard-open header (Reference Image 2): thumbnail + name + actions.
  compactHeaderCard: {
    marginHorizontal: 14,
    marginTop: 10,
    borderRadius: 14,
    backgroundColor: "#F8FAFC",
    paddingHorizontal: 12,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  compactThumbWrap: {
    width: 52,
    height: 52,
    position: "relative",
  },
  compactThumb: {
    width: 52,
    height: 52,
    borderRadius: 8,
    backgroundColor: "transparent",
  },
  compactDietBadge: {
    position: "absolute",
    top: 3,
    left: 3,
    backgroundColor: "#FFFFFF",
    borderRadius: 3,
    padding: 1,
  },
  compactName: {
    flex: 1,
    minWidth: 0,
    fontFamily: StoreFonts.loraBold,
    fontSize: 16,
    lineHeight: 21,
    color: StoreTheme.textPrimary,
  },
  dietRow: {
    marginBottom: 8,
  },
  titleActionsRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  titleBlock: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontFamily: StoreFonts.loraBold,
    fontSize: 18,
    lineHeight: 24,
    color: StoreTheme.textPrimary,
  },
  titleDark: {
    color: MerchantDarkPalette.text,
  },
  priceRow: {
    marginTop: 7,
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 7,
  },
  price: {
    fontFamily: StoreFonts.poppinsSemiBold,
    fontSize: 15,
    color: StoreTheme.textPrimary,
  },
  strikePrice: {
    fontSize: 13,
    color: StoreTheme.textMuted,
    textDecorationLine: "line-through",
  },
  strikePriceDark: {
    color: MerchantDarkPalette.textDim,
  },
  offerBadge: {
    borderRadius: 5,
    backgroundColor: "#ECFDF5",
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  offerBadgeText: {
    color: "#15803D",
    fontSize: 10,
    fontWeight: "700",
  },
  catalogDiscountBadge: {
    borderRadius: 5,
    backgroundColor: "#FEF9C3",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(245, 158, 11, 0.3)",
  },
  catalogDiscountBadgeText: {
    color: "#B45309",
    fontSize: 10,
    fontWeight: "800",
  },
  actionRow: {
    flexDirection: "row",
    gap: 8,
  },
  circleAction: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#E2E4EA",
    backgroundColor: "#FFFFFF",
  },
  circleActionDark: {
    borderColor: MerchantDarkPalette.border,
    backgroundColor: MerchantDarkPalette.elevated,
  },
  description: {
    marginTop: 10,
    fontFamily: StoreFonts.loraRegular,
    fontSize: 13,
    lineHeight: 19,
    color: StoreTheme.textSecondary,
  },
  descriptionDark: {
    color: MerchantDarkPalette.textMuted,
  },
  customisable: {
    marginTop: 8,
    fontSize: 11,
    fontWeight: "700",
    color: StoreTheme.accentMintDark,
  },
  requestCard: {
    marginHorizontal: 14,
    marginTop: 10,
    borderRadius: 14,
    backgroundColor: "#F8FAFC",
    padding: 12,
  },
  requestCardDark: {
    backgroundColor: MerchantDarkPalette.elevated,
  },
  requestTitle: {
    fontFamily: StoreFonts.loraBold,
    fontSize: 16,
    color: StoreTheme.textPrimary,
  },
  requestHint: {
    marginTop: 3,
    fontSize: 12,
    lineHeight: 17,
    color: StoreTheme.textSecondary,
  },
  inputWrap: {
    marginTop: 10,
    minHeight: 84,
    borderRadius: 12,
    backgroundColor: "#EEF0F5",
    overflow: "hidden",
  },
  inputWrapDark: {
    backgroundColor: MerchantDarkPalette.card,
  },
  input: {
    minHeight: 84,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 22,
    fontSize: 13,
    lineHeight: 18,
    color: StoreTheme.textPrimary,
  },
  inputDark: {
    color: MerchantDarkPalette.text,
  },
  counter: {
    position: "absolute",
    right: 10,
    bottom: 8,
    fontSize: 10,
    color: "#9CA3AF",
  },
  counterDark: {
    color: MerchantDarkPalette.textDim,
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: FOOTER_H_PAD,
    paddingTop: 12,
    gap: FOOTER_GAP,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: StoreTheme.border,
    backgroundColor: "#FFFFFF",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: -2 },
        shadowOpacity: 0.06,
        shadowRadius: 6,
      },
      android: { elevation: 10 },
    }),
  },
  footerDark: {
    backgroundColor: MerchantDarkPalette.surface,
    borderTopColor: MerchantDarkPalette.border,
  },
  stepper: {
    width: STEPPER_WIDTH,
    height: CTA_HEIGHT,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1.5,
    borderColor: ADD_GREEN,
    borderRadius: 10,
    backgroundColor: QTY_FILL,
    paddingHorizontal: 4,
    flexGrow: 0,
    flexShrink: 0,
  },
  stepperDark: {
    backgroundColor: MerchantDarkPalette.elevated,
    borderColor: MerchantDarkPalette.accent,
  },
  stepperButton: {
    width: 36,
    height: CTA_HEIGHT,
    alignItems: "center",
    justifyContent: "center",
  },
  stepperGlyph: {
    fontSize: 22,
    lineHeight: 24,
    fontWeight: "700",
    color: ADD_GREEN,
  },
  stepperGlyphDark: {
    color: MerchantDarkPalette.accent,
  },
  stepperGlyphDisabled: {
    color: "#9CA3AF",
  },
  quantity: {
    fontSize: 16,
    fontWeight: "800",
    color: ADD_GREEN,
  },
  quantityDark: {
    color: MerchantDarkPalette.accent,
  },
  addButton: {
    height: CTA_HEIGHT,
    borderRadius: 10,
    backgroundColor: ADD_GREEN,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
    flexGrow: 0,
    flexShrink: 0,
  },
  addButtonDisabled: {
    backgroundColor: "#D1D5DB",
  },
  addButtonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "800",
  },
});
