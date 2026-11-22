/**
 * Six service cards in a 2-column grid — height adapts to fill one-screen home layout.
 *
 * Base order: Food, Ride, Parcel/Grocery mid, Ecom.
 * Explore Nearby is inserted just after the last currently-active card.
 */

import { useLayoutEffect, useState, useCallback, useMemo } from "react";
import { View, Text, StyleSheet, Dimensions, Platform } from "react-native";
import { useRouter } from "expo-router";
import { AppAssetImage } from "@/components/AppAssetImage";
import { CX } from "@/lib/appAssetKeys";
import { AppText } from "@/components/AppText";
import type { CustomerAccountBlocksMap } from "@/services/customerServiceBlocks.service";
import { FrozenServiceIconCircle } from "@/components/FrozenServiceIconCircle";
import type { CustomerHomeServiceId } from "@/lib/customerHomeServiceMeta";
import { prefetchCriticalHomeAssetImagesSync, HOME_CRITICAL_ASSET_KEYS } from "@/lib/homeCriticalAssets";
import { navigateToFoodHome, warmFoodHomeEntry } from "@/lib/navigateToFoodHome";
import { foodFixDbg } from "@/lib/tabNavDebug";
import { useAppAssetsStore } from "@/store/appAssetsStore";
import { useServiceCardOfferPills } from "@/hooks/useServiceCardOfferPills";
import { InstantPressable } from "@/components/InstantPressable";
import { HomeServicesGridSkeleton } from "@/components/home/HomeTabSkeletons";
import { homeSkeletonLog } from "@/lib/homeSkeletonTelemetry";
import { HOME_DARK } from "@/constants/homeDarkTheme";

const { width: SCREEN_W } = Dimensions.get("window");
const PAD = 16;
/** Clear gutter between cards (row + column) — magicpin-like airy grid. */
const GAP = 12;
const COLS = 2;
const CARD_W = Math.floor((SCREEN_W - PAD * 2 - GAP * (COLS - 1)) / COLS);
const DEFAULT_CARD_H = 126;
/** Magicpin-style soft tile radius. */
const CARD_RADIUS = 22;
const CORNER_PILL_PAD_V = 6;
const CORNER_PILL_PAD_H = 10;
const CORNER_PILL_INNER_R = 12;
const CORNER_PILL_FONT = 10;
/** Extra line box so descenders never clip in release/Hermes. */
const CORNER_PILL_LINE = 14;
/** Solid forest green — matches reference offer corner badge. */
const OFFER_PILL_GREEN = "#15803D";
/** Alias kept so Metro HMR never throws if a prior gradient paint still reads this name. */
const OFFER_PILL_GREEN_TOP = OFFER_PILL_GREEN;
/**
 * Bottom-right hero art (magicpin corner). Pill stays bottom-left; art hugs
 * the opposite corner — never centered in the card.
 */
const SERVICE_IMAGE_BOX = 88;
/**
 * Reserved bottom-left band for the tag pill. Art sits in the bottom-right
 * corner and must not cover pill copy.
 */
const TAG_PILL_BAND_H = CORNER_PILL_PAD_V * 2 + CORNER_PILL_LINE + 4;
/** Pill owns left side — wide enough for full "Going Out" / "Fresh & Fast". */
const TAG_PILL_MAX_W = Math.min(CARD_W - SERVICE_IMAGE_BOX + 16, Math.floor(CARD_W * 0.7));

