/**
 * Classic food home — restaurant card with nested horizontal dish rail
 * (reference “Explore restaurants” / store-with-items layout).
 * GatiMitra mint accents; circular + / stepper anchored inside each dish image.
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
import { resolveItemDiet } from "@/lib/itemDiet";
import { useMenuItemCartQty } from "@/hooks/useMenuItemCartQty";
import { GatiMitraColors } from "@/constants/gatimitra";
import { toAbsoluteImageUrl } from "@/utils/mediaUrl";
import { sizedImageUrl } from "@/lib/imageSizing";
import type { FoodItemUnderPrice, StoreFoodItemsUnderPrice } from "@/services/foodHomeItemsUnderPrice.service";
import type { MerchantSummary } from "@/services/merchant.service";
import { formatMerchantDeliveryTime } from "@/lib/merchantDeliveryTime";
import {
  ClassicLowestPriceStamp,
  CLASSIC_LOWEST_PRICE_STAMP_WIDTH,
} from "@/components/home/ClassicLowestPriceStamp";
import { ClassicLowerPriceTag } from "@/components/home/ClassicLowerPriceTag";
import { ClassicCornerRatingPill } from "@/components/home/ClassicCornerRatingPill";
import { MerchantOfferRow } from "@/components/home/MerchantOfferRow";
import { ClassicFoodImagePlaceholder } from "@/components/home/ClassicFoodImagePlaceholder";
import { useMerchantLiveStatus } from "@/hooks/useMerchantLiveStatus";
import { useClassicFoodChromeStore } from "@/store/classicFoodChromeStore";
import {
  pickLowestItemPerCategory,
  type ClassicCategoryRef,
} from "@/lib/classicCategoryFromPrice";

type Props = {
  store: StoreFoodItemsUnderPrice;
  merchant?: MerchantSummary | null;
  weatherDelayMinutes?: number;
  /** Home categories — used to pick one lowest item per distinct category. */
  categories?: ClassicCategoryRef[];
  /**
   * Flat card (no shadow) while sticky chrome is active — avoids stacked elevation.
   * When omitted, reads classic Food chrome store (no parent re-render on stick).
   */
  flatChrome?: boolean;
  /**
   * @deprecated Prefer live status via useMerchantLiveStatus (same as grid/discovery).
   * Kept as optional override for tests.
   */
  storeOpen?: boolean;
  onPressStore: () => void;
  onPressAdd?: (item: FoodItemUnderPrice) => void;
  onPressItem?: (item: FoodItemUnderPrice) => void;
  onWarmItem?: (item: FoodItemUnderPrice) => void;
  onIncrement?: (item: FoodItemUnderPrice) => void;
  onDecrement?: (item: FoodItemUnderPrice) => void;
};

const PAD = 16;
const ITEM_W = 148;
const ITEM_IMG = 140;
/** Space under the photo so + / stepper never covers the dish or the item name. */
const STEPPER_BAND = 30;
const CLASSIC_HEADING = "35-45% LOWER EVERYDAY";
const RAIL_LIMIT = 12;
const CARD_RADIUS = 20;

