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
import { isMenuItemImagePrefetched } from "@/lib/prefetchMenuItemImages";
import { toAbsoluteImageUrl } from "@/utils/mediaUrl";
import { formatOfferRupee, computeCatalogDiscountPercent, resolveMenuOfferPriceDisplay, type ItemOfferDisplay } from "@/lib/itemOfferDisplay";
import { MENU_MASONRY_CARD_RADIUS } from "@/features/merchant-detail/constants/layout";
import { MerchantDarkPalette, useMerchantUiDark } from "@/features/merchant-detail/merchantUiTheme";

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
    () => (item.imageUrl?.trim() ? (toAbsoluteImageUrl(item.imageUrl) ?? item.imageUrl) : null),
    [item.imageUrl]
  );
  const skipRemoteImage = !imageUri;
  const imageWasPrefetched = imageUri && !skipRemoteImage ? isMenuItemImagePrefetched(imageUri) : false;
  const [imageFailed, setImageFailed] = useState(false);
  const photoPx = Math.max(1, Math.round(imageSize));

  const isCustomisable = !!(item.hasVariants || item.hasAddons || item.hasCustomizations);
  const outOfStock = item.inStock === false;
  const controlsDisabled = isStoreClosed || outOfStock;

  useEffect(() => {
    setImageFailed(false);
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
  const catalogDiscountPct =
    basePrice != null && basePrice > sellingPrice
      ? computeCatalogDiscountPercent(basePrice, sellingPrice)
      : null;
  const showRemoteImage = !!imageUri && !imageFailed && !skipRemoteImage;
  const diet = getItemDiet(item);
  const displayName = item.name.replace(/\s+/g, " ").trim();
  const descriptionText = formatCardDescription(item.description);
  const prepLabel = formatPrepLabel(item.prepTimeMinutes);

  return (
    <View style={[styles.card, dark && styles.cardDark, highlighted && (dark ? styles.cardHighlightedDark : styles.cardHighlighted)]}>
      <View style={styles.imageBlock} collapsable={false}>
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
                recyclingKey={item.id}
                transition={0}
                priority={imageWasPrefetched ? "high" : "normal"}
                allowDownscaling
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
            {prepLabel ? (
              <View style={[styles.timeBadge, dark && styles.timeBadgeDark]}>
                <AppText style={[styles.timeBadgeText, dark && styles.timeBadgeTextDark]} numberOfLines={1}>
                  {prepLabel}
                </AppText>
              </View>
            ) : isHighlyReordered ? (
              <View style={[styles.timeBadge, dark && styles.timeBadgeDark]}>
                <AppText style={[styles.timeBadgeText, dark && styles.timeBadgeTextDark]} numberOfLines={1}>
                  Popular
                </AppText>
              </View>
            ) : item.isRecommended ? (
              <View style={[styles.timeBadge, dark && styles.timeBadgeDark]}>
                <AppText style={[styles.timeBadgeText, dark && styles.timeBadgeTextDark]} numberOfLines={1}>
                  ★ Rec
                </AppText>
              </View>
            ) : null}
          </View>
        </Pressable>

        <View style={styles.imageTopRow} pointerEvents="box-none">
          <View style={styles.dietBadge} pointerEvents="none">
            <DietIndicator type={diet} />
          </View>
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

      <View style={[styles.body, dark && styles.bodyDark]}>
        <Pressable
          disabled={!onItemPress}
          delayPressIn={0}
          unstable_pressDelay={0}
          onTouchStart={handleItemTouchStart}
          onTouchMove={handleItemTouchMove}
          onPress={handleItemPress}
          style={({ pressed }) => [pressed && onItemPress && styles.pressed]}
        >
          <AppText style={[styles.name, dark && styles.nameDark]} numberOfLines={dark ? 1 : 2} ellipsizeMode="tail">
            {displayName}
          </AppText>
          {!dark && descriptionText ? (
            <AppText style={styles.desc} numberOfLines={1} ellipsizeMode="tail">
              {descriptionText}
            </AppText>
          ) : !dark && (item.categoryName || item.category) ? (
            <AppText style={styles.desc} numberOfLines={1}>
              {(item.categoryName ?? item.category ?? "").trim()}
            </AppText>
          ) : null}
          {!dark && isCustomisable ? (
            <AppText style={styles.customisable}>customisable</AppText>
          ) : null}
        </Pressable>

        <View style={styles.priceRow}>
          <View style={styles.priceCol}>
            {showDiscount && strikeAmount != null ? (
              <View style={styles.priceOfferRow}>
                <AppText style={[styles.salePrice, dark && styles.salePriceDark]}>{formatOfferRupee(payableAmount)}</AppText>
                <AppText style={[styles.strike, dark && styles.strikeDark]}>{formatOfferRupee(strikeAmount)}</AppText>
              </View>
            ) : (
              <AppText style={[styles.salePrice, dark && styles.salePriceDark]}>{formatOfferRupee(sellingPrice)}</AppText>
            )}
            {outOfStock ? <AppText style={styles.oosText}>Out of stock</AppText> : null}
          </View>
          {outOfStock ? (
            <View style={styles.oosChip}>
              <AppText style={styles.oosChipText}>Sold</AppText>
            </View>
          ) : (
            <View style={styles.addSlot}>
              <StoreMenuInstantCartControl
                itemKey={`${merchantId}:${item.listRowKey ?? item.id}`}
                merchantId={merchantId}
                quantity={cartQty}
                disabled={isStoreClosed}
                size="compact"
                allowOptimisticAdd={!isCustomisable}
                onAdd={handleAdd}
                onIncrement={handleIncrementPress}
                onDecrement={handleDecrementPress}
                accessibilityLabel={`${item.name} quantity`}
              />
            </View>
          )}
        </View>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  card: {
    width: "100%",
    overflow: "hidden",
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
    width: "100%",
    position: "relative",
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
    width: 92,
    height: MENU_COMPACT_CONTROL_HEIGHT,
    justifyContent: "center",
  },
});
