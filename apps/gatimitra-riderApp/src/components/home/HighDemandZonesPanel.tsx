import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  LayoutAnimation,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  UIManager,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { DemandZone } from "@/src/lib/demand-zones";
import { openGoogleMapsNavigation } from "@/src/lib/open-google-maps-navigation";

if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

/** Same banner chrome as OffDutyBanner ("Not receiving new orders!"). */
export const DEMAND_ZONES_COLLAPSED_HEIGHT = 62;

type Props = {
  zones: DemandZone[];
  riderLat?: number;
  riderLng?: number;
  visible?: boolean;
  isLoading?: boolean;
};

/**
 * Bottom map banner — mirrors OffDutyBanner layout (icon + title/sub + CTA).
 */
export function HighDemandZonesPanel({
  zones,
  riderLat,
  riderLng,
  visible = true,
  isLoading = false,
}: Props) {
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (zones.length === 0) setExpanded(false);
  }, [zones.length]);

  const toggle = useCallback(() => {
    if (zones.length === 0) return;
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded((v) => !v);
  }, [zones.length]);

  const navigateToZone = useCallback(
    (zone: DemandZone) => {
      void openGoogleMapsNavigation({
        destination: zone.centroid,
        origin:
          riderLat != null && riderLng != null
            ? { lat: riderLat, lng: riderLng }
            : undefined,
        destinationLabel: zone.label,
      });
    },
    [riderLat, riderLng]
  );

  if (!visible) return null;

  const hasZones = zones.length > 0;
  const subtitle = isLoading
    ? "Finding busy areas near you…"
    : hasZones
      ? "Maximize your earnings in these areas!"
      : "No busy areas nearby right now";

  return (
    <View style={styles.root} collapsable={false}>
      {expanded && hasZones ? (
        <View style={styles.list}>
          {zones.map((zone) => (
            <View key={zone.id} style={styles.row}>
              <View style={styles.rowText}>
                <Text style={styles.zoneTitle} numberOfLines={1}>
                  {zone.label}
                </Text>
                <Text style={styles.zoneMeta} numberOfLines={1}>
                  {zone.distanceKm < 1
                    ? `${Math.round(zone.distanceKm * 1000)} m`
                    : `${zone.distanceKm} km`}
                  {zone.storeCount > 0 ? ` · ${zone.storeCount} restaurants` : ""}
                </Text>
              </View>
              <Pressable
                onPress={() => navigateToZone(zone)}
                hitSlop={10}
                style={({ pressed }) => [styles.mapBtn, pressed && styles.pressed]}
                accessibilityRole="button"
                accessibilityLabel={`Navigate to ${zone.label}`}
              >
                <Ionicons name="map" size={20} color="#334155" />
              </Pressable>
            </View>
          ))}
        </View>
      ) : null}

      <View style={styles.banner}>
        <View style={styles.icon}>
          {isLoading ? (
            <ActivityIndicator size="small" color="#ffffff" />
          ) : (
            <Ionicons name="flame" size={18} color="#ffffff" />
          )}
        </View>
        <View style={styles.textCol}>
          <Text style={styles.title} numberOfLines={1}>
            High demand zones
          </Text>
          <Text style={styles.sub} numberOfLines={1}>
            {subtitle}
          </Text>
        </View>
        <Pressable
          style={[styles.cta, !hasZones && styles.ctaDisabled]}
          onPress={toggle}
          disabled={!hasZones}
          accessibilityRole="button"
          accessibilityLabel={expanded ? "Hide zones" : "View zones"}
        >
          <Text style={styles.ctaText}>
            {hasZones ? (expanded ? "Hide" : "View") : "Soon"}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    width: "100%",
    alignSelf: "stretch",
  },
  /** Match OffDutyBanner.offDutyWrap */
  banner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#0f172a",
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 10,
    minHeight: DEMAND_ZONES_COLLAPSED_HEIGHT,
    width: "100%",
  },
  icon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.45)",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  textCol: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: 14,
    fontWeight: "800",
    color: "#ffffff",
  },
  sub: {
    fontSize: 11,
    color: "rgba(255,255,255,0.92)",
    marginTop: 2,
  },
  cta: {
    backgroundColor: "#ffffff",
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    flexShrink: 0,
  },
  ctaDisabled: {
    opacity: 0.7,
  },
  ctaText: {
    fontSize: 13,
    fontWeight: "800",
    color: "#EA580C",
  },
  list: {
    backgroundColor: "#FFFFFF",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#E5E7EB",
    maxHeight: 200,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#F3F4F6",
  },
  rowText: {
    flex: 1,
    minWidth: 0,
    paddingRight: 10,
  },
  zoneTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: "#0f172a",
  },
  zoneMeta: {
    marginTop: 2,
    fontSize: 11,
    color: "#64748b",
    fontWeight: "600",
  },
  mapBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
    justifyContent: "center",
  },
  pressed: {
    opacity: 0.88,
  },
});
