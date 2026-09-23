import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppText } from "@/components/AppText";
import {
  View,
  Pressable,
  StyleSheet,
  Platform,
  Vibration,
  type GestureResponderEvent,
} from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import type { MenuItem } from "@/services/merchant.service";
import { StoreTheme } from "@/constants/storeTheme";
import { StoreFonts } from "@/constants/storeTypography";
import { DietIndicator } from "./DietIndicator";
import { MenuItemImagePlaceholder } from "./MenuItemImagePlaceholder";
import {
  StoreMenuInstantCartControl,
  MENU_COMPACT_CONTROL_HEIGHT,
} from "./StoreMenuCartControls";
import { getBasePrice, getItemDiet, getSellingPrice } from "./storeMenuUtils";
import { useMenuItemCartQty } from "@/hooks/useMenuItemCartQty";
import { ensureMenuItemImageWarm } from "@/lib/prefetchMenuItemImages";
import { GatiMitraColors } from "@/constants/gatimitra";
import { toAbsoluteImageUrl } from "@/utils/mediaUrl";
import { sizedImageUrl } from "@/lib/imageSizing";
import { formatOfferRupee, computeCatalogDiscountPercent, resolveMenuOfferPriceDisplay, type ItemOfferDisplay } from "@/lib/itemOfferDisplay";
import { MENU_MASONRY_CARD_RADIUS } from "@/features/merchant-detail/constants/layout";
import { MerchantDarkPalette, useMerchantUiDark } from "@/features/merchant-detail/merchantUiTheme";
import { ClassicCornerRatingPill } from "@/components/home/ClassicCornerRatingPill";

export type StoreMenuMasonryCardProps = {
  item: MenuItem;
  merchantId: string;
  /** Pixel width of the photo slot — required so expo-image does not paint 0×0 on Android. */
  imageSize: number;
  onAdd: (item: MenuItem) => void;
  onIncrement: (itemId: string, menuItemId?: number) => void;
  onDecrement: (itemId: string, menuItemId?: number) => void;
  isStoreClosed?: boolean;
  isHighlyReordered?: boolean;
  isBookmarked?: boolean;
  highlighted?: boolean;
  onItemPress?: (item: MenuItem) => void;
  onBookmark?: (item: MenuItem) => void;
  itemOffer?: ItemOfferDisplay | null;
};

const TAP_MOVE_SLOP = 8;
const DESC_MAX = 28;

function formatCardDescription(description?: string | null) {
  const normalized = description?.replace(/\s+/g, " ").trim() ?? "";
  if (!normalized) return "";
  if (normalized.length <= DESC_MAX) return normalized;
  return `${normalized.slice(0, DESC_MAX).trimEnd()}…`;
}

function formatPrepLabel(minutes?: number | null) {
  if (minutes == null || !Number.isFinite(minutes) || minutes <= 0) return null;
  const rounded = Math.max(5, Math.round(minutes / 5) * 5);
  return `${rounded}–${rounded + 10} min`;
}

