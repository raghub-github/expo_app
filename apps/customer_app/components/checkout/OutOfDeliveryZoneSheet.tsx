import React from "react";
import {
  Modal,
  Pressable,
  StyleSheet,
  View,
  useWindowDimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import Svg, { Path } from "react-native-svg";
import { useAppSafeAreaInsets } from "@/hooks/useAppSafeAreaInsets";
import { CheckoutText } from "@/components/checkout/CheckoutText";
import { GatiMitraColors } from "@/constants/gatimitra";

const WAVE_HEIGHT = 42;
/** Same vertical gap: title → message and message → button. */
const TEXT_STACK_GAP = 14;

function WaveEdge({ width }: { width: number }) {
  const w = Math.max(320, width);
  const fillPath = [
    `M 0 ${WAVE_HEIGHT}`,
    "L 0 34",
    `L ${w * 0.2} 34`,
    `C ${w * 0.27} 34 ${w * 0.27} 4 ${w * 0.37} 4`,
    `L ${w * 0.63} 4`,
    `C ${w * 0.73} 4 ${w * 0.73} 34 ${w * 0.81} 34`,
    `L ${w} 34`,
    `L ${w} ${WAVE_HEIGHT}`,
    "Z",
  ].join(" ");
  const strokePath = [
    "M 0 34",
    `L ${w * 0.2} 34`,
    `C ${w * 0.27} 34 ${w * 0.27} 4 ${w * 0.37} 4`,
    `L ${w * 0.63} 4`,
    `C ${w * 0.73} 4 ${w * 0.73} 34 ${w * 0.81} 34`,
    `L ${w} 34`,
  ].join(" ");

  return (
    <Svg width={w} height={WAVE_HEIGHT} style={styles.wave}>
      <Path d={fillPath} fill="#FFFFFF" />
      <Path d={strokePath} stroke="#F97316" strokeWidth={1.2} fill="none" />
    </Svg>
  );
}

type Props = {
  visible: boolean;
  onClose: () => void;
};

export function OutOfDeliveryZoneSheet({ visible, onClose }: Props) {
  const { width } = useWindowDimensions();
  const insets = useAppSafeAreaInsets();
  const buttonWidth = Math.min(Math.max(width - 40, 280), 420);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      presentationStyle="overFullScreen"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={styles.root}>
        <Pressable
          style={styles.backdrop}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close message"
        />
        <View style={styles.sheet}>
          <WaveEdge width={width} />
          <View style={[styles.body, { paddingBottom: Math.max(insets.bottom, 16) + 28 }]}>
            <View style={styles.iconWrap}>
              <View style={styles.iconCircle}>
                <Ionicons name="location-outline" size={38} color="#FFFFFF" />
              </View>
              <View style={styles.errorBadge}>
                <Ionicons name="close" size={13} color="#FFFFFF" />
              </View>
            </View>

            <CheckoutText style={styles.title}>Address outside delivery area</CheckoutText>
            <CheckoutText style={styles.message}>
              This address is outside the restaurant&apos;s delivery area. Please select a
              deliverable address or add a new one.
            </CheckoutText>

            <View style={styles.messageButtonGap} />

            <Pressable
              onPress={onClose}
              style={({ pressed }) => [
                styles.buttonPressable,
                { width: buttonWidth },
                pressed && styles.buttonPressed,
              ]}
              accessibilityRole="button"
              accessibilityLabel="Got it"
            >
              <LinearGradient
                colors={GatiMitraColors.checkoutGradient}
                start={{ x: 0, y: 0.5 }}
                end={{ x: 1, y: 0.5 }}
                style={[styles.button, { width: buttonWidth }]}
              >
                <CheckoutText style={styles.buttonText} numberOfLines={1}>
                  Got It !
                </CheckoutText>
              </LinearGradient>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: "flex-end" },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(17, 24, 39, 0.64)",
  },
  sheet: { width: "100%", backgroundColor: "transparent" },
  wave: { width: "100%" },
  body: {
    marginTop: -8,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 20,
    paddingTop: 0,
    alignItems: "center",
  },
  iconWrap: {
    width: 76,
    height: 76,
    marginTop: -14,
    marginBottom: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  iconCircle: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: "#111111",
    alignItems: "center",
    justifyContent: "center",
  },
  errorBadge: {
    position: "absolute",
    right: 0,
    bottom: 2,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "#FB7185",
    borderWidth: 2,
    borderColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    color: "#111827",
    fontSize: 17,
    fontWeight: "700",
    textAlign: "center",
    lineHeight: 23,
  },
  message: {
    color: "#4B5563",
    fontSize: 13,
    fontWeight: "400",
    textAlign: "center",
    lineHeight: 20,
    marginTop: TEXT_STACK_GAP,
    paddingHorizontal: 10,
  },
  /** Explicit spacer avoids custom text/layout styles swallowing button margins. */
  messageButtonGap: {
    width: "100%",
    height: 30,
    flexShrink: 0,
  },
  buttonPressable: {
    marginTop: 0,
    borderRadius: 12,
    overflow: "hidden",
  },
  buttonPressed: { opacity: 0.9, transform: [{ scale: 0.995 }] },
  button: {
    minHeight: 52,
    paddingHorizontal: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
    textAlign: "center",
  },
});
