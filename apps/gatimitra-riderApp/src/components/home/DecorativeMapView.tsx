import React from "react";
import { View, StyleSheet, Dimensions } from "react-native";
import { Svg, Line, Rect, Circle } from "react-native-svg";
import { YouRiderMarker } from "@/src/components/home/YouRiderMarker";

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");

type DecorativeMapViewProps = {
  lat?: number;
  lng?: number;
};

/** Grayscale map placeholder when native maps unavailable (web). */
export function DecorativeMapView({ lat: _lat, lng: _lng }: DecorativeMapViewProps) {
  const gridLines = [];
  const step = 56;
  for (let x = 0; x < SCREEN_W; x += step) {
    gridLines.push(
      <Line key={`v-${x}`} x1={x} y1={0} x2={x} y2={SCREEN_H} stroke="#D1D5DB" strokeWidth={1} opacity={0.55} />
    );
  }
  for (let y = 0; y < SCREEN_H; y += step) {
    gridLines.push(
      <Line key={`h-${y}`} x1={0} y1={y} x2={SCREEN_W} y2={y} stroke="#D1D5DB" strokeWidth={1} opacity={0.55} />
    );
  }

  const cx = SCREEN_W * 0.52;
  const cy = SCREEN_H * 0.42;

  return (
    <View style={styles.root}>
      <Svg width={SCREEN_W} height={SCREEN_H} style={StyleSheet.absoluteFill}>
        <Rect x={0} y={0} width={SCREEN_W} height={SCREEN_H} fill="#ECECEC" />
        {gridLines}
        <Rect x={SCREEN_W * 0.08} y={SCREEN_H * 0.18} width={SCREEN_W * 0.84} height={14} fill="#FFFFFF" rx={4} />
        <Rect x={SCREEN_W * 0.22} y={SCREEN_H * 0.08} width={12} height={SCREEN_H * 0.72} fill="#FFFFFF" rx={4} />
        <Circle cx={SCREEN_W * 0.18} cy={SCREEN_H * 0.78} r={28} fill="#D9D9D9" opacity={0.7} />
      </Svg>

      <View style={[styles.markerHost, { left: cx - 45, top: cy - 78 }]}>
        <YouRiderMarker />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#ECECEC",
  },
  markerHost: {
    position: "absolute",
    alignItems: "center",
  },
});
