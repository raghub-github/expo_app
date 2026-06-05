/**
 * All Services – 3-column ride service grid (Rapido-style, no icon boxes).
 */

import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  Image,
  ImageSourcePropType,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

const { width: SCREEN_W } = Dimensions.get("window");

const H_PAD = 18;
const COLS = 3;
const GAP = 18;
const TILE_W = (SCREEN_W - H_PAD * 2 - GAP * (COLS - 1)) / COLS;
const ICON_SIZE = TILE_W * 0.82;

export type ServiceId =
  | "auto"
  | "cab-economy"
  | "bike"
  | "bike-lite"
  | "cab-premium"
  | "travel";

type ServiceBadge = "discount" | "premium";

type RideService = {
  id: ServiceId;
  label: string;
  image: ImageSourcePropType;
  badge?: ServiceBadge;
  disabled?: boolean;
};

/** Temporarily disabled on Book a Ride — enable when travel is live. */
export const DISABLED_SERVICE_IDS: ServiceId[] = ["travel"];

export const ALL_SERVICES: RideService[] = [
  {
    id: "auto",
    label: "Auto",
    image: require("../../public/img/auto.png"),
  },
  {
    id: "cab-economy",
    label: "Cab Economy",
    image: require("../../public/img/ride1.png"),
  },
  {
    id: "bike",
    label: "Bike",
    image: require("../../public/img/bike.png"),
  },
  {
    id: "bike-lite",
    label: "Bike Lite",
    image: require("../../public/img/bike.png"),
    badge: "discount",
  },
  {
    id: "cab-premium",
    label: "Cab Premium",
    image: require("../../public/img/cabpremium.png"),
    badge: "premium",
  },
  {
    id: "travel",
    label: "Travel",
    image: require("../../public/img/travel.png"),
    disabled: true,
  },
];

function ServiceBadgeIcon({ type }: { type: ServiceBadge }) {
  if (type === "discount") {
    return (
      <View style={styles.discountBadge}>
        <Text style={styles.discountBadgeText}>%</Text>
      </View>
    );
  }

  return (
    <View style={styles.premiumBadge}>
      <Ionicons name="sparkles" size={12} color="#FFFFFF" />
    </View>
  );
}

function ServiceTile({
  service,
  onPress,
}: {
  service: RideService;
  onPress: () => void;
}) {
  const disabled = service.disabled === true;

  return (
    <TouchableOpacity
      style={[styles.tileWrap, { width: TILE_W }, disabled && styles.tileWrapDisabled]}
      activeOpacity={disabled ? 1 : 0.82}
      onPress={disabled ? undefined : onPress}
      disabled={disabled}
    >
      <View style={[styles.iconArea, { width: TILE_W, height: ICON_SIZE }]}>
        <Image
          source={service.image}
          style={{ width: ICON_SIZE, height: ICON_SIZE }}
          resizeMode="contain"
        />
        {service.badge && !disabled ? <ServiceBadgeIcon type={service.badge} /> : null}
        {disabled ? (
          <View style={styles.comingSoonBadge}>
            <Text style={styles.comingSoonText}>Soon</Text>
          </View>
        ) : null}
      </View>
      <Text style={[styles.tileLabel, disabled && styles.tileLabelDisabled]} numberOfLines={2}>
        {service.label}
      </Text>
    </TouchableOpacity>
  );
}

type AllServicesGridProps = {
  onSelectService: (id: ServiceId) => void;
};

export function AllServicesGrid({ onSelectService }: AllServicesGridProps) {
  return (
    <View style={styles.root}>
      <Text style={styles.title}>All Services</Text>
      <View style={styles.grid}>
        {ALL_SERVICES.map((service) => (
          <ServiceTile
            key={service.id}
            service={service}
            onPress={() => {
              if (service.disabled || DISABLED_SERVICE_IDS.includes(service.id)) return;
              onSelectService(service.id);
            }}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    marginBottom: 18,
  },
  title: {
    fontSize: 22,
    fontWeight: "800",
    color: "#111827",
    marginBottom: 20,
    letterSpacing: -0.3,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: GAP,
  },
  tileWrap: {
    alignItems: "center",
  },
  tileWrapDisabled: {
    opacity: 0.5,
  },
  iconArea: {
    alignItems: "center",
    justifyContent: "center",
    overflow: "visible",
  },
  comingSoonBadge: {
    position: "absolute",
    bottom: 0,
    alignSelf: "center",
    backgroundColor: "#9CA3AF",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  comingSoonText: {
    fontSize: 9,
    fontWeight: "700",
    color: "#FFFFFF",
    letterSpacing: 0.2,
  },
  tileLabel: {
    marginTop: 8,
    fontSize: 13,
    fontWeight: "600",
    color: "#111827",
    textAlign: "center",
    lineHeight: 17,
    minHeight: 34,
  },
  tileLabelDisabled: {
    color: "#9CA3AF",
  },
  discountBadge: {
    position: "absolute",
    top: -2,
    right: 8,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#22C55E",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#FFFFFF",
  },
  discountBadgeText: {
    fontSize: 11,
    fontWeight: "800",
    color: "#FFFFFF",
  },
  premiumBadge: {
    position: "absolute",
    top: -2,
    right: 8,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#F59E0B",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#FFFFFF",
  },
});
