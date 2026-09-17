/**
 * Classic store — horizontal rail of dishes that have photos (Toing-style).
 * GatiMitra mint; circular + / stepper on the image.
 */

import { Pressable, ScrollView, StyleSheet, TouchableOpacity, View, useWindowDimensions } from "react-native";
import { NATURAL_HORIZONTAL_SCROLL_PROPS } from "@/lib/naturalScrollProps";
import { Image } from "expo-image";
import { AppText } from "@/components/AppText";
import { DietIndicator } from "@/components/store/DietIndicator";
import {
  MENU_CIRCLE_CONTROL_SIZE,
  MENU_CIRCLE_STEPPER_WIDTH,
  ON_IMAGE_CONTROL_INSET,
  StoreMenuInstantCartControl,
} from "@/components/store/StoreMenuCartControls";
import { getBasePrice, getSellingPrice } from "@/components/store/storeMenuUtils";
import { resolveItemDiet } from "@/lib/itemDiet";
import { useMenuItemCartQty } from "@/hooks/useMenuItemCartQty";
import { StoreTheme } from "@/constants/storeTheme";
import { ClassicCornerRatingPill } from "@/components/home/ClassicCornerRatingPill";
import { GatiMitraColors } from "@/constants/gatimitra";
import { toAbsoluteImageUrl } from "@/utils/mediaUrl";
import type { MenuListRow } from "@/features/merchant-detail/types";
import type { MenuItem } from "@/services/merchant.service";

type Props = {
  title: string;
  items: MenuListRow[];
  merchantId: string;
  onAdd: (item: MenuItem) => void;
  onIncrement: (itemId: string, menuItemId?: number) => void;
  onDecrement: (itemId: string, menuItemId?: number) => void;
  onItemPress: (item: MenuItem) => void;
  isStoreClosed?: boolean;
};

const GAP = 12;

