/**
 * Compact “everyday lowest price” seal — visible mint dashed ring + dark pill.
 * Matches Toing-style circle stamp with GatiMitra mint (not pink).
 */

import { StyleSheet, View } from "react-native";
import { AppText } from "@/components/AppText";
import { GatiMitraColors } from "@/constants/gatimitra";

type Props = {
  /** @deprecated Rating lives on ClassicCornerRatingPill — ignored. */
  rating?: string | null;
};

const CIRCLE = 56;
/** Horizontal overhang past the circle on EACH side (equal L/R). */
const PILL_OVERHANG = 12;
const WRAP_W = CIRCLE + PILL_OVERHANG * 2;
/** Dark mint so the seal reads stronger than the ring. */
const PILL_BG = "#14532D";

export function ClassicLowestPriceStamp(_props: Props) {
  return (
    <View style={styles.wrap} pointerEvents="none">
      <View style={styles.outerRing}>
        <View style={styles.midRing}>
          <View style={styles.innerRing} />
        </View>
      </View>
      <View style={styles.pill} pointerEvents="none">
        <AppText style={styles.pillText} numberOfLines={1}>
          LOWEST PRICE
        </AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: WRAP_W,
    height: CIRCLE,
    alignItems: "center",
    justifyContent: "center",
    transform: [{ rotate: "-12deg" }],
    overflow: "visible",
  },
  outerRing: {
    width: CIRCLE,
    height: CIRCLE,
    borderRadius: CIRCLE / 2,
    borderWidth: 2.25,
    borderColor: GatiMitraColors.deepMintStart,
    backgroundColor: "rgba(16, 185, 129, 0.14)",
    alignItems: "center",
    justifyContent: "center",
    padding: 3,
  },
  midRing: {
    flex: 1,
    width: "100%",
    borderRadius: (CIRCLE - 6) / 2,
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: "rgba(5, 150, 105, 0.85)",
    alignItems: "center",
    justifyContent: "center",
    padding: 2,
  },
  innerRing: {
    flex: 1,
    width: "100%",
    borderRadius: (CIRCLE - 14) / 2,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(5, 150, 105, 0.45)",
  },
  pill: {
    position: "absolute",
    alignSelf: "center",
    backgroundColor: PILL_BG,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
    maxWidth: WRAP_W,
  },
  pillText: {
    fontSize: 7.5,
    fontWeight: "900",
    color: "#FFFFFF",
    letterSpacing: 0.4,
    textTransform: "uppercase",
    includeFontPadding: false,
  },
});

export const CLASSIC_LOWEST_PRICE_STAMP_WIDTH = WRAP_W;
