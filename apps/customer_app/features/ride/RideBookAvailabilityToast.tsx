import { View, Text, StyleSheet } from "react-native";
import { GatiMitraColors } from "@/constants/gatimitra";
import { AppAssetImage } from "@/components/AppAssetImage";
import { CX } from "@/lib/appAssetKeys";

type Props = {
  visible: boolean;
  message: string;
};

/** Rapido-style dark pill toast for ride booking availability hints. */
export function RideBookAvailabilityToast({ visible, message }: Props) {
  if (!visible) return null;

  return (
    <View style={styles.wrap} pointerEvents="none">
      <View style={styles.pill}>
        <View style={styles.logoCircle}>
          <AppAssetImage assetKey={CX.orders.toastLogo} style={styles.logo} contentFit="contain" />
        </View>
        <Text style={styles.text}>{message}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 68,
    alignItems: "center",
    zIndex: 12,
    paddingHorizontal: 16,
  },
  pill: {
    width: "78%",
    maxWidth: 340,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "rgba(45, 45, 45, 0.94)",
    paddingVertical: 11,
    paddingHorizontal: 14,
    borderRadius: 999,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.22,
    shadowRadius: 10,
    elevation: 8,
  },
  logoCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: GatiMitraColors.primaryMint,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  logo: {
    width: 20,
    height: 20,
  },
  text: {
    flex: 1,
    fontSize: 13,
    fontWeight: "600",
    color: "#FFFFFF",
    lineHeight: 18,
  },
});
