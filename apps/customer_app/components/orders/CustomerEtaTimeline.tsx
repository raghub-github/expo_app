/**
 * Customer order milestone timeline — placed / accepted / picked up / delivered|cancelled.
 * Shows event timestamps only (no ETA revision copy).
 */
import { View, StyleSheet } from "react-native";
import { AppText } from "@/components/AppText";
import type { OrderDetail } from "@/services/order.service";
import { colors } from "@/theme/colors";

const TEAL = colors.primary[600];

export type MilestoneEntry = {
  status: string;
  at: string;
  label: string;
};

/** Format like: 16 Aug, 8:25 pm */
export function formatMilestoneAt(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";
  const datePart = d.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
  });
  const timePart = d.toLocaleTimeString("en-IN", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
  return `${datePart}, ${timePart}`;
}

function defaultLabelForStatus(status: string): string {
  const s = status.trim().toUpperCase();
  if (s === "PLACED" || s === "ORDER_PLACED") return "Order placed";
  if (s === "ACCEPTED" || s === "PREPARING" || s === "MERCHANT_ACCEPTED") return "Accepted";
  if (s === "PICKED_UP" || s === "ON_THE_WAY" || s === "IN_TRANSIT") return "Picked up";
  if (s === "DELIVERED") return "Delivered";
  if (s === "CANCELLED" || s === "REJECTED" || s === "FAILED") return "Cancelled";
  return status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Build milestones from order detail (prefers API statusHistory). */
export function milestonesFromOrder(order: OrderDetail): MilestoneEntry[] {
  const fromHistory = (order.statusHistory ?? [])
    .map((e) => {
      const at = String(e.at ?? "").trim();
      if (!at || !Number.isFinite(new Date(at).getTime())) return null;
      const label =
        (typeof (e as { label?: string }).label === "string" &&
          (e as { label?: string }).label!.trim()) ||
        defaultLabelForStatus(e.status);
      return {
        status: String(e.status ?? "").toUpperCase() || "STATUS",
        at,
        label,
      };
    })
    .filter((e): e is MilestoneEntry => e != null);

  if (fromHistory.length > 0) {
    return [...fromHistory].sort(
      (a, b) => new Date(a.at).getTime() - new Date(b.at).getTime()
    );
  }

  // Fallback when history is missing — use known order timestamps.
  const fallback: MilestoneEntry[] = [];
  if (order.createdAt) {
    fallback.push({ status: "PLACED", at: order.createdAt, label: "Order placed" });
  }
  if (order.riderPickedUpAt) {
    fallback.push({
      status: "PICKED_UP",
      at: order.riderPickedUpAt,
      label: "Picked up",
    });
  }
  const st = (order.status ?? "").toUpperCase();
  if (st === "DELIVERED" || st === "CANCELLED" || st === "REJECTED") {
    const terminalAt =
      order.statusHistory?.find((h) =>
        ["DELIVERED", "CANCELLED", "REJECTED"].includes((h.status ?? "").toUpperCase())
      )?.at ?? order.createdAt;
    if (terminalAt) {
      fallback.push({
        status: st === "DELIVERED" ? "DELIVERED" : "CANCELLED",
        at: terminalAt,
        label: st === "DELIVERED" ? "Delivered" : "Cancelled",
      });
    }
  }
  return fallback;
}

function TimelineRow({
  entry,
  isLast,
}: {
  entry: MilestoneEntry;
  isLast: boolean;
}) {
  return (
    <View style={styles.row}>
      <View style={styles.rail}>
        <View style={styles.dotOuter}>
          <View style={styles.dotInner} />
        </View>
        {!isLast ? <View style={styles.line} /> : null}
      </View>
      <View style={styles.body}>
        <AppText style={styles.label}>{entry.label}</AppText>
        <AppText style={styles.time}>{formatMilestoneAt(entry.at)}</AppText>
      </View>
    </View>
  );
}

export function CustomerEtaTimeline({
  order,
  enabled = true,
}: {
  order: OrderDetail | null | undefined;
  enabled?: boolean;
}) {
  if (!enabled || !order) return null;
  const entries = milestonesFromOrder(order);
  if (entries.length === 0) return null;

  return (
    <View style={styles.card}>
      <AppText style={styles.title}>Order timeline</AppText>
      {entries.map((entry, i) => (
        <TimelineRow
          key={`${entry.status}-${entry.at}-${i}`}
          entry={entry}
          isLast={i === entries.length - 1}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(0,0,0,0.06)",
    alignSelf: "stretch",
  },
  title: {
    fontSize: 15,
    fontWeight: "700",
    color: "#0F172A",
    marginBottom: 12,
  },
  row: {
    flexDirection: "row",
    minHeight: 48,
  },
  rail: {
    width: 22,
    alignItems: "center",
  },
  /** Outer ring + inner filled dot for every completed milestone. */
  dotOuter: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: TEAL,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  dotInner: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: TEAL,
  },
  line: {
    flex: 1,
    width: 2,
    backgroundColor: "rgba(45,149,71,0.28)",
    marginTop: 2,
    marginBottom: 2,
  },
  body: {
    flex: 1,
    paddingLeft: 10,
    paddingBottom: 14,
  },
  label: {
    fontSize: 14,
    fontWeight: "700",
    color: TEAL,
  },
  time: {
    fontSize: 13,
    color: "#64748B",
    marginTop: 3,
  },
});
