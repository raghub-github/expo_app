/**
 * Offline UX — red bottom status bar only.
 * Main content offline empty state lives in OfflineContentOverlay (tabs layout).
 */
import { useEffect, useRef } from "react";
import { AppText as Text } from "@/components/AppText";
import { Animated, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNetworkStatus } from "@/context/NetworkStatusContext";

const LORA = "Lora_400Regular";
const RED_BAR = "#9F1239";

export function OfflineNetworkChrome() {
  const insets = useSafeAreaInsets();
  const { isOnline, ready } = useNetworkStatus();
  const slide = useRef(new Animated.Value(80)).current;

  useEffect(() => {
    if (!ready) return;
    Animated.timing(slide, {
      toValue: isOnline ? 80 : 0,
      duration: isOnline ? 180 : 220,
      useNativeDriver: true,
    }).start();
  }, [isOnline, ready, slide]);

  if (!ready || isOnline) {
    return null;
  }

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <Animated.View
        style={[
          styles.barWrap,
          {
            paddingBottom: Math.max(insets.bottom, 8),
            transform: [{ translateY: slide }],
          },
        ]}
        pointerEvents="none"
      >
        <View style={styles.bar}>
          <Ionicons name="cloud-offline" size={14} color="#FFFFFF" style={{ marginRight: 6 }} />
          <Text style={styles.barText}>No internet available</Text>
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  barWrap: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 9998,
    elevation: 9998,
  },
  bar: {
    backgroundColor: RED_BAR,
    minHeight: 36,
    paddingVertical: 10,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  barText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontFamily: LORA,
    letterSpacing: 0.2,
  },
});
