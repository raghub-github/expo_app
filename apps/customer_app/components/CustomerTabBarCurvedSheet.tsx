/**
 * Bottom nav sheet: full-bleed bar, rounded top corners,
 * connected to the screen bottom (Android gesture area is filled; tabs pad above it).
 * Flat edge stroke only — no drop shadow on the dock.
 */
import React, { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { GatiMitraColors } from "@/constants/gatimitra";

/** Pronounced top corner radius so the curve is easy to see. */
export const TAB_SHEET_TOP_RADIUS = 32;

/** Light theme sheet — matches main app surfaces. */
export const TAB_SHEET_FILL_LIGHT = GatiMitraColors.cardSurface;
/** Discovery / dark chrome sheet. */
export const TAB_SHEET_FILL_DARK = "#121212";

/** Edge stroke — light theme (reads on mint / soft bg). */
export const TAB_SHEET_EDGE_LIGHT = "rgba(15, 23, 42, 0.10)";
/** @deprecated Lift shadow removed — kept for callers. */
export const TAB_SHEET_LIFT_LIGHT = "transparent";
/** Edge stroke — dark theme (reads on dark content). */
export const TAB_SHEET_EDGE_DARK = "rgba(255, 255, 255, 0.14)";
/** @deprecated Lift shadow removed — kept for callers. */
export const TAB_SHEET_LIFT_DARK = "transparent";

function roundedTopSheetPath(width: number, height: number, radius: number): string {
  const w = Math.max(1, width);
  const h = Math.max(radius + 8, height);
  const r = Math.min(radius, w / 2, h);
  return [
    `M 0 ${r}`,
    `Q 0 0 ${r} 0`,
    `L ${w - r} 0`,
    `Q ${w} 0 ${w} ${r}`,
    `L ${w} ${h}`,
    `L 0 ${h}`,
    `Z`,
  ].join(" ");
}

/** Open path along the rounded top only — used for the visible curve stroke. */
function roundedTopEdgePath(width: number, radius: number): string {
  const w = Math.max(1, width);
  const r = Math.min(radius, w / 2);
  return [
    `M 0 ${r}`,
    `Q 0 0 ${r} 0`,
    `L ${w - r} 0`,
    `Q ${w} 0 ${w} ${r}`,
  ].join(" ");
}

type Props = {
  width: number;
  height: number;
  /** Sheet fill — light theme white by default. */
  fill?: string;
  /** Top-edge stroke color. */
  edgeColor?: string;
  /** Ignored — shadow removed from dock. */
  liftColor?: string;
};

export function CustomerTabBarCurvedSheet({
  width,
  height,
  fill = TAB_SHEET_FILL_LIGHT,
  edgeColor = TAB_SHEET_EDGE_LIGHT,
}: Props) {
  const w = Math.max(1, Math.round(width));
  const h = Math.max(TAB_SHEET_TOP_RADIUS + 24, Math.round(height));
  const r = TAB_SHEET_TOP_RADIUS;

  const { fillPath, edgePath } = useMemo(
    () => ({
      fillPath: roundedTopSheetPath(w, h, r),
      edgePath: roundedTopEdgePath(w, r),
    }),
    [w, h, r],
  );

  if (w < 2) return null;

  return (
    <View style={[styles.host, { width: w, height: h }]} pointerEvents="none">
      <Svg width={w} height={h} style={StyleSheet.absoluteFill}>
        <Path d={fillPath} fill={fill} />
        <Path
          d={edgePath}
          stroke={edgeColor}
          strokeWidth={1}
          fill="none"
          strokeLinecap="round"
        />
      </Svg>
    </View>
  );
}

/** @deprecated Kept so older imports keep compiling — rear peek removed for reference match. */
export const TAB_SHEET_CURVE_RISE = 0;
/** @deprecated */
export const TAB_SHEET_REAR_PEEK = 0;

const styles = StyleSheet.create({
  host: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    overflow: "visible",
  },
});
