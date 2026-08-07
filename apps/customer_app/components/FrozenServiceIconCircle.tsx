/**
 * Service icon in a circle with a diagonal slash — frozen / blocked state.
 */

import { View, StyleSheet } from "react-native";
import { AppAssetImage } from "@/components/AppAssetImage";

type FrozenServiceIconCircleProps = {
  assetKey: string;
  size?: number;
};

export function FrozenServiceIconCircle({ assetKey, size = 44 }: FrozenServiceIconCircleProps) {
  const outer = size + 22;
  const slashWidth = Math.max(3, Math.round(outer * 0.045));
  const slashHeight = Math.round(outer * 1.02);

  return (
    <View style={[styles.wrap, { width: outer, height: outer }]}>
      <View
        style={[
          styles.ring,
          {
            width: outer,
            height: outer,
            borderRadius: outer / 2,
          },
        ]}
      >
        <AppAssetImage assetKey={assetKey} style={{ width: size, height: size }} contentFit="contain" />
      </View>
      <View
        style={[
          styles.slash,
          {
            width: slashWidth,
            height: slashHeight,
            borderRadius: slashWidth / 2,
            transform: [{ rotate: "-45deg" }],
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: "center",
    justifyContent: "center",
  },
  ring: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
    borderWidth: 3,
    borderColor: "#DC2626",
    overflow: "hidden",
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
  },
  slash: {
    position: "absolute",
    backgroundColor: "#DC2626",
    zIndex: 2,
  },
});
