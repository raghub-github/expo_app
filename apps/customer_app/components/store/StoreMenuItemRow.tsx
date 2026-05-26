import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  Pressable,
  StyleSheet,
  Platform,
  Vibration,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import type { MenuItem } from "@/services/merchant.service";
import { StoreTheme } from "@/constants/storeTheme";
import { DietIndicator } from "./DietIndicator";
import { MenuItemImagePlaceholder } from "./MenuItemImagePlaceholder";
import { getBasePrice, getItemDiet, getSellingPrice } from "./storeMenuUtils";
import { useMenuItemCartQty } from "@/hooks/useMenuItemCartQty";

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
  /** Top co-purchased companion item name from order history. */
  goesWithName?: string | null;
  onBookmark?: (item: MenuItem) => void;
  onShare?: (item: MenuItem) => void;
};

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
  const quantity = useMenuItemCartQty(item.id, item.menuItemId, merchantId);
  const [imageFailed, setImageFailed] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const addScale = useSharedValue(1);

  useEffect(() => {
    setImageFailed(false);
    setImageLoaded(false);
  }, [item.imageUrl]);

  const handleAdd = useCallback(() => {
    if (isStoreClosed) return;
    if (Platform.OS === "android") Vibration.vibrate(15);
    addScale.value = withSpring(0.96, { damping: 15, stiffness: 320 }, () => {
      addScale.value = withSpring(1);
    });
    onAdd(item);
  }, [item, onAdd, addScale, isStoreClosed]);

  const addStyle = useAnimatedStyle(() => ({ transform: [{ scale: addScale.value }] }));

  const sellingPrice = getSellingPrice(item);
  const basePrice = getBasePrice(item);
  const showDiscount = basePrice != null && basePrice > sellingPrice;
  const isCustomisable = item.hasVariants || item.hasAddons || item.hasCustomizations;
  const showRemoteImage = !!item.imageUrl && !imageFailed;
  const diet = getItemDiet(item);

  return (
    <View style={[styles.wrap, highlighted && styles.wrapHighlighted]}>
      <View style={styles.row}>
        <View style={styles.leftCol}>
          <View style={styles.titleRow}>
            <DietIndicator type={diet} />
            <Text style={styles.name} numberOfLines={2}>
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
          ) : goesWithName ? (
            <Text style={styles.goesWithText} numberOfLines={1}>
              Often ordered with {goesWithName}
            </Text>
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

          <View style={styles.actionIcons}>
            <TouchableOpacity
              style={styles.circleBtn}
              hitSlop={6}
              onPress={() => onBookmark?.(item)}
              activeOpacity={0.75}
            >
              <Ionicons
                name={isBookmarked ? "bookmark" : "bookmark-outline"}
                size={16}
                color={isBookmarked ? StoreTheme.accentMint : StoreTheme.textSecondary}
              />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.circleBtn}
              hitSlop={6}
              onPress={() => onShare?.(item)}
              activeOpacity={0.75}
            >
              <Ionicons name="share-social-outline" size={16} color={StoreTheme.textSecondary} />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.rightCol}>
          <View style={styles.imageWrap}>
            {showRemoteImage ? (
              <>
                {!imageLoaded ? <View style={styles.imageShimmer} /> : null}
                <Image
                  source={{ uri: item.imageUrl! }}
                  style={[styles.image, imageLoaded ? styles.imageVisible : styles.imageHidden]}
                  resizeMode="cover"
                  onLoad={() => setImageLoaded(true)}
                  onError={() => setImageFailed(true)}
                />
              </>
            ) : (
              <MenuItemImagePlaceholder />
            )}
            {isStoreClosed ? <View style={styles.closedOverlay} /> : null}
          </View>

          <Animated.View style={[styles.addSlot, addStyle]}>
            {quantity === 0 ? (
              <Pressable
                onPress={handleAdd}
                disabled={isStoreClosed}
                style={[styles.addBtn, isStoreClosed && styles.addBtnDisabled]}
              >
                <Text style={[styles.addBtnText, isStoreClosed && styles.addBtnTextDisabled]}>
                  {isStoreClosed ? "Closed" : "ADD"}
                </Text>
                {!isStoreClosed ? (
                  <Ionicons name="add" size={14} color={StoreTheme.accentMint} />
                ) : null}
              </Pressable>
            ) : (
              <View style={[styles.qtyWrap, isStoreClosed && styles.addBtnDisabled]}>
                <TouchableOpacity
                  onPress={() => !isStoreClosed && onDecrement(item.id, item.menuItemId)}
                  style={styles.qtyBtn}
                  disabled={isStoreClosed}
                >
                  <Ionicons name="remove" size={16} color={StoreTheme.accentMint} />
                </TouchableOpacity>
                <Text style={styles.qtyText}>{quantity}</Text>
                <TouchableOpacity
                  onPress={() => !isStoreClosed && onIncrement(item.id, item.menuItemId)}
                  style={styles.qtyBtn}
                  disabled={isStoreClosed}
                >
                  <Ionicons name="add" size={16} color={StoreTheme.accentMint} />
                </TouchableOpacity>
              </View>
            )}
          </Animated.View>

          {isCustomisable ? <Text style={styles.customisable}>customisable</Text> : null}
        </View>
      </View>
      {showDivider ? <View style={styles.divider} /> : null}
    </View>
  );
});

