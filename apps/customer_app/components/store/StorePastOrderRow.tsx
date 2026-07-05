import React, { useCallback, useEffect, useMemo, useState } from "react";
import { View, StyleSheet } from "react-native";
import { Image } from "expo-image";
import type { MenuItem } from "@/services/merchant.service";
import { StoreTheme } from "@/constants/storeTheme";
import { StoreText } from "./StoreText";
import { DietIndicator } from "./DietIndicator";
import { MenuItemImagePlaceholder } from "./MenuItemImagePlaceholder";
import { StoreMenuAddButton, StoreMenuQtyStepper } from "./StoreMenuCartControls";
import { getItemDiet, getSellingPrice } from "./storeMenuUtils";
import { toAbsoluteImageUrl } from "@/utils/mediaUrl";

export type PastOrderItem = {
  menuItem: MenuItem;
  orderedAt: string;
  userRating?: number | null;
};

export type StorePastOrderRowProps = {
  item: PastOrderItem;
  quantity: number;
  onAdd: (item: MenuItem) => void;
  onIncrement: (itemId: string, menuItemId?: number) => void;
  onDecrement: (itemId: string, menuItemId?: number) => void;
  isStoreClosed?: boolean;
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
const ACTION_W = 88;

export function StorePastOrderRow({
  item: { menuItem, orderedAt, userRating },
  quantity,
  onAdd,
  onIncrement,
  onDecrement,
  isStoreClosed = false,
}: StorePastOrderRowProps) {
  const [imageFailed, setImageFailed] = useState(false);
  const isCustomisable =
    menuItem.hasVariants || menuItem.hasAddons || menuItem.hasCustomizations;
  const diet = getItemDiet(menuItem);
  const sellingPrice = getSellingPrice(menuItem);
  const imageUri = useMemo(
    () => (menuItem.imageUrl?.trim() ? (toAbsoluteImageUrl(menuItem.imageUrl) ?? menuItem.imageUrl) : null),
    [menuItem.imageUrl]
  );

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
    <View style={styles.row}>
      <View style={styles.imageCol}>
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

      <View style={styles.infoCol}>
        <StoreText style={styles.name} bold numberOfLines={2}>
          {menuItem.name}
        </StoreText>
        <StoreText style={styles.price} bold>
          ₹{Math.round(sellingPrice)}
        </StoreText>
        <StoreText style={styles.orderedAgo}>{formatOrderedAgo(orderedAt)}</StoreText>
        {userRating != null && userRating > 0 ? (
          <StoreText style={styles.rating}>You rated {Math.round(userRating)} ★</StoreText>
        ) : null}
      </View>

      <View style={styles.actionCol}>
        {quantity === 0 ? (
          <StoreMenuAddButton
            onPress={handleAdd}
            disabled={isStoreClosed}
            style={styles.addControl}
          />
        ) : (
          <StoreMenuQtyStepper
            quantity={quantity}
            disabled={isStoreClosed}
            onIncrement={handleIncrement}
            onDecrement={handleDecrement}
            style={styles.addControl}
          />
        )}
        {isCustomisable ? (
          <StoreText style={styles.customisable}>customisable</StoreText>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    gap: 12,
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
  price: {
    fontSize: 18,
    color: StoreTheme.textPrimary,
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
    alignItems: "center",
    justifyContent: "center",
  },
  addControl: {
    width: ACTION_W,
  },
  customisable: {
    fontSize: 10,
    color: StoreTheme.textMuted,
    marginTop: 5,
    textAlign: "center",
  },
});
