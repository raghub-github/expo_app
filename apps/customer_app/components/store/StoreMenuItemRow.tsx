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
  MENU_STEPPER_CONTROL_HEIGHT,
} from "./StoreMenuCartControls";
import { getBasePrice, getItemDiet, getSellingPrice, isItemSpicy } from "./storeMenuUtils";
import { useMenuItemCartQty } from "@/hooks/useMenuItemCartQty";
import { isMenuItemImagePrefetched, isMenuItemImageReady, ensureMenuItemImageWarm } from "@/lib/prefetchMenuItemImages";
import { toAbsoluteImageUrl } from "@/utils/mediaUrl";
import { isHeroMediaSessionReady } from "@/lib/prefetchGridFirstHeroMedia";
import { formatOfferRupee, computeCatalogDiscountPercent, resolveMenuOfferPriceDisplay, type ItemOfferDisplay } from "@/lib/itemOfferDisplay";
import { MENU_ITEM_ROW_HEIGHT } from "@/features/merchant-detail/constants/layout";

export type StoreMenuItemRowProps = {
  item: MenuItem;
  merchantId: string;
  onAdd: (item: MenuItem) => void;
  onIncrement: (itemId: string, menuItemId?: number) => void;
  onDecrement: (itemId: string, menuItemId?: number) => void;
  isStoreClosed?: boolean;
  showDivider?: boolean;
  isHighlyReordered?: boolean;
  isBookmarked?: boolean;
  highlighted?: boolean;
  /** @deprecated Pairing strip replaces inline companion hint. */
  goesWithName?: string | null;
  /** Opens item details when the row/image is pressed. Cart actions remain independent. */
  onItemPress?: (item: MenuItem) => void;
  onBookmark?: (item: MenuItem) => void;
  onShare?: (item: MenuItem) => void;
  /** Live merchant offer for this item (Boost % / BOGO). */
  itemOffer?: ItemOfferDisplay | null;
};

const IMAGE_SIZE = 118;
const ROW_GAP = 12;
const TAP_MOVE_SLOP = 8;
const DESCRIPTION_FIRST_LINE_LENGTH = 40;
const DESCRIPTION_SECOND_LINE_LENGTH = 35;
/** Left text ends this far before the row’s right edge so image+ADD always fit. */
const LEFT_RESERVE = IMAGE_SIZE + ROW_GAP;

function formatRowDescription(description?: string | null) {
  const normalized = description?.replace(/\s+/g, " ").trim() ?? "";
  if (normalized.length <= DESCRIPTION_FIRST_LINE_LENGTH) return normalized;

  const firstLine = normalized.slice(0, DESCRIPTION_FIRST_LINE_LENGTH).trimEnd();
  const remaining = normalized.slice(DESCRIPTION_FIRST_LINE_LENGTH).trimStart();
  const secondLine = remaining
    .slice(0, DESCRIPTION_SECOND_LINE_LENGTH)
    .trimEnd();
  const suffix =
    remaining.length > DESCRIPTION_SECOND_LINE_LENGTH ? "..." : "";

  return `${firstLine}\n${secondLine}${suffix}`;
}

