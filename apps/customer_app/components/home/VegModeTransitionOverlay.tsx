import { ActivityIndicator, StyleSheet, View } from "react-native";
import { AppText } from "@/components/AppText";
import { GatiMitraColors } from "@/constants/gatimitra";

export type VegModeTransitionKind = "on" | "off";

type Props = {
  kind: VegModeTransitionKind | null;
};

/** Full-screen veg-mode flash — bold dark copy, no thin gray system text. */
export function VegModeTransitionOverlay({ kind }: Props) {
  if (!kind) return null;

  if (kind === "on") {
    return (
      <View style={styles.root} pointerEvents="none">
        <View style={styles.badge}>
          <AppText style={styles.badgeText} bold>
            100% VEG
          </AppText>
        </View>
        <AppText style={styles.subtitle} bold>
          Explore veg dishes from all restaurants
        </AppText>
      </View>
    );
  }

  return (
    <View style={styles.root} pointerEvents="none">
      <ActivityIndicator size="large" color={GatiMitraColors.primaryMint} />
      <AppText style={styles.offTitle} bold>
        Switching off
      </AppText>
      <AppText style={styles.offTitle} bold>
        Veg Mode for you
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 40,
    elevation: 40,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 28,
  },
  badge: {
    width: 132,
    height: 132,
    borderRadius: 66,
    backgroundColor: "#16A34A",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 22,
  },
  badgeText: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "800",
    letterSpacing: 0.6,
    textAlign: "center",
  },
  subtitle: {
    color: "#111827",
    fontSize: 16,
    fontWeight: "800",
    textAlign: "center",
    lineHeight: 22,
  },
  offTitle: {
    color: "#111827",
    fontSize: 20,
    fontWeight: "800",
    textAlign: "center",
    lineHeight: 26,
    marginTop: 6,
  },
});
