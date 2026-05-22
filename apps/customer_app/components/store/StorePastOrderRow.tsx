import React, { useCallback, useState } from "react";
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
import type { MenuItem } from "@/services/merchant.service";
import { StoreTheme } from "@/constants/storeTheme";
import { DietIndicator } from "./DietIndicator";
import { MenuItemImagePlaceholder } from "./MenuItemImagePlaceholder";

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

  const handleAdd = useCallback(() => {
    if (isStoreClosed) return;
    if (Platform.OS === "android") Vibration.vibrate(15);
    onAdd(menuItem);
  }, [menuItem, onAdd, isStoreClosed]);

  return (
    <View style={styles.row}>
      <View style={styles.imageCol}>
        <View style={styles.imageWrap}>
          {menuItem.imageUrl && !imageFailed ? (
            <Image
              source={{ uri: menuItem.imageUrl }}
              style={styles.image}
              resizeMode="cover"
              onError={() => setImageFailed(true)}
            />
          ) : (
            <MenuItemImagePlaceholder size="sm" />
          )}
          <View style={styles.dietBadge}>
            <DietIndicator type={menuItem.isVeg ? "veg" : "nonveg"} />
          </View>
        </View>
      </View>

      <View style={styles.infoCol}>
        <Text style={styles.name} numberOfLines={2}>
          {menuItem.name}
        </Text>
        <Text style={styles.price}>₹{menuItem.price}</Text>
        <Text style={styles.orderedAgo}>{formatOrderedAgo(orderedAt)}</Text>
        {userRating != null && userRating > 0 ? (
          <Text style={styles.rating}>You rated {Math.round(userRating)} ★</Text>
        ) : null}
      </View>

      <View style={styles.actionCol}>
        {quantity === 0 ? (
          <Pressable
            onPress={handleAdd}
            disabled={isStoreClosed}
            style={[styles.addBtn, isStoreClosed && styles.addBtnDisabled]}
          >
            <Text style={styles.addBtnText}>{isStoreClosed ? "Closed" : "ADD"}</Text>
            {!isStoreClosed ? (
              <Ionicons name="add" size={14} color={StoreTheme.accentMint} />
            ) : null}
          </Pressable>
        ) : (
          <View style={styles.qtyWrap}>
            <TouchableOpacity
              onPress={() => onDecrement(menuItem.id, menuItem.menuItemId)}
              style={styles.qtyBtn}
            >
              <Ionicons name="remove" size={16} color={StoreTheme.accentMint} />
            </TouchableOpacity>
            <Text style={styles.qtyText}>{quantity}</Text>
            <TouchableOpacity
              onPress={() => onIncrement(menuItem.id, menuItem.menuItemId)}
              style={styles.qtyBtn}
            >
              <Ionicons name="add" size={16} color={StoreTheme.accentMint} />
            </TouchableOpacity>
          </View>
        )}
        {isCustomisable ? <Text style={styles.customisable}>customisable</Text> : null}
      </View>
    </View>
  );
}

const IMAGE = 72;

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingVertical: 14,
    gap: 12,
  },
  imageCol: {},
  imageWrap: {
    width: IMAGE,
    height: IMAGE,
    borderRadius: 10,
    overflow: "hidden",
    backgroundColor: "#F3F4F6",
    position: "relative",
  },
  image: {
    width: "100%",
    height: "100%",
  },
  dietBadge: {
    position: "absolute",
    top: 4,
    left: 4,
    backgroundColor: "#fff",
    borderRadius: 2,
    padding: 1,
  },
  infoCol: {
    flex: 1,
    minWidth: 0,
  },
  name: {
    fontSize: 14,
    fontWeight: "600",
    color: StoreTheme.textPrimary,
    lineHeight: 19,
    marginBottom: 4,
  },
  price: {
    fontSize: 14,
    fontWeight: "600",
    color: StoreTheme.textPrimary,
    marginBottom: 2,
  },
  orderedAgo: {
    fontSize: 12,
    color: StoreTheme.textSecondary,
  },
  rating: {
    fontSize: 12,
    color: StoreTheme.textSecondary,
    marginTop: 2,
  },
  actionCol: {
    alignItems: "center",
    minWidth: 72,
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
    paddingHorizontal: 12,
    minWidth: 72,
  },
  addBtnDisabled: {
    borderColor: "#9CA3AF",
  },
  addBtnText: {
    fontSize: 13,
    fontWeight: "700",
    color: StoreTheme.accentMint,
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
    paddingHorizontal: 6,
    minWidth: 72,
  },
  qtyBtn: { padding: 2 },
  qtyText: {
    fontSize: 13,
    fontWeight: "700",
    color: StoreTheme.accentMint,
  },
  customisable: {
    fontSize: 10,
    color: StoreTheme.textMuted,
    marginTop: 6,
  },
});
