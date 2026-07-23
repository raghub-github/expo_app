import { useMemo, useState } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import {
  buildMerchantVisibleTimeline,
  displayLabelForStep,
  findActionForStep,
  formatTimelineClock,
  parseActorDetailFromAction,
  timelineSourceShort,
  type MerchantOrderActionForTimeline,
  type MerchantTimelineOrder,
  type MerchantVisibleTimelineStep,
  type TimelineEntryLike,
} from "@/lib/merchantVisibleTimeline";
import { GatiMitraMerchant } from "@/constants/theme";

const DOT_SIZE = 20;
const RAIL_WIDTH = 2;
const TIME_COL_WIDTH = 72;

/** Zomato-style short labels for the vertical timeline rows. */
const COMPACT_LABELS: Record<string, string> = {
  placed: "Order placed",
  accepted: "Accepted by manager",
  preparing: "Preparing",
  rider_arrived: "Delivery partner arrived",
  ready: "Ready",
  picked_up: "Picked up",
  delivered: "Delivered",
  cancelled: "Cancelled",
  rto: "RTO",
};

function compactLabelForStep(
  step: MerchantVisibleTimelineStep,
  order: MerchantTimelineOrder
): string {
  if (step.key === "cancelled") return displayLabelForStep(step, order);
  return COMPACT_LABELS[step.key] ?? step.label;
}

function stepDotStyle(step: MerchantVisibleTimelineStep) {
  if (step.tone === "cancel") return styles.dotCancel;
  if (step.tone === "rto") return styles.dotRto;
  return styles.dotDone;
}

function actorDetailForStep(
  step: MerchantVisibleTimelineStep,
  order: MerchantTimelineOrder,
  actions: MerchantOrderActionForTimeline[]
) {
  if (!step.actorAction) return null;
  if (step.actorAction === "accepted") {
    const act = findActionForStep(actions, ["ACCEPTED"]);
    return parseActorDetailFromAction(act, order.accepted_by_label);
  }
  if (step.actorAction === "ready") {
    const act = findActionForStep(actions, ["READY_FOR_PICKUP", "READY", "PREPARED"]);
    return parseActorDetailFromAction(act);
  }
  const act = findActionForStep(actions, ["CANCELLED"]);
  return parseActorDetailFromAction(act, order.cancelled_by_label ?? order.rejected_reason);
}

function expandedMeta(detail: ReturnType<typeof parseActorDetailFromAction>): {
  email?: string;
  source?: string;
  extra?: string;
} {
  if (!detail) return {};
  if (detail.variant === "admin") {
    return { source: detail.source, extra: detail.acceptedBy };
  }
  return {
    email: detail.email,
    source: timelineSourceShort(detail.source),
    extra: detail.name || detail.phone || undefined,
  };
}

type Props = {
  order: MerchantTimelineOrder;
  timelineEntries?: TimelineEntryLike[];
  actions?: MerchantOrderActionForTimeline[];
  riderReachedAt?: string | null;
};

