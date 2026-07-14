import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Platform,
  Vibration,
} from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import type { MenuItem } from "@/services/merchant.service";
import { StoreTheme } from "@/constants/storeTheme";
import { StoreFonts } from "@/constants/storeTypography";
import { DietIndicator } from "./DietIndicator";
import { MenuItemImagePlaceholder } from "./MenuItemImagePlaceholder";
import { StoreMenuInstantCartControl, MENU_ADD_CONTROL_HEIGHT } from "./StoreMenuCartControls";
import { getBasePrice, getItemDiet, getSellingPrice, isItemSpicy } from "./storeMenuUtils";
import { useMenuItemCartQty } from "@/hooks/useMenuItemCartQty";
import { isMenuItemImagePrefetched } from "@/lib/prefetchMenuItemImages";
import { toAbsoluteImageUrl } from "@/utils/mediaUrl";
import { formatOfferRupee, type ItemOfferDisplay } from "@/lib/itemOfferDisplay";
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
  onBookmark?: (item: MenuItem) => void;
  onShare?: (item: MenuItem) => void;
  /** Live merchant offer for this item (Boost % / BOGO). */
  itemOffer?: ItemOfferDisplay | null;
};

const IMAGE_SIZE = 118;

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
  onBookmark,
  onShare,
  itemOffer = null,
}: StoreMenuItemRowProps) {
  const cartQty = useMenuItemCartQty(item.id, item.menuItemId, merchantId);
  const imageUri = useMemo(
    () => (item.imageUrl?.trim() ? (toAbsoluteImageUrl(item.imageUrl) ?? item.imageUrl) : null),
    [item.imageUrl]
  );
  const imageWasPrefetched = imageUri ? isMenuItemImagePrefetched(imageUri) : false;
  const [imageFailed, setImageFailed] = useState(false);

  const isCustomisable = !!(item.hasVariants || item.hasAddons || item.hasCustomizations);

  useEffect(() => {
    setImageFailed(false);
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

  const handleBookmarkPress = useCallback(() => {
    if (!onBookmark) return;
    if (Platform.OS === "android") Vibration.vibrate(10);
    onBookmark(item);
  }, [item, onBookmark]);

  const handleSharePress = useCallback(() => {
    if (!onShare) return;
    if (Platform.OS === "android") Vibration.vibrate(10);
    onShare(item);
  }, [item, onShare]);

  const sellingPrice = getSellingPrice(item);
  const basePrice = getBasePrice(item);
  const catalogMrpDiscount = basePrice != null && basePrice > sellingPrice;
  const offerUnitPrice =
    itemOffer?.kind !== "bogo" && itemOffer?.offerPrice != null ? itemOffer.offerPrice : null;
  const showOfferPrice =
    offerUnitPrice != null && offerUnitPrice < sellingPrice - 0.001;
  const showDiscount = showOfferPrice || catalogMrpDiscount;
  const strikeAmount = showOfferPrice
    ? Math.round(itemOffer?.strikePrice ?? sellingPrice)
    : basePrice!;
  const payableAmount = showOfferPrice ? offerUnitPrice! : sellingPrice;
  const showCouponIneligibleNote = catalogMrpDiscount && !showOfferPrice;
  const showRemoteImage = !!imageUri && !imageFailed;
  const diet = getItemDiet(item);
  const spicy = isItemSpicy(item);

  return (
    <View style={[styles.wrap, highlighted && styles.wrapHighlighted]}>
      <View style={styles.row}>
        <View style={styles.leftCol}>
          <View style={styles.titleRow}>
            <View style={styles.titleIcons}>
              <DietIndicator type={diet} />
              {spicy ? (
                <View style={styles.spicyBadge} accessibilityLabel="Spicy">
                  <Text style={styles.spicyEmoji}>🌶</Text>
                </View>
              ) : null}
            </View>
            <Text style={styles.name} numberOfLines={2}>
              {item.name}
            </Text>
          </View>

          {itemOffer?.kind === "bogo" ? (
            <View style={styles.offerBadgeSlot}>
              <View style={styles.bogoBadge}>
                <Text style={styles.bogoBadgeText}>{itemOffer.label}</Text>
              </View>
            </View>
          ) : itemOffer ? (
            <View style={styles.offerBadgeSlot}>
              <View style={styles.boostBadge}>
                <Text style={styles.boostBadgeText}>{itemOffer.label}</Text>
              </View>
            </View>
          ) : null}

          {isHighlyReordered ? (
            <View style={styles.reorderRow}>
              <View style={styles.reorderBarTrack}>
                <View style={styles.reorderBarFill} />
              </View>
              <Text style={styles.reorderText}>Highly reordered</Text>
            </View>
          ) : null}

          <View style={styles.priceBlock}>
            {showDiscount ? (
              <View style={styles.priceOfferRow}>
                <Text style={styles.basePriceStrike}>{formatOfferRupee(strikeAmount)}</Text>
                <Text style={styles.discountPrice}>
                  {showOfferPrice ? `Get for ${formatOfferRupee(payableAmount)}` : formatOfferRupee(payableAmount)}
                </Text>
              </View>
            ) : (
              <Text style={styles.basePrice}>{formatOfferRupee(sellingPrice)}</Text>
            )}
          </View>

          {item.description ? (
            <Text style={styles.desc} numberOfLines={2}>
              {item.description}
              {item.description.length > 80 ? (
                <Text style={styles.moreLink}> ...more</Text>
              ) : null}
            </Text>
          ) : null}

          {showCouponIneligibleNote ? (
            <Text style={styles.couponNote}>NOT ELIGIBLE FOR COUPONS</Text>
          ) : null}
        </View>

        <View style={styles.rightCol} collapsable={false}>
          <View style={styles.imageWrap} pointerEvents="none">
            {showRemoteImage ? (
              <>
                {!imageWasPrefetched ? <View style={styles.imageShimmer} /> : null}
                <Image
                  source={{ uri: imageUri! }}
                  style={styles.image}
                  contentFit="cover"
                  cachePolicy="memory-disk"
                  recyclingKey={item.id}
                  transition={0}
                  priority={imageWasPrefetched ? "normal" : "low"}
                  allowDownscaling
                  onError={() => setImageFailed(true)}
                />
              </>
            ) : (
              <MenuItemImagePlaceholder />
            )}
            {isStoreClosed ? <View style={styles.closedOverlay} /> : null}
            {isCustomisable ? (
              <View style={styles.customisableOnImage} pointerEvents="none">
                <Text style={styles.customisableOnImageText}>customisable</Text>
              </View>
            ) : null}
          </View>
          <View style={styles.addSlot} collapsable={false}>
            <StoreMenuInstantCartControl
              itemKey={`${merchantId}:${item.listRowKey ?? item.id}`}
              quantity={cartQty}
              disabled={isStoreClosed}
              onAdd={handleAdd}
              onIncrement={handleIncrementPress}
              onDecrement={handleDecrementPress}
              accessibilityLabel={`${item.name} quantity`}
            />
          </View>
        </View>
      </View>

      <View style={styles.bottomActionRow} collapsable={false}>
        <View style={styles.actionIcons} collapsable={false}>
          <Pressable
            style={({ pressed }) => [styles.circleBtn, pressed && styles.circleBtnPressed]}
            hitSlop={12}
            onPress={handleBookmarkPress}
            disabled={!onBookmark}
            accessibilityRole="button"
            accessibilityLabel={isBookmarked ? "Remove bookmark" : "Bookmark dish"}
          >
            <Ionicons
              name={isBookmarked ? "bookmark" : "bookmark-outline"}
              size={16}
              color={isBookmarked ? StoreTheme.accentMint : StoreTheme.textSecondary}
            />
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.circleBtn, pressed && styles.circleBtnPressed]}
            hitSlop={12}
            onPress={handleSharePress}
            disabled={!onShare}
            accessibilityRole="button"
            accessibilityLabel="Share dish"
          >
            <Ionicons
              name="share-social-outline"
              size={16}
              color={StoreTheme.accentMint}
            />
          </Pressable>
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
    paddingTop: 20,
    paddingBottom: 6,
    minHeight: MENU_ITEM_ROW_HEIGHT,
    overflow: "visible",
  },
  wrapHighlighted: {
    backgroundColor: StoreTheme.accentMintSoft,
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  leftCol: {
    flex: 1,
    minWidth: 0,
    paddingRight: 4,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    marginBottom: 6,
  },
  titleIcons: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingTop: 3,
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
    fontFamily: StoreFonts.loraBold,
    fontSize: 17,
    color: StoreTheme.textPrimary,
    lineHeight: 23,
    letterSpacing: -0.2,
  },
  reorderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 6,
  },
  offerBadgeRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 6,
  },
  offerBadgeSlot: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 6,
    minHeight: 22,
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
  priceBlock: {
    marginBottom: 6,
    marginTop: 2,
  },
  priceOfferRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "baseline",
    gap: 8,
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
    fontFamily: StoreFonts.loraRegular,
    fontSize: 13,
    color: StoreTheme.textSecondary,
    lineHeight: 19,
    marginTop: 4,
  },
  moreLink: {
    fontFamily: StoreFonts.loraRegular,
    color: StoreTheme.textSecondary,
  },
  couponNote: {
    fontSize: 10,
    fontWeight: "600",
    color: StoreTheme.textMuted,
    letterSpacing: 0.3,
    marginTop: 6,
  },
  actionIcons: {
    flexDirection: "row",
    gap: 10,
    zIndex: 4,
    elevation: 4,
    alignSelf: "center",
  },
  circleBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: StoreTheme.border,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  circleBtnPressed: {
    borderColor: StoreTheme.accentMint,
    backgroundColor: StoreTheme.accentMintSoft,
  },
  rightCol: {
    width: IMAGE_SIZE,
    alignItems: "stretch",
    zIndex: 1,
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
    flexShrink: 0,
  },
  bottomActionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-start",
    marginTop: 10,
    minHeight: 34,
    gap: 12,
  },
  addSlot: {
    width: IMAGE_SIZE,
    minHeight: MENU_ADD_CONTROL_HEIGHT,
    zIndex: 2,
    alignItems: "stretch",
    justifyContent: "center",
  },
  divider: {
    marginTop: 16,
    borderBottomWidth: 1,
    borderStyle: "dotted",
    borderColor: StoreTheme.borderDotted,
  },
});
