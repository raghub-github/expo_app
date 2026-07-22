import React, { useCallback, useEffect, useMemo, useState } from "react";
import { AppText } from "@/components/AppText";

import { Pressable, View, StyleSheet } from "react-native";
import { Image } from "expo-image";
import type { MenuItem } from "@/services/merchant.service";
import { StoreTheme } from "@/constants/storeTheme";
import { StoreText } from "./StoreText";
import { DietIndicator } from "./DietIndicator";
import { MenuItemImagePlaceholder } from "./MenuItemImagePlaceholder";
import { StoreMenuInstantCartControl, MENU_ADD_CONTROL_HEIGHT } from "./StoreMenuCartControls";
import { getItemDiet, getSellingPrice } from "./storeMenuUtils";
import { toAbsoluteImageUrl } from "@/utils/mediaUrl";
import { formatOfferRupee, type ItemOfferDisplay } from "@/lib/itemOfferDisplay";
import { useMenuItemCartQty } from "@/hooks/useMenuItemCartQty";

export type PastOrderItem = {
  menuItem: MenuItem;
  orderedAt: string;
  userRating?: number | null;
};

export type StorePastOrderRowProps = {
  item: PastOrderItem;
  merchantId: string;
  onAdd: (item: MenuItem) => void;
  onIncrement: (itemId: string, menuItemId?: number) => void;
  onDecrement: (itemId: string, menuItemId?: number) => void;
  onItemPress?: (item: MenuItem) => void;
  isStoreClosed?: boolean;
  itemOffer?: ItemOfferDisplay | null;
};

