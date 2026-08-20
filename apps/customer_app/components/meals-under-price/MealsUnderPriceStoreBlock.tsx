import { ScrollView, StyleSheet, TouchableOpacity, View, useWindowDimensions } from "react-native";
import { AppText } from "@/components/AppText";

import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { DietIndicator } from "@/components/store/DietIndicator";
import { getBasePrice, getSellingPrice } from "@/components/store/storeMenuUtils";
import type { FoodItemUnderPrice, StoreFoodItemsUnderPrice } from "@/services/foodHomeItemsUnderPrice.service";
import type { MenuItem } from "@/services/merchant.service";
import { toAbsoluteImageUrl } from "@/utils/mediaUrl";
import { MerchantDarkPalette, useMerchantUiDark } from "@/features/merchant-detail/merchantUiTheme";

type Props = {
  store: StoreFoodItemsUnderPrice;
  onPressItem: (storePublicId: string, itemId: string) => void;
  onPressViewMenu: (storePublicId: string) => void;
  onPressViewCart: (item: FoodItemUnderPrice, store: StoreFoodItemsUnderPrice) => void;
};

const PAD = 16;
const CARD_GAP = 10;
const ZOMATO_GREEN = "#24963F";
const OFFER_BLUE = "#256FEF";

function toMenuItem(item: FoodItemUnderPrice): MenuItem {
  return {
    id: item.itemId,
    menuItemId: item.menuItemPk,
    name: item.name,
    price: item.price,
    basePrice: item.basePrice ?? undefined,
    discountPercentage: item.discountPercentage ?? undefined,
    isVeg: item.isVeg,
  };
}

function formatRating(rating: number | null | undefined): string {
  if (rating != null && Number.isFinite(rating) && rating > 0) {
    return Number(rating).toFixed(1);
  }
  return "New";
}

function formatReviewHint(totalReviews: number | null | undefined): string | null {
  if (totalReviews == null || !Number.isFinite(totalReviews) || totalReviews <= 0) return null;
  if (totalReviews >= 1_000_000) return `By ${(totalReviews / 1_000_000).toFixed(1)}M+`;
  if (totalReviews >= 1000) return `By ${(totalReviews / 1000).toFixed(1)}K+`;
  return `By ${Math.round(totalReviews)}+`;
}

function formatPrice(amount: number): string {
  const hasDecimals = Math.abs(amount % 1) > 0.001;
  return `₹${amount.toFixed(hasDecimals ? 2 : 0)}`;
}

function MealsUnderPriceItemCard({
  item,
  cardWidth,
  imageHeight,
  onPressItem,
  onPressViewCart,
}: {
  item: FoodItemUnderPrice;
  cardWidth: number;
  imageHeight: number;
  onPressItem: () => void;
  onPressViewCart: () => void;
}) {
  const uri = toAbsoluteImageUrl(item.imageUrl);
  const menuItem = toMenuItem(item);
  const sellingPrice = getSellingPrice(menuItem);
  const basePrice = getBasePrice(menuItem);
  const showStrike = basePrice != null && basePrice > sellingPrice;
  const dark = useMerchantUiDark();

  return (
    <View style={[styles.itemCard, dark && styles.itemCardDark, { width: cardWidth }]}>
      <TouchableOpacity activeOpacity={0.94} onPress={onPressItem}>
        <View style={[styles.imageWrap, dark && styles.imageWrapDark, { height: imageHeight }]}>
          {uri ? (
            <Image source={{ uri }} style={styles.image} contentFit="cover" cachePolicy="memory-disk" />
          ) : (
            <View style={[styles.imagePlaceholder, dark && styles.imagePlaceholderDark]}>
              <Ionicons name="restaurant-outline" size={28} color={dark ? MerchantDarkPalette.textDim : "#9CA3AF"} />
            </View>
          )}
        </View>

        <View style={styles.cardBody}>
          <View style={styles.nameRow}>
            <DietIndicator type={item.isVeg ? "veg" : "nonveg"} />
            <AppText style={[styles.itemName, dark && styles.itemNameDark]} numberOfLines={2}>
              {item.name}
            </AppText>
          </View>

          <View style={styles.priceActionRow}>
            <View style={styles.priceCol}>
              <AppText style={[styles.itemPrice, dark && styles.itemPriceDark]}>{formatPrice(sellingPrice)}</AppText>
              {showStrike ? (
                <AppText style={[styles.itemStrike, dark && styles.itemStrikeDark]}>{formatPrice(basePrice!)}</AppText>
              ) : null}
            </View>
            <TouchableOpacity
              style={[styles.viewCartBtn, dark && styles.viewCartBtnDark]}
              activeOpacity={0.86}
              onPress={(e) => {
                e.stopPropagation?.();
                onPressViewCart();
              }}
            >
              <AppText style={[styles.viewCartBtnText, dark && styles.viewCartBtnTextDark]}>View cart</AppText>
              <Ionicons name="chevron-forward" size={11} color={dark ? MerchantDarkPalette.accent : ZOMATO_GREEN} />
            </TouchableOpacity>
          </View>

          {showStrike ? (
            <AppText style={[styles.offerHint, dark && styles.offerHintDark]}>Best offer applied</AppText>
          ) : null}
        </View>
      </TouchableOpacity>
    </View>
  );
}

