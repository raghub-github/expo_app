import React, { useCallback, useEffect, useMemo, useState } from "react";
import { AppText } from "@/components/AppText";
import { Pressable, View, StyleSheet } from "react-native";
import { Image } from "expo-image";
import type { MenuItem } from "@/services/merchant.service";
import { StoreTheme } from "@/constants/storeTheme";
import { StoreFonts } from "@/constants/storeTypography";
import { DietIndicator } from "./DietIndicator";
import { MenuItemImagePlaceholder } from "./MenuItemImagePlaceholder";
import { StoreMenuInstantCartControl } from "./StoreMenuCartControls";
import { getBasePrice, getItemDiet, getSellingPrice } from "./storeMenuUtils";
import { toAbsoluteImageUrl } from "@/utils/mediaUrl";
import { formatOfferRupee, resolveMenuOfferPriceDisplay, type ItemOfferDisplay } from "@/lib/itemOfferDisplay";
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
  showDivider?: boolean;
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

const THUMB = 56;
const ACTION_W = 90;

export const StorePastOrderRow = React.memo(function StorePastOrderRow({
  item: { menuItem, orderedAt, userRating },
  merchantId,
  onAdd,
  onIncrement,
  onDecrement,
  onItemPress,
  isStoreClosed = false,
  itemOffer = null,
  showDivider = true,
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
  const { payable: payableAmount, strike: strikeAmount, showStrike: showOfferPrice } =
    resolveMenuOfferPriceDisplay({
      sellingPrice,
      basePrice: getBasePrice(menuItem),
      itemOffer,
    });
  const imageUri = useMemo(
    () =>
      menuItem.imageUrl?.trim()
        ? (toAbsoluteImageUrl(menuItem.imageUrl) ?? menuItem.imageUrl)
        : null,
    [menuItem.imageUrl]
  );

  const itemKey = `${merchantId}:${menuItem.listRowKey ?? menuItem.id}`;

  useEffect(() => {
    setImageFailed(false);
  }, [imageUri]);

  const outOfStock = menuItem.inStock === false;
  const controlsDisabled = isStoreClosed || outOfStock;

  const handleAdd = useCallback(() => {
    if (controlsDisabled) return;
    onAdd(menuItem);
  }, [menuItem, onAdd, controlsDisabled]);

  const handleIncrement = useCallback(() => {
    if (controlsDisabled) return;
    onIncrement(menuItem.id, menuItem.menuItemId);
  }, [controlsDisabled, menuItem.id, menuItem.menuItemId, onIncrement]);

  const handleDecrement = useCallback(() => {
    if (controlsDisabled) return;
    onDecrement(menuItem.id, menuItem.menuItemId);
  }, [controlsDisabled, menuItem.id, menuItem.menuItemId, onDecrement]);

  return (
    <View style={styles.rowWrap}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`View ${menuItem.name} details`}
        onPress={() => onItemPress?.(menuItem)}
        style={({ pressed }) => [styles.pressable, pressed && styles.rowPressed]}
      >
        <View style={styles.row}>
          <View style={styles.thumbSlot} pointerEvents="none">
            {imageUri && !imageFailed ? (
              <Image
                source={{ uri: imageUri }}
                style={styles.thumbImage}
                contentFit="cover"
                cachePolicy="memory-disk"
                transition={0}
                onError={() => setImageFailed(true)}
              />
            ) : (
              <View style={styles.thumbPlaceholder}>
                <MenuItemImagePlaceholder size="xs" />
              </View>
            )}
            <View style={styles.dietBadge}>
              <DietIndicator type={diet} />
            </View>
          </View>

          <View style={styles.bodyCol} pointerEvents="none">
            <AppText style={styles.name} numberOfLines={2} ellipsizeMode="tail">
              {menuItem.name}
            </AppText>

            {showOfferPrice ? (
              <>
                <View style={styles.offerPriceRow}>
                  {itemOffer ? (
                    <View style={styles.offerBadge}>
                      <AppText style={styles.offerBadgeText} numberOfLines={1}>
                        {itemOffer.label}
                      </AppText>
                    </View>
                  ) : null}
                  <AppText style={styles.basePriceStrike} numberOfLines={1}>
                    {formatOfferRupee(strikeAmount ?? payableAmount)}
                  </AppText>
                </View>
                <AppText style={styles.discountPrice} numberOfLines={1}>
                  Get for {formatOfferRupee(payableAmount)}
                </AppText>
              </>
            ) : (
              <>
                {itemOffer ? (
                  <View style={styles.offerBadge}>
                    <AppText style={styles.offerBadgeText} numberOfLines={1}>
                      {itemOffer.label}
                    </AppText>
                  </View>
                ) : null}
                <AppText style={styles.price} numberOfLines={1}>
                  {formatOfferRupee(sellingPrice)}
                </AppText>
              </>
            )}

            <AppText style={styles.meta} numberOfLines={1} ellipsizeMode="tail">
              {formatOrderedAgo(orderedAt)}
            </AppText>
            {userRating != null && userRating > 0 ? (
              <AppText style={styles.meta} numberOfLines={1}>
                You rated {Math.round(userRating)} ★
              </AppText>
            ) : null}
          </View>

          <View style={styles.actionCol} pointerEvents="auto" collapsable={false}>
            <StoreMenuInstantCartControl
              itemKey={itemKey}
              merchantId={merchantId}
              quantity={cartQty}
              disabled={controlsDisabled}
              allowOptimisticAdd={!isCustomisable}
              accent="zomato"
              onAdd={handleAdd}
              onIncrement={handleIncrement}
              onDecrement={handleDecrement}
              accessibilityLabel={`${menuItem.name} quantity`}
            />
            {isCustomisable ? (
              <AppText style={styles.customisable} numberOfLines={1}>
                customisable
              </AppText>
            ) : null}
          </View>
        </View>
      </Pressable>
      {showDivider ? <View style={styles.divider} /> : null}
    </View>
  );
});

