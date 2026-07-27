import { useMemo } from "react";
import { AppText as Text } from "@/components/AppText";
import { View, StyleSheet } from "react-native";
import {
  elapsedMs,
  formatHandoverDuration,
  resolveHandoverTimelinePhase,
} from "@/lib/orderHandoverTimeline";

type Props = {
  preparedAt: string | null | undefined;
  handedOverAt?: string | null;
  pickedUpAt?: string | null;
  pickupOtp?: string | null;
  nowMs: number;
};

export function ReadyHandoverTimeline({
  preparedAt,
  handedOverAt,
  pickedUpAt,
  pickupOtp,
  nowMs,
}: Props) {
  const phase = resolveHandoverTimelinePhase(preparedAt, handedOverAt, pickedUpAt);

  const { waitingMs, progressPct } = useMemo(() => {
    if (!preparedAt) {
      return { waitingMs: 0, progressPct: 0 };
    }
    if (phase === "waiting_handover") {
      const waiting = elapsedMs(preparedAt, nowMs);
      return {
        waitingMs: waiting,
        progressPct: Math.min(95, 12 + (waiting / 600_000) * 80),
      };
    }
    if (phase === "waiting_pickup" && handedOverAt) {
      const waiting = elapsedMs(handedOverAt, nowMs);
      return {
        waitingMs: waiting,
        progressPct: Math.min(95, 50 + (waiting / 600_000) * 45),
      };
    }
    if (phase === "complete") {
      return { waitingMs: 0, progressPct: 100 };
    }
    return { waitingMs: 0, progressPct: 0 };
  }, [preparedAt, handedOverAt, phase, nowMs]);

  const title =
    phase === "waiting_handover"
      ? "Handover food in"
      : phase === "waiting_pickup"
        ? "Waiting for pickup"
        : "Handover complete";

  const showOtp = phase === "waiting_handover" && !!pickupOtp;

  return (
    <View style={styles.wrap}>
      <View style={styles.topRow}>
        <View style={styles.timerBlock}>
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>
          {phase !== "complete" ? (
            <Text style={styles.timer}>{formatHandoverDuration(waitingMs)}</Text>
          ) : (
            <Text style={styles.done}>Done</Text>
          )}
        </View>
        {showOtp ? (
          <View style={styles.otpChip}>
            <Text style={styles.otpLabel}>OTP</Text>
            <Text style={styles.otpCode}>{pickupOtp}</Text>
          </View>
        ) : null}
      </View>
      <View style={styles.track}>
        <View style={[styles.bar, { width: `${progressPct}%` }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#99F6E4",
    backgroundColor: "#F0FDFA",
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  timerBlock: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 6,
    minWidth: 0,
  },
  title: {
    flexShrink: 1,
    fontSize: 12,
    fontWeight: "700",
    color: "#134E4A",
  },
  timer: {
    fontSize: 11,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
    color: "#115E59",
    backgroundColor: "rgba(255,255,255,0.9)",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  done: {
    fontSize: 10,
    fontWeight: "700",
    color: "#047857",
    backgroundColor: "#D1FAE5",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  otpChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#FFFFFF",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  otpLabel: {
    fontSize: 9,
    fontWeight: "700",
    color: "#64748B",
    letterSpacing: 0.3,
  },
  otpCode: {
    fontSize: 13,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
    letterSpacing: 1.5,
    color: "#0F172A",
  },
  track: {
    marginTop: 6,
    height: 4,
    borderRadius: 999,
    backgroundColor: "#CCFBF1",
    overflow: "hidden",
  },
  bar: {
    height: "100%",
    borderRadius: 999,
    backgroundColor: "#14B8A6",
  },
});
