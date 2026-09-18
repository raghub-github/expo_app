/**
 * Classic food home — horizontal rail of meals under a price cap.
 * GatiMitra mint accents; circular + / stepper anchored inside each dish image.
 */

import { Pressable, ScrollView, StyleSheet, TouchableOpacity, View } from "react-native";
import { NATURAL_HORIZONTAL_SCROLL_PROPS } from "@/lib/naturalScrollProps";
import { AppText } from "@/components/AppText";
import { Image } from "expo-image";
import { GatiMitraColors } from "@/constants/gatimitra";
import { DietIndicator } from "@/components/store/DietIndicator";
import {
  MENU_CIRCLE_CONTROL_SIZE,
  MENU_CIRCLE_STEPPER_WIDTH,
  ON_IMAGE_CONTROL_INSET,
  StoreMenuInstantCartControl,
} from "@/components/store/StoreMenuCartControls";
import { resolveItemDiet } from "@/lib/itemDiet";
import { useMenuItemCartQty } from "@/hooks/useMenuItemCartQty";
import { toAbsoluteImageUrl } from "@/utils/mediaUrl";
import type { FoodItemUnderPrice } from "@/services/foodHomeItemsUnderPrice.service";
import { GMSkeleton } from "@/components/ShimmerSkeleton";
import { ClassicFoodImagePlaceholder } from "@/components/home/ClassicFoodImagePlaceholder";

type Props = {
  title: string;
  items: FoodItemUnderPrice[];
  loading?: boolean;
  /** Keep heading + skeleton/empty rail mounted even when there are zero items. */
  alwaysVisible?: boolean;
  priceSort?: "asc" | "desc";
  onPressItem: (item: FoodItemUnderPrice) => void;
  /** Warm full-config on press-in so the sheet paints without "Loading options…". */
  onWarmItem?: (item: FoodItemUnderPrice) => void;
  /** Separate from card press — must not navigate away. */
  onPressAdd?: (item: FoodItemUnderPrice) => void;
  onIncrement?: (item: FoodItemUnderPrice) => void;
  onDecrement?: (item: FoodItemUnderPrice) => void;
  onPressSeeAll?: () => void;
};

const CARD_W = 188;
const IMAGE_H = 180;

function buildRailItems(
  items: FoodItemUnderPrice[],
  priceSort: "asc" | "desc"
): FoodItemUnderPrice[] {
  const imaged = items.filter((item) => Boolean(item.imageUrl?.trim()));
  if (imaged.length === 0) return [];

  const byStore = new Map<string, FoodItemUnderPrice[]>();
  for (const item of imaged) {
    const key = item.storePublicId || item.storeName || "store";
    const list = byStore.get(key);
    if (list) list.push(item);
    else byStore.set(key, [item]);
  }

  const dir = priceSort === "desc" ? -1 : 1;
  for (const list of byStore.values()) {
    list.sort((a, b) => (a.price - b.price) * dir);
  }

  const queues = [...byStore.values()];
  const interleaved: FoodItemUnderPrice[] = [];
  let added = true;
  while (added) {
    added = false;
    for (const q of queues) {
      const next = q.shift();
      if (next) {
        interleaved.push(next);
        added = true;
      }
    }
  }

  return [...interleaved].sort((a, b) => (a.price - b.price) * dir);
}

