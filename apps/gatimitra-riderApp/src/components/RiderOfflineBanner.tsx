import React, { useEffect, useRef, useState } from "react";
import { Text, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRiderNetworkStore } from "@/src/stores/riderNetworkStore";

/**
 * Non-blocking connection chip. Mounted at the root so OTP screens are not
 * remounted when connectivity changes.
 */
export function RiderOfflineBanner() {
  const insets = useSafeAreaInsets();
  const online = useRiderNetworkStore((s) => s.online);
  const [restoredFlash, setRestoredFlash] = useState(false);
  const seenOffline = useRef(false);

  useEffect(() => {
    if (!online) {
      seenOffline.current = true;
      setRestoredFlash(false);
      return;
    }
    if (!seenOffline.current) return;
    setRestoredFlash(true);
    const t = setTimeout(() => setRestoredFlash(false), 1800);
    return () => clearTimeout(t);
  }, [online]);

  if (online && !restoredFlash) return null;

  return (
    <View pointerEvents="none" style={[styles.wrap, { top: Math.max(insets.top, 8) + 4 }]}>
      <View style={[styles.chip, online ? styles.chipOk : styles.chipOff]}>
        <Text style={styles.text}>
          {online ? "Connection restored" : "No internet connection"}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    left: 16,
    right: 16,
    zIndex: 40,
    alignItems: "center",
  },
  chip: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  chipOff: { backgroundColor: "#111827" },
  chipOk: { backgroundColor: "#166534" },
  text: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "600",
  },
});
