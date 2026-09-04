/**
 * Six service cards in a 2-column grid — height adapts to fill one-screen home layout.
 *
 * Base order: Food, Ride, Parcel/Grocery mid, Ecom.
 * Explore Nearby is inserted just after the last currently-active card.
 */

import { useLayoutEffect, useMemo, useEffect, useRef, useState, useCallback } from "react";
import { View, TouchableOpacity, StyleSheet, Dimensions } from "react-native";
import { useRouter } from "expo-router";
import { AppAssetImage } from "@/components/AppAssetImage";
import { GMSkeleton } from "@/components/ShimmerSkeleton";
import { CX } from "@/lib/appAssetKeys";
import { AppText } from "@/components/AppText";
import type { CustomerAccountBlocksMap } from "@/services/customerServiceBlocks.service";
import { FrozenServiceIconCircle } from "@/components/FrozenServiceIconCircle";
import type { CustomerHomeServiceId } from "@/lib/customerHomeServiceMeta";
import { prefetchCriticalHomeAssetImagesSync } from "@/lib/homeCriticalAssets";
import { useAppAssetsStore } from "@/store/appAssetsStore";
import { useServiceCardOfferPills } from "@/hooks/useServiceCardOfferPills";

const { width: SCREEN_W } = Dimensions.get("window");
const PAD = 16;
const GAP = 8;
const COLS = 2;
const CARD_W = Math.floor((SCREEN_W - PAD * 2 - GAP * (COLS - 1)) / COLS);
const DEFAULT_CARD_H = 118;
const CARD_RADIUS = 14;
const CORNER_PILL_PAD_V = 5;
const CORNER_PILL_PAD_H = 9;
const CORNER_PILL_INNER_R = 14;
const CORNER_PILL_FONT = 9;
const CORNER_PILL_LINE = 12;
/** Solid forest green — matches reference offer corner badge. */
const OFFER_PILL_GREEN = "#15803D";
/** Alias kept so Metro HMR never throws if a prior gradient paint still reads this name. */
const OFFER_PILL_GREEN_TOP = OFFER_PILL_GREEN;
/** Uniform illustration box for every service tile (prevents grocery art looking larger). */
const SERVICE_IMAGE_BOX = 52;
/** Only show image skeleton if load takes longer than this (avoids flash on cache hit). */
const SERVICE_IMAGE_SKELETON_DELAY_MS = 220;

function ServiceCardImage({
  assetKey,
  imageScale = 1,
}: {
  assetKey: string;
  imageScale?: number;
}) {
  const assetUrl = useAppAssetsStore((s) => s.assets[assetKey]?.url ?? s.assets[assetKey]?.proxyUrl ?? null);
  const hasCachedUrl = Boolean(assetUrl?.trim());
  const imageReadyRef = useRef(hasCachedUrl);
  const [showSkeleton, setShowSkeleton] = useState(false);
  // Keep image visible once painted — never hide on URL refresh (stale-while-revalidate).
  const [imageVisible, setImageVisible] = useState(hasCachedUrl);

  useEffect(() => {
    // Only reset skeleton timer when switching to a different asset key.
    // URL churn (signed URL rotate / CMS refresh) must not blank the tile.
    if (imageReadyRef.current || imageVisible) {
      setShowSkeleton(false);
      return;
    }
    setShowSkeleton(false);
    const timer = setTimeout(() => {
      if (!imageReadyRef.current) setShowSkeleton(true);
    }, SERVICE_IMAGE_SKELETON_DELAY_MS);
    return () => clearTimeout(timer);
  }, [assetKey, imageVisible]);

  const handleImageLoad = useCallback(() => {
    imageReadyRef.current = true;
    setShowSkeleton(false);
    setImageVisible(true);
  }, []);

  const drawSize = Math.round(SERVICE_IMAGE_BOX * Math.min(1, Math.max(0.5, imageScale)));

  return (
    <View style={[styles.imageWrap, { width: SERVICE_IMAGE_BOX, height: SERVICE_IMAGE_BOX }]}>
      {showSkeleton && !imageVisible ? (
        <GMSkeleton
          style={[
            styles.imageSkeleton,
            {
              width: SERVICE_IMAGE_BOX,
              height: SERVICE_IMAGE_BOX,
              borderRadius: Math.round(SERVICE_IMAGE_BOX * 0.22),
            },
          ]}
        />
      ) : null}
      <AppAssetImage
        assetKey={assetKey}
        style={{ width: drawSize, height: drawSize }}
        contentFit="contain"
        onLoad={handleImageLoad}
      />
    </View>
  );
}

