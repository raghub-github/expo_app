import { useEffect, useRef, useState } from "react";
import { AppText as Text } from "@/components/AppText";
import { View, StyleSheet, Animated, Easing, type LayoutChangeEvent } from "react-native";

export const STORE_DELISTED_MARQUEE =
  "This store is delisted. You cannot go online until GatiMitra relists it. Please contact support.";

/** Partner Site parity: scrolling one-line notice while the store is delisted. */
export function StoreDelistedMarquee({ message }: { message?: string }) {
  const translateX = useRef(new Animated.Value(0)).current;
  const [segmentWidth, setSegmentWidth] = useState(0);
  const text = (message && message.trim()) || STORE_DELISTED_MARQUEE;

  useEffect(() => {
    if (segmentWidth <= 0) return undefined;
    translateX.setValue(0);
    const loop = Animated.loop(
      Animated.timing(translateX, {
        toValue: -segmentWidth,
        duration: 52_000,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [segmentWidth, translateX, text]);

  const onSegmentLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    if (w > 0) setSegmentWidth(w);
  };

  return (
    <View style={styles.marqueeWrap} accessibilityRole="text" accessibilityLiveRegion="polite">
      <Animated.View style={[styles.marqueeRow, { transform: [{ translateX }] }]}>
        {[0, 1].map((copy) => (
          <Text
            key={copy}
            onLayout={copy === 0 ? onSegmentLayout : undefined}
            style={styles.marqueeText}
            numberOfLines={1}
          >
            {text} · {text} ·{" "}
          </Text>
        ))}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  marqueeWrap: {
    width: "100%",
    alignSelf: "stretch",
    overflow: "hidden",
    borderBottomWidth: 1,
    borderBottomColor: "#FDE68A",
    backgroundColor: "#FFFBEB",
    paddingVertical: 8,
  },
  marqueeRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "nowrap",
  },
  marqueeText: {
    paddingHorizontal: 24,
    fontSize: 13,
    fontWeight: "600",
    color: "#451A03",
  },
});
