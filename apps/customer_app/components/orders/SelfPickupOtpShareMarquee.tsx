/**
 * Slow continuous marquee under Self-Pick-Up OTP strip.
 */
import { useEffect, useRef, useState } from "react";
import { View, StyleSheet, Animated as RNAnimated, Easing } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { AppText } from "@/components/AppText";
import { GatiMitraColors } from "@/constants/gatimitra";

const MINT = GatiMitraColors.emerald;
export const SELF_PICKUP_OTP_SHARE_MESSAGE =
  "Please share the pickup OTP with the store when collecting the order.";

type Props = {
  message?: string;
};

export function SelfPickupOtpShareMarquee({
  message = SELF_PICKUP_OTP_SHARE_MESSAGE,
}: Props) {
  const translateX = useRef(new RNAnimated.Value(0)).current;
  const loopRef = useRef<RNAnimated.CompositeAnimation | null>(null);
  const [segW, setSegW] = useState(0);
  const unit = `${message}    ·    `;

  useEffect(() => {
    loopRef.current?.stop();
    translateX.setValue(0);
    if (segW <= 0) return;
    // Slow crawl (~22 px/s).
    const duration = Math.max(14_000, Math.round(segW * 45));
    loopRef.current = RNAnimated.loop(
      RNAnimated.timing(translateX, {
        toValue: -segW,
        duration,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    loopRef.current.start();
    return () => loopRef.current?.stop();
  }, [message, segW, translateX]);

  return (
    <View style={styles.wrap} accessibilityRole="text" accessibilityLabel={message}>
      <Ionicons name="information-circle-outline" size={15} color={MINT} style={styles.icon} />
      <View style={styles.marquee}>
        <RNAnimated.View style={[styles.track, { transform: [{ translateX }] }]}>
          <AppText
            style={styles.text}
            numberOfLines={1}
            onLayout={(e) => {
              const w = e.nativeEvent.layout.width;
              if (w > 0 && Math.abs(w - segW) > 1) setSegW(w);
            }}
          >
            {unit}
          </AppText>
          <AppText style={styles.text} numberOfLines={1}>
            {unit}
          </AppText>
        </RNAnimated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#ECFDF5",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(11, 110, 79, 0.18)",
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  icon: { marginRight: 6 },
  marquee: { flex: 1, overflow: "hidden" },
  track: { flexDirection: "row", alignItems: "center" },
  text: {
    fontSize: 12,
    fontWeight: "600",
    color: "#065F46",
    flexShrink: 0,
  },
});
