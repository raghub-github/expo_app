/**
 * Combined subscription history — purchases + refunds in one timeline.
 *
 * PRIVACY: this list NEVER shows the agent who processed a refund. The
 * backend endpoint strips `actor` before we ever see it and our types
 * mirror the guarantee.
 */

import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  View,
} from "react-native";
import { AppText as Text } from "@/components/AppText";
import { Ionicons } from "@expo/vector-icons";
import {
  fetchMerchantSubscriptionHistory,
  type MerchantSubscriptionHistoryEvent,
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
const BLUE = "#2563EB";
const INDIGO = "#6366F1";

function inr(rupees: number): string {
  return `₹${rupees.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}
function paise(p: number): string {
  return inr(Math.round(p) / 100);
}
/**
 * Parse a timestamp the way the API may actually send it.
 *
 * `new Date(bad)` does NOT throw — it yields an Invalid Date whose
 * toLocaleString() renders the literal string "Invalid Date", which is what the
 * refund rows were showing. Hermes is also stricter than browsers: it rejects
 * the Postgres wire form "2026-07-21 08:51:00+00" (space separator, 2-digit
 * offset), so normalise before parsing and always guard the NaN case.
 */
function parseTimestamp(raw: string | number | Date | null | undefined): Date | null {
  if (raw == null || raw === "") return null;
  if (raw instanceof Date) return Number.isNaN(raw.getTime()) ? null : raw;
  if (typeof raw === "number") {
    // Accept both seconds and milliseconds epochs.
    const ms = raw < 1e12 ? raw * 1000 : raw;
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  let s = String(raw).trim();
  if (!s) return null;
  s = s.replace(" ", "T");
  // "+00" / "+0530" -> "+00:00" / "+05:30"
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

function purchaseStatusStyle(s: string) {
  const map: Record<string, { bg: string; fg: string; label: string }> = {
    PAID: { bg: "#DCFCE7", fg: GREEN_DARK, label: "Paid" },
    REFUNDED: { bg: "#F1F5F9", fg: MUTED, label: "Refunded" },
    REFUND_PENDING: { bg: "#FEF3C7", fg: AMBER, label: "Refund pending" },
    FAILED: { bg: "#FEE2E2", fg: ROSE, label: "Failed" },
    PENDING: { bg: "#DBEAFE", fg: BLUE, label: "Pending" },
  };
  return map[s] ?? { bg: "#F1F5F9", fg: MUTED, label: s };
}
function refundStatusStyle(s: "COMPLETED" | "PENDING" | "FAILED") {
  if (s === "COMPLETED") return { bg: "#DCFCE7", fg: GREEN_DARK, label: "Refunded" };
  if (s === "PENDING") return { bg: "#FEF3C7", fg: AMBER, label: "Processing" };
  return { bg: "#FEE2E2", fg: ROSE, label: "Failed" };
}

export function SubscriptionHistoryList({ storeId, token }: Props) {
  const [items, setItems] = useState<MerchantSubscriptionHistoryEvent[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchMerchantSubscriptionHistory(storeId, token, { limit: 25 });
      setItems(res.items);
      setTotal(res.total);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load subscription history");
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
          <Ionicons name="time-outline" size={18} color={INDIGO} />
          <Text style={styles.title}>Subscription history</Text>
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
          <Text style={styles.emptyText}>Loading…</Text>
        </View>
      ) : error ? (
        <View style={styles.errorBox}>
          <Ionicons name="alert-circle-outline" size={16} color={ROSE} />
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : items.length === 0 ? (
        <View style={styles.emptyBox}>
          <Ionicons name="checkmark-circle-outline" size={22} color={MUTED} />
          <Text style={styles.emptyText}>No subscription activity yet</Text>
          <Text style={styles.emptySub}>
            When you purchase a plan or get a refund, it will appear here.
          </Text>
        </View>
      ) : (
        <View>
          {items.map((r) => {
            const key = `${r.eventType}-${r.id}`;
            const expanded = expandedKey === key;
            const isPurchase = r.eventType === "PURCHASE";
            const stat = isPurchase ? purchaseStatusStyle(r.status) : refundStatusStyle(r.status);
            return (
              <Pressable
                key={key}
                onPress={() => setExpandedKey(expanded ? null : key)}
                style={({ pressed }) => [styles.row, pressed && { backgroundColor: "#F9FAFB" }]}
              >
                <View style={styles.rowTop}>
                  <View style={[styles.iconBox, isPurchase ? styles.iconPurchase : styles.iconRefund]}>
                    <Ionicons
                      name={isPurchase ? "cart-outline" : "refresh-outline"}
                      size={16}
                      color={isPurchase ? GREEN_DARK : ROSE}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={styles.titleRow}>
                      <Text style={styles.eventTitle}>
                        {isPurchase ? "Purchase" : "Refund"} · {r.planName || `Plan #${r.planId}`}
                      </Text>
                      <View style={[styles.statusPill, { backgroundColor: stat.bg }]}>
                        <Text style={[styles.statusText, { color: stat.fg }]}>{stat.label}</Text>
                      </View>
                    </View>
                    <Text style={styles.subline}>
                      {r.gateway === "WALLET" ? "Wallet" : r.gateway === "RAZORPAY" ? "Razorpay" : r.gateway}
                      {"  ·  "}
                      {formatDate(r.eventAt)}
                    </Text>
                  </View>
                  <View style={{ alignItems: "flex-end" }}>
                    <Text style={[styles.amount, !isPurchase && { color: ROSE }]}>
                      {isPurchase ? "" : "−"}
                      {paise(r.totalPaise)}
                    </Text>
                  </View>
                </View>
                {expanded ? (
                  <View style={styles.detailBox}>
                    {isPurchase ? (
                      <>
                        <DetailLine label="Payment ID" value={`#${r.id}`} />
                        <DetailLine label="Subscription ID" value={`#${r.subscriptionId}`} />
                        <DetailLine
                          label="Base amount"
                          value={paise(r.totalPaise - r.gstAmountPaise)}
                        />
                        {r.gstPercent > 0 ? (
                          <DetailLine
                            label={`GST (${r.gstPercent}%)`}
                            value={paise(r.gstAmountPaise)}
                          />
                        ) : null}
                        <DetailLine label="Total" value={paise(r.totalPaise)} />
                        <DetailLine label="Method" value={r.gateway} />
                        {r.billingPeriodStart && r.billingPeriodEnd ? (
                          <DetailLine
                            label="Billing period"
                            value={`${formatDate(r.billingPeriodStart)}  →  ${formatDate(r.billingPeriodEnd)}`}
                          />
                        ) : null}
                        {r.notes ? <DetailLine label="Notes" value={r.notes} /> : null}
                      </>
                    ) : (
                      <>
                        <DetailLine label="Reason" value={r.reason} />
                        <DetailLine
                          label="Method"
                          value={r.gateway === "WALLET" ? "Wallet credit" : "Razorpay refund"}
                        />
                        <DetailLine label="Initiated" value={formatDate(r.initiatedAt)} />
                        <DetailLine label="Completed" value={formatDate(r.completedAt)} />
                        {r.gateway === "RAZORPAY" && r.status === "PENDING" ? (
                          <Text style={styles.helper}>
                            Razorpay is processing this refund. Reaches your account in ~5–7 banking days.
                          </Text>
                        ) : null}
                        {r.status === "FAILED" && r.failureReason ? (
                          <DetailLine label="Failure reason" value={r.failureReason} />
                        ) : null}
                      </>
                    )}
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
  iconBox: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  iconPurchase: { backgroundColor: "#DCFCE7" },
  iconRefund: { backgroundColor: "#FEE2E2" },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  eventTitle: { fontSize: 14, fontWeight: "600", color: TEXT, flexShrink: 1 },
  subline: { fontSize: 11.5, color: MUTED, marginTop: 2 },
  amount: { fontSize: 15, fontWeight: "700", color: TEXT },
  statusPill: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 },
  statusText: { fontSize: 10.5, fontWeight: "700" },
  detailBox: {
    marginTop: 12,
    gap: 6,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: BORDER,
  },
  detailLine: { flexDirection: "row", justifyContent: "space-between", gap: 12 },
  detailLabel: { fontSize: 11, color: MUTED, fontWeight: "500", flex: 1 },
  detailValue: { fontSize: 12, color: TEXT, flex: 2, textAlign: "right" },
  helper: { fontSize: 11.5, color: AMBER, marginTop: 6, lineHeight: 16 },
});
