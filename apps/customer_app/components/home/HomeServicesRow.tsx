/**
 * Six service cards in a 2-column grid — height adapts to fill one-screen home layout.
 */

import { View, Text, TouchableOpacity, StyleSheet, Dimensions } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { AppAssetImage } from "@/components/AppAssetImage";
import { CX } from "@/lib/appAssetKeys";

const { width: SCREEN_W } = Dimensions.get("window");
const PAD = 16;
const GAP = 8;
const COLS = 2;
const CARD_W = Math.floor((SCREEN_W - PAD * 2 - GAP * (COLS - 1)) / COLS);
const DEFAULT_CARD_H = 118;

type ServiceItem = {
  id: string;
  title: string;
  pill?: string;
  arrowColor: string;
  assetKey: string;
  route: string;
};

const ALWAYS_DISABLED_IDS = new Set(["ecom", "vouchers", "near-me"]);

const SERVICES: ServiceItem[] = [
  {
    id: "food",
    title: "Order Food",
    pill: "Fresh & Fast Delivery",
    arrowColor: "#7C3AED",
    assetKey: CX.home.serviceFood,
    route: "/home",
  },
  {
    id: "ride",
    title: "Book a Ride",
    pill: "Going Out",
    arrowColor: "#16A34A",
    assetKey: CX.home.serviceRide,
    route: "/home/service/ride",
  },
  {
    id: "parcels",
    title: "Courier Service",
    pill: "Send Parcels",
    arrowColor: "#EA580C",
    assetKey: CX.home.serviceParcel,
    route: "/home/service/parcels",
  },
  {
    id: "ecom",
    title: "E-Commerce",
    pill: "Elect & Ecom",
    arrowColor: "#2563EB",
    assetKey: CX.home.serviceEcommerce,
    route: "/home/shop",
  },
  {
    id: "vouchers",
    title: "Online Vouchers",
    pill: "Offers",
    arrowColor: "#EA580C",
    assetKey: CX.home.serviceVoucher,
    route: "/home/service/vouchers",
  },
  {
    id: "near-me",
    title: "Explore Nearby",
    pill: "Near Me",
    arrowColor: "#DB2777",
    assetKey: CX.home.serviceLocation,
    route: "/home/service/near-me",
  },
];

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
  };
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
  return false;
}

function ServiceTile({
  item,
  cardHeight,
  enabled,
}: ServiceTileProps & { enabled: boolean }) {
  const router = useRouter();
  const imageSize = Math.round(cardHeight * 0.48);
  const iconWrap = Math.round(imageSize * 1.12);

  return (
    <TouchableOpacity
      style={[styles.card, { height: cardHeight }, !enabled && styles.cardDisabled]}
      activeOpacity={enabled ? 0.88 : 1}
      disabled={!enabled}
      onPress={() => router.push(item.route as never)}
    >
      {item.pill ? (
        <View style={styles.pill}>
          <Text style={styles.pillText} numberOfLines={1}>
            {item.pill}
          </Text>
        </View>
      ) : null}

      <Text style={styles.title} numberOfLines={1}>
        {item.title}
      </Text>

      <View style={[styles.arrowBtn, { backgroundColor: item.arrowColor }]}>
        <Ionicons name="chevron-forward" size={13} color="#fff" />
      </View>

      <View style={[styles.imageWrap, { width: iconWrap, height: iconWrap }]}>
        <AppAssetImage
          assetKey={item.assetKey}
          style={{ width: imageSize, height: imageSize }}
          contentFit="contain"
        />
      </View>
    </TouchableOpacity>
  );
}

export function HomeServicesRow({ cardHeight = DEFAULT_CARD_H, enabledServices }: Props) {
  return (
    <View style={styles.grid}>
      {SERVICES.map((s) => (
        <ServiceTile
          key={s.id}
          item={s}
          cardHeight={cardHeight}
          enabled={isServiceEnabled(s.id, enabledServices)}
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
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 5,
    elevation: 2,
  },
  cardDisabled: {
    opacity: 0.42,
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
  },
  imageWrap: {
    position: "absolute",
    right: 5,
    bottom: 5,
    alignItems: "center",
    justifyContent: "center",
  },
});