function ClassicHomeItemCard({
  store,
  item,
  faded,
  onPressAdd,
  onPressItem,
  onWarmItem,
  onIncrement,
  onDecrement,
}: {
  store: StoreFoodItemsUnderPrice;
  item: FoodItemUnderPrice;
  faded: boolean;
  onPressAdd?: (item: FoodItemUnderPrice) => void;
  onPressItem?: (item: FoodItemUnderPrice) => void;
  onWarmItem?: (item: FoodItemUnderPrice) => void;
  onIncrement?: (item: FoodItemUnderPrice) => void;
  onDecrement?: (item: FoodItemUnderPrice) => void;
}) {
  // Dish thumbnail paints at ITEM_IMG(140)pt — request a matching WebP derivative.
  const uri = sizedImageUrl(toAbsoluteImageUrl(item.imageUrl), ITEM_IMG);
  const showStrike =
    item.basePrice != null && Number.isFinite(item.basePrice) && item.basePrice > item.price;
  const cartQty = useMenuItemCartQty(item.itemId, item.menuItemPk, store.storePublicId);

  // Always reserve stepper footprint so optimistic +→stepper never clips.
  const dockW = MENU_CIRCLE_STEPPER_WIDTH + ON_IMAGE_CONTROL_INSET;
  const dockH = MENU_CIRCLE_CONTROL_SIZE + ON_IMAGE_CONTROL_INSET;
  const openDetails = () => onPressItem?.(item);

  return (
    <View style={styles.itemCard}>
      <View style={styles.itemImageWrap} collapsable={false}>
        <View style={styles.itemImageClip} pointerEvents="none">
          {uri ? (
            <Image
              source={{ uri }}
              style={styles.itemImage}
              contentFit="cover"
              cachePolicy="memory-disk"
              priority="high"
              transition={0}
            />
          ) : (
            <View style={[styles.itemImage, styles.itemImageFallback]}>
              <ClassicFoodImagePlaceholder iconSize={18} />
            </View>
          )}
        </View>
        {onPressItem ? (
          <>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${item.name} details`}
              onPressIn={() => onWarmItem?.(item)}
              onPress={openDetails}
              style={[styles.imagePressTop, { height: ITEM_IMG - dockH + STEPPER_BAND }]}
            />
            <Pressable
              accessibilityElementsHidden
              importantForAccessibility="no"
              onPressIn={() => onWarmItem?.(item)}
              onPress={openDetails}
              style={[
                styles.imagePressBottomLeft,
                { height: dockH, right: dockW, bottom: STEPPER_BAND },
              ]}
            />
          </>
        ) : null}
        <View style={styles.addOnImage} pointerEvents="box-none" collapsable={false}>
          <StoreMenuInstantCartControl
            itemKey={`${store.storePublicId}:${item.itemId}`}
            merchantId={store.storePublicId}
            quantity={cartQty}
            disabled={faded}
            size="circle"
            allowOptimisticAdd={!faded}
            imageCornerCutout
            onAdd={() => onPressAdd?.(item)}
            onIncrement={() => onIncrement?.(item)}
            onDecrement={() => onDecrement?.(item)}
            accessibilityLabel={`${item.name} quantity`}
          />
        </View>
      </View>

      <View style={[styles.itemMeta, cartQty > 0 && styles.itemMetaBelowStepper]}>
        <TouchableOpacity
          activeOpacity={0.92}
          disabled={!onPressItem}
          onPress={() => onPressItem?.(item)}
        >
          <View style={styles.itemNameRow}>
            <DietIndicator type={resolveItemDiet({ isVeg: item.isVeg })} />
            <AppText style={styles.itemName} numberOfLines={2} ellipsizeMode="tail">
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
    </View>
  );
}

export function ClassicStoreWithItemsCard({
  store,
  merchant,
  weatherDelayMinutes = 0,
  categories = [],
  flatChrome: flatChromeProp,
  storeOpen: storeOpenOverride,
  onPressStore,
  onPressAdd,
  onPressItem,
  onWarmItem,
  onIncrement,
  onDecrement,
}: Props) {
  const { width: winW } = useWindowDimensions();
  const cardW = Math.max(280, winW - PAD * 2);
  const storeFlatChrome = useClassicFoodChromeStore((s) => s.active && s.categoriesSticky);
  const flatChrome = flatChromeProp ?? storeFlatChrome;
  // Same open/closed source as GMRestaurantCardV2 / DiscoveryRestaurantCard.
  // Keep status map warm for filters; do not use default CLOSED to hide +.
  useMerchantLiveStatus(
    merchant ?? {
      id: store.storePublicId,
      liveStatus: undefined,
      isOpen: undefined,
      nextOpenAt: null,
      nextCloseAt: null,
    }
  );

  // Prefer every under-price dish (photo or patterned placeholder).
  const railItems = [...store.items].sort((a, b) => a.price - b.price).slice(0, RAIL_LIMIT);
  const diverse =
    categories.length > 0
      ? pickLowestItemPerCategory(store.items, categories, RAIL_LIMIT)
      : [];
  const items = railItems.length > 0 ? railItems : diverse;
  if (items.length === 0) return null;

  const rating =
    store.avgRating != null && Number.isFinite(store.avgRating) && store.avgRating > 0
      ? store.avgRating.toFixed(1)
      : merchant?.avgRating != null && Number.isFinite(merchant.avgRating) && merchant.avgRating > 0
        ? Number(merchant.avgRating).toFixed(1)
        : null;
  const eta =
    store.deliveryTime?.trim() ||
    (merchant
      ? formatMerchantDeliveryTime(merchant, { weatherDelayMinutes })
      : null) ||
    null;
  const cuisine =
    Array.isArray(merchant?.cuisines) && merchant!.cuisines!.length > 0
      ? merchant!.cuisines!.slice(0, 2).join(", ")
      : null;
  const minItem = Math.min(...items.map((i) => i.price));
  // Incomplete merchant snapshots resolve liveStatus→CLOSED by default; that must
  // not hide/grey the item + buttons. Only fade on explicit closed signals.
  const rawLive = (merchant?.liveStatus ?? "").toString().trim().toUpperCase();
  const faded =
    storeOpenOverride === false ||
    merchant?.isOpen === false ||
    rawLive === "CLOSED";
  const promoLines = [
    "Free delivery with GM Plus upto 5km.",
    [cuisine, `Items At ₹${Math.round(minItem)}`].filter(Boolean).join(" · "),
    eta,
  ].filter(Boolean) as string[];

  return (
    <View
      style={[
        styles.card,
        flatChrome && styles.cardFlat,
        { width: cardW },
      ]}
    >
      {rating ? <ClassicCornerRatingPill rating={rating} cardRadius={CARD_RADIUS} /> : null}
      {/* Fade body only — LOWEST PRICE watermark stays full-strength mint. */}
      <View style={faded ? styles.cardFaded : undefined}>
        <Pressable
          onPressIn={onPressStore}
          delayPressIn={0}
          unstable_pressDelay={0}
          accessibilityRole="button"
          accessibilityLabel={`Open ${store.storeName}`}
          style={styles.header}
        >
          <View style={[styles.headerText, rating ? styles.headerTextWithRating : null]}>
            <ClassicLowerPriceTag label={CLASSIC_HEADING} />
            <AppText style={styles.storeName} numberOfLines={1} ellipsizeMode="tail">
              {store.storeName}
            </AppText>
            <View style={styles.promoTicker} pointerEvents="none">
              <MerchantOfferRow texts={promoLines} compact />
            </View>
          </View>
          {/* Spacer keeps header layout; real stamp is outside the fade layer. */}
          <View
            style={[styles.headerRight, rating ? styles.headerRightBelowPill : null]}
            pointerEvents="none"
          />
        </Pressable>

        <ScrollView
          {...NATURAL_HORIZONTAL_SCROLL_PROPS}
          contentContainerStyle={styles.itemsRow}
        >
          {items.map((item) => (
            <ClassicHomeItemCard
              key={`${store.storePublicId}-${item.itemId}`}
              store={store}
              item={item}
              faded={faded}
              onPressAdd={onPressAdd}
              onPressItem={onPressItem}
              onWarmItem={onWarmItem}
              onIncrement={onIncrement}
              onDecrement={onDecrement}
            />
          ))}
        </ScrollView>
      </View>
      <View
        style={[styles.stampOutsideFade, rating ? styles.stampOutsideFadeBelowPill : null]}
        pointerEvents="none"
      >
        <ClassicLowestPriceStamp />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    alignSelf: "center",
    marginBottom: 16,
    backgroundColor: "#FFFFFF",
    borderRadius: CARD_RADIUS,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(15,23,42,0.08)",
    paddingTop: 14,
    paddingBottom: 12,
    overflow: "visible",
    elevation: 0,
    shadowOpacity: 0,
    shadowRadius: 0,
  },
  cardFlat: {
    borderColor: "rgba(15,23,42,0.06)",
  },
  cardFaded: {
    opacity: 0.48,
  },
  header: {
    paddingHorizontal: 14,
    flexDirection: "row",
    gap: 8,
    overflow: "visible",
    zIndex: 2,
  },
  headerText: {
    flex: 1,
    minWidth: 0,
  },
  headerTextWithRating: {
    paddingRight: 8,
  },
  headerRight: {
    width: CLASSIC_LOWEST_PRICE_STAMP_WIDTH,
    alignItems: "center",
    flexShrink: 0,
    overflow: "visible",
    marginTop: -10,
  },
  headerRightBelowPill: {
    marginTop: 12,
  },
  /** Full-color stamp — not a child of cardFaded opacity. */
  stampOutsideFade: {
    position: "absolute",
    top: 4,
    right: 14,
    width: CLASSIC_LOWEST_PRICE_STAMP_WIDTH,
    alignItems: "center",
    zIndex: 4,
  },
  stampOutsideFadeBelowPill: {
    top: 26,
  },
  storeName: {
    marginTop: 2,
    fontSize: 17,
    fontWeight: "800",
    color: GatiMitraColors.textPrimaryNew,
  },
  promoTicker: {
    marginTop: 8,
  },
  itemsRow: {
    paddingHorizontal: 14,
    gap: 14,
    paddingTop: 14,
    paddingBottom: 8,
  },
  itemCard: {
    width: ITEM_W,
    // Clip stepper spill with width limits on the control, not overflow (breaks + taps).
    overflow: "visible",
  },
  itemImageWrap: {
    width: ITEM_W,
    height: ITEM_IMG + STEPPER_BAND,
    borderRadius: 14,
    overflow: "visible",
    backgroundColor: "transparent",
  },
  itemImageClip: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: ITEM_IMG,
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
    bottom: STEPPER_BAND,
    zIndex: 2,
  },
  itemImage: {
    width: "100%",
    height: ITEM_IMG,
    borderRadius: 14,
  },
  itemImageFallback: {
    overflow: "hidden",
    backgroundColor: "#F6E8DC",
  },
  /**
   * Sits in the clear band under the photo — does not cover food or the name.
   */
  addOnImage: {
    position: "absolute",
    right: 0,
    bottom: Math.max(0, STEPPER_BAND - 6),
    zIndex: 50,
    elevation: 10,
    width: Math.min(ITEM_W, MENU_CIRCLE_STEPPER_WIDTH + ON_IMAGE_CONTROL_INSET),
    height: MENU_CIRCLE_CONTROL_SIZE + ON_IMAGE_CONTROL_INSET,
    alignItems: "flex-end",
    justifyContent: "flex-end",
    overflow: "visible",
    backgroundColor: "transparent",
  },
  itemMeta: {
    marginTop: 10,
    gap: 6,
    overflow: "visible",
  },
  itemMetaBelowStepper: {
    marginTop: 16,
  },
  itemNameRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 4,
    paddingRight: 2,
    minHeight: 34,
  },
  itemName: {
    flex: 1,
    fontSize: 12,
    fontWeight: "700",
    color: GatiMitraColors.textPrimaryNew,
    lineHeight: 16,
  },
  priceOnlyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    minHeight: 18,
  },
  strike: {
    fontSize: 11,
    color: GatiMitraColors.textSecondary,
    textDecorationLine: "line-through",
  },
  price: {
    fontSize: 13,
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
