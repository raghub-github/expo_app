/**
 * Six service cards in a 2-column grid — height adapts to fill one-screen home layout.
 *
 * Order (default when parcel + grocery both active):
 * 1 Food, 2 Ride, 3 Parcel, 4 Grocery, 5 E-Commerce, 6 Nearby
 * When parcel is inactive and grocery is active, Grocery shifts to slot 3.
 */

import { useMemo } from "react";
import { View, TouchableOpacity, StyleSheet, Dimensions } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { AppAssetImage } from "@/components/AppAssetImage";
import { CX } from "@/lib/appAssetKeys";
import { AppText } from "@/components/AppText";
import type { CustomerAccountBlocksMap } from "@/services/customerServiceBlocks.service";
import { FrozenServiceIconCircle } from "@/components/FrozenServiceIconCircle";
import type { CustomerHomeServiceId } from "@/lib/customerHomeServiceMeta";

const { width: SCREEN_W } = Dimensions.get("window");
const PAD = 16;
const GAP = 8;
const COLS = 2;
const CARD_W = Math.floor((SCREEN_W - PAD * 2 - GAP * (COLS - 1)) / COLS);
const DEFAULT_CARD_H = 118;

type ServiceItem = {
  id: CustomerHomeServiceId;
  title: string;
  pill?: string;
  arrowColor: string;
  assetKey: string;
  route: string;
};

const ALWAYS_DISABLED_IDS = new Set<string>(["ecom", "near-me"]);

const FOOD: ServiceItem = {
  id: "food",
  title: "Order Food",
  pill: "Fresh & Fast Delivery",
  arrowColor: "#7C3AED",
  assetKey: CX.home.serviceFood,
  route: "/home",
};
const RIDE: ServiceItem = {
  id: "ride",
  title: "Book a Ride",
  pill: "Going Out",
  arrowColor: "#16A34A",
  assetKey: CX.home.serviceRide,
  route: "/home/service/ride",
};
const PARCELS: ServiceItem = {
  id: "parcels",
  title: "Courier Service",
  pill: "Send Parcels",
  arrowColor: "#EA580C",
  assetKey: CX.home.serviceParcel,
  route: "/home/service/parcels",
};
const GROCERY: ServiceItem = {
  id: "grocery",
  title: "Grocery",
  pill: "Fresh Daily",
  arrowColor: "#EA580C",
  // Reuse former Online Vouchers artwork for Grocery.
  assetKey: CX.home.serviceVoucher,
  route: "/home/grocery",
};
const ECOM: ServiceItem = {
  id: "ecom",
  title: "E-Commerce",
  pill: "Elect & Ecom",
  arrowColor: "#2563EB",
  assetKey: CX.home.serviceEcommerce,
  route: "/home/shop",
};
const NEAR_ME: ServiceItem = {
  id: "near-me",
  title: "Explore Nearby",
  pill: "Near Me",
  arrowColor: "#DB2777",
  assetKey: CX.home.serviceLocation,
  route: "/home/service/near-me",
};

/** Parcel inactive + grocery active → grocery takes slot 3; otherwise parcel stays at 3. */
export function orderHomeServices(opts: {
  parcelEnabled: boolean;
  groceryEnabled: boolean;
}): ServiceItem[] {
  const groceryBeforeParcel = !opts.parcelEnabled && opts.groceryEnabled;
  const mid = groceryBeforeParcel ? [GROCERY, PARCELS] : [PARCELS, GROCERY];
  return [FOOD, RIDE, ...mid, ECOM, NEAR_ME];
}

type ServiceTileProps = {
  item: ServiceItem;
  cardHeight: number;
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
  const imageSize = Math.round(cardHeight * 0.48);
  const iconWrap = Math.round(imageSize * 1.12);
  const isAccountBlocked = Boolean(accountBlockReason);
  const overlayIconSize = Math.round(cardHeight * 0.26);

  return (
    <TouchableOpacity
      style={[styles.card, { height: cardHeight }]}
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
      {item.pill ? (
        <View style={styles.pill}>
          <AppText style={[styles.pillText, !enabled && styles.textMuted]} numberOfLines={1}>
            {item.pill}
          </AppText>
        </View>
      ) : null}

      <AppText style={[styles.title, !enabled && styles.textMuted]} numberOfLines={1}>
        {item.title}
      </AppText>

      <View
        style={[
          styles.arrowBtn,
          { backgroundColor: item.arrowColor },
          !enabled && styles.arrowBtnMuted,
        ]}
      >
        <Ionicons name="chevron-forward" size={13} color="#fff" />
      </View>

      {/* Images stay at full opacity — parent opacity < 1 blanks expo-image on Android. */}
      <View style={[styles.imageWrap, { width: iconWrap, height: iconWrap }]}>
        <AppAssetImage
          assetKey={item.assetKey}
          style={{ width: imageSize, height: imageSize }}
          contentFit="contain"
        />
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
  const services = useMemo(
    () =>
      orderHomeServices({
        parcelEnabled: enabledServices?.parcels === true,
        groceryEnabled: enabledServices?.grocery === true,
      }),
    [enabledServices?.parcels, enabledServices?.grocery]
  );

  return (
    <View style={styles.grid}>
      {services.map((s) => (
        <ServiceTile
          key={s.id}
          item={s}
          cardHeight={cardHeight}
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
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#F0F0F0",
    paddingTop: 9,
    paddingBottom: 8,
    paddingHorizontal: 9,
    // Match offer + brand banners: no elevation (white cards show even light shadows heavily).
    shadowColor: "transparent",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
    overflow: "hidden",
  },
  disabledWash: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(255,255,255,0.52)",
    borderRadius: 14,
    zIndex: 4,
  },
  blockedOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(255,255,255,0.78)",
    borderRadius: 14,
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
  pill: {
    alignSelf: "flex-start",
    backgroundColor: "#F3F4F6",
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 6,
    maxWidth: "90%",
    marginBottom: 3,
  },
  pillText: {
    fontSize: 8,
    fontWeight: "700",
    color: "#6B7280",
  },
  title: {
    fontSize: 14,
    fontWeight: "800",
    color: "#111827",
    lineHeight: 17,
    marginRight: 58,
  },
  arrowBtn: {
    position: "absolute",
    left: 9,
    bottom: 9,
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 5,
  },
  arrowBtnMuted: {
    opacity: 0.45,
  },
  imageWrap: {
    position: "absolute",
    right: 5,
    bottom: 5,
    alignItems: "center",
    justifyContent: "center",
  },
});