export function MealsUnderPriceStoreBlock({
  store,
  onPressItem,
  onPressViewMenu,
  onPressViewCart,
}: Props) {
  const { width: windowWidth } = useWindowDimensions();
  const cardWidth = Math.round(windowWidth * 0.58);
  const imageHeight = Math.round(cardWidth * 0.7);
  const snapInterval = cardWidth + CARD_GAP;

  const reviewHint = formatReviewHint(store.totalReviews);
  const ratingLabel = formatRating(store.avgRating);
  const visibleItems = store.items;
  const dark = useMerchantUiDark();

  if (visibleItems.length === 0) return null;

  return (
    <View style={[styles.section, dark && styles.sectionDark]}>
      <View style={styles.headerRow}>
        <View style={styles.headerLeft}>
          <AppText style={[styles.storeName, dark && styles.storeNameDark]} numberOfLines={2}>
            {store.storeName}
          </AppText>
          <View style={styles.metaRow}>
            {store.deliveryTime ? (
              <>
                <Ionicons name="flash" size={12} color={dark ? MerchantDarkPalette.accent : ZOMATO_GREEN} />
                <AppText style={[styles.metaText, styles.metaHighlight, dark && styles.metaHighlightDark]}>
                  {store.deliveryTime}
                </AppText>
                <AppText style={[styles.metaDot, dark && styles.metaDotDark]}>|</AppText>
              </>
            ) : null}
            <AppText style={[styles.secureDeliveryText, dark && styles.secureDeliveryTextDark]}>
              Secure and Fast Delivery
            </AppText>
          </View>
        </View>
        <View style={styles.ratingCol}>
          <View style={styles.ratingPill}>
            <AppText style={styles.ratingText}>{ratingLabel}</AppText>
            <Ionicons name="star" size={9} color="#FFFFFF" />
          </View>
          {reviewHint ? (
            <AppText style={[styles.reviewHint, dark && styles.reviewHintDark]}>{reviewHint}</AppText>
          ) : null}
        </View>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        decelerationRate="fast"
        snapToInterval={snapInterval}
        snapToAlignment="start"
        disableIntervalMomentum
        contentContainerStyle={styles.itemRow}
      >
        {visibleItems.map((item) => (
          <MealsUnderPriceItemCard
            key={`${item.storePublicId}-${item.itemId}`}
            item={item}
            cardWidth={cardWidth}
            imageHeight={imageHeight}
            onPressItem={() => onPressItem(item.storePublicId, item.itemId)}
            onPressViewCart={() => onPressViewCart(item, store)}
          />
        ))}
      </ScrollView>

      <TouchableOpacity
        style={[styles.menuBtn, dark && styles.menuBtnDark]}
        activeOpacity={0.88}
        onPress={() => onPressViewMenu(store.storePublicId)}
      >
        <AppText style={[styles.menuBtnText, dark && styles.menuBtnTextDark]}>View full menu</AppText>
        <Ionicons name="chevron-forward" size={14} color={dark ? MerchantDarkPalette.textDim : "#9CA3AF"} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    backgroundColor: "#FFFFFF",
    paddingTop: 12,
    paddingBottom: 10,
    borderBottomWidth: 8,
    borderBottomColor: "#F3F4F6",
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    paddingHorizontal: PAD,
    marginBottom: 10,
    gap: 12,
  },
  headerLeft: {
    flex: 1,
    gap: 7,
  },
  storeName: {
    fontSize: 15,
    fontWeight: "800",
    color: "#1C1C1C",
    lineHeight: 20,
    letterSpacing: -0.3,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    flexWrap: "wrap",
  },
  metaText: {
    fontSize: 12,
    color: "#696969",
    fontWeight: "600",
  },
  metaHighlight: {
    color: ZOMATO_GREEN,
    fontWeight: "700",
  },
  metaDot: {
    fontSize: 12,
    color: "#CFCFCF",
    fontWeight: "600",
  },
  secureDeliveryText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#696969",
  },
  ratingCol: {
    alignItems: "flex-end",
    gap: 3,
    minWidth: 54,
  },
  ratingPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: ZOMATO_GREEN,
    borderRadius: 7,
    paddingHorizontal: 7,
    paddingVertical: 4,
    minWidth: 48,
    justifyContent: "center",
  },
  ratingText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "800",
  },
  reviewHint: {
    fontSize: 10,
    fontWeight: "500",
    color: "#9CA3AF",
  },
  itemRow: {
    paddingHorizontal: PAD,
    gap: CARD_GAP,
    paddingBottom: 2,
  },
  itemCard: {
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: "#FFFFFF",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#E5E7EB",
  },
  imageWrap: {
    width: "100%",
    backgroundColor: "#E5E7EB",
  },
  image: {
    width: "100%",
    height: "100%",
  },
  imagePlaceholder: {
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F3F4F6",
  },
  cardBody: {
    paddingHorizontal: 9,
    paddingTop: 7,
    paddingBottom: 8,
    gap: 5,
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 5,
    minHeight: 28,
  },
  itemName: {
    flex: 1,
    fontSize: 12,
    fontWeight: "600",
    color: "#1C1C1C",
    lineHeight: 15,
  },
  priceActionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  priceCol: {
    flex: 1,
    flexDirection: "row",
    alignItems: "baseline",
    gap: 5,
    flexWrap: "wrap",
    minWidth: 0,
  },
  itemPrice: {
    fontSize: 16,
    fontWeight: "900",
    color: "#111111",
    letterSpacing: -0.4,
  },
  itemStrike: {
    fontSize: 13,
    fontWeight: "500",
    color: "#A3A3A3",
    textDecorationLine: "line-through",
    letterSpacing: -0.2,
  },
  offerHint: {
    fontSize: 11,
    fontWeight: "600",
    color: OFFER_BLUE,
    marginTop: -2,
  },
  viewCartBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 0,
    borderWidth: 1,
    borderColor: ZOMATO_GREEN,
    backgroundColor: "#FFFFFF",
    borderRadius: 6,
    paddingVertical: 5,
    paddingHorizontal: 9,
    flexShrink: 0,
  },
  viewCartBtnText: {
    fontSize: 11,
    fontWeight: "700",
    color: ZOMATO_GREEN,
  },
  menuBtn: {
    marginTop: 10,
    marginHorizontal: PAD,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 10,
    paddingVertical: 9,
    paddingHorizontal: 16,
    backgroundColor: "#FFFFFF",
  },
  menuBtnText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#374151",
  },
  sectionDark: {
    backgroundColor: MerchantDarkPalette.bg,
    borderBottomColor: MerchantDarkPalette.elevated,
  },
  storeNameDark: {
    color: MerchantDarkPalette.text,
  },
  metaHighlightDark: {
    color: MerchantDarkPalette.accent,
  },
  metaDotDark: {
    color: MerchantDarkPalette.border,
  },
  secureDeliveryTextDark: {
    color: MerchantDarkPalette.textMuted,
  },
  reviewHintDark: {
    color: MerchantDarkPalette.textDim,
  },
  itemCardDark: {
    backgroundColor: MerchantDarkPalette.card,
    borderColor: MerchantDarkPalette.border,
  },
  imageWrapDark: {
    backgroundColor: MerchantDarkPalette.elevated,
  },
  imagePlaceholderDark: {
    backgroundColor: MerchantDarkPalette.elevated,
  },
  itemNameDark: {
    color: MerchantDarkPalette.text,
  },
  itemPriceDark: {
    color: MerchantDarkPalette.accent,
  },
  itemStrikeDark: {
    color: MerchantDarkPalette.textDim,
  },
  offerHintDark: {
    color: MerchantDarkPalette.offer,
  },
  viewCartBtnDark: {
    backgroundColor: "transparent",
    borderColor: MerchantDarkPalette.accent,
  },
  viewCartBtnTextDark: {
    color: MerchantDarkPalette.accent,
  },
  menuBtnDark: {
    backgroundColor: MerchantDarkPalette.card,
    borderColor: MerchantDarkPalette.border,
  },
  menuBtnTextDark: {
    color: MerchantDarkPalette.text,
  },
});
