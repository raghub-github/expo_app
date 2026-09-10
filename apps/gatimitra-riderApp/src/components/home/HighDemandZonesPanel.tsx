import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  LayoutAnimation,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  UIManager,
  useWindowDimensions,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { DemandZone } from "@/src/lib/demand-zones";
import { openGoogleMapsNavigation } from "@/src/lib/open-google-maps-navigation";
import { responsiveFont, responsiveSpacing } from "@/src/theme/responsive";

/** Fabric / New Arch — LayoutAnimation often crashes with "Unable to find viewState for tag". */
const IS_FABRIC =
  Boolean((globalThis as { nativeFabricUIManager?: unknown }).nativeFabricUIManager) ||
  Boolean((globalThis as { RN$Bridgeless?: unknown }).RN$Bridgeless);

const LAYOUT_ANIM_OK =
  !IS_FABRIC &&
  Platform.OS === "android" &&
  typeof UIManager.setLayoutAnimationEnabledExperimental === "function";

if (LAYOUT_ANIM_OK) {
  UIManager.setLayoutAnimationEnabledExperimental?.(true);
}

function safeConfigureLayoutAnimation(): void {
  if (IS_FABRIC) return;
  try {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
  } catch {
    /* ignore — never crash expand/collapse */
  }
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
 * Flex row with shrinkable text so narrow widths / large fonts never overflow.
 */
export function HighDemandZonesPanel({
  zones,
  riderLat,
  riderLng,
  visible = true,
  isLoading = false,
}: Props) {
  const [expanded, setExpanded] = useState(false);
  const { width, fontScale } = useWindowDimensions();
  const titleSize = responsiveFont(14, width, fontScale, { min: 12, max: 16 });
  const subSize = responsiveFont(11, width, fontScale, { min: 10, max: 13 });
  const padH = responsiveSpacing(14, width);
  const padV = responsiveSpacing(14, width);

  useEffect(() => {
    if (zones.length === 0) setExpanded(false);
  }, [zones.length]);

  const toggle = useCallback(() => {
    if (zones.length === 0) return;
    safeConfigureLayoutAnimation();
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

  const listMaxH = Math.min(200, Math.round(width * 0.45));

  return (
    <View style={styles.root} collapsable={false}>
      {expanded && hasZones ? (
        <View style={[styles.list, { maxHeight: listMaxH }]}>
          {zones.map((zone) => (
            <View key={zone.id} style={styles.row}>
              <View style={styles.rowText}>
                <Text style={[styles.zoneTitle, { fontSize: titleSize }]} numberOfLines={1}>
                  {zone.label}
                </Text>
                <Text style={[styles.zoneMeta, { fontSize: subSize }]} numberOfLines={1}>
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

      <View style={[styles.banner, { paddingHorizontal: padH, paddingVertical: padV }]}>
        <View style={styles.icon}>
          {isLoading ? (
            <ActivityIndicator size="small" color="#ffffff" />
          ) : (
            <Ionicons name="flame" size={18} color="#ffffff" />
          )}
        </View>
        <View style={styles.textCol}>
          <Text style={[styles.title, { fontSize: titleSize }]} numberOfLines={1} ellipsizeMode="tail">
            High demand zones
          </Text>
          <Text style={[styles.sub, { fontSize: subSize }]} numberOfLines={2} ellipsizeMode="tail">
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
          <Text style={[styles.ctaText, { fontSize: responsiveFont(13, width, fontScale, { min: 11, max: 14 }) }]} numberOfLines={1}>
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
  banner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#0f172a",
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
    flexShrink: 1,
  },
  title: {
    fontWeight: "800",
    color: "#ffffff",
  },
  sub: {
    color: "rgba(255,255,255,0.92)",
    marginTop: 2,
  },
  cta: {
    backgroundColor: "#ffffff",
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    flexShrink: 0,
    minWidth: 52,
    alignItems: "center",
    justifyContent: "center",
  },
  ctaDisabled: {
    opacity: 0.7,
  },
  ctaText: {
    fontWeight: "800",
    color: "#EA580C",
  },
  list: {
    backgroundColor: "#FFFFFF",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#E5E7EB",
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
    fontWeight: "800",
    color: "#0f172a",
  },
  zoneMeta: {
    marginTop: 2,
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
