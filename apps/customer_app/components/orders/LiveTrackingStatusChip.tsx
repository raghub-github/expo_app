import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { AppText } from "@/components/AppText";
import {
  resolveLiveTrackingStatus,
  useLiveLocationHealth,
  type LiveTrackingStatusView,
} from "@/lib/liveLocationTransport";

type Props = {
  /** Hide when there is no rider fix yet. */
  hasRiderFix?: boolean;
  style?: object;
};

/**
 * User-facing outage chip only (long silence / offline).
 * Reconnecting / "last updated" debug labels never appear in production.
 */
export function LiveTrackingStatusChip({ hasRiderFix = true, style }: Props) {
  const health = useLiveLocationHealth();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 2500);
    return () => clearInterval(id);
  }, []);

  if (!hasRiderFix) return null;

  const status: LiveTrackingStatusView | null = resolveLiveTrackingStatus(health, now);
  if (!status) return null;

  const isDebug = status.kind === "debug_reconnecting" || status.kind === "debug_paused";

  return (
    <View
      style={[styles.wrap, isDebug ? styles.toneDebug : styles.toneOutage, style]}
      pointerEvents="none"
    >
      <View style={[styles.dot, isDebug ? styles.dotDebug : styles.dotOutage]} />
      <AppText style={styles.label} numberOfLines={2}>
        {status.label}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    maxWidth: "92%",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
  },
  toneOutage: {
    backgroundColor: "rgba(15, 23, 42, 0.88)",
    borderColor: "rgba(255,255,255,0.12)",
  },
  toneDebug: {
    backgroundColor: "rgba(30, 41, 59, 0.78)",
    borderColor: "rgba(255,255,255,0.14)",
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  dotOutage: {
    backgroundColor: "#F87171",
  },
  dotDebug: {
    backgroundColor: "#FBBF24",
  },
  label: {
    flexShrink: 1,
    fontSize: 12,
    fontWeight: "600",
    color: "#F8FAFC",
    letterSpacing: 0.1,
    lineHeight: 16,
  },
});