type ServiceItem = {
  id: CustomerHomeServiceId;
  title: string;
  description: string;
  pill?: string;
  /** Theme accent — drives active pill fill/text. */
  accentColor: string;
  /** Scale down assets that optically fill more of the box (e.g. grocery cart). */
  imageScale?: number;
  assetKey: string;
  route: string;
};

const ALWAYS_DISABLED_IDS = new Set<string>(["ecom"]);

const FOOD: ServiceItem = {
  id: "food",
  title: "Order Food",
  description: "Delicious meals, delivered hot & fast to your door.",
  pill: "Fresh & Fast Delivery",
  accentColor: "#7C3AED",
  assetKey: CX.home.serviceFood,
  route: "/home",
};
const RIDE: ServiceItem = {
  id: "ride",
  title: "Book a Ride",
  description: "Safe, comfortable & affordable rides anytime.",
  pill: "Going Out",
  accentColor: "#16A34A",
  assetKey: CX.home.serviceRide,
  route: "/home/service/ride",
};
const PARCELS: ServiceItem = {
  id: "parcels",
  title: "Courier Service",
  description: "Send anything, anywhere with speed & care.",
  pill: "Send Parcels",
  accentColor: "#EA580C",
  assetKey: CX.home.serviceParcel,
  route: "/home/service/parcels",
};
const GROCERY: ServiceItem = {
  id: "grocery",
  title: "Grocery",
  description: "Get daily essentials delivered to your home.",
  pill: "Fresh Daily",
  accentColor: "#EA580C",
  // Cart art fills more of the canvas — match visual size of other tiles.
  imageScale: 0.82,
  assetKey: CX.home.serviceVoucher,
  route: "/home/grocery",
};
const ECOM: ServiceItem = {
  id: "ecom",
  title: "E-Commerce",
  description: "Shop your favorite products from trusted stores.",
  pill: "Elect & Ecom",
  accentColor: "#2563EB",
  assetKey: CX.home.serviceEcommerce,
  route: "/home/shop",
};
const NEAR_ME: ServiceItem = {
  id: "near-me",
  title: "Explore Nearby",
  description: "Find top places, restaurants & services around you.",
  pill: "Near Me",
  accentColor: "#DB2777",
  assetKey: CX.home.serviceLocation,
  route: "/home/service/near-me",
};

/** Parcel inactive + grocery active → grocery takes mid slot before parcel. */
export function orderHomeServices(opts: {
  parcelEnabled: boolean;
  groceryEnabled: boolean;
}): ServiceItem[] {
  const groceryBeforeParcel = !opts.parcelEnabled && opts.groceryEnabled;
  const mid = groceryBeforeParcel ? [GROCERY, PARCELS] : [PARCELS, GROCERY];
  return [FOOD, RIDE, ...mid, ECOM, NEAR_ME];
}

/**
 * Keep Explore Nearby immediately after the last active card (before inactive tiles).
 */
export function orderHomeServicesWithNearbyPlacement(
  opts: {
    parcelEnabled: boolean;
    groceryEnabled: boolean;
  },
  isEnabled: (id: CustomerHomeServiceId) => boolean
): ServiceItem[] {
  const base = orderHomeServices(opts).filter((s) => s.id !== "near-me");
  let lastActive = -1;
  for (let i = 0; i < base.length; i++) {
    if (isEnabled(base[i]!.id)) lastActive = i;
  }
  const insertAt = lastActive >= 0 ? lastActive + 1 : 0;
  const next = [...base];
  next.splice(insertAt, 0, NEAR_ME);
  return next;
}

type ServiceTileProps = {
  item: ServiceItem;
  cardHeight: number;
  /** Top-right offer pill — only when a live geo offer exists. */
  offerPillLabel?: string | null;
};

type Props = {
  cardHeight?: number;
  enabledServices?: {
    food: boolean;
    ride: boolean;
    parcels: boolean;
    grocery?: boolean;
  };
  accountBlocks?: CustomerAccountBlocksMap;
  onAccountBlockedPress?: (
    serviceId: CustomerHomeServiceId,
    reason: string,
    label: string,
    assetKey: string
  ) => void;
};