export const StoreMenuMasonryCard = React.memo(function StoreMenuMasonryCard({
  item,
  merchantId,
  imageSize,
  onAdd,
  onIncrement,
  onDecrement,
  isStoreClosed = false,
  isHighlyReordered = false,
  isBookmarked = false,
  highlighted = false,
  onItemPress,
  onBookmark,
  itemOffer = null,
}: StoreMenuMasonryCardProps) {
  const dark = useMerchantUiDark();
  const cartQty = useMenuItemCartQty(item.id, item.menuItemId, merchantId);
  const imageUri = useMemo(
    // Masonry photo paints at imageSize wide — request a matching WebP derivative.
    () =>
      item.imageUrl?.trim()
        ? sizedImageUrl(toAbsoluteImageUrl(item.imageUrl) ?? item.imageUrl, imageSize)
        : null,
    [item.imageUrl, imageSize]
  );
  const skipRemoteImage = !imageUri;
  const [imageFailed, setImageFailed] = useState(false);
  const photoPx = Math.max(1, Math.round(imageSize));

  const isCustomisable = !!(item.hasVariants || item.hasAddons || item.hasCustomizations);
  const outOfStock = item.inStock === false;
  const controlsDisabled = isStoreClosed || outOfStock;

  useEffect(() => {
    setImageFailed(false);
    if (imageUri) ensureMenuItemImageWarm(imageUri);
  }, [imageUri]);

  const handleAdd = useCallback(() => {
    if (controlsDisabled) return;
    onAdd(item);
  }, [controlsDisabled, item, onAdd]);

  const handleIncrementPress = useCallback(() => {
    if (controlsDisabled) return;
    onIncrement(item.id, item.menuItemId);
  }, [controlsDisabled, item.id, item.menuItemId, onIncrement]);

  const handleDecrementPress = useCallback(() => {
    if (controlsDisabled) return;
    onDecrement(item.id, item.menuItemId);
  }, [controlsDisabled, item.id, item.menuItemId, onDecrement]);

  const handleBookmarkPress = useCallback(
    (event: GestureResponderEvent) => {
      event.stopPropagation();
      if (!onBookmark) return;
      if (Platform.OS === "android") Vibration.vibrate(10);
      onBookmark(item);
    },
    [item, onBookmark]
  );

  const openLockRef = useRef(false);
  const tapGestureRef = useRef({ x: 0, y: 0, moved: false });
  const handleItemTouchStart = useCallback((event: GestureResponderEvent) => {
    tapGestureRef.current = {
      x: event.nativeEvent.pageX,
      y: event.nativeEvent.pageY,
      moved: false,
    };
  }, []);
  const handleItemTouchMove = useCallback((event: GestureResponderEvent) => {
    const gesture = tapGestureRef.current;
    if (
      Math.abs(event.nativeEvent.pageX - gesture.x) > TAP_MOVE_SLOP ||
      Math.abs(event.nativeEvent.pageY - gesture.y) > TAP_MOVE_SLOP
    ) {
      gesture.moved = true;
    }
  }, []);
  const handleItemPress = useCallback(() => {
    if (!onItemPress) return;
    if (tapGestureRef.current.moved) return;
    if (openLockRef.current) return;
    openLockRef.current = true;
    onItemPress(item);
    setTimeout(() => {
      openLockRef.current = false;
    }, 280);
  }, [item, onItemPress]);

  const sellingPrice = getSellingPrice(item);
  const basePrice = getBasePrice(item);
  const { payable: payableAmount, strike: strikeAmount, showStrike: showDiscount } =
    resolveMenuOfferPriceDisplay({ sellingPrice, basePrice, itemOffer });
  // catalogDiscountPct still used for on-image % OFF badge
  const catalogDiscountPct =
    basePrice != null && basePrice > sellingPrice
      ? computeCatalogDiscountPercent(basePrice, sellingPrice)
      : null;
  const showRemoteImage = !!imageUri && !imageFailed && !skipRemoteImage;
  const diet = getItemDiet(item);
  const displayName = item.name.replace(/\s+/g, " ").trim();
  const descriptionText = formatCardDescription(item.description);
  const prepLabel = formatPrepLabel(item.prepTimeMinutes);
  const itemRating =
    item.avgRating != null && Number.isFinite(item.avgRating) && item.avgRating > 0
      ? item.avgRating.toFixed(1)
      : null;

  return (
    <View style={[styles.card, dark && styles.cardDark, highlighted && (dark ? styles.cardHighlightedDark : styles.cardHighlighted)]}>
      <View style={[styles.imageBlock, { width: photoPx, height: photoPx }]} collapsable={false}>
        <Pressable
          accessibilityRole={onItemPress ? "button" : undefined}
          accessibilityLabel={onItemPress ? `View ${item.name} details` : undefined}
          disabled={!onItemPress}
          delayPressIn={0}
          unstable_pressDelay={0}
          onTouchStart={handleItemTouchStart}
          onTouchMove={handleItemTouchMove}
          onPress={handleItemPress}
          android_ripple={Platform.OS === "android" ? { color: "transparent" } : undefined}
          style={({ pressed }) => [
            styles.imagePressable,
            { width: photoPx, height: photoPx },
            pressed && onItemPress && styles.pressed,
          ]}
        >
          <View
            collapsable={false}
            pointerEvents="none"
            style={[
              styles.imageWrap,
              dark && styles.imageWrapDark,
              { width: photoPx, height: photoPx },
            ]}
          >
            {showRemoteImage ? (
              <Image
                source={{ uri: imageUri! }}
                style={{
                  width: photoPx,
                  height: photoPx,
                  borderTopLeftRadius: MENU_MASONRY_CARD_RADIUS,
                  borderTopRightRadius: MENU_MASONRY_CARD_RADIUS,
                }}
                contentFit="cover"
                cachePolicy="memory-disk"
                recyclingKey={String(item.listRowKey ?? item.id)}
                transition={0}
                priority="normal"
                allowDownscaling
                onLoad={() => {
                  if (imageUri) ensureMenuItemImageWarm(imageUri);
                }}
                onError={() => setImageFailed(true)}
              />
            ) : (
              <View style={[styles.placeholderFill, dark && styles.placeholderFillDark]}>
                <MenuItemImagePlaceholder size="lg" fill />
              </View>
            )}
            {controlsDisabled ? <View style={styles.closedOverlay} /> : null}
            {catalogDiscountPct != null ? (
              <View style={styles.discountOnImage}>
                <View style={styles.discountPctBadge}>
                  <AppText style={styles.discountPctBadgeText} numberOfLines={1}>
                    {catalogDiscountPct}% OFF
                  </AppText>
                </View>
              </View>
            ) : null}
            {itemOffer?.kind === "bogo" || itemOffer ? (
              <View style={styles.offerOnImage}>
                <View style={itemOffer?.kind === "bogo" ? styles.bogoBadge : styles.boostBadge}>
                  <AppText
                    style={itemOffer?.kind === "bogo" ? styles.bogoBadgeText : styles.boostBadgeText}
                    numberOfLines={1}
                  >
                    {itemOffer.label}
                  </AppText>
                </View>
              </View>
            ) : null}
            {itemRating ? (
              dark ? (
                <ClassicCornerRatingPill rating={itemRating} cardRadius={MENU_MASONRY_CARD_RADIUS} />
              ) : (
                <View style={styles.ratingBottomLeft} pointerEvents="none">
                  <Ionicons name="star" size={9} color="#FFFFFF" />
                  <AppText style={styles.ratingBottomLeftText}>{itemRating}</AppText>
                </View>
              )
            ) : dark && prepLabel ? (
              <View style={[styles.timeBadge, styles.timeBadgeDark]}>
                <AppText style={[styles.timeBadgeText, styles.timeBadgeTextDark]} numberOfLines={1}>
                  {prepLabel}
                </AppText>
              </View>
            ) : null}
            {/* Classic: prep under heart; + / stepper live in the details row below the image. */}
            {!dark && prepLabel ? (
              <View style={styles.classicPrepUnderHeart} pointerEvents="none">
                <AppText style={styles.classicPrepTopRightText} numberOfLines={1}>
                  {prepLabel}
                </AppText>
              </View>
            ) : null}
            {(isHighlyReordered || item.isPopular) && catalogDiscountPct == null ? (
              <View style={styles.popularTopLeft} pointerEvents="none">
                <AppText style={styles.popularTopLeftText} numberOfLines={1}>
                  Popular
                </AppText>
              </View>
            ) : dark && !itemRating && item.isRecommended ? (
              <View style={[styles.timeBadge, styles.timeBadgeDark]}>
                <AppText style={[styles.timeBadgeText, styles.timeBadgeTextDark]} numberOfLines={1}>
                  ★ Rec
                </AppText>
              </View>
            ) : null}
          </View>
        </Pressable>

        <View style={styles.imageTopRow} pointerEvents="box-none">
          {dark ? (
            <View style={styles.dietBadge} pointerEvents="none">
              <DietIndicator type={diet} />
            </View>
          ) : (
            <View style={styles.heartHit} />
          )}
          {onBookmark ? (
            <Pressable
              style={({ pressed }) => [styles.heartHit, pressed && styles.pressed]}
              hitSlop={8}
              onPress={handleBookmarkPress}
              accessibilityRole="button"
              accessibilityLabel={isBookmarked ? "Remove bookmark" : "Bookmark dish"}
            >
              <View style={[styles.heartBtn, dark && styles.heartBtnDark]} pointerEvents="none">
                <Ionicons
                  name={isBookmarked ? "heart" : "heart-outline"}
                  size={14}
                  color={isBookmarked ? StoreTheme.accentRed : dark ? "#FFFFFF" : "#374151"}
                />
              </View>
            </Pressable>
          ) : (
            <View style={styles.heartHit} />
          )}
        </View>
      </View>

      <View style={[styles.body, dark && styles.bodyDark, !dark && styles.bodyClassic]}>
        <Pressable
          disabled={!onItemPress}
          delayPressIn={0}
          unstable_pressDelay={0}
          onTouchStart={handleItemTouchStart}
          onTouchMove={handleItemTouchMove}
          onPress={handleItemPress}
          style={({ pressed }) => [pressed && onItemPress && styles.pressed]}
        >
          {!dark ? (
            <View style={styles.nameRowClassic}>
              <DietIndicator type={diet} />
              <AppText style={styles.nameClassic} numberOfLines={2} ellipsizeMode="tail">
                {displayName}
              </AppText>
            </View>
          ) : (
            <AppText style={[styles.name, styles.nameDark]} numberOfLines={1} ellipsizeMode="tail">
              {displayName}
            </AppText>
          )}
          {!dark && descriptionText ? (
            <AppText style={styles.descClassic} numberOfLines={2} ellipsizeMode="tail">
              {descriptionText}
            </AppText>
          ) : null}
          {!dark && isCustomisable ? (
            <AppText style={styles.customisable}>customisable</AppText>
          ) : null}
        </Pressable>

        <View style={[styles.priceRow, !dark && styles.priceRowClassic]}>
          <View style={styles.priceCol}>
            {!dark ? (
              <>
                <View style={styles.priceOfferRow}>
                  {showDiscount && strikeAmount != null ? (
                    <AppText style={styles.strikeClassic}>{formatOfferRupee(strikeAmount)}</AppText>
                  ) : null}
                  <AppText style={styles.classicPrice}>
                    {formatOfferRupee(showDiscount ? payableAmount : sellingPrice)}
                  </AppText>
                </View>
              </>
            ) : showDiscount && strikeAmount != null ? (
              <View style={styles.priceOfferRow}>
                <AppText style={[styles.salePrice, styles.salePriceDark]}>
                  {formatOfferRupee(payableAmount)}
                </AppText>
                <AppText style={[styles.strike, styles.strikeDark]}>
                  {formatOfferRupee(strikeAmount)}
                </AppText>
              </View>
            ) : (
              <AppText style={[styles.salePrice, styles.salePriceDark]}>
                {formatOfferRupee(sellingPrice)}
              </AppText>
            )}
            {outOfStock && dark ? (
              <AppText style={styles.oosText}>Out of stock</AppText>
            ) : null}
          </View>
          <View style={[styles.addSlot, !dark && styles.addSlotClassic]}>
            <StoreMenuInstantCartControl
              itemKey={`${merchantId}:${item.listRowKey ?? item.id}`}
              merchantId={merchantId}
              quantity={cartQty}
              disabled={controlsDisabled}
              soldOut={outOfStock && !isStoreClosed}
              size="compact"
              allowOptimisticAdd={!isCustomisable}
              onAdd={handleAdd}
              onIncrement={handleIncrementPress}
              onDecrement={handleDecrementPress}
              accessibilityLabel={`${item.name} quantity`}
            />
          </View>
        </View>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  card: {
    width: "100%",
    overflow: "visible",
    backgroundColor: "#FFFFFF",
    borderRadius: MENU_MASONRY_CARD_RADIUS,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: StoreTheme.border,
    ...StoreTheme.cardShadow,
  },
  cardDark: {
    backgroundColor: MerchantDarkPalette.card,
    borderColor: MerchantDarkPalette.border,
  },
  cardHighlighted: {
    borderColor: StoreTheme.accentMint,
    backgroundColor: StoreTheme.accentMintSoft,
  },
  cardHighlightedDark: {
    borderColor: MerchantDarkPalette.accent,
    backgroundColor: MerchantDarkPalette.accentSoft,
  },
  pressed: {
    opacity: 0.92,
  },
  imagePressable: {
    overflow: "hidden",
    backgroundColor: "transparent",
    borderTopLeftRadius: MENU_MASONRY_CARD_RADIUS,
    borderTopRightRadius: MENU_MASONRY_CARD_RADIUS,
  },
  imageBlock: {
    position: "relative",
    overflow: "visible",
    zIndex: 2,
    alignSelf: "center",
  },
  imageWrap: {
    overflow: "hidden",
    backgroundColor: "#F3F4F6",
    borderTopLeftRadius: MENU_MASONRY_CARD_RADIUS,
    borderTopRightRadius: MENU_MASONRY_CARD_RADIUS,
  },
  imageWrapDark: {
    backgroundColor: "#1A1A1A",
  },
  placeholderFill: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F0F0F0",
    borderTopLeftRadius: MENU_MASONRY_CARD_RADIUS,
    borderTopRightRadius: MENU_MASONRY_CARD_RADIUS,
  },
  placeholderFillDark: {
    backgroundColor: "#1A1A1A",
  },
  imageShimmer: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#E5E7EB",
  },
  imageShimmerDark: {
    backgroundColor: "#2A2A2A",
  },
  closedOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.38)",
  },
  imageTopRow: {
    position: "absolute",
    top: 6,
    left: 6,
    right: 6,
    zIndex: 10,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  dietBadge: {
    backgroundColor: "rgba(255,255,255,0.92)",
    borderRadius: 4,
    padding: 3,
  },
  offerOnImage: {
    position: "absolute",
    left: 8,
    bottom: 8,
    maxWidth: "62%",
  },
  discountOnImage: {
    position: "absolute",
    left: 8,
    top: 8,
    maxWidth: "72%",
    zIndex: 2,
  },
  bogoBadge: {
    backgroundColor: "#ECFDF5",
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#86EFAC",
  },
  bogoBadgeText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#15803D",
  },
  boostBadge: {
    backgroundColor: "#EFF6FF",
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#93C5FD",
  },
  boostBadgeText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#1D4ED8",
  },
  discountPctBadge: {
    backgroundColor: "#FEF9C3",
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(245, 158, 11, 0.3)",
  },
  discountPctBadgeText: {
    fontSize: 10,
    fontWeight: "800",
    color: "#B45309",
  },
  timeBadge: {
    position: "absolute",
    right: 8,
    bottom: 8,
    backgroundColor: "rgba(245, 230, 211, 0.94)",
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  popularTopLeft: {
    position: "absolute",
    top: 8,
    left: 8,
    zIndex: 3,
    backgroundColor: GatiMitraColors.deepMintStart,
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  popularTopLeftText: {
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "800",
  },
  ratingBottomLeft: {
    position: "absolute",
    left: 8,
    bottom: 8,
    zIndex: 3,
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: GatiMitraColors.deepMintStart,
    borderRadius: 8,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  ratingBottomLeftText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "800",
  },
  classicPrepUnderHeart: {
    position: "absolute",
    top: 36,
    right: 8,
    zIndex: 3,
    backgroundColor: "rgba(245, 230, 211, 0.94)",
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    maxWidth: "48%",
  },
  classicPrepTopRightText: {
    fontSize: 9,
    fontWeight: "700",
    color: "#6B4F2A",
  },
  nameRowClassic: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
  },
  nameClassic: {
    flex: 1,
    fontFamily: StoreFonts.loraBold,
    fontWeight: "700",
    fontSize: 14,
    color: StoreTheme.textPrimary,
    lineHeight: 18,
    letterSpacing: -0.2,
  },
  descClassic: {
    marginTop: 3,
    fontSize: 11,
    lineHeight: 15,
    color: StoreTheme.textSecondary,
  },
  classicPrice: {
    fontFamily: StoreFonts.poppinsBold,
    fontSize: 15,
    fontWeight: "800",
    color: GatiMitraColors.textPrimaryNew,
    letterSpacing: -0.2,
  },
  strikeClassic: {
    fontFamily: StoreFonts.poppinsSemiBold,
    fontSize: 12,
    color: StoreTheme.textSecondary,
    textDecorationLine: "line-through",
  },
  timeBadgeDark: {
    backgroundColor: "rgba(0,0,0,0.62)",
  },
  timeBadgeText: {
    fontSize: 9,
    fontWeight: "700",
    color: "#6B4F2A",
  },
  timeBadgeTextDark: {
    color: "#E5E5E5",
  },
  heartHit: {
    width: 30,
    height: 30,
    alignItems: "center",
    justifyContent: "center",
  },
  heartBtn: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: "rgba(255,255,255,0.94)",
    alignItems: "center",
    justifyContent: "center",
  },
  heartBtnDark: {
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  body: {
    paddingHorizontal: 8,
    paddingTop: 8,
    paddingBottom: 8,
    gap: 4,
  },
  bodyClassic: {
    paddingTop: 10,
    paddingBottom: 10,
    gap: 6,
    overflow: "visible",
    zIndex: 4,
  },
  bodyDark: {
    paddingTop: 6,
    paddingBottom: 6,
    gap: 2,
  },
  name: {
    fontFamily: StoreFonts.loraBold,
    fontWeight: "700",
    fontSize: 13,
    color: StoreTheme.textPrimary,
    lineHeight: 17,
    letterSpacing: -0.2,
  },
  nameDark: {
    color: MerchantDarkPalette.text,
  },
  desc: {
    fontFamily: StoreFonts.loraRegular,
    fontSize: 11,
    color: StoreTheme.textSecondary,
    lineHeight: 15,
  },
  descDark: {
    color: MerchantDarkPalette.textMuted,
  },
  customisable: {
    fontSize: 10,
    fontWeight: "700",
    color: StoreTheme.cartAction,
    textTransform: "lowercase",
    letterSpacing: 0.15,
    marginTop: 1,
  },
  priceRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: 6,
    marginTop: 4,
    minHeight: MENU_COMPACT_CONTROL_HEIGHT,
  },
  priceRowClassic: {
    alignItems: "center",
    marginTop: 6,
    zIndex: 8,
    overflow: "visible",
  },
  priceCol: {
    flex: 1,
    minWidth: 0,
    justifyContent: "flex-end",
    paddingBottom: 2,
  },
  priceOfferRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "baseline",
    gap: 4,
  },
  salePrice: {
    fontFamily: StoreFonts.poppinsBold,
    fontSize: 14,
    color: StoreTheme.cartAction,
    letterSpacing: -0.2,
  },
  salePriceDark: {
    color: MerchantDarkPalette.accent,
  },
  strike: {
    fontFamily: StoreFonts.poppinsSemiBold,
    fontSize: 11,
    color: StoreTheme.textSecondary,
    textDecorationLine: "line-through",
  },
  strikeDark: {
    color: MerchantDarkPalette.textDim,
  },
  oosText: {
    fontSize: 10,
    fontWeight: "700",
    color: StoreTheme.textMuted,
    marginTop: 2,
  },
  oosChip: {
    height: MENU_COMPACT_CONTROL_HEIGHT,
    minWidth: MENU_COMPACT_CONTROL_HEIGHT,
    paddingHorizontal: 8,
    borderRadius: 10,
    backgroundColor: "#F3F4F6",
    alignItems: "center",
    justifyContent: "center",
  },
  oosChipText: {
    fontSize: 11,
    fontWeight: "700",
    color: StoreTheme.textMuted,
  },
  addSlot: {
    width: 108,
    height: MENU_COMPACT_CONTROL_HEIGHT + 20,
    justifyContent: "center",
    overflow: "visible",
    zIndex: 8,
  },
  addSlotClassic: {
    width: 108,
    alignItems: "stretch",
    overflow: "visible",
    zIndex: 8,
  },
});
