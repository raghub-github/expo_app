/**
 * All Services – 3-column ride service grid (Rapido-style, no icon boxes).
 */

import { View, TouchableOpacity, StyleSheet, Dimensions } from "react-native";
import { AppText } from "@/components/AppText";

import { Ionicons } from "@expo/vector-icons";
import { AppAssetImage } from "@/components/AppAssetImage";
import { CX } from "@/lib/appAssetKeys";
import { bundledRideServiceIcon } from "@/features/ride/rideOptionAssets";

const { width: SCREEN_W } = Dimensions.get("window");

const H_PAD = 18;
const COLS = 3;
const GAP = 18;
const TILE_W = (SCREEN_W - H_PAD * 2 - GAP * (COLS - 1)) / COLS;
const ICON_SIZE = TILE_W * 0.82;

export type ServiceId =
  | "bike"
  | "bike-lite"
  | "auto"
  | "ev_auto"
  | "cab-economy"
  | "cab-premium";

type ServiceBadge = "discount" | "premium";

type RideService = {
  id: ServiceId;
  label: string;
  assetKey: string;
  badge?: ServiceBadge;
  disabled?: boolean;
  /** Visual scale inside the shared icon box (full-bleed CMS art vs padded bike/cab). */
  iconScale?: number;
};

/** @deprecated Travel removed from customer booking. */
export const DISABLED_SERVICE_IDS: ServiceId[] = [];

export const ALL_SERVICES: RideService[] = [
  { id: "bike", label: "Bike", assetKey: CX.ride.bike },
  { id: "bike-lite", label: "Bike Lite", assetKey: CX.ride.bike, badge: "discount" },
  { id: "auto", label: "Auto", assetKey: CX.ride.auto },
  { id: "ev_auto", label: "EV Auto", assetKey: CX.ride.evAuto, badge: "discount", iconScale: 0.72 },
  { id: "cab-economy", label: "Cab Economy", assetKey: CX.ride.cab },
  { id: "cab-premium", label: "Cab Premium", assetKey: CX.ride.cabPremium, badge: "premium" },
];

function ServiceBadgeIcon({ type }: { type: ServiceBadge }) {
  if (type === "discount") {
    return (
      <View style={styles.discountBadge}>
        <AppText style={styles.discountBadgeText}>%</AppText>
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
  const iconPx = ICON_SIZE * (service.iconScale ?? 1);

  return (
    <TouchableOpacity
      style={[styles.tileWrap, { width: TILE_W }, disabled && styles.tileWrapDisabled]}
      activeOpacity={disabled ? 1 : 0.82}
      onPress={disabled ? undefined : onPress}
      disabled={disabled}
    >
      <View style={[styles.iconArea, { width: TILE_W, height: ICON_SIZE }]}>
        <View style={[styles.iconClip, { width: ICON_SIZE, height: ICON_SIZE }]}>
          <AppAssetImage
            assetKey={service.assetKey}
            style={{ width: iconPx, height: iconPx }}
            contentFit="contain"
            fallbackSource={bundledRideServiceIcon(service.assetKey)}
          />
        </View>
        {service.badge && !disabled ? <ServiceBadgeIcon type={service.badge} /> : null}
        {disabled ? (
          <View style={styles.comingSoonBadge}>
            <AppText style={styles.comingSoonText}>Soon</AppText>
          </View>
        ) : null}
      </View>
      <AppText style={[styles.tileLabel, disabled && styles.tileLabelDisabled]} numberOfLines={2}>
        {service.label}
      </AppText>
    </TouchableOpacity>
  );
}

type AllServicesGridProps = {
  onSelectService: (id: ServiceId) => void;
  /** When true, all tappable services are greyed out (e.g. unpaid prior ride fare). */
  servicesDisabled?: boolean;
};

export function AllServicesGrid({ onSelectService, servicesDisabled = false }: AllServicesGridProps) {
  return (
    <View style={[styles.root, servicesDisabled && styles.rootDisabled]}>
      <AppText style={styles.title}>All Services</AppText>
      <View style={styles.grid}>
        {ALL_SERVICES.map((service) => {
          const disabled =
            servicesDisabled || service.disabled === true || DISABLED_SERVICE_IDS.includes(service.id);
          return (
            <ServiceTile
              key={service.id}
              service={{ ...service, disabled }}
              onPress={() => {
                if (disabled) return;
                onSelectService(service.id);
              }}
            />
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    marginBottom: 18,
  },
  rootDisabled: {
    opacity: 0.92,
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
  iconClip: {
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
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
