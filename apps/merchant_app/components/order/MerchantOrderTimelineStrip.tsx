import { useMemo } from "react";
import { AppText as Text } from "@/components/AppText";
import { View, StyleSheet, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import {
  buildMerchantVisibleTimeline,
  displayLabelForStep,
  formatTimelineClock,
  formatTimelineDate,
  type MerchantOrderActionForTimeline,
  type MerchantTimelineOrder,
  type MerchantVisibleTimelineStep,
  type TimelineEntryLike,
} from "@/lib/merchantVisibleTimeline";
import { GatiMitraMerchant } from "@/constants/theme";

type Props = {
  order: MerchantTimelineOrder;
  timelineEntries?: TimelineEntryLike[];
  actions?: MerchantOrderActionForTimeline[];
  riderReachedAt?: string | null;
};

function stepCircleStyle(step: MerchantVisibleTimelineStep) {
  if (step.tone === "cancel") return styles.circleCancel;
  if (step.tone === "rto") return styles.circleRto;
  return styles.circleDone;
}

function connectorStyle(done: boolean, isCancel: boolean) {
  if (isCancel) return styles.connectorMuted;
  return done ? styles.connectorDone : styles.connectorPending;
}

export function MerchantOrderTimelineStrip({
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

  if (steps.length === 0) {
    return <Text style={styles.empty}>No timeline events recorded yet.</Text>;
  }

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
    >
      {steps.map((step, i) => {
        const isCancel = step.tone === "cancel";
        const prevDone = i > 0;
        const lineDone = prevDone && step.completed;
        const minWidth = step.key === "rider_arrived" ? 112 : 88;

        return (
          <View key={step.key} style={[styles.stepCol, { minWidth, maxWidth: 140 }]}>
            <View style={styles.connectorRow}>
              {i > 0 ? (
                <View style={[styles.connector, connectorStyle(lineDone, isCancel)]} />
              ) : (
                <View style={styles.connectorSpacer} />
              )}
              <View style={[styles.circle, stepCircleStyle(step)]}>
                {isCancel ? (
                  <Ionicons name="close" size={16} color="#FFFFFF" />
                ) : (
                  <Ionicons name="checkmark" size={16} color="#FFFFFF" />
                )}
              </View>
              {i < steps.length - 1 ? (
                <View
                  style={[
                    styles.connector,
                    connectorStyle(isCancel ? false : step.completed, isCancel),
                  ]}
                />
              ) : (
                <View style={styles.connectorSpacer} />
              )}
            </View>

            <Text style={styles.stepLabel} numberOfLines={3}>
              {displayLabelForStep(step, order)}
            </Text>

            {step.at ? (
              <View style={styles.timeBlock}>
                <Text style={styles.dateText}>{formatTimelineDate(step.at)}</Text>
                <Text style={styles.clockText}>{formatTimelineClock(step.at)}</Text>
              </View>
            ) : null}

            {step.detail ? (
              <Text style={styles.detailText} numberOfLines={2}>
                {step.detail}
              </Text>
            ) : null}
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  empty: {
    fontSize: 13,
    color: GatiMitraMerchant.textTertiary,
    textAlign: "center",
    paddingVertical: 24,
  },
  row: {
    paddingVertical: 8,
    paddingHorizontal: 4,
    alignItems: "flex-start",
  },
  stepCol: {
    alignItems: "center",
    flexShrink: 0,
  },
  connectorRow: {
    flexDirection: "row",
    alignItems: "center",
    width: "100%",
  },
  connector: {
    flex: 1,
    height: 2,
    minWidth: 8,
  },
  connectorSpacer: {
    flex: 1,
    minWidth: 4,
  },
  connectorDone: {
    backgroundColor: "#22C55E",
  },
  connectorPending: {
    backgroundColor: "#E5E7EB",
  },
  connectorMuted: {
    backgroundColor: "#FCA5A5",
  },
  circle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1,
  },
  circleDone: {
    backgroundColor: "#22C55E",
  },
  circleCancel: {
    backgroundColor: "#EF4444",
  },
  circleRto: {
    backgroundColor: "#F59E0B",
  },
  stepLabel: {
    marginTop: 8,
    width: "100%",
    textAlign: "center",
    fontSize: 11,
    fontWeight: "700",
    color: "#1F2937",
    lineHeight: 15,
  },
  timeBlock: {
    marginTop: 4,
    alignItems: "center",
  },
  dateText: {
    fontSize: 10,
    fontWeight: "500",
    color: "#6B7280",
    fontVariant: ["tabular-nums"],
  },
  clockText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#111827",
    fontVariant: ["tabular-nums"],
  },
  detailText: {
    marginTop: 2,
    fontSize: 10,
    color: "#6B7280",
    textAlign: "center",
    paddingHorizontal: 2,
  },
});
