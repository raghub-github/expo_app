import { useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet, View } from "react-native";
import { GatiMitraMerchant } from "@/constants/theme";

export function GrowthPanelLoader() {
  const pulse = useRef(new Animated.Value(0.45)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 700,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0.45,
          duration: 700,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  const aStyle = { opacity: pulse };

  return (
    <View style={s.wrap}>
      <Animated.View style={[s.lineLg, aStyle]} />
      <Animated.View style={[s.lineSm, aStyle]} />
      <View style={s.row}>
        <Animated.View style={[s.card, aStyle]} />
        <Animated.View style={[s.card, aStyle]} />
      </View>
      <Animated.View style={[s.lineLg, aStyle]} />
      <Animated.View style={[s.chart, aStyle]} />
    </View>
  );
}

const s = StyleSheet.create({
  wrap: {
    paddingVertical: 16,
    gap: 10,
  },
  lineLg: {
    height: 14,
    width: "72%",
    borderRadius: 8,
    backgroundColor: GatiMitraMerchant.border,
  },
  lineSm: {
    height: 11,
    width: "48%",
    borderRadius: 8,
    backgroundColor: GatiMitraMerchant.border,
  },
  row: {
    flexDirection: "row",
    gap: 10,
  },
  card: {
    flex: 1,
    height: 62,
    borderRadius: 12,
    backgroundColor: GatiMitraMerchant.border,
  },
  chart: {
    height: 118,
    borderRadius: 12,
    backgroundColor: GatiMitraMerchant.border,
  },
});