function isServiceEnabled(
  id: string,
  enabledServices: Props["enabledServices"]
): boolean {
  if (ALWAYS_DISABLED_IDS.has(id)) return false;
  if (!enabledServices) return false;
  if (id === "food") return enabledServices.food;
  if (id === "ride") return enabledServices.ride;
  if (id === "parcels") return enabledServices.parcels;
  if (id === "grocery") return enabledServices.grocery === true;
  // Explore Nearby lists food + grocery stores — active when either vertical is on.
  if (id === "near-me") return enabledServices.food === true || enabledServices.grocery === true;
  return false;
}

function accountBlockReasonFor(
  id: string,
  accountBlocks?: CustomerAccountBlocksMap
): string | undefined {
  if (!accountBlocks) return undefined;
  if (id === "food" || id === "grocery") return accountBlocks.food;
  if (id === "ride") return accountBlocks.ride;
  if (id === "parcels") return accountBlocks.parcels;
  if (id === "ecom") return accountBlocks.ecom;
  if (id === "near-me") return accountBlocks["near-me"];
  return undefined;
}

function ServiceTile({
  item,
  cardHeight,
  offerPillLabel,
  enabled,
  accountBlockReason,
  onAccountBlockedPress,
}: ServiceTileProps & {
  enabled: boolean;
  accountBlockReason?: string;
  onAccountBlockedPress?: (
    serviceId: CustomerHomeServiceId,
    reason: string,
    label: string,
    assetKey: string
  ) => void;
}) {
  const router = useRouter();
  const isAccountBlocked = Boolean(accountBlockReason);
  const overlayIconSize = Math.round(cardHeight * 0.26);

  return (
    <TouchableOpacity
      style={[
        styles.card,
        { height: cardHeight },
        offerPillLabel ? styles.cardWithOffer : null,
      ]}
      activeOpacity={enabled || isAccountBlocked ? 0.88 : 1}
      disabled={!enabled && !isAccountBlocked}
      onPress={() => {
        if (isAccountBlocked && accountBlockReason) {
          onAccountBlockedPress?.(
            item.id,
            accountBlockReason,
            item.title,
            item.assetKey
          );
          return;
        }
        if (enabled) router.push(item.route as never);
      }}
    >
      {offerPillLabel ? (
        <View style={styles.offerCornerPill} pointerEvents="none">
          <View style={styles.offerCornerPillFill}>
            <AppText style={styles.offerCornerPillText} numberOfLines={1}>
              {offerPillLabel}
            </AppText>
          </View>
        </View>
      ) : null}

      <AppText
        style={[
          styles.title,
          !enabled && styles.textMuted,
          offerPillLabel ? styles.titleWithOffer : null,
        ]}
        numberOfLines={1}
      >
        {item.title}
      </AppText>
      <AppText
        style={[
          styles.description,
          !enabled && styles.textMuted,
          offerPillLabel ? styles.descriptionWithOffer : null,
        ]}
        numberOfLines={3}
      >
        {item.description}
      </AppText>

      {item.pill ? (
        <View style={styles.tagCornerPill} pointerEvents="none">
          <View
            style={[
              styles.tagCornerPillFill,
              { backgroundColor: enabled ? item.accentColor : "#9CA3AF" },
            ]}
          >
            <AppText style={styles.tagCornerPillText} numberOfLines={1} maxFontSizeMultiplier={1}>
              {item.pill}
            </AppText>
          </View>
        </View>
      ) : null}

      <View style={styles.mediaCol} pointerEvents="none">
        <ServiceCardImage assetKey={item.assetKey} imageScale={item.imageScale ?? 1} />
      </View>

      {!enabled && !isAccountBlocked ? <View style={styles.disabledWash} pointerEvents="none" /> : null}
      {isAccountBlocked ? (
        <View style={styles.blockedOverlay} pointerEvents="none">
          <FrozenServiceIconCircle assetKey={item.assetKey} size={overlayIconSize} />
          <AppText style={styles.frozenLabel}>Frozen</AppText>
        </View>
      ) : null}
    </TouchableOpacity>
  );
}

