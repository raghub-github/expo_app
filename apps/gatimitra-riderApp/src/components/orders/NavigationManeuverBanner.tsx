import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { ActiveManeuverDisplay } from "@/src/lib/navigation-maneuver";
import { formatDistanceShort } from "@/src/lib/navigation-maneuver";
type Props = {
  maneuver: ActiveManeuverDisplay;
};

function ManeuverIcon({ icon }: { icon: ActiveManeuverDisplay["icon"] }) {
  const name =
    icon === "left" || icon === "slight-left"
      ? "arrow-back"
      : icon === "right" || icon === "slight-right"
        ? "arrow-forward"
        : icon === "uturn"
          ? "return-up-back"
          : icon === "arrive"
            ? "flag"
            : "arrow-up";
  const rotation =
    icon === "left" || icon === "slight-left"
      ? { transform: [{ rotate: "-90deg" }] }
      : icon === "right" || icon === "slight-right"
        ? { transform: [{ rotate: "90deg" }] }
        : undefined;

  return (
    <View style={[styles.iconWrap, rotation]}>
      <Ionicons name={name} size={28} color="#ffffff" />
    </View>
  );
}

export function NavigationManeuverBanner({ maneuver }: Props) {
  const wrongWay = maneuver.title === "Wrong way";
  const headline = wrongWay ? maneuver.primary : (maneuver.title ?? maneuver.primary);
  const distance = formatDistanceShort(maneuver.distanceAheadM);

  return (
    <View style={[styles.wrap, wrongWay && styles.wrapWrongWay]}>
      <View style={[styles.primaryRow, wrongWay && styles.primaryRowWrongWay]}>
        <ManeuverIcon icon={maneuver.icon} />
        <View style={styles.textCol}>
          {distance ? (
            <Text style={styles.distanceText} numberOfLines={1}>
              {distance}
            </Text>
          ) : null}
          <Text style={styles.primaryText} numberOfLines={2}>
            {headline}
          </Text>
        </View>
      </View>
      {maneuver.secondary ? (
        <View style={[styles.thenRow, wrongWay && styles.thenRowWrongWay]}>
          <Text style={styles.thenLabel}>Then</Text>
          <Ionicons name="arrow-forward" size={14} color="#E8F5E9" style={styles.thenArrow} />
          <Text style={styles.thenText} numberOfLines={1}>
            {maneuver.secondary}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const NAV_GREEN = "#0D5C2E";
const NAV_GREEN_LIGHT = "#1B7A3F";

const styles = StyleSheet.create({
  wrapWrongWay: {
    backgroundColor: "#C2410C",
  },
  primaryRowWrongWay: {
    backgroundColor: "#C2410C",
  },
  thenRowWrongWay: {
    backgroundColor: "#9A3412",
  },
  wrap: {
    backgroundColor: NAV_GREEN,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 6,
    elevation: 6,
  },
  primaryRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 12,
    backgroundColor: NAV_GREEN,
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  textCol: {
    flex: 1,
    minWidth: 0,
    paddingRight: 8,
  },
  distanceText: {
    fontSize: 26,
    fontWeight: "800",
    color: "#ffffff",
    lineHeight: 30,
  },
  primaryText: {
    fontSize: 17,
    fontWeight: "700",
    color: "rgba(255,255,255,0.95)",
    letterSpacing: 0.1,
  },
  thenRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: NAV_GREEN_LIGHT,
    borderTopLeftRadius: 12,
    alignSelf: "flex-start",
    marginLeft: 12,
    marginBottom: 10,
    maxWidth: "92%",
  },
  thenLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "#C8E6C9",
    textTransform: "uppercase",
  },
  thenArrow: {
    opacity: 0.9,
  },
  thenText: {
    flex: 1,
    fontSize: 13,
    fontWeight: "600",
    color: "#ffffff",
  },
});
