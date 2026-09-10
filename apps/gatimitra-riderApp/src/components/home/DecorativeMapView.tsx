import React from "react";
import { View, StyleSheet, useWindowDimensions } from "react-native";
import { Svg, Line, Rect, Circle } from "react-native-svg";
import { YouRiderMarker } from "@/src/components/home/YouRiderMarker";

type DecorativeMapViewProps = {
  lat?: number;
  lng?: number;
};

/** Grayscale map placeholder when native maps unavailable (web). */
export function DecorativeMapView({ lat: _lat, lng: _lng }: DecorativeMapViewProps) {
  const { width: screenW, height: screenH } = useWindowDimensions();
  const gridLines = [];
  const step = 56;
  for (let x = 0; x < screenW; x += step) {
    gridLines.push(
      <Line key={`v-${x}`} x1={x} y1={0} x2={x} y2={screenH} stroke="#D1D5DB" strokeWidth={1} opacity={0.55} />
    );
  }
  for (let y = 0; y < screenH; y += step) {
    gridLines.push(
      <Line key={`h-${y}`} x1={0} y1={y} x2={screenW} y2={y} stroke="#D1D5DB" strokeWidth={1} opacity={0.55} />
    );
  }

  const cx = screenW * 0.52;
  const cy = screenH * 0.42;

  return (
    <View style={styles.root}>
      <Svg width={screenW} height={screenH} style={StyleSheet.absoluteFill}>
        <Rect x={0} y={0} width={screenW} height={screenH} fill="#ECECEC" />
        {gridLines}
        <Rect x={screenW * 0.08} y={screenH * 0.18} width={screenW * 0.84} height={14} fill="#FFFFFF" rx={4} />
        <Rect x={screenW * 0.22} y={screenH * 0.08} width={12} height={screenH * 0.72} fill="#FFFFFF" rx={4} />
        <Circle cx={screenW * 0.18} cy={screenH * 0.78} r={28} fill="#D9D9D9" opacity={0.7} />
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