export function HomeServicesRow({
  cardHeight = DEFAULT_CARD_H,
  enabledServices,
  accountBlocks,
  onAccountBlockedPress,
}: Props) {
  const assets = useAppAssetsStore((s) => s.assets);
  const offerPills = useServiceCardOfferPills(true);
  useLayoutEffect(() => {
    prefetchCriticalHomeAssetImagesSync(assets);
  }, [assets]);

  const services = useMemo(
    () =>
      orderHomeServicesWithNearbyPlacement(
        {
          parcelEnabled: enabledServices?.parcels === true,
          groceryEnabled: enabledServices?.grocery === true,
        },
        (id) => isServiceEnabled(id, enabledServices)
      ),
    [enabledServices]
  );

  return (
    <View style={styles.grid}>
      {services.map((s) => (
        <ServiceTile
          key={s.id}
          item={s}
          cardHeight={cardHeight}
          offerPillLabel={offerPills[s.id] ?? null}
          enabled={isServiceEnabled(s.id, enabledServices)}
          accountBlockReason={accountBlockReasonFor(s.id, accountBlocks)}
          onAccountBlockedPress={onAccountBlockedPress}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: PAD,
    gap: GAP,
    marginTop: 10,
  },
  card: {
    width: CARD_W,
    backgroundColor: "#FFFFFF",
    borderRadius: CARD_RADIUS,
    borderWidth: 1,
    borderColor: "#F0F0F0",
    paddingTop: 9,
    paddingBottom: 28,
    paddingHorizontal: 9,
    shadowColor: "transparent",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
    overflow: "hidden",
  },
  cardWithOffer: {
    paddingTop: 22,
  },
  /**
   * Reference corner badge (mirrored to top-right):
   * outer corner matches the card radius; inner free corner is the soft curve.
   */
  offerCornerPill: {
    position: "absolute",
    top: 0,
    right: 0,
    zIndex: 8,
    maxWidth: "58%",
  },
  offerCornerPillFill: {
    paddingLeft: CORNER_PILL_PAD_H,
    paddingRight: CORNER_PILL_PAD_H,
    paddingTop: CORNER_PILL_PAD_V,
    paddingBottom: CORNER_PILL_PAD_V,
    backgroundColor: OFFER_PILL_GREEN_TOP,
    borderTopRightRadius: CARD_RADIUS,
    borderBottomRightRadius: 0,
    borderTopLeftRadius: 0,
    borderBottomLeftRadius: CORNER_PILL_INNER_R,
    overflow: "hidden",
  },
  offerCornerPillText: {
    color: "#FFFFFF",
    fontSize: CORNER_PILL_FONT,
    fontWeight: "800",
    letterSpacing: 0.2,
    lineHeight: CORNER_PILL_LINE,
    includeFontPadding: false,
    textTransform: "uppercase",
  },
  disabledWash: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(255,255,255,0.52)",
    borderRadius: CARD_RADIUS,
    zIndex: 4,
  },
  blockedOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(255,255,255,0.78)",
    borderRadius: CARD_RADIUS,
    zIndex: 6,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(220,38,38,0.22)",
    paddingHorizontal: 8,
    gap: 6,
  },
  frozenLabel: {
    fontSize: 14,
    fontWeight: "800",
    color: "#DC2626",
    letterSpacing: 0.3,
  },
  textMuted: {
    color: "#9CA3AF",
  },
  title: {
    fontSize: 14,
    fontWeight: "800",
    color: "#111827",
    lineHeight: 17,
    marginRight: 58,
  },
  titleWithOffer: {
    marginRight: 78,
  },
  description: {
    marginTop: 8,
    marginRight: 58,
    paddingBottom: 4,
    fontSize: 10,
    fontWeight: "500",
    color: "#9CA3AF",
    lineHeight: 14,
  },
  descriptionWithOffer: {
    marginRight: 58,
  },
  /**
   * Bottom-left mirror of the top-right offer ribbon:
   * flush to the card corner; soft curve on the free inner corner.
   */
  tagCornerPill: {
    position: "absolute",
    left: 0,
    bottom: 0,
    zIndex: 5,
    maxWidth: "72%",
  },
  tagCornerPillFill: {
    paddingLeft: CORNER_PILL_PAD_H,
    paddingRight: CORNER_PILL_PAD_H,
    paddingTop: CORNER_PILL_PAD_V,
    paddingBottom: CORNER_PILL_PAD_V,
    borderBottomLeftRadius: CARD_RADIUS,
    borderTopLeftRadius: 0,
    borderBottomRightRadius: 0,
    borderTopRightRadius: CORNER_PILL_INNER_R,
    overflow: "hidden",
  },
  tagCornerPillText: {
    color: "#FFFFFF",
    fontSize: CORNER_PILL_FONT,
    fontWeight: "800",
    letterSpacing: 0.15,
    lineHeight: CORNER_PILL_LINE,
    includeFontPadding: false,
  },
  mediaCol: {
    position: "absolute",
    right: 6,
    bottom: 8,
    width: SERVICE_IMAGE_BOX,
    height: SERVICE_IMAGE_BOX,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 2,
  },
  imageWrap: {
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  imageSkeleton: {
    position: "absolute",
  },
});
