/**
 * DEV-ONLY location diagnostics (section 27). Renders nothing in production.
 *
 * Shows the live location source / accuracy / age / freshness so we can verify the
 * fast-first → accurate-refine pipeline on real devices. Never shipped to customers.
 */
import { View, Text, StyleSheet } from "react-native";
import { useEffect, useState } from "react";
import { useLocationStore } from "@/store/locationStore";

export function LocationDebugOverlay() {
  const coords = useLocationStore((s) => s.coords);
  const accuracy = useLocationStore((s) => s.coordsAccuracy);
  const updatedAt = useLocationStore((s) => s.coordsUpdatedAt);
  const source = useLocationStore((s) => s.coordsSource);
  const freshness = useLocationStore((s) => s.locationFreshness);
  const locationSource = useLocationStore((s) => s.locationSource);
  const refining = useLocationStore((s) => s.refining);
  const provider = useLocationStore((s) => s.address?.provider);

  // Re-tick every second so "age" stays live.
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  if (!__DEV__) return null;

  const ageSec = updatedAt ? Math.max(0, Math.round((Date.now() - updatedAt) / 1000)) : null;

  return (
    <View style={styles.box} pointerEvents="none">
      <Text style={styles.text}>
        📍 src={source ?? "—"} / {locationSource ?? "—"}
        {refining ? " ⟳" : ""}
      </Text>
      <Text style={styles.text}>
        acc={accuracy != null ? `${Math.round(accuracy)}m` : "—"} · age=
        {ageSec != null ? `${ageSec}s` : "—"} · {freshness}
      </Text>
      <Text style={styles.text}>
        geo={provider ?? "—"}
        {coords ? ` · ${coords.latitude.toFixed(4)},${coords.longitude.toFixed(4)}` : ""}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    position: "absolute",
    left: 6,
    bottom: 90,
    backgroundColor: "rgba(0,0,0,0.66)",
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 6,
    zIndex: 9999,
  },
  text: { color: "#7CFFB2", fontSize: 10, fontFamily: "monospace" },
});