function ServiceCardImage({
  assetKey,
  imageScale = 1,
}: {
  assetKey: string;
  imageScale?: number;
}) {
  // Prefer proxy (stable cache key) — same order as AppAssetImage / getAppAssetUrl.
  const assetUrl = useAppAssetsStore(
    (s) => s.assets[assetKey]?.proxyUrl ?? s.assets[assetKey]?.url ?? null
  );
  const hasUrl = Boolean(assetUrl?.trim());
  const [imageVisible, setImageVisible] = useState(false);

  const handleImageLoad = useCallback(() => {
    setImageVisible(true);
    homeSkeletonLog("CONTENT_RENDERED", "service_image", assetKey);
  }, [assetKey]);

  const drawSize = Math.round(SERVICE_IMAGE_BOX * Math.min(1, Math.max(0.5, imageScale)));

  // No gray/white skeleton squares — empty until CMS art loads, then BR corner.
  if (!hasUrl) return null;

  return (
    <View
      style={[styles.imageWrap, { width: SERVICE_IMAGE_BOX, height: SERVICE_IMAGE_BOX }]}
      pointerEvents="none"
    >
      <AppAssetImage
        assetKey={assetKey}
        style={{
          width: drawSize,
          height: drawSize,
          opacity: imageVisible ? 1 : 0,
          backgroundColor: "transparent",
        }}
        contentFit="contain"
        transition={0}
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
  pill: "Fresh & Fast",
  accentColor: "#7C3AED",
  assetKey: CX.home.serviceFood,
  /** Unused for navigation — Food uses navigateToFoodHome → tab `food`. */
  route: "",
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
  // Cart art optically fills more — slight shrink so it stays in the BR corner.
  imageScale: 0.9,
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
  /** Full-grid shimmer while CMS service art map is still cold. */
  skeleton?: boolean;
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
  // Missing map = still resolving location/coverage — paint full opacity (not washed).
  if (!enabledServices) return true;
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
  const [pressed, setPressed] = useState(false);
  const canPress = enabled || isAccountBlocked;

  return (
    <View style={[styles.cardShadow, { height: cardHeight }]}>
      <InstantPressable
        style={[
          styles.card,
          { height: cardHeight },
          offerPillLabel ? styles.cardWithOffer : null,
        ]}
        // No shrink on tap — scale made tiles look broken; grey wash is enough.
        pressedScale={1}
        pressedOpacity={1}
        haptic={false}
        android_ripple={
          !canPress
            ? null
            : {
                color: "rgba(255,255,255,0.14)",
                borderless: false,
                // foreground:true clips absolute pills/art on Android release.
                foreground: false,
              }
        }
        disabled={!canPress}
        onPressIn={() => {
          if (canPress) setPressed(true);
          // Warm merchants cache + imagery before the Food tab mounts.
          if (canPress && item.id === "food") warmFoodHomeEntry();
        }}
        onPressOut={() => setPressed(false)}
        onPress={() => {
          setPressed(false);
          if (isAccountBlocked && accountBlockReason) {
            onAccountBlockedPress?.(
              item.id,
              accountBlockReason,
              item.title,
              item.assetKey
            );
            return;
          }
          if (!enabled) return;
          if (item.id === "food") {
            foodFixDbg("ENTER food", {
              source: "HomeServicesRow.onPress",
              method: "navigateToFoodHome",
              target: "food",
              reason: "food-service-card",
            });
            navigateToFoodHome(router);
            return;
          }
          router.push(item.route as never);
        }}
      >
        {offerPillLabel ? (
          <View style={styles.offerCornerPill} pointerEvents="none">
            <View style={styles.offerCornerPillFill}>
              <AppText
                style={styles.offerCornerPillText}
                numberOfLines={1}
                maxFontSizeMultiplier={1}
                adjustsFontSizeToFit
                minimumFontScale={0.8}
              >
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
          numberOfLines={2}
          maxFontSizeMultiplier={1.1}
          adjustsFontSizeToFit
          minimumFontScale={0.82}
        >
          {item.title}
        </AppText>

        {/* Art first, tag last — later sibling + elevation wins over the illustration. */}
        <View style={styles.mediaCol} pointerEvents="none">
          <ServiceCardImage assetKey={item.assetKey} imageScale={item.imageScale ?? 1} />
        </View>

        {item.pill ? (
          <View style={styles.tagCornerPill} pointerEvents="none" collapsable={false}>
            <View
              style={[
                styles.tagCornerPillFill,
                { backgroundColor: enabled ? item.accentColor : "#9CA3AF" },
              ]}
              collapsable={false}
            >
              {/* RN Text (not AppText): tiny corner pills + Lora metrics clipped on Android. */}
              <Text
                style={styles.tagCornerPillText}
                numberOfLines={1}
                maxFontSizeMultiplier={1}
                allowFontScaling={false}
              >
                {item.pill}
              </Text>
            </View>
          </View>
        ) : null}

        {pressed && canPress ? (
          <View style={styles.cardPressedOverlay} pointerEvents="none" />
        ) : null}

        {!enabled && !isAccountBlocked ? <View style={styles.disabledWash} pointerEvents="none" /> : null}
        {isAccountBlocked ? (
          <View style={styles.blockedOverlay} pointerEvents="none">
            <FrozenServiceIconCircle assetKey={item.assetKey} size={overlayIconSize} />
            <AppText style={styles.frozenLabel}>Frozen</AppText>
          </View>
        ) : null}
      </InstantPressable>
    </View>
  );
}

export function HomeServicesRow({
  cardHeight = DEFAULT_CARD_H,
  enabledServices,
  accountBlocks,
  skeleton = false,
  onAccountBlockedPress,
}: Props) {
  const offerPills = useServiceCardOfferPills(true);
  // Prefetch once per URI set — subscribe only to the fingerprint, not whole `assets`
  // (CMS refresh used to re-render the entire service grid).
  const criticalUrisKey = useAppAssetsStore((s) =>
    HOME_CRITICAL_ASSET_KEYS.map(
      (k) => s.assets[k]?.proxyUrl ?? s.assets[k]?.url ?? ""
    ).join("|")
  );
  useLayoutEffect(() => {
    prefetchCriticalHomeAssetImagesSync(useAppAssetsStore.getState().assets);
  }, [criticalUrisKey]);

  const services = useMemo(
    () =>
      orderHomeServicesWithNearbyPlacement(
        {
          parcelEnabled: isServiceEnabled("parcels", enabledServices),
          groceryEnabled: isServiceEnabled("grocery", enabledServices),
        },
        (id) => isServiceEnabled(id, enabledServices)
      ),
    [enabledServices]
  );

  if (skeleton) {
    return <HomeServicesGridSkeleton cardHeight={cardHeight} />;
  }

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
    rowGap: GAP,
    columnGap: GAP,
    marginTop: 10,
    overflow: "visible",
  },
  cardShadow: {
    width: CARD_W,
    borderRadius: CARD_RADIUS,
    backgroundColor: "#5A5A63",
    // Flat tile — no box shadow.
    shadowOpacity: 0,
    elevation: 0,
  },
  card: {
    width: "100%",
    backgroundColor: "#5A5A63",
    borderRadius: CARD_RADIUS,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.10)",
    paddingTop: 12,
    // Room for the bottom tag band — title + art must never invade it.
    paddingBottom: TAG_PILL_BAND_H + 2,
    paddingHorizontal: 12,
    // Radius clip for overlays; pills/art stay inside padded bounds.
    overflow: "hidden",
  },
  cardPressedOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(255,255,255,0.14)",
    borderRadius: CARD_RADIUS,
    zIndex: 6,
  },
  /**
   * Offer ribbon is absolute (top-right) — keep the same paddingTop as plain cards
   * so titles (Order Food vs Book a Ride) stay vertically aligned.
   */
  cardWithOffer: {
    paddingTop: 12,
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
    maxWidth: "68%",
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
    // Visible so offer copy never clips mid-glyph in release.
    overflow: "visible",
  },
  offerCornerPillText: {
    color: "#FFFFFF",
    fontSize: CORNER_PILL_FONT,
    fontWeight: "800",
    letterSpacing: 0.1,
    lineHeight: CORNER_PILL_LINE,
    includeFontPadding: false,
    textTransform: "uppercase",
    ...(Platform.OS === "android" ? { fontFamily: "sans-serif-medium" } : null),
  },
  disabledWash: {
    ...StyleSheet.absoluteFillObject,
    // Soft darken only — don’t turn the tile black.
    backgroundColor: "rgba(0, 0, 0, 0.28)",
    borderRadius: CARD_RADIUS,
    zIndex: 4,
  },
  blockedOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.45)",
    borderRadius: CARD_RADIUS,
    zIndex: 6,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(220,38,38,0.35)",
    paddingHorizontal: 8,
    gap: 6,
  },
  frozenLabel: {
    fontSize: 14,
    fontWeight: "800",
    color: "#F87171",
    letterSpacing: 0.3,
  },
  textMuted: {
    color: HOME_DARK.textDim,
  },
  title: {
    fontSize: 15,
    fontWeight: "800",
    color: HOME_DARK.text,
    lineHeight: 19,
    letterSpacing: -0.2,
    // Wide enough for "Courier Service" / "Explore Nearby" on two lines.
    maxWidth: "70%",
    paddingRight: 4,
    zIndex: 3,
  },
  titleWithOffer: {
    // Clear top-right offer ribbon only — still fit two-word titles.
    maxWidth: "62%",
    marginRight: 6,
  },
  /**
   * Bottom-left corner tag — lives in TAG_PILL_BAND_H; art is parked above it.
   */
  tagCornerPill: {
    position: "absolute",
    left: 0,
    bottom: 0,
    zIndex: 20,
    elevation: Platform.OS === "android" ? 12 : 0,
    maxWidth: TAG_PILL_MAX_W,
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
    // Do NOT clip text — labels must fully paint in local + production.
    overflow: "visible",
    alignSelf: "flex-start",
    minHeight: TAG_PILL_BAND_H - 2,
    justifyContent: "center",
  },
  tagCornerPillText: {
    color: "#FFFFFF",
    fontSize: CORNER_PILL_FONT,
    lineHeight: CORNER_PILL_LINE,
    letterSpacing: 0.15,
    includeFontPadding: false,
    // System bold — custom Lora metrics clipped "Going Out" → "Going" in release.
    fontWeight: "700",
    ...(Platform.OS === "android" ? { fontFamily: "sans-serif-medium" } : null),
  },
  mediaCol: {
    position: "absolute",
    right: 0,
    bottom: 0,
    width: SERVICE_IMAGE_BOX,
    height: SERVICE_IMAGE_BOX,
    alignItems: "flex-end",
    justifyContent: "flex-end",
    zIndex: 2,
    elevation: 0,
    overflow: "visible",
  },
  imageWrap: {
    width: "100%",
    height: "100%",
    alignItems: "flex-end",
    justifyContent: "flex-end",
    overflow: "visible",
    backgroundColor: "transparent",
  },
});
