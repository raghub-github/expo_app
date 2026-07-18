/**
 * Horizontal marquee banner for merchant prep-delay updates (20s).
 */
import { useEffect, useRef } from "react";
import { AppText } from "@/components/AppText";

import { View, StyleSheet, Animated as RNAnimated } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { GatiMitraColors } from "@/constants/gatimitra";

const GREEN = GatiMitraColors.primaryMint;

export function PrepDelayMarqueeBanner({ message }: { message: string }) {
  const translateX = useRef(new RNAnimated.Value(0)).current;
  const textW = useRef(0);
  const viewW = useRef(0);
  const loopRef = useRef<RNAnimated.CompositeAnimation | null>(null);

  useEffect(() => {
    loopRef.current?.stop();
    translateX.setValue(0);
    const overflow = textW.current - viewW.current;
    if (overflow <= 4) return;
    const scrollMs = Math.max(4000, overflow * 20);
    loopRef.current = RNAnimated.loop(
      RNAnimated.sequence([
        RNAnimated.delay(500),
        RNAnimated.timing(translateX, {
          toValue: -overflow,
          duration: scrollMs,
          useNativeDriver: true,
        }),
        RNAnimated.delay(800),
        RNAnimated.timing(translateX, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }),
      ])
    );
    loopRef.current.start();
    return () => loopRef.current?.stop();
  }, [message, translateX]);

  return (
    <View style={styles.wrap}>
      <Ionicons name="time-outline" size={16} color={GREEN} style={styles.icon} />
      <View
        style={styles.marquee}
        onLayout={(e) => {
          viewW.current = e.nativeEvent.layout.width;
        }}
      >
        <RNAnimated.View style={{ flexDirection: "row", transform: [{ translateX }] }}>
          <AppText
            style={styles.text}
            onLayout={(e) => {
              textW.current = e.nativeEvent.layout.width;
            }}
            numberOfLines={1}
          >
            {message}
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
    backgroundColor: "#FFF7ED",
    borderWidth: 1,
    borderColor: "#FDBA74",
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    marginBottom: 8,
  },
  icon: { marginRight: 6 },
  marquee: { flex: 1, overflow: "hidden" },
  text: {
    fontSize: 13,
    fontWeight: "600",
    color: "#9A3412",
    flexShrink: 0,
  },
});