export function MerchantOrderVerticalTimeline({
  order,
  timelineEntries = [],
  actions = [],
  riderReachedAt = null,
}: Props) {
  const steps = useMemo(
    () =>
      buildMerchantVisibleTimeline(order, {
        riderReachedAt,
        actions,
        timelineEntries,
      }),
    [order, riderReachedAt, actions, timelineEntries]
  );

  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  if (steps.length === 0) {
    return <Text style={styles.empty}>No timeline events yet.</Text>;
  }

  return (
    <View style={styles.list}>
      {steps.map((step, index) => {
        const isLast = index === steps.length - 1;
        const title = compactLabelForStep(step, order);
        const canExpand = step.showView && !!step.actorAction;
        const expanded = canExpand && expandedKey === step.key;
        const detail = canExpand ? actorDetailForStep(step, order, actions) : null;
        const meta = expanded && detail ? expandedMeta(detail) : null;
        const timeLabel = step.at ? formatTimelineClock(step.at) : "—";

        return (
          <View key={step.key} style={[styles.row, !isLast && styles.rowWithRail]}>
            <Text style={styles.timeText}>{timeLabel}</Text>

            <View style={styles.railCol}>
              {!isLast ? <View style={styles.railLine} /> : null}
              <View style={[styles.dot, stepDotStyle(step)]}>
                {step.tone === "cancel" ? (
                  <Ionicons name="close" size={12} color="#FFFFFF" />
                ) : step.tone === "rto" ? (
                  <Ionicons name="return-down-back" size={11} color="#FFFFFF" />
                ) : (
                  <Ionicons name="checkmark" size={12} color="#FFFFFF" />
                )}
              </View>
            </View>

            <View style={styles.labelCol}>
              <View style={styles.labelRow}>
                <Text style={styles.labelText}>{title}</Text>
                {canExpand ? (
                  <Pressable
                    onPress={() => setExpandedKey((k) => (k === step.key ? null : step.key))}
                    hitSlop={8}
                    style={styles.infoBtn}
                  >
                    <Ionicons
                      name={expanded ? "chevron-up" : "chevron-down"}
                      size={16}
                      color={GatiMitraMerchant.textTertiary}
                    />
                  </Pressable>
                ) : null}
              </View>

              {expanded && meta ? (
                <View style={styles.metaBlock}>
                  {meta.email ? <Text style={styles.metaText}>{meta.email}</Text> : null}
                  {meta.extra && !meta.email ? (
                    <Text style={styles.metaText}>{meta.extra}</Text>
                  ) : null}
                  {meta.source ? (
                    <Text style={styles.metaText}>Source: {meta.source}</Text>
                  ) : null}
                </View>
              ) : null}

              {!expanded && step.detail ? (
                <Text style={styles.detailText} numberOfLines={2}>
                  {step.detail}
                </Text>
              ) : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    paddingTop: 4,
    paddingBottom: 8,
  },
  empty: {
    fontSize: 14,
    color: GatiMitraMerchant.textTertiary,
    textAlign: "center",
    paddingVertical: 24,
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    minHeight: 44,
  },
  rowWithRail: {
    paddingBottom: 20,
  },
  timeText: {
    width: TIME_COL_WIDTH,
    paddingTop: 1,
    fontSize: 13,
    fontWeight: "500",
    color: GatiMitraMerchant.textSecondary,
    fontVariant: ["tabular-nums"],
  },
  railCol: {
    width: DOT_SIZE + 12,
    alignItems: "center",
    position: "relative",
  },
  railLine: {
    position: "absolute",
    top: DOT_SIZE,
    bottom: -20,
    width: RAIL_WIDTH,
    backgroundColor: "#22C55E",
    left: (DOT_SIZE + 12) / 2 - RAIL_WIDTH / 2,
  },
  dot: {
    width: DOT_SIZE,
    height: DOT_SIZE,
    borderRadius: DOT_SIZE / 2,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1,
  },
  dotDone: {
    backgroundColor: "#22C55E",
  },
  dotCancel: {
    backgroundColor: "#EF4444",
  },
  dotRto: {
    backgroundColor: "#F59E0B",
  },
  labelCol: {
    flex: 1,
    paddingTop: 1,
    paddingLeft: 4,
    minWidth: 0,
  },
  labelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  labelText: {
    flexShrink: 1,
    fontSize: 15,
    fontWeight: "600",
    color: GatiMitraMerchant.textPrimary,
    lineHeight: 20,
  },
  infoBtn: {
    padding: 2,
  },
  metaBlock: {
    marginTop: 6,
    gap: 2,
  },
  metaText: {
    fontSize: 13,
    color: GatiMitraMerchant.textSecondary,
    lineHeight: 18,
  },
  detailText: {
    marginTop: 4,
    fontSize: 12,
    color: GatiMitraMerchant.textSecondary,
    lineHeight: 17,
  },
});