function UnderPriceItemCard({
  item,
  onPressItem,
  onWarmItem,
  onPressAdd,
  onIncrement,
  onDecrement,
}: {
  item: FoodItemUnderPrice;
  onPressItem: (item: FoodItemUnderPrice) => void;
  onWarmItem?: (item: FoodItemUnderPrice) => void;
  onPressAdd?: (item: FoodItemUnderPrice) => void;
  onIncrement?: (item: FoodItemUnderPrice) => void;
  onDecrement?: (item: FoodItemUnderPrice) => void;
}) {
  const uri = toAbsoluteImageUrl(item.imageUrl);
  const showStrike =
    item.basePrice != null && Number.isFinite(item.basePrice) && item.basePrice > item.price;
  const cartQty = useMenuItemCartQty(item.itemId, item.menuItemPk, item.storePublicId);
  // Always reserve stepper footprint so optimistic +→stepper never clips;
  // image press zones leave this corner alone so + never opens details.
  const dockW = MENU_CIRCLE_STEPPER_WIDTH + ON_IMAGE_CONTROL_INSET;
  const dockH = MENU_CIRCLE_CONTROL_SIZE + ON_IMAGE_CONTROL_INSET;

  const openDetails = () => onPressItem(item);
  const warmDetails = () => onWarmItem?.(item);

  return (
    <View style={styles.card}>
      <View style={styles.imageWrap} collapsable={false}>
        {/* Photo only — no gesture handler so + dock never loses the race. */}
        <View style={styles.imageClip} pointerEvents="none">
          {uri ? (
            <Image
              source={{ uri }}
              style={styles.image}
              contentFit="cover"
              cachePolicy="memory-disk"
              priority="high"
              transition={0}
              recyclingKey={`classic-meal-${item.storePublicId}-${item.itemId}`}
            />
          ) : (
            <View style={[styles.image, styles.imageFallback]}>
              <ClassicFoodImagePlaceholder iconSize={20} />
            </View>
          )}
          {item.isPopular ? (
            <View style={styles.popularBadge}>
              <AppText style={styles.popularText}>Popular</AppText>
            </View>
          ) : null}
        </View>

        {/* Sheet open: everything except the bottom-right add dock. */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${item.name} details`}
          onPressIn={warmDetails}
          onPress={openDetails}
          style={[styles.imagePressTop, { bottom: dockH }]}
        />
        <Pressable
          accessibilityElementsHidden
          importantForAccessibility="no"
          onPressIn={warmDetails}
          onPress={openDetails}
          style={[styles.imagePressBottomLeft, { height: dockH, right: dockW }]}
        />

        {/* On-image dock (not under meta) so qty-0 green + always paints. */}
        <View style={styles.addOnImage} pointerEvents="box-none" collapsable={false}>
          <StoreMenuInstantCartControl
            itemKey={`${item.storePublicId}:${item.itemId}`}
            merchantId={item.storePublicId}
            quantity={cartQty}
            size="circle"
            allowOptimisticAdd
            imageCornerCutout
            onAdd={() => onPressAdd?.(item)}
            onIncrement={() => onIncrement?.(item)}
            onDecrement={() => onDecrement?.(item)}
            accessibilityLabel={`${item.name} quantity`}
          />
        </View>
      </View>

      <AppText style={styles.store} numberOfLines={1}>
        {item.storeName}
      </AppText>
      <TouchableOpacity activeOpacity={0.9} onPressIn={warmDetails} onPress={openDetails}>
        <View style={styles.nameRow}>
          <DietIndicator type={resolveItemDiet({ isVeg: item.isVeg })} />
          <AppText style={styles.name} numberOfLines={1} ellipsizeMode="tail">
            {item.name}
          </AppText>
        </View>
      </TouchableOpacity>

      <View style={styles.priceOnlyRow}>
        {showStrike ? (
          <AppText style={styles.strike} numberOfLines={1}>
            ₹{Math.round(item.basePrice!)}
          </AppText>
        ) : null}
        <AppText style={styles.price} numberOfLines={1}>
          ₹{Math.round(item.price)}
        </AppText>
        {item.flashSale ? (
          <AppText style={styles.flashChip} numberOfLines={1}>
            Flash
          </AppText>
        ) : null}
      </View>
    </View>
  );
}

export function FoodHomeUnder250Section({
  title,
  items,
  loading,
  alwaysVisible = false,
  priceSort = "asc",
  onPressItem,
  onWarmItem,
  onPressAdd,
  onIncrement,
  onDecrement,
  onPressSeeAll,
}: Props) {
  const railItems = buildRailItems(items, priceSort);
  // Always-visible classic home: keep section chrome even while empty/loading.
  if (!alwaysVisible && !loading && railItems.length === 0) return null;
  const paintLoading = Boolean(loading);

  return (
    <View style={styles.wrap}>
      <View style={styles.headingRow}>
        <AppText style={styles.heading}>{title}</AppText>
        {onPressSeeAll ? (
          <TouchableOpacity onPress={onPressSeeAll} hitSlop={8} activeOpacity={0.85}>
            <AppText style={styles.seeAll}>See All ›</AppText>
          </TouchableOpacity>
        ) : null}
      </View>
      {paintLoading ? (
        <ScrollView {...NATURAL_HORIZONTAL_SCROLL_PROPS} contentContainerStyle={styles.row}>
          {Array.from({ length: 4 }).map((_, i) => (
            <View key={i} style={styles.skeletonCard}>
              <GMSkeleton style={styles.skeletonImage} />
              <GMSkeleton style={styles.skeletonLineWide} />
              <GMSkeleton style={styles.skeletonLineNarrow} />
            </View>
          ))}
        </ScrollView>
      ) : railItems.length > 0 ? (
        <ScrollView {...NATURAL_HORIZONTAL_SCROLL_PROPS} contentContainerStyle={styles.row}>
          {railItems.map((item) => (
            <UnderPriceItemCard
              key={`${item.storePublicId}-${item.itemId}`}
              item={item}
              onPressItem={onPressItem}
              onWarmItem={onWarmItem}
              onPressAdd={onPressAdd}
              onIncrement={onIncrement}
              onDecrement={onDecrement}
            />
          ))}
        </ScrollView>
      ) : alwaysVisible ? (
        <View style={styles.emptyWrap}>
          <AppText style={styles.emptyText}>No items in this price range nearby</AppText>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingTop: 0,
    paddingBottom: 4,
  },
  headingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    marginBottom: 8,
    marginTop: 0,
  },
  heading: {
    fontSize: 18,
    fontWeight: "800",
    color: GatiMitraColors.textPrimaryNew,
  },
  emptyWrap: {
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  emptyText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#94A3B8",
  },
  seeAll: {
    fontSize: 13,
    fontWeight: "600",
    color: GatiMitraColors.textSecondary,
  },
  row: {
    paddingHorizontal: 16,
    gap: 12,
    paddingBottom: 4,
  },
  card: {
    width: CARD_W,
    overflow: "visible",
  },
  skeletonCard: {
    width: CARD_W,
  },
  skeletonImage: {
    width: CARD_W,
    height: IMAGE_H,
    borderRadius: 16,
  },
  skeletonLineWide: {
    width: CARD_W * 0.72,
    height: 10,
    borderRadius: 5,
    marginTop: 10,
  },
  skeletonLineNarrow: {
    width: CARD_W * 0.48,
    height: 10,
    borderRadius: 5,
    marginTop: 8,
  },
  imageWrap: {
    width: CARD_W,
    height: IMAGE_H,
    borderRadius: 16,
    overflow: "visible",
    backgroundColor: "transparent",
  },
  imageClip: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: "#F3F4F6",
  },
  image: {
    width: "100%",
    height: IMAGE_H,
    borderRadius: 16,
  },
  imageFallback: {
    overflow: "hidden",
    backgroundColor: "#F6E8DC",
  },
  /** Full width above the add dock. */
  imagePressTop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 2,
  },
  /** Bottom strip left of the add dock. */
  imagePressBottomLeft: {
    position: "absolute",
    left: 0,
    bottom: 0,
    zIndex: 2,
  },
  /** Bottom-right on the photo — above meta siblings so + never hides. */
  addOnImage: {
    position: "absolute",
    right: 0,
    bottom: 8,
    zIndex: 50,
    elevation: 10,
    width: MENU_CIRCLE_STEPPER_WIDTH + 4,
    height: MENU_CIRCLE_CONTROL_SIZE + 4,
    alignItems: "flex-end",
    justifyContent: "flex-end",
    overflow: "visible",
    backgroundColor: "transparent",
  },
  popularBadge: {
    position: "absolute",
    top: 8,
    left: 8,
    backgroundColor: GatiMitraColors.primaryMint,
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  popularText: {
    fontSize: 10,
    fontWeight: "800",
    color: "#FFFFFF",
  },
  store: {
    marginTop: 12,
    fontSize: 11,
    color: GatiMitraColors.textSecondary,
  },
  nameRow: {
    marginTop: 4,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    minHeight: 18,
  },
  name: {
    flex: 1,
    fontSize: 13,
    fontWeight: "700",
    color: GatiMitraColors.textPrimaryNew,
  },
  priceOnlyRow: {
    marginTop: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minHeight: 18,
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
  flashChip: {
    fontSize: 9,
    fontWeight: "800",
    color: "#C2410C",
    letterSpacing: 0.2,
  },
});
