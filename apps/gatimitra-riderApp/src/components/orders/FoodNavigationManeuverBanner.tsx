import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { ActiveManeuverDisplay } from "@/src/lib/navigation-maneuver";
import { formatDistanceAhead } from "@/src/lib/navigation-maneuver";

type Props = {
  maneuver: ActiveManeuverDisplay;
};

const NAV_GREEN = "#0B5D30";
const NAV_GREEN_DARK = "#084526";

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
    <View style={[styles.iconBox, rotation]}>
      <Ionicons name={name} size={36} color="#ffffff" />
    </View>
  );
}

export function FoodNavigationManeuverBanner({ maneuver }: Props) {
  const ahead = formatDistanceAhead(maneuver.distanceAheadM);
  const wrongWay = maneuver.title === "Wrong way";
  const headline = wrongWay ? maneuver.primary : maneuver.title;

  return (
    <View style={[styles.wrap, wrongWay && styles.wrapWrongWay]}>
      <View style={styles.main}>
        <ManeuverIcon icon={maneuver.icon} />
        <View style={styles.textCol}>
          <Text style={[styles.title, wrongWay && styles.titleWrongWay]} numberOfLines={wrongWay ? 2 : 1}>
            {headline}
          </Text>
          {ahead ? (
            <Text style={styles.ahead} numberOfLines={1}>
              {ahead}
            </Text>
          ) : null}
        </View>
      </View>
      {maneuver.thenLabel ? (
        <View style={[styles.thenBar, wrongWay && styles.thenBarWrongWay]}>
          <Text style={styles.thenPrefix}>Then</Text>
          <Ionicons name="arrow-forward" size={14} color="#B8E6C8" />
          <Text style={styles.thenText} numberOfLines={1}>
            {maneuver.thenLabel}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: NAV_GREEN,
    marginHorizontal: 0,
    overflow: "hidden",
  },
  wrapWrongWay: {
    backgroundColor: "#C2410C",
  },
  thenBarWrongWay: {
    backgroundColor: "#9A3412",
  },
  main: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 10,
  },
  iconBox: {
    width: 52,
    height: 52,
    alignItems: "center",
    justifyContent: "center",
  },
  textCol: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontSize: 26,
    fontWeight: "800",
    color: "#ffffff",
    letterSpacing: -0.3,
  },
  titleWrongWay: {
    fontSize: 17,
    lineHeight: 22,
  },
  ahead: {
    fontSize: 15,
    fontWeight: "600",
    color: "rgba(255,255,255,0.88)",
  },
  thenBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: NAV_GREEN_DARK,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  thenPrefix: {
    fontSize: 13,
    fontWeight: "800",
    color: "#B8E6C8",
    textTransform: "uppercase",
  },
  thenText: {
    flex: 1,
    fontSize: 14,
    fontWeight: "700",
    color: "#ffffff",
  },
});