function formatOrderedAgo(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diffMs = Math.max(0, now - then);
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (days < 1) return "You ordered today";
  if (days === 1) return "You ordered yesterday";
  if (days < 30) return `You ordered ${days} days ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `You ordered ${months} month${months > 1 ? "s" : ""} ago`;
  const years = Math.floor(months / 12);
  return `You ordered ${years} year${years > 1 ? "s" : ""} ago`;
}

const IMAGE = 96;
const ACTION_W = 104;

export const StorePastOrderRow = React.memo(function StorePastOrderRow({
  item: { menuItem, orderedAt, userRating },
  merchantId,
  onAdd,
  onIncrement,
  onDecrement,
  onItemPress,
  isStoreClosed = false,
  itemOffer = null,
}: StorePastOrderRowProps) {
  const cartQty = useMenuItemCartQty(menuItem.id, menuItem.menuItemId, merchantId);
  const [imageFailed, setImageFailed] = useState(false);
  const isCustomisable = !!(
    menuItem.hasVariants ||
    menuItem.hasAddons ||
    menuItem.hasCustomizations
  );
  const diet = getItemDiet(menuItem);
  const sellingPrice = getSellingPrice(menuItem);
  const offerUnitPrice =
    itemOffer?.kind !== "bogo" && itemOffer?.offerPrice != null ? itemOffer.offerPrice : null;
  const showOfferPrice =
    offerUnitPrice != null && offerUnitPrice < sellingPrice - 0.001;
  const strikeAmount = showOfferPrice
    ? Math.round(itemOffer?.strikePrice ?? sellingPrice)
    : sellingPrice;
  const payableAmount = showOfferPrice ? offerUnitPrice! : sellingPrice;
  const imageUri = useMemo(
    () =>
      menuItem.imageUrl?.trim()
        ? (toAbsoluteImageUrl(menuItem.imageUrl) ?? menuItem.imageUrl)
        : null,
    [menuItem.imageUrl]
  );

  // Same key as menu rows so past-order + menu steppers stay in sync.
  const itemKey = `${merchantId}:${menuItem.listRowKey ?? menuItem.id}`;

  useEffect(() => {
    setImageFailed(false);
  }, [imageUri]);

  const handleAdd = useCallback(() => {
    if (isStoreClosed) return;
    onAdd(menuItem);
  }, [menuItem, onAdd, isStoreClosed]);

  const handleIncrement = useCallback(() => {
    if (isStoreClosed) return;
    onIncrement(menuItem.id, menuItem.menuItemId);
  }, [isStoreClosed, menuItem.id, menuItem.menuItemId, onIncrement]);

  const handleDecrement = useCallback(() => {
    if (isStoreClosed) return;
    onDecrement(menuItem.id, menuItem.menuItemId);
  }, [isStoreClosed, menuItem.id, menuItem.menuItemId, onDecrement]);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`View ${menuItem.name} details`}
      onPress={() => onItemPress?.(menuItem)}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
    >
      <View style={styles.imageCol} pointerEvents="none">
        <View style={styles.imageWrap}>
          {imageUri && !imageFailed ? (
            <Image
              source={{ uri: imageUri }}
              style={styles.image}
              contentFit="cover"
              cachePolicy="memory-disk"
              transition={0}
              onError={() => setImageFailed(true)}
            />
          ) : (
            <MenuItemImagePlaceholder size="sm" />
          )}
        </View>
        <View style={styles.dietBadge} pointerEvents="none">
          <DietIndicator type={diet} />
        </View>
      </View>

      <View style={styles.infoCol} pointerEvents="none">
        <StoreText style={styles.name} bold numberOfLines={2}>
          {menuItem.name}
        </StoreText>

        {showOfferPrice ? (
          <>
            <View style={styles.offerPriceRow}>
              {itemOffer?.kind === "bogo" ? (
                <View style={styles.offerBadge}>
                  <AppText style={styles.bogoBadgeText}>{itemOffer.label}</AppText>
                </View>
              ) : itemOffer ? (
                <View style={[styles.offerBadge, styles.boostBadge]}>
                  <AppText style={styles.boostBadgeText}>{itemOffer.label}</AppText>
                </View>
              ) : null}
              <AppText style={styles.basePriceStrike}>{formatOfferRupee(strikeAmount)}</AppText>
            </View>
            <AppText style={styles.discountPrice}>Get for {formatOfferRupee(payableAmount)}</AppText>
          </>
        ) : (
          <>
            {itemOffer?.kind === "bogo" ? (
              <View style={styles.offerBadge}>
                <AppText style={styles.bogoBadgeText}>{itemOffer.label}</AppText>
              </View>
            ) : itemOffer ? (
              <View style={[styles.offerBadge, styles.boostBadge]}>
                <AppText style={styles.boostBadgeText}>{itemOffer.label}</AppText>
              </View>
            ) : null}
            <StoreText style={styles.price} bold>
              {formatOfferRupee(sellingPrice)}
            </StoreText>
          </>
        )}

        <StoreText style={styles.orderedAgo}>{formatOrderedAgo(orderedAt)}</StoreText>
        {userRating != null && userRating > 0 ? (
          <StoreText style={styles.rating}>You rated {Math.round(userRating)} ★</StoreText>
        ) : null}
      </View>

      <View style={styles.actionCol} collapsable={false} pointerEvents="auto">
        <StoreMenuInstantCartControl
          itemKey={itemKey}
          merchantId={merchantId}
          quantity={cartQty}
          disabled={isStoreClosed}
          allowOptimisticAdd={!isCustomisable}
          onAdd={handleAdd}
          onIncrement={handleIncrement}
          onDecrement={handleDecrement}
          accessibilityLabel={`${menuItem.name} quantity`}
        />
        {isCustomisable ? (
          <StoreText style={styles.customisable}>customisable</StoreText>
        ) : null}
      </View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    gap: 12,
  },
  rowPressed: {
    backgroundColor: "rgba(19, 114, 67, 0.045)",
  },
  imageCol: {
    width: IMAGE,
    position: "relative",
  },
  imageWrap: {
    width: IMAGE,
    height: IMAGE,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: "#F3F4F6",
  },
  image: {
    width: "100%",
    height: "100%",
  },
  dietBadge: {
    position: "absolute",
    top: 6,
    left: 6,
    backgroundColor: "#FFFFFF",
    borderRadius: 3,
    padding: 1,
  },
  infoCol: {
    flex: 1,
    minWidth: 0,
    paddingRight: 4,
  },
  name: {
    fontSize: 17,
    color: StoreTheme.textPrimary,
    lineHeight: 23,
    letterSpacing: -0.2,
  },
  offerBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: "#2563EB",
    backgroundColor: "#EFF6FF",
  },
  boostBadge: {
    borderColor: "#2563EB",
  },
  bogoBadgeText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#2563EB",
  },
  boostBadgeText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#2563EB",
  },
  price: {
    fontSize: 18,
    color: StoreTheme.textPrimary,
    letterSpacing: -0.2,
    marginTop: 2,
  },
  offerPriceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 4,
    flexWrap: "wrap",
  },
  basePriceStrike: {
    fontSize: 14,
    fontWeight: "600",
    color: StoreTheme.textSecondary,
    textDecorationLine: "line-through",
  },
  discountPrice: {
    fontSize: 16,
    fontWeight: "700",
    color: "#2563EB",
    letterSpacing: -0.2,
    marginTop: 2,
  },
  orderedAgo: {
    fontSize: 12,
    color: "#E57373",
    marginTop: 3,
  },
  rating: {
    fontSize: 11,
    color: StoreTheme.textSecondary,
    marginTop: 2,
  },
  actionCol: {
    width: ACTION_W,
    minWidth: ACTION_W,
    minHeight: MENU_ADD_CONTROL_HEIGHT + 12,
    alignItems: "stretch",
    justifyContent: "center",
    zIndex: 60,
    elevation: 60,
    paddingVertical: 6,
  },
  customisable: {
    fontSize: 10,
    color: StoreTheme.textMuted,
    marginTop: 5,
    textAlign: "center",
  },
});