export const StoreMenuItemRow = React.memo(function StoreMenuItemRow({
  item,
  merchantId,
  onAdd,
  onIncrement,
  onDecrement,
  isStoreClosed = false,
  showDivider = true,
  isHighlyReordered = false,
  isBookmarked = false,
  highlighted = false,
  goesWithName = null,
  onItemPress,
  onBookmark,
  onShare,
  itemOffer = null,
}: StoreMenuItemRowProps) {
  const cartQty = useMenuItemCartQty(item.id, item.menuItemId, merchantId);
  const imageUri = useMemo(
    () => (item.imageUrl?.trim() ? (toAbsoluteImageUrl(item.imageUrl) ?? item.imageUrl) : null),
    [item.imageUrl]
  );
  const [imageFailed, setImageFailed] = useState(false);
  /** Once painted, never show shimmer again — prevents scroll recycle flicker. */
  const [imagePainted, setImagePainted] = useState(() =>
    !!(
      imageUri &&
      (isMenuItemImageReady(imageUri) || isHeroMediaSessionReady(imageUri))
    )
  );
  const warmedRef = useRef<string | null>(null);

  const isCustomisable = !!(item.hasVariants || item.hasAddons || item.hasCustomizations);

  useEffect(() => {
    setImageFailed(false);
    if (!imageUri) return;
    if (
      isMenuItemImageReady(imageUri) ||
      isHeroMediaSessionReady(imageUri) ||
      isMenuItemImagePrefetched(imageUri)
    ) {
      setImagePainted(true);
    }
    // Warm once per URI — avoid re-prefetch storms while scrolling full-mount lists.
    if (warmedRef.current === imageUri) return;
    warmedRef.current = imageUri;
    ensureMenuItemImageWarm(imageUri);
  }, [imageUri]);

  const handleAdd = useCallback(() => {
    if (isStoreClosed) return;
    onAdd(item);
  }, [isStoreClosed, item, onAdd]);

  const handleIncrementPress = useCallback(() => {
    if (isStoreClosed) return;
    onIncrement(item.id, item.menuItemId);
  }, [isStoreClosed, item.id, item.menuItemId, onIncrement]);

  const handleDecrementPress = useCallback(() => {
    if (isStoreClosed) return;
    onDecrement(item.id, item.menuItemId);
  }, [isStoreClosed, item.id, item.menuItemId, onDecrement]);

  const handleBookmarkPress = useCallback(
    (event: GestureResponderEvent) => {
      event.stopPropagation();
      if (!onBookmark) return;
      if (Platform.OS === "android") Vibration.vibrate(10);
      onBookmark(item);
    },
    [item, onBookmark]
  );

  const handleSharePress = useCallback(
    (event: GestureResponderEvent) => {
      event.stopPropagation();
      if (!onShare) return;
      if (Platform.OS === "android") Vibration.vibrate(10);
      onShare(item);
    },
    [item, onShare]
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
    // A vertical/horizontal drag is scrolling, never an item-open gesture.
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
  const showOfferPrice =
    itemOffer?.kind !== "bogo" &&
    itemOffer?.offerPrice != null &&
    itemOffer.offerPrice < sellingPrice - 0.001;
  const catalogMrpDiscount = basePrice != null && basePrice > sellingPrice;
  const catalogDiscountPct = catalogMrpDiscount
    ? computeCatalogDiscountPercent(basePrice, sellingPrice)
    : null;
  const showCouponIneligibleNote = catalogMrpDiscount && !showOfferPrice;
  const showRemoteImage = !!imageUri && !imageFailed;
  const diet = getItemDiet(item);
  const spicy = isItemSpicy(item);
  const displayName = item.name.replace(/\s+/g, " ").trim();
  const descriptionText = formatRowDescription(item.description);

  return (
    <View style={[styles.wrap, highlighted && styles.wrapHighlighted]}>
      {/*
        Absolute right column + reserved left padding.
        Parent width drives layout — never use windowWidth (FlashList / insets mismatch).
      */}
      <View style={styles.row}>
        <Pressable
          accessibilityRole={onItemPress ? "button" : undefined}
          accessibilityLabel={onItemPress ? `View ${item.name} details` : undefined}
          disabled={!onItemPress}
          delayPressIn={0}
          unstable_pressDelay={0}
          onTouchStart={handleItemTouchStart}
          onTouchMove={handleItemTouchMove}
          onPress={handleItemPress}
          style={({ pressed }) => [
            styles.leftCol,
            pressed && onItemPress && styles.itemPressed,
          ]}
        >
          <View style={styles.titleRow}>
            <View style={styles.titleIcons}>
              <DietIndicator type={diet} />
              {spicy ? (
                <View style={styles.spicyBadge} accessibilityLabel="Spicy">
                  <AppText style={styles.spicyEmoji}>🌶</AppText>
                </View>
              ) : null}
            </View>
            <AppText
              style={styles.name}
              numberOfLines={2}
              ellipsizeMode="tail"
            >
              {displayName}
            </AppText>
          </View>

          {isHighlyReordered ? (
            <View style={styles.reorderRow}>
              <View style={styles.reorderBarTrack}>
                <View style={styles.reorderBarFill} />
              </View>
              <AppText style={styles.reorderText}>Highly reordered</AppText>
            </View>
          ) : null}

          {itemOffer?.kind === "bogo" ? (
            <View style={styles.offerBadgeSlot}>
              <View style={styles.bogoBadge}>
                <AppText style={styles.bogoBadgeText}>{itemOffer.label}</AppText>
              </View>
            </View>
          ) : itemOffer ? (
            <View style={styles.offerBadgeSlot}>
              <View style={styles.boostBadge}>
                <AppText style={styles.boostBadgeText}>{itemOffer.label}</AppText>
              </View>
            </View>
          ) : catalogDiscountPct != null ? (
            <View style={styles.offerBadgeSlot}>
              <View style={styles.discountPctBadge}>
                <AppText style={styles.discountPctBadgeText}>{catalogDiscountPct}% OFF</AppText>
              </View>
            </View>
          ) : null}

          <View style={styles.priceBlock}>
            {showDiscount && strikeAmount != null ? (
              <View style={styles.priceOfferRow}>
                <AppText style={styles.basePriceStrike}>{formatOfferRupee(strikeAmount)}</AppText>
                <AppText style={styles.discountPrice}>
                  {showOfferPrice
                    ? `Get for ${formatOfferRupee(payableAmount)}`
                    : formatOfferRupee(payableAmount)}
                </AppText>
              </View>
            ) : (
              <AppText style={styles.basePrice}>{formatOfferRupee(sellingPrice)}</AppText>
            )}
          </View>

          {descriptionText ? (
            <AppText style={styles.desc} numberOfLines={2} ellipsizeMode="tail">
              {descriptionText}
            </AppText>
          ) : null}

          {showCouponIneligibleNote ? (
            <AppText style={styles.couponNote}>NOT ELIGIBLE FOR COUPONS</AppText>
          ) : null}
        </Pressable>

        {/* Bookmark / share — left column under description (reference position). */}
        <View style={styles.actionIcons} collapsable={false}>
          <Pressable
            style={({ pressed }) => [styles.circleBtnHit, pressed && styles.circleBtnPressed]}
            hitSlop={10}
            onPress={handleBookmarkPress}
            disabled={!onBookmark}
            accessibilityRole="button"
            accessibilityLabel={isBookmarked ? "Remove bookmark" : "Bookmark dish"}
          >
            <View style={styles.circleBtn} pointerEvents="none">
              <Ionicons
                name={isBookmarked ? "bookmark" : "bookmark-outline"}
                size={14}
                color={isBookmarked ? StoreTheme.accentMint : "#6B7280"}
              />
            </View>
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.circleBtnHit, pressed && styles.circleBtnPressed]}
            hitSlop={10}
            onPress={handleSharePress}
            disabled={!onShare}
            accessibilityRole="button"
            accessibilityLabel="Share dish"
          >
            <View style={styles.circleBtn} pointerEvents="none">
              <Ionicons name="arrow-redo-outline" size={14} color="#6B7280" />
            </View>
          </Pressable>
        </View>

        <View style={styles.rightCol} pointerEvents="box-none" collapsable={false}>
          <Pressable
            accessibilityRole={onItemPress ? "button" : undefined}
            accessibilityLabel={onItemPress ? `View ${item.name} details` : undefined}
            disabled={!onItemPress}
            delayPressIn={0}
            unstable_pressDelay={0}
            onTouchStart={handleItemTouchStart}
            onTouchMove={handleItemTouchMove}
            onPress={handleItemPress}
            style={({ pressed }) => [
              styles.imagePressable,
              pressed && onItemPress && styles.itemPressed,
            ]}
          >
            <View style={styles.imageWrap} pointerEvents="none">
              {showRemoteImage ? (
                <>
                  {!imagePainted ? <View style={styles.imageShimmer} /> : null}
                  <Image
                    source={{ uri: imageUri! }}
                    style={styles.image}
                    contentFit="cover"
                    cachePolicy="memory-disk"
                    recyclingKey={String(item.listRowKey ?? item.id)}
                    transition={0}
                    priority="normal"
                    allowDownscaling
                    onLoad={() => setImagePainted(true)}
                    onError={() => setImageFailed(true)}
                  />
                </>
              ) : (
                <MenuItemImagePlaceholder />
              )}
              {isStoreClosed ? <View style={styles.closedOverlay} /> : null}
              {isCustomisable ? (
                <View style={styles.customisableOnImage} pointerEvents="none">
                  <AppText style={styles.customisableOnImageText}>customisable</AppText>
                </View>
              ) : null}
              {item.isRecommended ? (
                <View style={styles.imageBadgeStack} pointerEvents="none">
                  {item.isRecommended ? (
                    <View style={styles.imageRecommendedBadge}>
                      <AppText style={styles.imageRecommendedBadgeText} numberOfLines={1}>
                        Recommended
                      </AppText>
                    </View>
                  ) : null}
                </View>
              ) : null}
            </View>
          </Pressable>
          <View style={styles.addSlot} collapsable={false}>
            <StoreMenuInstantCartControl
              itemKey={`${merchantId}:${item.listRowKey ?? item.id}`}
              merchantId={merchantId}
              quantity={cartQty}
              disabled={isStoreClosed}
              allowOptimisticAdd={!isCustomisable}
              onAdd={handleAdd}
              onIncrement={handleIncrementPress}
              onDecrement={handleDecrementPress}
              accessibilityLabel={`${item.name} quantity`}
            />
          </View>
        </View>
      </View>

      {showDivider ? <View style={styles.divider} /> : null}
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: StoreTheme.background,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 4,
    minHeight: MENU_ITEM_ROW_HEIGHT,
    width: "100%",
    overflow: "visible",
  },
  wrapHighlighted: {
    backgroundColor: StoreTheme.accentMintSoft,
  },
  itemPressed: {
    backgroundColor: "rgba(19, 114, 67, 0.045)",
  },
  row: {
    position: "relative",
    width: "100%",
    minHeight: IMAGE_SIZE + 8 + MENU_STEPPER_CONTROL_HEIGHT,
  },
  leftCol: {
    width: "100%",
    paddingRight: LEFT_RESERVE,
    borderRadius: 12,
  },
  imagePressable: {
    width: IMAGE_SIZE,
    borderRadius: 12,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    width: "100%",
    gap: 10,
    marginBottom: 6,
  },
  titleIcons: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingTop: 3,
    flexShrink: 0,
  },
  spicyBadge: {
    width: 16,
    height: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  spicyEmoji: {
    fontSize: 12,
    lineHeight: 14,
  },
  name: {
    flex: 1,
    minWidth: 0,
    maxWidth: "100%",
    flexShrink: 1,
    fontFamily: StoreFonts.loraBold,
    fontWeight: "700",
    fontSize: 15,
    color: StoreTheme.textPrimary,
    lineHeight: 20,
    letterSpacing: -0.2,
  },
  reorderRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 6,
    marginBottom: 6,
    width: "100%",
  },
  reorderBarTrack: {
    width: 28,
    height: 3,
    borderRadius: 2,
    backgroundColor: "#E5E7EB",
    overflow: "hidden",
  },
  reorderBarFill: {
    width: "75%",
    height: "100%",
    backgroundColor: StoreTheme.reorderBar,
    borderRadius: 2,
  },
  reorderText: {
    fontSize: 11,
    color: StoreTheme.reorderGreen,
    fontWeight: "700",
  },
  offerBadgeSlot: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 6,
    minHeight: 22,
    maxWidth: "100%",
  },
  bogoBadge: {
    backgroundColor: "#ECFDF5",
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#86EFAC",
  },
  bogoBadgeText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#15803D",
  },
  boostBadge: {
    backgroundColor: "#EFF6FF",
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#93C5FD",
  },
  boostBadgeText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#1D4ED8",
  },
  discountPctBadge: {
    backgroundColor: "#FEF9C3",
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(245, 158, 11, 0.3)",
  },
  discountPctBadgeText: {
    fontSize: 11,
    fontWeight: "800",
    color: "#B45309",
  },
  priceBlock: {
    marginBottom: 6,
    marginTop: 2,
    width: "100%",
  },
  priceOfferRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "baseline",
    gap: 8,
    width: "100%",
  },
  basePrice: {
    fontFamily: StoreFonts.poppinsBold,
    fontSize: 18,
    color: StoreTheme.textPrimary,
    letterSpacing: -0.2,
  },
  basePriceStrike: {
    fontFamily: StoreFonts.poppinsSemiBold,
    fontSize: 14,
    color: StoreTheme.textSecondary,
    textDecorationLine: "line-through",
    letterSpacing: -0.15,
  },
  discountPrice: {
    fontFamily: StoreFonts.poppinsBold,
    fontSize: 17,
    color: StoreTheme.linkBlue,
    letterSpacing: -0.15,
  },
  desc: {
    width: "100%",
    fontFamily: StoreFonts.loraRegular,
    fontSize: 13,
    color: StoreTheme.textSecondary,
    lineHeight: 19,
    marginTop: 4,
  },
  couponNote: {
    fontSize: 10,
    fontWeight: "600",
    color: StoreTheme.textMuted,
    letterSpacing: 0.3,
    marginTop: 6,
  },
  /** Under description — nudged right to sit mid-left like reference. */
  actionIcons: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 10,
    marginLeft: 8,
    paddingRight: LEFT_RESERVE,
    alignSelf: "flex-start",
  },
  circleBtnHit: {
    width: 30,
    height: 30,
    alignItems: "center",
    justifyContent: "center",
  },
  circleBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#C4C4C4",
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  circleBtnPressed: {
    opacity: 0.72,
  },
  rightCol: {
    position: "absolute",
    top: 0,
    right: 0,
    width: IMAGE_SIZE,
    alignItems: "stretch",
    gap: 8,
  },
  imageWrap: {
    width: IMAGE_SIZE,
    height: IMAGE_SIZE,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: "#F3F4F6",
  },
  image: {
    width: "100%",
    height: "100%",
    borderRadius: 12,
  },
  imageShimmer: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#E5E7EB",
    borderRadius: 12,
  },
  closedOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.35)",
    borderRadius: 12,
  },
  customisableOnImage: {
    position: "absolute",
    top: 6,
    left: 6,
    right: 6,
    alignItems: "flex-end",
    justifyContent: "center",
  },
  customisableOnImageText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#FFFFFF",
    textTransform: "lowercase",
    letterSpacing: 0.15,
    textShadowColor: "rgba(0,0,0,0.55)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
    backgroundColor: "rgba(0,0,0,0.5)",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 3,
  },
  imageBadgeStack: {
    position: "absolute",
    left: 6,
    right: 6,
    bottom: 6,
    alignItems: "flex-start",
    gap: 3,
  },
  imageRecommendedBadge: {
    maxWidth: "100%",
    borderRadius: 4,
    backgroundColor: "rgba(255, 247, 237, 0.95)",
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#FDBA74",
  },
  imageRecommendedBadgeText: {
    color: "#C2410C",
    fontSize: 9,
    fontWeight: "800",
  },
  addSlot: {
    width: IMAGE_SIZE,
    minHeight: MENU_STEPPER_CONTROL_HEIGHT,
    alignItems: "stretch",
    justifyContent: "center",
  },
  divider: {
    marginTop: 12,
    borderBottomWidth: 1,
    borderStyle: "dotted",
    borderColor: StoreTheme.borderDotted,
  },
});
