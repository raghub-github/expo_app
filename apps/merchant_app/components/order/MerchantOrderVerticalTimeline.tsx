import { useMemo, useState } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import {
  buildMerchantVisibleTimeline,
  displayLabelForStep,
  findActionForStep,
  parseActorDetailFromAction,
  timelineSourceShort,
  type MerchantOrderActionForTimeline,
  type MerchantTimelineOrder,
  type MerchantVisibleTimelineStep,
  type TimelineEntryLike,
} from "@/lib/merchantVisibleTimeline";
import { formatOrderDateTime } from "@/components/order/orderFormatters";
import { GatiMitraMerchant } from "@/constants/theme";

const ICON_SIZE = 26;
const RAIL_WIDTH = 2;

function stepIcon(step: MerchantVisibleTimelineStep) {
  const isCancel = step.tone === "cancel";
  const isRto = step.tone === "rto";
  if (isCancel) {
    return (
      <View style={[styles.iconCircle, styles.iconCancel]}>
        <Ionicons name="close" size={16} color="#FFFFFF" />
      </View>
    );
  }
  if (isRto) {
    return (
      <View style={[styles.iconCircle, styles.iconRto]}>
        <Ionicons name="return-down-back" size={14} color="#FFFFFF" />
      </View>
    );
  }
  return (
    <View style={[styles.iconCircle, styles.iconDone]}>
      <Ionicons name="checkmark" size={16} color="#FFFFFF" />
    </View>
  );
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

  const firstExpandable = steps.find((s) => s.showView && s.actorAction)?.key ?? null;
  const [expandedKey, setExpandedKey] = useState<string | null>(firstExpandable);

  if (steps.length === 0) {
    return <Text style={styles.empty}>No timeline events yet.</Text>;
  }

  return (
    <View style={styles.card}>
      {steps.map((step, index) => {
        const isLast = index === steps.length - 1;
        const title = displayLabelForStep(step, order);
        const canExpand = step.showView && !!step.actorAction;
        const expanded = canExpand && expandedKey === step.key;
        const detail = canExpand ? actorDetailForStep(step, order, actions) : null;
        const meta = expanded ? expandedMeta(detail) : null;

        return (
          <View key={step.key} style={styles.stepWrap}>
            <View style={styles.railCol}>
              {index > 0 ? <View style={styles.lineTop} /> : null}
              {stepIcon(step)}
              {!isLast ? <View style={styles.lineBottom} /> : null}
            </View>

            <View style={styles.contentCol}>
              <Pressable
                onPress={() => {
                  if (!canExpand) return;
                  setExpandedKey((k) => (k === step.key ? null : step.key));
                }}
                style={styles.titleRow}
                disabled={!canExpand}
              >
                <View style={styles.titleBlock}>
                  <Text style={styles.stepTitle}>{title}</Text>
                  {step.at ? (
                    <Text style={styles.stepTime}>{formatOrderDateTime(step.at)}</Text>
                  ) : null}
                </View>
                {canExpand ? (
                  <Ionicons
                    name={expanded ? "chevron-up" : "chevron-down"}
                    size={18}
                    color={GatiMitraMerchant.textTertiary}
                  />
                ) : null}
              </Pressable>

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
                <Text style={styles.detailText} numberOfLines={3}>
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
  card: {
    backgroundColor: GatiMitraMerchant.surfaceSubtle,
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 14,
  },
  empty: {
    fontSize: 13,
    color: GatiMitraMerchant.textTertiary,
    paddingVertical: 8,
  },
  stepWrap: {
    flexDirection: "row",
    minHeight: 56,
  },
  railCol: {
    width: ICON_SIZE + 8,
    alignItems: "center",
  },
  lineTop: {
    width: RAIL_WIDTH,
    flex: 1,
    minHeight: 8,
    backgroundColor: "#CBD5E1",
    marginBottom: 2,
  },
  lineBottom: {
    width: RAIL_WIDTH,
    flex: 1,
    minHeight: 12,
    backgroundColor: "#CBD5E1",
    marginTop: 2,
  },
  iconCircle: {
    width: ICON_SIZE,
    height: ICON_SIZE,
    borderRadius: ICON_SIZE / 2,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1,
  },
  iconDone: {
    backgroundColor: "#111827",
  },
  iconCancel: {
    backgroundColor: "#DC2626",
  },
  iconRto: {
    backgroundColor: "#EA580C",
  },
  contentCol: {
    flex: 1,
    paddingLeft: 10,
    paddingBottom: 20,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 8,
  },
  titleBlock: {
    flex: 1,
    minWidth: 0,
  },
  stepTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: GatiMitraMerchant.textPrimary,
    letterSpacing: -0.2,
  },
  stepTime: {
    marginTop: 4,
    fontSize: 13,
    fontWeight: "400",
    color: GatiMitraMerchant.textSecondary,
  },
  metaBlock: {
    marginTop: 8,
    gap: 4,
  },
  metaText: {
    fontSize: 13,
    color: GatiMitraMerchant.textSecondary,
    lineHeight: 18,
  },
  detailText: {
    marginTop: 6,
    fontSize: 12,
    color: GatiMitraMerchant.textSecondary,
    lineHeight: 17,
  },
});
