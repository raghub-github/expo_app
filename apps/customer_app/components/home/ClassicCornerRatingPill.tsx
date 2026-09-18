/**
 * Curved top-right corner pill — same geometry as HomeServicesRow offer pills.
 * Used for store rating on Classic food cards.
 */

import { StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { AppText } from "@/components/AppText";

type Props = {
  rating: string;
  /** Match parent card corner radius. */
  cardRadius?: number;
};

const PAD_H = 8;
const PAD_V = 5;
const INNER_R = 12;
const FONT = 11;

export function ClassicCornerRatingPill({ rating, cardRadius = 20 }: Props) {
  return (
    <View style={styles.wrap} pointerEvents="none">
      <View
        style={[
          styles.fill,
          {
            borderTopRightRadius: cardRadius,
            borderBottomLeftRadius: INNER_R,
          },
        ]}
      >
        <Ionicons name="star" size={10} color="#FFFFFF" />
        <AppText style={styles.text} numberOfLines={1}>
          {rating}
        </AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    top: 0,
    right: 0,
    zIndex: 8,
    maxWidth: "50%",
  },
  fill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingLeft: PAD_H,
    paddingRight: PAD_H,
    paddingTop: PAD_V,
    paddingBottom: PAD_V,
    backgroundColor: "#0F766E",
    borderTopRightRadius: 20,
    borderBottomRightRadius: 0,
    borderTopLeftRadius: 0,
    borderBottomLeftRadius: INNER_R,
    overflow: "hidden",
  },
  text: {
    color: "#FFFFFF",
    fontSize: FONT,
    fontWeight: "800",
    letterSpacing: 0.2,
    lineHeight: 14,
    includeFontPadding: false,
  },
});