function FeaturedRailCard({
  item,
  cardW,
  imageH,
  merchantId,
  onAdd,
  onIncrement,
  onDecrement,
  onItemPress,
  isStoreClosed,
}: {
  item: MenuListRow;
  cardW: number;
  imageH: number;
  merchantId: string;
  onAdd: (item: MenuItem) => void;
  onIncrement: (itemId: string, menuItemId?: number) => void;
  onDecrement: (itemId: string, menuItemId?: number) => void;
  onItemPress: (item: MenuItem) => void;
  isStoreClosed: boolean;
}) {
  const uri = toAbsoluteImageUrl(item.imageUrl);
  const sell = getSellingPrice(item);
  const base = getBasePrice(item);
  const showStrike = base != null && base > sell;
  const out = item.inStock === false || isStoreClosed;
  const cartQty = useMenuItemCartQty(item.id, item.menuItemId, merchantId);
  const isCustomisable = !!(item.hasVariants || item.hasAddons || item.hasCustomizations);
  const itemRating =
    item.avgRating != null && Number.isFinite(item.avgRating) && item.avgRating > 0
      ? item.avgRating.toFixed(1)
      : null;
  const dockW = MENU_CIRCLE_STEPPER_WIDTH + ON_IMAGE_CONTROL_INSET;
  const dockH = MENU_CIRCLE_CONTROL_SIZE + ON_IMAGE_CONTROL_INSET;

  if (!uri) return null;

  return (
    <View style={[styles.card, { width: cardW }]}>
      <View style={[styles.imageWrap, { height: imageH }]} collapsable={false}>
        <View style={styles.imageClip} pointerEvents="none">
          <Image source={{ uri }} style={styles.image} contentFit="cover" cachePolicy="memory-disk" />
          {itemRating ? <ClassicCornerRatingPill rating={itemRating} cardRadius={14} /> : null}
          {item.isPopular || item.isRecommended ? (
            <View style={styles.popularTopLeft} pointerEvents="none">
              <AppText style={styles.popularTopLeftText}>Popular</AppText>
            </View>
          ) : null}
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${item.name} details`}
          onPress={() => onItemPress(item)}
          style={[styles.imagePressTop, { bottom: dockH }]}
        />
        <Pressable
          accessibilityElementsHidden
          importantForAccessibility="no"
          onPress={() => onItemPress(item)}
          style={[styles.imagePressBottomLeft, { height: dockH, right: dockW }]}
        />
        {/* Always mount when in stock — on-image so meta cannot cover the +. */}
        {!out ? (
          <View style={styles.addOnImage} pointerEvents="box-none" collapsable={false}>
            <StoreMenuInstantCartControl
              itemKey={`${merchantId}:${item.listRowKey ?? item.id}`}
              merchantId={merchantId}
              quantity={cartQty}
              disabled={isStoreClosed}
              size="circle"
              allowOptimisticAdd={!isCustomisable}
              imageCornerCutout
              onAdd={() => onAdd(item)}
              onIncrement={() => onIncrement(item.id, item.menuItemId)}
              onDecrement={() => onDecrement(item.id, item.menuItemId)}
              accessibilityLabel={`${item.name} quantity`}
            />
          </View>
        ) : null}
      </View>
      <View style={styles.meta}>
        <TouchableOpacity activeOpacity={0.92} onPress={() => onItemPress(item)}>
          <View style={styles.nameRow}>
            <DietIndicator type={resolveItemDiet({ isVeg: item.isVeg })} />
            <AppText style={styles.name} numberOfLines={2}>
              {item.name}
            </AppText>
          </View>
        </TouchableOpacity>
        <View style={styles.priceRow}>
          {showStrike ? <AppText style={styles.strike}>₹{Math.round(base!)}</AppText> : null}
          <AppText style={styles.price}>₹{Math.round(sell)}</AppText>
        </View>
      </View>
    </View>
  );
}

export function ClassicFeaturedImagedRail({
  title,
  items,
  merchantId,
  onAdd,
  onIncrement,
  onDecrement,
  onItemPress,
  isStoreClosed = false,
}: Props) {
  const { width } = useWindowDimensions();
  const cardW = Math.min(180, Math.round(width * 0.44));
  const imageH = Math.round(cardW * 0.94);

  if (items.length === 0) return null;

  return (
    <View style={styles.wrap}>
      <AppText style={styles.title}>{title}</AppText>
      <ScrollView {...NATURAL_HORIZONTAL_SCROLL_PROPS} contentContainerStyle={styles.row}>
        {items.map((item) => (
          <FeaturedRailCard
            key={item.listRowKey}
            item={item}
            cardW={cardW}
            imageH={imageH}
            merchantId={merchantId}
            onAdd={onAdd}
            onIncrement={onIncrement}
            onDecrement={onDecrement}
            onItemPress={onItemPress}
            isStoreClosed={isStoreClosed}
          />
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingTop: 8,
    paddingBottom: 4,
    backgroundColor: StoreTheme.background,
  },
  title: {
    fontSize: 16,
    fontWeight: "800",
    color: GatiMitraColors.textPrimaryNew,
    paddingHorizontal: 16,
    marginBottom: 10,
  },
  row: {
    paddingHorizontal: 16,
    gap: GAP,
    paddingBottom: 8,
  },
  card: {
    marginRight: 0,
    overflow: "visible",
  },
  imageWrap: {
    borderRadius: 14,
    overflow: "visible",
    backgroundColor: "transparent",
  },
  imageClip: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 14,
    overflow: "hidden",
    backgroundColor: "#F3F4F6",
  },
  imagePressTop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 2,
  },
  imagePressBottomLeft: {
    position: "absolute",
    left: 0,
    bottom: 0,
    zIndex: 2,
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
  image: {
    width: "100%",
    height: "100%",
    borderRadius: 14,
  },
  addOnImage: {
    position: "absolute",
    right: 0,
    bottom: 8,
    zIndex: 50,
    elevation: 10,
    width: MENU_CIRCLE_STEPPER_WIDTH + ON_IMAGE_CONTROL_INSET,
    maxWidth: "100%",
    height: MENU_CIRCLE_CONTROL_SIZE + ON_IMAGE_CONTROL_INSET,
    alignItems: "flex-end",
    justifyContent: "flex-end",
    backgroundColor: "transparent",
  },
  meta: {
    paddingTop: 12,
    gap: 6,
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
  },
  name: {
    flex: 1,
    fontSize: 13,
    fontWeight: "700",
    color: GatiMitraColors.textPrimaryNew,
    lineHeight: 17,
  },
  priceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  strike: {
    fontSize: 12,
    color: GatiMitraColors.textSecondary,
    textDecorationLine: "line-through",
  },
  price: {
    fontSize: 14,
    fontWeight: "800",
    color: GatiMitraColors.textPrimaryNew,
  },
});