const IMAGE_SIZE = 118;

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: StoreTheme.background,
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 4,
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
    gap: 8,
    marginBottom: 4,
  },
  name: {
    flex: 1,
    fontSize: 15,
    fontWeight: "600",
    color: StoreTheme.textPrimary,
    lineHeight: 20,
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
    color: StoreTheme.textSecondary,
    fontWeight: "500",
  },
  goesWithText: {
    fontSize: 11,
    color: StoreTheme.linkBlue,
    fontWeight: "500",
    marginBottom: 6,
  },
  priceBlock: {
    marginBottom: 4,
  },
  basePrice: {
    fontSize: 14,
    fontWeight: "500",
    color: StoreTheme.textPrimary,
  },
  basePriceStrike: {
    fontSize: 13,
    fontWeight: "500",
    color: StoreTheme.textSecondary,
    textDecorationLine: "line-through",
  },
  discountPrice: {
    fontSize: 13,
    fontWeight: "600",
    color: StoreTheme.linkBlue,
    marginTop: 1,
  },
  desc: {
    fontSize: 12,
    color: StoreTheme.textSecondary,
    lineHeight: 17,
    marginTop: 2,
  },
  moreLink: {
    color: StoreTheme.textSecondary,
    fontWeight: "600",
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
    gap: 8,
    marginTop: 10,
  },
  circleBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: StoreTheme.border,
    alignItems: "center",
    justifyContent: "center",
  },
  rightCol: {
    width: IMAGE_SIZE,
    alignItems: "center",
    paddingBottom: 2,
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
  imageVisible: { opacity: 1 },
  imageHidden: { opacity: 0 },
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
    width: IMAGE_SIZE - 16,
    marginTop: 8,
    zIndex: 2,
  },
  addBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: StoreTheme.accentMint,
    borderRadius: 6,
    paddingVertical: 7,
    paddingHorizontal: 10,
    minHeight: 32,
    ...StoreTheme.cardShadow,
  },
  addBtnDisabled: {
    borderColor: "#9CA3AF",
    opacity: 0.85,
  },
  addBtnText: {
    fontSize: 13,
    fontWeight: "700",
    color: StoreTheme.accentMint,
    letterSpacing: 0.5,
  },
  addBtnTextDisabled: {
    color: "#9CA3AF",
    fontSize: 11,
  },
  qtyWrap: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: StoreTheme.accentMint,
    borderRadius: 6,
    paddingVertical: 4,
    paddingHorizontal: 4,
    minHeight: 32,
    ...StoreTheme.cardShadow,
  },
  qtyBtn: {
    padding: 2,
  },
  qtyText: {
    fontSize: 13,
    fontWeight: "700",
    color: StoreTheme.accentMint,
  },
  customisable: {
    fontSize: 10,
    color: StoreTheme.textMuted,
    marginTop: 6,
    textAlign: "center",
  },
  divider: {
    marginTop: 18,
    borderBottomWidth: 1,
    borderStyle: "dotted",
    borderColor: StoreTheme.borderDotted,
  },
});
