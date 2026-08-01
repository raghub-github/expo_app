import { AppText as Text } from "@/components/AppText";
import { View, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { FoodOrderRiderLogEntry } from "@/services/ordersApi";
import { isInactiveRiderAssignment } from "@/lib/orderAssignedRider";
import { formatTimelineClock } from "@/lib/merchantVisibleTimeline";
import { GatiMitraMerchant } from "@/constants/theme";

const DOT = 18;
const RAIL = 2;

type StepTone = "done" | "missed" | "cancel" | "pending";

type RiderTimelineStep = {
  key: string;
  label: string;
  at: string | null;
  tone: StepTone;
};

function buildRiderTimelineSteps(rider: FoodOrderRiderLogEntry): RiderTimelineStep[] {
  const inactive = isInactiveRiderAssignment(
    rider.assignment_status,
    rider.cancelled_at,
    rider.rejected_at
  );
  const endAt = rider.cancelled_at ?? rider.rejected_at ?? null;
  const delivered = !!rider.delivered_at;

  const assignedAt = rider.assigned_at ?? rider.accepted_at;
  const reachedAt = rider.reached_merchant_at;
  const pickedAt = rider.picked_up_at;

  const reachedDone = !!reachedAt;
  const pickedDone = !!pickedAt;
  const settled = inactive || delivered;

  let final: RiderTimelineStep;
  if (delivered) {
    final = {
      key: "delivered",
      label: "Delivered",
      at: rider.delivered_at,
      tone: "done",
    };
  } else if (inactive || endAt) {
    final = {
      key: "cancelled",
      label: "Cancelled",
      at: endAt,
      tone: "cancel",
    };
  } else {
    final = {
      key: "outcome",
      label: "Outcome",
      at: null,
      tone: "pending",
    };
  }

  return [
    {
      key: "assigned",
      label: "Assigned",
      at: assignedAt,
      tone: assignedAt ? "done" : "pending",
    },
    {
      key: "reached",
      label: reachedDone ? "Reached" : "Not reached",
      at: reachedAt,
      tone: reachedDone ? "done" : settled ? "missed" : "pending",
    },
    {
      key: "picked",
      label: pickedDone ? "Picked" : "Not picked",
      at: pickedAt,
      tone: pickedDone ? "done" : settled ? "missed" : "pending",
    },
    final,
  ];
}

function stepColors(tone: StepTone): { dot: string; icon: string; label: string } {
  switch (tone) {
    case "done":
      return {
        dot: "#22C55E",
        icon: "#FFFFFF",
        label: GatiMitraMerchant.textPrimary,
      };
    case "cancel":
      return {
        dot: "#EF4444",
        icon: "#FFFFFF",
        label: "#B91C1C",
      };
    case "missed":
      return {
        dot: "#E5E7EB",
        icon: "#9CA3AF",
        label: GatiMitraMerchant.textTertiary,
      };
    default:
      return {
        dot: "#F3F4F6",
        icon: "#D1D5DB",
        label: GatiMitraMerchant.textTertiary,
      };
  }
}

function railColor(from: StepTone, to: StepTone): string {
  if (from === "done" && (to === "done" || to === "cancel" || to === "missed")) {
    return "#22C55E";
  }
  return "#E5E7EB";
}

function StepIcon({ tone }: { tone: StepTone }) {
  const c = stepColors(tone);
  if (tone === "cancel") {
    return <Ionicons name="close" size={11} color={c.icon} />;
  }
  if (tone === "done") {
    return <Ionicons name="checkmark" size={11} color={c.icon} />;
  }
  if (tone === "missed") {
    return <Ionicons name="remove" size={11} color={c.icon} />;
  }
  return <View style={[styles.pendingInner, { borderColor: c.icon }]} />;
}

type Props = {
  rider: FoodOrderRiderLogEntry;
};

export function RiderAssignmentHorizontalTimeline({ rider }: Props) {
  const steps = buildRiderTimelineSteps(rider);

  return (
    <View style={styles.wrap}>
      <View style={styles.railRow}>
        {steps.map((step, index) => {
          const colors = stepColors(step.tone);
          const prev = index > 0 ? steps[index - 1] : null;
          const next = index < steps.length - 1 ? steps[index + 1] : null;
          const clock = step.at ? formatTimelineClock(step.at) : "";

          return (
            <View key={step.key} style={styles.stepCol}>
              <View style={styles.dotRow}>
                <View
                  style={[
                    styles.halfRail,
                    {
                      backgroundColor: prev
                        ? railColor(prev.tone, step.tone)
                        : "transparent",
                    },
                  ]}
                />
                <View style={[styles.dot, { backgroundColor: colors.dot }]}>
                  <StepIcon tone={step.tone} />
                </View>
                <View
                  style={[
                    styles.halfRail,
                    {
                      backgroundColor: next
                        ? railColor(step.tone, next.tone)
                        : "transparent",
                    },
                  ]}
                />
              </View>
              <Text style={[styles.label, { color: colors.label }]} numberOfLines={2}>
                {step.label}
              </Text>
              <Text
                style={[styles.time, clock ? styles.timeActive : null]}
                numberOfLines={1}
              >
                {clock || "—"}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#E5E7EB",
  },
  railRow: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  stepCol: {
    flex: 1,
    minWidth: 0,
    alignItems: "center",
  },
  dotRow: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 6,
  },
  halfRail: {
    flex: 1,
    height: RAIL,
  },
  dot: {
    width: DOT,
    height: DOT,
    borderRadius: DOT / 2,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1,
  },
  pendingInner: {
    width: 6,
    height: 6,
    borderRadius: 3,
    borderWidth: 1.5,
  },
  label: {
    fontSize: 11,
    fontWeight: "700",
    textAlign: "center",
    lineHeight: 14,
    paddingHorizontal: 2,
  },
  time: {
    marginTop: 3,
    fontSize: 11,
    fontWeight: "500",
    color: GatiMitraMerchant.textTertiary,
    textAlign: "center",
    fontVariant: ["tabular-nums"],
  },
  timeActive: {
    fontWeight: "600",
    color: GatiMitraMerchant.textSecondary,
  },
});
