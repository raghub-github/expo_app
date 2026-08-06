/**
 * Customer ETA Timeline — renders server history only (no local ETA math).
 */
import { View, StyleSheet } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { AppText } from "@/components/AppText";
import { etaService, type EtaTimelineEntry } from "@/services/eta.service";
import { colors } from "@/theme/colors";

const TEAL = colors.primary[600];

function formatAt(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";
  return d.toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

function TimelineRow({
  entry,
  isLast,
  isLatest,
}: {
  entry: EtaTimelineEntry;
  isLast: boolean;
  isLatest: boolean;
}) {
  return (
    <View style={styles.row}>
      <View style={styles.rail}>
        <View style={[styles.dot, isLatest && styles.dotLatest]} />
        {!isLast ? <View style={styles.line} /> : null}
      </View>
      <View style={styles.body}>
        <AppText style={[styles.label, isLatest && styles.labelLatest]}>{entry.label}</AppText>
        {entry.detail ? <AppText style={styles.detail}>{entry.detail}</AppText> : null}
        <AppText style={styles.meta}>{formatAt(entry.at)}</AppText>
      </View>
    </View>
  );
}

export function CustomerEtaTimeline({
  orderId,
  enabled = true,
}: {
  orderId: string | null | undefined;
  enabled?: boolean;
}) {
  const id = String(orderId ?? "").trim();
  const { data, isLoading } = useQuery({
    queryKey: ["orderEtaTimeline", id],
    queryFn: () => etaService.getTimeline(id),
    enabled: Boolean(enabled && id),
    staleTime: 20_000,
    refetchInterval: enabled ? 45_000 : false,
  });

  const entries = data?.entries ?? [];
  if (!id || (!isLoading && entries.length === 0)) return null;

  return (
    <View style={styles.card}>
      <AppText style={styles.title}>Delivery estimate timeline</AppText>
      {isLoading && entries.length === 0 ? (
        <AppText style={styles.meta}>Loading updates…</AppText>
      ) : (
        entries.map((entry, i) => (
          <TimelineRow
            key={entry.id}
            entry={entry}
            isLast={i === entries.length - 1}
            isLatest={i === entries.length - 1}
          />
        ))
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    padding: 16,
    marginHorizontal: 16,
    marginBottom: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(0,0,0,0.06)",
  },
  title: {
    fontSize: 15,
    fontWeight: "700",
    color: "#0F172A",
    marginBottom: 12,
  },
  row: {
    flexDirection: "row",
    minHeight: 52,
  },
  rail: {
    width: 18,
    alignItems: "center",
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#A7B5C4",
    marginTop: 4,
  },
  dotLatest: {
    backgroundColor: TEAL,
  },
  line: {
    flex: 1,
    width: 2,
    backgroundColor: "rgba(0,0,0,0.08)",
    marginTop: 2,
    marginBottom: 2,
  },
  body: {
    flex: 1,
    paddingLeft: 10,
    paddingBottom: 12,
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
    color: "#0F172A",
  },
  labelLatest: {
    color: TEAL,
  },
  detail: {
    fontSize: 13,
    color: "#64748B",
    marginTop: 2,
  },
  meta: {
    fontSize: 11,
    color: "#94A3B8",
    marginTop: 2,
  },
});
