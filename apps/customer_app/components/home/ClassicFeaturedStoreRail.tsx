/**
 * Classic food home — horizontal “ITEMS AT ₹” store cards (reference featured rail).
 * Soft zig-zag top + bottom edges (Toing-style) + light mint band.
 */

import { ScrollView, StyleSheet, TouchableOpacity, View, useWindowDimensions } from "react-native";
import { NATURAL_HORIZONTAL_SCROLL_PROPS } from "@/lib/naturalScrollProps";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import Svg, { Path } from "react-native-svg";
import { AppText } from "@/components/AppText";
import { GatiMitraColors } from "@/constants/gatimitra";
import { toAbsoluteImageUrl } from "@/utils/mediaUrl";
import type { StoreFoodItemsUnderPrice } from "@/services/foodHomeItemsUnderPrice.service";
import type { MerchantSummary } from "@/services/merchant.service";
import { formatMerchantDeliveryTime } from "@/lib/merchantDeliveryTime";
import { resolveMerchantBannerUri } from "@/lib/merchantBanner";
import { sizedImageUrl } from "@/lib/imageSizing";
import { isClassicPopularRatedStore } from "@/lib/classicStoreRating";
import { useMerchantLiveStatus } from "@/hooks/useMerchantLiveStatus";

type Props = {
  stores: StoreFoodItemsUnderPrice[];
  merchantsById: Map<string, MerchantSummary>;
  weatherDelayMinutes?: number;
  onPressStore: (storePublicId: string, merchant?: MerchantSummary) => void;
};

const CARD_W = 168;
const IMG_H = 132;

/** Soft mint band — halka but clearly darker than page white. */
const BAND_BG = "#A8D5BC";
/** Dark navy — readable on mint. */
const HEADLINE_BLUE = "#0F2744";
const ZIG_H = 14;
const ZIG_TOOTH = 12;

/** Sharp zig-zag edge (postage/receipt style). `flip` = bottom edge. */
function ZigZagEdge({
  width,
  color,
  flip = false,
}: {
  width: number;
  color: string;
  flip?: boolean;
}) {
  const w = Math.max(320, Math.ceil(width));
  const peak = 1;
  const valley = ZIG_H - 1;
  let d = `M 0 ${valley}`;
  for (let x = 0; x < w + ZIG_TOOTH; x += ZIG_TOOTH) {
    const mid = x + ZIG_TOOTH / 2;
    const end = x + ZIG_TOOTH;
    d += ` L ${mid} ${peak} L ${end} ${valley}`;
  }
  d += ` L ${w} ${ZIG_H} L 0 ${ZIG_H} Z`;

  return (
    <Svg
      width={w}
      height={ZIG_H}
      style={[styles.zigZag, flip && styles.zigZagFlip]}
      pointerEvents="none"
    >
      <Path d={d} fill={color} />
    </Svg>
  );
}

function FeaturedStoreCard({
  store,
  minPrice,
  cover,
  merchant,
  weatherDelayMinutes,
  onPressStore,
}: {
  store: StoreFoodItemsUnderPrice;
  minPrice: number;
  cover: StoreFoodItemsUnderPrice["items"][number];
  merchant?: MerchantSummary;
  weatherDelayMinutes: number;
  onPressStore: (storePublicId: string, merchant?: MerchantSummary) => void;
}) {
  // Same OPEN/CLOSED source as grid + discovery cards.
  const liveStatus = useMerchantLiveStatus(
    merchant ?? {
      id: store.storePublicId,
      liveStatus: undefined,
      isOpen: undefined,
      nextOpenAt: null,
      nextCloseAt: null,
    }
  );
  const storeOpen = liveStatus === "OPEN";

  const bannerBase =
    (merchant ? resolveMerchantBannerUri(merchant) : null) ||
    toAbsoluteImageUrl(cover.imageUrl) ||
    cover.imageUrl;
  // Featured cover paints at CARD_W wide — request a matching WebP derivative.
  const banner = sizedImageUrl(bannerBase, CARD_W) ?? bannerBase;
  const rating =
    store.avgRating != null && store.avgRating > 0
      ? store.avgRating.toFixed(1)
      : merchant?.avgRating != null && Number(merchant.avgRating) > 0
        ? Number(merchant.avgRating).toFixed(1)
        : null;
  const eta =
    store.deliveryTime?.trim() ||
    (merchant
      ? formatMerchantDeliveryTime(merchant, { weatherDelayMinutes })
      : null);
  const cuisine =
    Array.isArray(merchant?.cuisines) && merchant!.cuisines!.length > 0
      ? merchant!.cuisines!.slice(0, 2).join(", ")
      : null;

  return (
    <TouchableOpacity
      style={[styles.card, !storeOpen && styles.cardFaded]}
      activeOpacity={0.92}
      onPress={() => onPressStore(store.storePublicId, merchant)}
    >
      <View style={styles.imageWrap}>
        {banner ? (
          <Image
            source={{ uri: banner }}
            style={styles.image}
            contentFit="cover"
            cachePolicy="memory-disk"
            priority="high"
            transition={0}
            recyclingKey={`classic-feat-${store.storePublicId}`}
          />
        ) : (
          <View style={[styles.image, styles.imageFallback]} />
        )}
        <LinearGradient
          colors={
            storeOpen
              ? ["transparent", "rgba(15,23,42,0.45)"]
              : ["transparent", "rgba(15,23,42,0.78)"]
          }
          style={styles.shade}
        />
        <AppText style={styles.itemsAt}>ITEMS AT ₹{Math.round(minPrice)}</AppText>
      </View>
      <AppText style={styles.name} numberOfLines={1}>
        {store.storeName}
      </AppText>
      <View style={styles.metaRow}>
        {rating ? (
          <>
            <Ionicons name="star" size={11} color={GatiMitraColors.primaryMint} />
            <AppText style={styles.meta}>{rating}</AppText>
          </>
        ) : null}
        {eta ? (
          <AppText style={styles.meta}>
            {rating ? " · " : ""}
            {eta}
          </AppText>
        ) : null}
      </View>
      {cuisine ? (
        <AppText style={styles.cuisine} numberOfLines={1}>
          {cuisine}
        </AppText>
      ) : null}
    </TouchableOpacity>
  );
}

