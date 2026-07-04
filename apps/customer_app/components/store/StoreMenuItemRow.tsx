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
import { StoreMenuAddButton, StoreMenuQtyStepper, MENU_ADD_CONTROL_HEIGHT } from "./StoreMenuCartControls";
import { getBasePrice, getItemDiet, getSellingPrice, isItemSpicy } from "./storeMenuUtils";
import { useMenuItemCartQty } from "@/hooks/useMenuItemCartQty";
import { isMenuItemImagePrefetched } from "@/lib/prefetchMenuItemImages";
import { toAbsoluteImageUrl } from "@/utils/mediaUrl";

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
}: StoreMenuItemRowProps) {
  const cartQty = useMenuItemCartQty(item.id, item.menuItemId, merchantId);
  const [optimisticQty, setOptimisticQty] = useState<number | null>(null);
  const imageUri = useMemo(
    () => (item.imageUrl?.trim() ? (toAbsoluteImageUrl(item.imageUrl) ?? item.imageUrl) : null),
    [item.imageUrl]
  );
  const imageWasPrefetched = imageUri ? isMenuItemImagePrefetched(imageUri) : false;
  const [imageFailed, setImageFailed] = useState(false);

  const isCustomisable = item.hasVariants || item.hasAddons || item.hasCustomizations;
  const displayQty = optimisticQty ?? cartQty;

  useEffect(() => {
    if (optimisticQty != null && cartQty >= optimisticQty) {
      setOptimisticQty(null);
    }
  }, [cartQty, optimisticQty]);

  useEffect(() => {
    if (cartQty === 0) {
      setOptimisticQty(null);
    }
  }, [cartQty]);

  useEffect(() => {
    setImageFailed(false);
  }, [imageUri]);

  const handleAdd = useCallback(() => {
    if (isStoreClosed) return;

    if (!isCustomisable) {
      setOptimisticQty((prev) => (prev ?? cartQty) + 1);
    }

    onAdd(item);
  }, [cartQty, isCustomisable, isStoreClosed, item, onAdd]);

  const handleIncrementPress = useCallback(() => {
    if (isStoreClosed) return;
    setOptimisticQty((prev) => (prev ?? cartQty) + 1);
    onIncrement(item.id, item.menuItemId);
  }, [cartQty, isStoreClosed, item.id, item.menuItemId, onIncrement]);

  const handleDecrementPress = useCallback(() => {
    if (isStoreClosed) return;
    setOptimisticQty((prev) => Math.max(0, (prev ?? cartQty) - 1));
    onDecrement(item.id, item.menuItemId);
  }, [cartQty, isStoreClosed, item.id, item.menuItemId, onDecrement]);

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
  const showDiscount = basePrice != null && basePrice > sellingPrice;
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
            <Text style={styles.name} numberOfLines={3}>
              {item.name}
            </Text>
          </View>

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
              <>
                <Text style={styles.basePriceStrike}>₹{Math.round(basePrice!)}</Text>
                <Text style={styles.discountPrice}>Get for ₹{Math.round(sellingPrice)}</Text>
              </>
            ) : (
              <Text style={styles.basePrice}>₹{Math.round(sellingPrice)}</Text>
            )}
          </View>

          {item.description ? (
            <Text style={styles.desc} numberOfLines={3}>
              {item.description}
              {item.description.length > 80 ? (
                <Text style={styles.moreLink}> ...more</Text>
              ) : null}
            </Text>
          ) : null}

          {showDiscount ? (
            <Text style={styles.couponNote}>NOT ELIGIBLE FOR COUPONS</Text>
          ) : null}

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

        <View style={styles.rightCol} collapsable={false}>
          <View style={styles.imageStack} collapsable={false}>
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
            </View>

            <View style={styles.addSlot} collapsable={false}>
              {displayQty === 0 ? (
                <StoreMenuAddButton
                  onPress={handleAdd}
                  disabled={isStoreClosed}
                  accessibilityLabel={`Add ${item.name} to cart`}
                />
              ) : (
                <StoreMenuQtyStepper
                  quantity={displayQty}
                  disabled={isStoreClosed}
                  onIncrement={handleIncrementPress}
                  onDecrement={handleDecrementPress}
                  accessibilityLabel={`${item.name} quantity`}
                />
              )}
            </View>
          </View>

          {isCustomisable ? <Text style={styles.customisable}>customisable</Text> : null}
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
    minHeight: 172,
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
    marginTop: 2,
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
    marginTop: 12,
    zIndex: 4,
    elevation: 4,
    alignSelf: "flex-start",
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
    alignItems: "center",
    paddingBottom: 2,
  },
  imageStack: {
    width: IMAGE_SIZE,
    alignItems: "stretch",
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
  addSlot: {
    marginTop: 8,
    width: "100%",
    height: MENU_ADD_CONTROL_HEIGHT,
    minHeight: MENU_ADD_CONTROL_HEIGHT,
    zIndex: 12,
    elevation: 12,
    alignItems: "stretch",
    justifyContent: "center",
  },
  customisable: {
    fontSize: 10,
    fontWeight: "600",
    color: StoreTheme.textMuted,
    marginTop: 8,
    textAlign: "center",
    textTransform: "lowercase",
  },
  divider: {
    marginTop: 20,
    borderBottomWidth: 1,
    borderStyle: "dotted",
    borderColor: StoreTheme.borderDotted,
  },
});
