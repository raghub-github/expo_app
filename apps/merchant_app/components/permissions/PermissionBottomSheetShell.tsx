import React from "react";
import {
  View,
  Modal,
  Pressable,
  StyleSheet,
  Platform,
  useWindowDimensions,
  type ViewStyle,
} from "react-native";
import Svg, { Path } from "react-native-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";

/**
 * Top edge like the Razorpay / UPI “Select account” sheet (reference image):
 * rounded flat left → deep concave scoop on the right (backdrop shows through).
 *
 * Critical: the white body must only join UNDER the scoop floor — never cover
 * the scooped silhouette with a rectangular marginTop overlap.
 */
const MERCHANT_TEAL = "#0D9488";
const WAVE_HEIGHT = 56;
/** Y of the left / flat portion of the top edge. */
const WAVE_TOP_Y = 8;
/** Deepest Y of the right-side scoop. */
const WAVE_SCOOP_Y = 48;

function ScoopTopEdge({ width }: { width: number }) {
  const w = Math.max(320, width);
  const ty = WAVE_TOP_Y;
  const sy = WAVE_SCOOP_Y;
  const h = WAVE_HEIGHT;

  // Asymmetric scoop: left rounded corner, deep dip on the right (2nd reference image).
  const fillPath = [
    `M 0 ${h}`,
    `L 0 ${ty + 12}`,
    `Q 0 ${ty} 18 ${ty}`,
    `L ${w * 0.38} ${ty}`,
    `C ${w * 0.48} ${ty} ${w * 0.52} ${sy} ${w * 0.68} ${sy}`,
    `C ${w * 0.86} ${sy} ${w * 0.94} ${ty + 6} ${w} ${ty + 2}`,
    `L ${w} ${h}`,
    "Z",
  ].join(" ");

  const strokePath = [
    `M 18 ${ty}`,
    `L ${w * 0.38} ${ty}`,
    `C ${w * 0.48} ${ty} ${w * 0.52} ${sy} ${w * 0.68} ${sy}`,
    `C ${w * 0.86} ${sy} ${w * 0.94} ${ty + 6} ${w} ${ty + 2}`,
  ].join(" ");

  return (
    <Svg width={w} height={h} style={styles.wave} pointerEvents="none">
      <Path d={fillPath} fill="#FFFFFF" />
      <Path d={strokePath} stroke={MERCHANT_TEAL} strokeWidth={1.5} fill="none" />
    </Svg>
  );
}

type PermissionBottomSheetShellProps = {
  visible: boolean;
  children: React.ReactNode;
  maxHeightRatio?: number;
  sheetStyle?: ViewStyle;
  dismissible?: boolean;
  onDismiss?: () => void;
};

/** Bottom sheet with Razorpay-style scooped header (right notch). */
export function PermissionBottomSheetShell({
  visible,
  children,
  maxHeightRatio = 0.72,
  sheetStyle,
  dismissible = true,
  onDismiss,
}: PermissionBottomSheetShellProps) {
  const insets = useSafeAreaInsets();
  const { height: winH, width: winW } = useWindowDimensions();
  const maxH = Math.round(winH * maxHeightRatio);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
      presentationStyle="overFullScreen"
      onRequestClose={dismissible ? onDismiss : undefined}
    >
      <View style={styles.root}>
        <Pressable
          style={styles.backdrop}
          onPress={dismissible ? onDismiss : undefined}
          accessibilityRole={dismissible ? "button" : undefined}
          accessibilityLabel={dismissible ? "Close" : undefined}
        />
        <View style={[styles.anchor, { maxHeight: maxH }]} pointerEvents="box-none">
          <View style={styles.sheetOuter} pointerEvents="box-none">
            <ScoopTopEdge width={winW} />
            <View
              style={[
                styles.sheet,
                { paddingBottom: Math.max(insets.bottom, 16) },
                sheetStyle,
              ]}
            >
              {children}
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: "flex-end",
    zIndex: 10000,
    elevation: 10000,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(15, 23, 42, 0.55)",
    zIndex: 0,
  },
  anchor: {
    width: "100%",
    zIndex: 1,
    overflow: "visible",
  },
  sheetOuter: {
    width: "100%",
    backgroundColor: "transparent",
    overflow: "visible",
    ...(Platform.OS === "android"
      ? { elevation: 24 }
      : {
          shadowColor: "#000",
          shadowOffset: { width: 0, height: -4 },
          shadowOpacity: 0.12,
          shadowRadius: 12,
        }),
  },
  wave: {
    width: "100%",
    zIndex: 2,
  },
  sheet: {
    width: "100%",
    backgroundColor: "#FFFFFF",
    // Join only under the scoop floor — do NOT cover the scoop silhouette.
    marginTop: -(WAVE_HEIGHT - WAVE_SCOOP_Y),
    paddingTop: 4,
    overflow: "visible",
    zIndex: 1,
  },
});