export function ClassicFeaturedStoreRail({
  stores,
  merchantsById,
  weatherDelayMinutes = 0,
  onPressStore,
}: Props) {
  const { width: winW } = useWindowDimensions();
  const list = stores
    .map((s) => {
      const merchant = merchantsById.get(s.storePublicId);
      if (!isClassicPopularRatedStore(s, merchant)) return null;
      const imaged = s.items.filter((i) => Boolean(i.imageUrl?.trim()));
      if (imaged.length === 0) return null;
      const minPrice = Math.min(...imaged.map((i) => i.price).filter((p) => p > 0));
      if (!Number.isFinite(minPrice) || minPrice <= 0) return null;
      return { store: s, minPrice, cover: imaged[0]! };
    })
    .filter(Boolean)
    .slice(0, 16) as Array<{
    store: StoreFoodItemsUnderPrice;
    minPrice: number;
    cover: StoreFoodItemsUnderPrice["items"][number];
  }>;

  if (list.length === 0) return null;

  return (
    <View style={styles.wrap}>
      <ZigZagEdge width={winW} color={BAND_BG} />
      <View style={styles.bandBody}>
        <View style={styles.promoBand}>
          <AppText style={styles.promoTitle}>Popular Stores Near you</AppText>
        </View>
        <ScrollView {...NATURAL_HORIZONTAL_SCROLL_PROPS} contentContainerStyle={styles.row}>
          {list.map(({ store, minPrice, cover }) => (
            <FeaturedStoreCard
              key={store.storePublicId}
              store={store}
              minPrice={minPrice}
              cover={cover}
              merchant={merchantsById.get(store.storePublicId)}
              weatherDelayMinutes={weatherDelayMinutes}
              onPressStore={onPressStore}
            />
          ))}
        </ScrollView>
      </View>
      <ZigZagEdge width={winW} color={BAND_BG} flip />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: 8,
    marginBottom: 10,
    backgroundColor: "transparent",
  },
  zigZag: {
    width: "100%",
    marginBottom: -1,
  },
  zigZagFlip: {
    transform: [{ scaleY: -1 }],
    marginBottom: 0,
    marginTop: -1,
  },
  bandBody: {
    backgroundColor: BAND_BG,
    paddingBottom: 12,
  },
  promoBand: {
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 10,
  },
  promoTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: HEADLINE_BLUE,
    letterSpacing: -0.2,
  },
  row: {
    paddingHorizontal: 16,
    gap: 12,
  },
  card: {
    width: CARD_W,
  },
  cardFaded: {
    opacity: 0.48,
  },
  imageWrap: {
    width: CARD_W,
    height: IMG_H,
    borderRadius: 14,
    overflow: "hidden",
    backgroundColor: "#E5E7EB",
  },
  image: {
    width: "100%",
    height: "100%",
  },
  imageFallback: {
    backgroundColor: "#CBD5E1",
  },
  shade: {
    ...StyleSheet.absoluteFillObject,
  },
  itemsAt: {
    position: "absolute",
    left: 10,
    bottom: 10,
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.2,
  },
  name: {
    marginTop: 8,
    fontSize: 13,
    fontWeight: "800",
    color: GatiMitraColors.textPrimaryNew,
  },
  metaRow: {
    marginTop: 3,
    flexDirection: "row",
    alignItems: "center",
  },
  meta: {
    fontSize: 11,
    fontWeight: "600",
    color: GatiMitraColors.textSecondary,
  },
  cuisine: {
    marginTop: 2,
    fontSize: 11,
    fontWeight: "500",
    color: GatiMitraColors.textSecondary,
  },
});
