/**
 * Home featured offer — compact gradient hero; CTA bottom-right, copy never overlaps.
 */

import { View, Text, StyleSheet, Platform } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { GatiMitraColors } from "@/constants/gatimitra";

export type HomeFeaturedOfferCardProps = {
  title: string;
  sub: string;
  width: number;
  height?: number;
};

export function HomeFeaturedOfferCard({
  title,
  sub,
  width,
  height = 116,
}: HomeFeaturedOfferCardProps) {
  return (
    <View style={[styles.card, { width, height }]}>
      <LinearGradient
        colors={["#047857", "#16A34A", "#4ADE80"]}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={StyleSheet.absoluteFill}
      />
      <LinearGradient
        colors={["rgba(255,255,255,0.12)", "transparent", "rgba(0,0,0,0.06)"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />

      <View style={styles.decoCircle} pointerEvents="none" />

      <View style={styles.body}>
        <View style={styles.topRow}>
          <View style={styles.badge}>
            <Ionicons name="flash" size={10} color="#fff" />
            <Text style={styles.badgeText}>For you</Text>
          </View>
          <View style={styles.iconOrb}>
            <Ionicons name="restaurant" size={18} color="rgba(255,255,255,0.92)" />
          </View>
        </View>

        <View style={styles.copyBlock}>
          <Text style={styles.title} numberOfLines={2}>
            {title}
          </Text>
          {sub ? (
            <Text style={styles.sub} numberOfLines={2}>
              {sub}
            </Text>
          ) : null}
        </View>

        <View style={styles.bottomBar}>
          <View style={styles.cta}>
            <Text style={styles.ctaText}>Explore More</Text>
            <Ionicons name="arrow-forward" size={14} color={GatiMitraColors.emerald} />
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 20,
    overflow: "hidden",
    ...(Platform.OS === "ios" && {
      shadowColor: "#047857",
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.22,
      shadowRadius: 12,
    }),
    elevation: 6,
  },
  decoCircle: {
    position: "absolute",
    right: -24,
    top: -18,
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: "rgba(255,255,255,0.1)",
  },
  body: {
    flex: 1,
    paddingHorizontal: 14,
    paddingTop: 11,
    paddingBottom: 11,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    flexShrink: 0,
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: GatiMitraColors.warmOrange,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 16,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: "800",
    color: "#fff",
    letterSpacing: 0.25,
    textTransform: "uppercase",
  },
  iconOrb: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.18)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.22)",
    alignItems: "center",
    justifyContent: "center",
  },
  copyBlock: {
    flex: 1,
    justifyContent: "center",
    paddingTop: 6,
    paddingBottom: 8,
    paddingRight: 4,
    maxWidth: "72%",
  },
  title: {
    fontSize: 17,
    fontWeight: "800",
    color: "#fff",
    letterSpacing: -0.3,
    lineHeight: 21,
  },
  sub: {
    marginTop: 3,
    fontSize: 12,
    fontWeight: "500",
    color: "rgba(255,255,255,0.92)",
    lineHeight: 16,
  },
  bottomBar: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "flex-end",
    flexShrink: 0,
  },
  cta: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 12,
    gap: 6,
    ...(Platform.OS === "ios" && {
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.1,
      shadowRadius: 4,
    }),
    elevation: 2,
  },
  ctaText: {
    fontSize: 13,
    fontWeight: "800",
    color: GatiMitraColors.textPrimaryNew,
  },
});
