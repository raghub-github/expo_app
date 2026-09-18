/**
 * Reference “Worth A Try” image dock — soft mint scoop in the lower-right.
 * Fill only (no stroke) so the curve edge never draws a hard overlapping line.
 * + / stepper sit ON TOP as siblings (higher zIndex).
 */

import React, { memo, useEffect, useRef, useState } from "react";
import { Animated, Easing, Platform, StyleSheet, View } from "react-native";
import Svg, { Path } from "react-native-svg";

/** Must match MENU_CIRCLE_CONTROL_SIZE / MENU_CIRCLE_STEPPER_WIDTH. */
const CIRCLE = 30;
const STEPPER_SHELL = 84;
/** Tight mint margin — smaller scoop relative to the image. */
const PAD_INSET = 6;
/** Extra height above the control for a short scoop. */
const SWEEP_EXTRA = 10;
/** Extra width left of the control for a short concave scoop. */
const SWEEP_EXTRA_W = 10;

export const ADD_CUTOUT = {
  circle: CIRCLE,
  stepperShell: STEPPER_SHELL,
  padInset: PAD_INSET,
  plusW: CIRCLE + PAD_INSET * 2 + SWEEP_EXTRA_W,
  stepperW: STEPPER_SHELL + PAD_INSET * 2 + SWEEP_EXTRA_W,
  padH: CIRCLE + PAD_INSET * 2 + SWEEP_EXTRA,
} as const;

export const ADD_CUTOUT_PLUS_W = ADD_CUTOUT.plusW;
export const ADD_CUTOUT_STEPPER_W = ADD_CUTOUT.stepperW;
export const ADD_CUTOUT_PAD_H = ADD_CUTOUT.padH;
export const ADD_CUTOUT_PAD_INSET = ADD_CUTOUT.padInset;

/** Soft mint — reference dock over food photos. */
export const ADD_CURVE_FILL = "#F2F7F4";

/**
 * Single smooth concave scoop (all points inside viewBox — no negative Y).
 * Bottom + right flush with the card corner; left edge curves into the photo.
 */
function curvePath(w: number, h: number): string {
  return [
    `M 0 ${h}`,
    `L ${w} ${h}`,
    `L ${w} 0`,
    `L ${w * 0.48} 0`,
    // Soft concave: top of dock → bottom-left corner (stays inside 0…h).
    `C ${w * 0.22} 0 ${w * 0.06} ${h * 0.32} 0 ${h}`,
    `Z`,
  ].join(" ");
}

function CurvePad({
  width,
  height,
  color,
}: {
  width: number;
  height: number;
  color: string;
}) {
  return (
    <Svg width={width} height={height} style={StyleSheet.absoluteFill}>
      <Path d={curvePath(width, height)} fill={color} stroke="none" />
    </Svg>
  );
}

function ItemCardAddCornerCutoutInner({
  expanded = false,
  color = ADD_CURVE_FILL,
}: {
  expanded?: boolean;
  color?: string;
}) {
  const targetW = expanded ? ADD_CUTOUT_STEPPER_W : ADD_CUTOUT_PLUS_W;
  const widthAnim = useRef(new Animated.Value(targetW)).current;
  const [padW, setPadW] = useState(targetW);

  useEffect(() => {
    const id = widthAnim.addListener(({ value }) => {
      setPadW(Math.max(ADD_CUTOUT_PLUS_W, Math.round(value)));
    });
    return () => widthAnim.removeListener(id);
  }, [widthAnim]);

  useEffect(() => {
    Animated.timing(widthAnim, {
      toValue: expanded ? ADD_CUTOUT_STEPPER_W : ADD_CUTOUT_PLUS_W,
      duration: 200,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [expanded, widthAnim]);

  return (
    <Animated.View
      style={[
        styles.wrap,
        {
          width: padW,
          height: ADD_CUTOUT_PAD_H,
        },
      ]}
      pointerEvents="none"
      collapsable={false}
    >
      {/* Soft lift under the scoop — matches reference, no hard outline. */}
      <View style={styles.shadowPlate} pointerEvents="none" />
      <CurvePad width={padW} height={ADD_CUTOUT_PAD_H} color={color} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    right: 0,
    bottom: 0,
    zIndex: 0,
    overflow: "visible",
  },
  shadowPlate: {
    ...StyleSheet.absoluteFillObject,
    borderTopLeftRadius: 28,
    backgroundColor: "transparent",
    ...Platform.select({
      ios: {
        shadowColor: "#0F172A",
        shadowOffset: { width: -2, height: -1 },
        shadowOpacity: 0.08,
        shadowRadius: 4,
      },
      android: {
        elevation: 0,
      },
      default: {},
    }),
  },
});

export const ItemCardAddCornerCutout = memo(ItemCardAddCornerCutoutInner);
