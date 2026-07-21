/**
 * Refund history for the merchant's own subscription payments.
 *
 * PRIVACY: this component NEVER shows the agent who processed the refund.
 * The backend endpoint stripped `actor` before we ever saw it. Even if you
 * want to display it, don't — merchants and admins have different data
 * projections by design.
 */

import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import {
  fetchMerchantSubscriptionRefunds,
  type MerchantRefundHistoryEntry,
} from "@/services/subscriptionPaymentApi";

type Props = {
  storeId: number;
  token: string;
};

const TEXT = "#111827";
const MUTED = "#6B7280";
const BORDER = "#E5E7EB";
const GREEN = "#16A34A";
const GREEN_DARK = "#15803D";
const AMBER = "#B45309";
const ROSE = "#DC2626";

function inr(rupees: number): string {
  return `₹${rupees.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

function paise(p: number): string {
  return inr(Math.round(p) / 100);
}

/**
 * `new Date(bad)` does NOT throw — it yields an Invalid Date that renders as the
 * literal "Invalid Date" (what the refund rows showed). Hermes also rejects the
 * Postgres wire form "2026-07-21 08:51:00+00", so normalise then guard NaN.
 */
function parseTimestamp(raw: string | number | Date | null | undefined): Date | null {
  if (raw == null || raw === "") return null;
  if (raw instanceof Date) return Number.isNaN(raw.getTime()) ? null : raw;
  if (typeof raw === "number") {
    const ms = raw < 1e12 ? raw * 1000 : raw;
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  let s = String(raw).trim();
  if (!s) return null;
  s = s.replace(" ", "T");
  if (!/[zZ]$/.test(s)) {
    s = s.replace(/([+-]\d{2})(\d{2})$/, "$1:$2").replace(/([+-]\d{2})$/, "$1:00");
  }
  let d = new Date(s);
  if (Number.isNaN(d.getTime())) d = new Date(String(raw));
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatDate(iso: string | number | Date | null | undefined): string {
  const d = parseTimestamp(iso);
  if (!d) return "—";
  try {
    return d.toLocaleString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

function statusStyle(s: MerchantRefundHistoryEntry["status"]) {
  if (s === "COMPLETED") return { bg: "#DCFCE7", fg: GREEN_DARK, label: "Refunded" };
  if (s === "PENDING") return { bg: "#FEF3C7", fg: AMBER, label: "Processing" };
  return { bg: "#FEE2E2", fg: ROSE, label: "Failed" };
}

export function SubscriptionRefundHistoryList({ storeId, token }: Props) {
  const [items, setItems] = useState<MerchantRefundHistoryEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchMerchantSubscriptionRefunds(storeId, token, { limit: 20 });
      setItems(res.items);
      setTotal(res.total);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load refund history");
      setItems([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [storeId, token]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Ionicons name="refresh-circle-outline" size={18} color={GREEN_DARK} />
          <Text style={styles.title}>Refund history</Text>
          {total > 0 ? <View style={styles.pill}><Text style={styles.pillText}>{total}</Text></View> : null}
        </View>
        <Pressable onPress={load} hitSlop={8} disabled={loading}>
          <Text style={[styles.refreshText, loading && { opacity: 0.5 }]}>
            {loading ? "Loading…" : "Refresh"}
          </Text>
        </Pressable>
      </View>

      {loading && items.length === 0 ? (
        <View style={styles.emptyBox}>
          <ActivityIndicator color={GREEN} />
          <Text style={styles.emptyText}>Loading refunds…</Text>
        </View>
      ) : error ? (
        <View style={styles.errorBox}>
          <Ionicons name="alert-circle-outline" size={16} color={ROSE} />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : items.length === 0 ? (
        <View style={styles.emptyBox}>
          <Ionicons name="checkmark-circle-outline" size={22} color={MUTED} />
          <Text style={styles.emptyText}>No refunds on this store</Text>
          <Text style={styles.emptySub}>When a subscription payment is refunded, it will appear here.</Text>
        </View>
      ) : (
        <View>
          {items.map((r) => {
            const stat = statusStyle(r.status);
            const expanded = expandedId === r.id;
            return (
              <Pressable
                key={r.id}
                onPress={() => setExpandedId(expanded ? null : r.id)}
                style={({ pressed }) => [styles.row, pressed && { backgroundColor: "#F9FAFB" }]}
                hitSlop={4}
              >
                <View style={styles.rowTop}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.planName}>{r.planName || `Plan #${r.planId}`}</Text>
                    <Text style={styles.subline}>
                      {r.gateway === "WALLET" ? "Refunded to wallet" : "Refunded to original payment method"}
                      {" · "}
                      {formatDate(r.initiatedAt)}
                    </Text>
                  </View>
                  <View style={{ alignItems: "flex-end" }}>
                    <Text style={styles.amount}>{paise(r.totalPaise)}</Text>
                    <View style={[styles.statusPill, { backgroundColor: stat.bg }]}>
                      <Text style={[styles.statusText, { color: stat.fg }]}>{stat.label}</Text>
                    </View>
                  </View>
                </View>
                {expanded ? (
                  <View style={styles.detailBox}>
                    <DetailLine label="Reason" value={r.reason} />
                    <DetailLine label="Method" value={r.gateway === "WALLET" ? "Wallet credit" : "Razorpay refund"} />
                    <DetailLine label="Initiated" value={formatDate(r.initiatedAt)} />
                    <DetailLine label="Completed" value={formatDate(r.completedAt)} />
                    {r.gateway === "RAZORPAY" && r.status === "PENDING" ? (
                      <Text style={styles.helper}>
                        Razorpay is processing this refund. It usually reaches your account in 5–7 banking days.
                      </Text>
                    ) : null}
                    {r.status === "FAILED" && r.failureReason ? (
                      <DetailLine label="Failure reason" value={r.failureReason} />
                    ) : null}
                  </View>
                ) : null}
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );
}