const styles = StyleSheet.create({
  rowWrap: {
    width: "100%",
    alignSelf: "stretch",
  },
  pressable: {
    width: "100%",
    alignSelf: "stretch",
  },
  row: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
  },
  rowPressed: {
    backgroundColor: "rgba(34, 197, 94, 0.05)",
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: StoreTheme.border,
    marginLeft: THUMB + 12,
  },
  thumbSlot: {
    width: THUMB,
    height: THUMB,
    borderRadius: 10,
    overflow: "hidden",
    backgroundColor: "#F3F4F6",
    flexShrink: 0,
  },
  thumbImage: {
    width: THUMB,
    height: THUMB,
  },
  thumbPlaceholder: {
    width: THUMB,
    height: THUMB,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F0F0F0",
  },
  dietBadge: {
    position: "absolute",
    top: 4,
    left: 4,
    backgroundColor: "#FFFFFF",
    borderRadius: 3,
    padding: 1,
  },
  bodyCol: {
    flex: 1,
    minWidth: 0,
    marginLeft: 12,
    marginRight: 8,
    overflow: "hidden",
  },
  name: {
    fontFamily: StoreFonts.poppinsSemiBold,
    fontSize: 14,
    color: StoreTheme.textPrimary,
    lineHeight: 18,
    letterSpacing: -0.15,
  },
  offerBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: StoreTheme.linkBlue,
    backgroundColor: "#EFF6FF",
    marginTop: 2,
    maxWidth: "100%",
  },
  offerBadgeText: {
    fontSize: 10,
    fontWeight: "700",
    color: StoreTheme.linkBlue,
  },
  price: {
    fontFamily: StoreFonts.poppinsBold,
    fontSize: 14,
    color: StoreTheme.textPrimary,
    marginTop: 2,
  },
  offerPriceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 2,
    maxWidth: "100%",
  },
  basePriceStrike: {
    fontSize: 12,
    fontWeight: "600",
    color: StoreTheme.textSecondary,
    textDecorationLine: "line-through",
    flexShrink: 1,
  },
  discountPrice: {
    fontFamily: StoreFonts.poppinsBold,
    fontSize: 14,
    color: StoreTheme.linkBlue,
    marginTop: 1,
  },
  meta: {
    fontSize: 11,
    color: StoreTheme.textSecondary,
    lineHeight: 14,
    marginTop: 2,
  },
  actionCol: {
    width: ACTION_W,
    flexShrink: 0,
    alignItems: "stretch",
    justifyContent: "center",
  },
  customisable: {
    fontSize: 9,
    color: StoreTheme.textMuted,
    marginTop: 3,
    textAlign: "center",
    textTransform: "lowercase",
  },
});
