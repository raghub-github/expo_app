import { View, StyleSheet } from "react-native";
import { AppText } from "@/components/AppText";

import { LinearGradient } from "expo-linear-gradient";
import { GatiMitraColors } from "@/constants/gatimitra";

const GREEN = GatiMitraColors.primaryMint;
const GREEN_DARK = GatiMitraColors.deepMintStart;

/** Tilted 3D-style wallet icon — GatiMitra green, teal in discovery dark. */
export function GatiCashWalletHeroIcon({ dark = false }: { dark?: boolean }) {
  return (
    <View style={styles.wrap}>
      <View style={[styles.shadowLayer, dark && styles.shadowLayerDark]} />
      <LinearGradient
        colors={dark ? ["#2DD4BF", "#0F766E"] : [GREEN, GREEN_DARK]}
        start={{ x: 0.15, y: 0 }}
        end={{ x: 0.85, y: 1 }}
        style={styles.body}
      >
        <View style={styles.flap} />
        <View style={styles.flapLine} />
        <AppText style={styles.rupee}>₹</AppText>
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    transform: [{ rotate: "14deg" }],
    marginBottom: 20,
  },
  shadowLayer: {
    position: "absolute",
    width: 88,
    height: 64,
    borderRadius: 18,
    backgroundColor: "rgba(22, 163, 74, 0.32)",
    top: 8,
    left: 6,
  },
  shadowLayerDark: {
    backgroundColor: "rgba(45, 212, 191, 0.28)",
  },
  body: {
    width: 88,
    height: 64,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    shadowColor: GREEN_DARK,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  flap: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 22,
    backgroundColor: "rgba(255,255,255,0.14)",
    borderBottomLeftRadius: 12,
    borderBottomRightRadius: 12,
  },
  flapLine: {
    position: "absolute",
    top: 20,
    left: 10,
    right: 10,
    height: 1.5,
    backgroundColor: "rgba(255,255,255,0.28)",
    borderRadius: 1,
  },
  rupee: {
    fontSize: 30,
    fontWeight: "800",
    color: "#FFFFFF",
    marginTop: 6,
  },
});
