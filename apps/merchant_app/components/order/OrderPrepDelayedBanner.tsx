import { AppText as Text } from "@/components/AppText";
import { View, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import {
  formatPrepDelayedBannerLabel,
  formatPrepDelayedBannerLabelFromMinutes,
  prepOverdueSeconds,
  type PrepCountdownOrder,
} from "@/lib/order-prep-time";

const BLOOD_RED = "#8B0000";

type Props = {
  order: PrepCountdownOrder;
  nowMs: number;
};

/** Top-of-card banner — live overdue minutes vs prep_ready_by_at (KPT + need-more-time). */
export function OrderPrepDelayedBanner({ order, nowMs }: Props) {
  const overdueSec = prepOverdueSeconds(order, nowMs);
  const label = formatPrepDelayedBannerLabel(overdueSec);

  return <OrderDelayTopBanner label={label} />;
}

/** Top banner on ready / picked-up cards — frozen delay from when order was marked ready. */
export function OrderPreparedLateTopBanner({ lateMinutes }: { lateMinutes: number }) {
  return <OrderDelayTopBanner label={formatPrepDelayedBannerLabelFromMinutes(lateMinutes)} />;
}

function OrderDelayTopBanner({ label }: { label: string }) {
  return (
    <View style={styles.wrap}>
      <Ionicons name="hourglass-outline" size={14} color="#FFFFFF" />
      <Text style={styles.text}>{label}</Text>
    </View>
  );
}

export function ExtraPrepTimeAddedBanner({ label }: { label: string }) {
  return (
    <View style={styles.extraWrap}>
      <Text style={styles.extraText}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: BLOOD_RED,
    paddingVertical: 8,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  text: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.3,
  },
  extraWrap: {
    backgroundColor: "#FFF7ED",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#FDBA74",
    paddingVertical: 7,
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  extraText: {
    color: "#9A3412",
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.2,
  },
});