function DetailLine({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailLine}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: BORDER,
    marginTop: 16,
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
    backgroundColor: "#F9FAFB",
  },
  headerLeft: { flexDirection: "row", alignItems: "center", gap: 8 },
  title: { fontSize: 14, fontWeight: "700", color: TEXT },
  pill: { backgroundColor: "#E5E7EB", borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  pillText: { fontSize: 11, fontWeight: "600", color: MUTED },
  refreshText: { fontSize: 12, fontWeight: "600", color: GREEN_DARK },
  emptyBox: { paddingVertical: 32, alignItems: "center", gap: 8 },
  emptyText: { fontSize: 13, color: MUTED, fontWeight: "500" },
  emptySub: { fontSize: 11.5, color: MUTED, paddingHorizontal: 32, textAlign: "center" },
  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 14,
    backgroundColor: "#FEF2F2",
    borderRadius: 8,
    margin: 12,
  },
  errorText: { fontSize: 12, color: ROSE, flex: 1 },
  row: { paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: BORDER },
  rowTop: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  planName: { fontSize: 14, fontWeight: "600", color: TEXT },
  subline: { fontSize: 11.5, color: MUTED, marginTop: 2 },
  amount: { fontSize: 15, fontWeight: "700", color: TEXT },
  statusPill: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2, marginTop: 4 },
  statusText: { fontSize: 10.5, fontWeight: "700" },
  detailBox: { marginTop: 12, gap: 6, paddingTop: 10, borderTopWidth: 1, borderTopColor: BORDER },
  detailLine: { flexDirection: "row", justifyContent: "space-between", gap: 12 },
  detailLabel: { fontSize: 11, color: MUTED, fontWeight: "500", flex: 1 },
  detailValue: { fontSize: 12, color: TEXT, flex: 2, textAlign: "right" },
  helper: { fontSize: 11.5, color: AMBER, marginTop: 6, lineHeight: 16 },
});
