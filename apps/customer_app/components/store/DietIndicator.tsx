import React from "react";
import { View, StyleSheet } from "react-native";
import { StoreTheme } from "@/constants/storeTheme";

type DietType = "veg" | "nonveg" | "egg";

function DietIndicatorInner({ type }: { type: DietType }) {
  if (type === "veg") {
    return (
      <View style={[styles.box, { borderColor: StoreTheme.vegGreen }]}>
        <View style={[styles.dot, { backgroundColor: StoreTheme.vegGreen }]} />
      </View>
    );
  }
  if (type === "egg") {
    return (
      <View style={[styles.box, { borderColor: StoreTheme.eggYellow }]}>
        <View style={[styles.eggDot, { backgroundColor: StoreTheme.eggYellow }]} />
      </View>
    );
  }
  return (
    <View style={[styles.box, { borderColor: StoreTheme.nonVegBrown }]}>
      <View style={[styles.triangle, { borderBottomColor: StoreTheme.nonVegBrown }]} />
    </View>
  );
}

const BOX = 14;

const styles = StyleSheet.create({
  box: {
    width: BOX,
    height: BOX,
    borderWidth: 1.5,
    borderRadius: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  eggDot: {
    width: 7,
    height: 5,
    borderRadius: 3,
  },
  triangle: {
    width: 0,
    height: 0,
    borderLeftWidth: 4,
    borderRightWidth: 4,
    borderBottomWidth: 7,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    marginTop: -1,
  },
});

/**
 * Rendered once per list item. Memoised so a parent re-render (a filter
 * toggle, a store-status tick, a bill recalculation) does not walk every
 * mounted instance.
 */
export const DietIndicator = React.memo(DietIndicatorInner);
