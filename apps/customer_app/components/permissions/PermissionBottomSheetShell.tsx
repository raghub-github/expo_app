import React from "react";
import {
  View,
  Modal,
  StyleSheet,
  Platform,
  useWindowDimensions,
  type ViewStyle,
} from "react-native";
import Svg, { Path } from "react-native-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "@/theme";

/** Same central-hump wave as Rider PermissionBottomSheetShell / StoreMenuItemDetailSheet. */
const WAVE_HEIGHT = 36;
const WAVE_SIDE_Y = 28;
const WAVE_PEAK_Y = 2;
const WAVE_STROKE = colors.primary[700];

function WaveTopEdge({ width }: { width: number }) {
  const w = Math.max(320, width);
  const sy = WAVE_SIDE_Y;
  const py = WAVE_PEAK_Y;
  const fillPath = [
    `M 0 ${WAVE_HEIGHT}`,
    `L 0 ${sy}`,
    `L ${w * 0.18} ${sy}`,
    `C ${w * 0.28} ${sy} ${w * 0.3} ${py} ${w * 0.5} ${py}`,
    `C ${w * 0.7} ${py} ${w * 0.72} ${sy} ${w * 0.82} ${sy}`,
    `L ${w} ${sy}`,
    `L ${w} ${WAVE_HEIGHT}`,
    "Z",
  ].join(" ");
  const strokePath = [
    `M 0 ${sy}`,
    `L ${w * 0.18} ${sy}`,
    `C ${w * 0.28} ${sy} ${w * 0.3} ${py} ${w * 0.5} ${py}`,
    `C ${w * 0.7} ${py} ${w * 0.72} ${sy} ${w * 0.82} ${sy}`,
    `L ${w} ${sy}`,
  ].join(" ");

  return (
    <Svg width={w} height={WAVE_HEIGHT} style={styles.wave} pointerEvents="none">
      <Path d={fillPath} fill="#FFFFFF" />
      <Path d={strokePath} stroke={WAVE_STROKE} strokeWidth={1.5} fill="none" />
    </Svg>
  );
}

type PermissionBottomSheetShellProps = {
  visible: boolean;
  children: React.ReactNode;
  maxHeightRatio?: number;
  sheetStyle?: ViewStyle;
};

/** Bottom sheet shell for permission prompts — Rider-style wave header. */
export function PermissionBottomSheetShell({
  visible,
  children,
  maxHeightRatio = 0.82,
  sheetStyle,
}: PermissionBottomSheetShellProps) {
  const insets = useSafeAreaInsets();
  const { height: winH, width: winW } = useWindowDimensions();
  const maxH = Math.round(winH * maxHeightRatio);

  // Fully unmount Modal when hidden — PermissionsAndroid hangs under a mounted Modal.
  if (!visible) return null;

  return (
    <Modal
      visible
      transparent
      animationType="slide"
      statusBarTranslucent
      presentationStyle="overFullScreen"
    >
      <View style={styles.root}>
        <View style={styles.backdrop} />
        <View style={[styles.anchor, { maxHeight: maxH }]}>
          <View style={styles.sheetOuter} pointerEvents="box-none">
            <WaveTopEdge width={winW} />
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
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(15, 23, 42, 0.55)",
  },
  anchor: {
    width: "100%",
  },
  sheetOuter: {
    width: "100%",
    ...(Platform.OS === "android"
      ? { elevation: 16 }
      : {
          shadowColor: "#000",
          shadowOffset: { width: 0, height: -4 },
          shadowOpacity: 0.12,
          shadowRadius: 12,
        }),
  },
  wave: {
    width: "100%",
  },
  sheet: {
    width: "100%",
    backgroundColor: "#FFFFFF",
    marginTop: -(WAVE_HEIGHT - WAVE_SIDE_Y),
    overflow: "hidden",
  },
});
