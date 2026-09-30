/**
 * Bottom sheet for a store-ledger row that cleared outstanding dues.
 */
import { AppText as Text } from "@/components/AppText";
import { StyleSheet, View } from "react-native";
import { MerchantBottomSheetShell } from "@/components/order/MerchantBottomSheetShell";
import { GatiMitraMerchant } from "@/constants/theme";
import { formatCurrency } from "@/lib/merchantPayoutUtils";
import { parsePgTimestamp } from "@/lib/parsePgTimestamp";
import type { LedgerEntry } from "@/services/walletApi";

function metaNumber(meta: Record<string, unknown> | null | undefined, key: string): number | null {
  const raw = meta?.[key];
  const n = typeof raw === "number" ? raw : Number(raw);
  return Number.isFinite(n) ? n : null;
}

function metaText(meta: Record<string, unknown> | null | undefined, key: string): string {
  const raw = meta?.[key];
  return raw == null ? "" : String(raw).trim();
}

export function isDuesClearedLedgerEntry(entry: LedgerEntry): boolean {
  const meta = entry.metadata ?? null;
  return (
    String(meta?.purpose ?? "").trim() === "outstanding_dues_clear" ||
    String(meta?.entry_type ?? "").trim() === "outstanding_dues_cleared" ||
    /^Outstanding dues Cleared$/i.test(String(entry.description ?? "").trim())
  );
}

function formatWhen(iso: string): string {
  const d = parsePgTimestamp(iso) ?? new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Asia/Kolkata",
  });
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value || "—"}</Text>
    </View>
  );
}

export function DuesClearedDetailSheet({
  entry,
  onClose,
}: {
  entry: LedgerEntry | null;
  onClose: () => void;
}) {
  const meta = entry?.metadata ?? null;
  const paid = entry ? metaNumber(meta, "paid_amount") ?? entry.amount : 0;
  const duesBeforeBalance = entry ? metaNumber(meta, "dues_before") ?? entry.balance_before : null;
  const duesAmount = entry ? metaNumber(meta, "dues_amount") : null;
  const walletAfter = entry?.balance_after ?? null;
  const remaining =
    walletAfter != null && walletAfter < -0.005 ? Math.abs(walletAfter) : 0;

  return (
    <MerchantBottomSheetShell visible={entry != null} onClose={onClose} maxHeightPercent="78%">
      <View style={styles.body}>
        <Text style={styles.title}>Dues cleared</Text>
        <Text style={styles.amount}>{formatCurrency(paid)}</Text>
        <Text style={styles.sub}>Outstanding dues payment</Text>
        <View style={styles.card}>
          <Row label="Status" value="Cleared" />
          <Row label="Amount paid" value={formatCurrency(paid)} />
          <Row
            label="Dues before"
            value={
              duesAmount != null
                ? formatCurrency(duesAmount)
                : duesBeforeBalance != null && duesBeforeBalance < 0
                  ? formatCurrency(Math.abs(duesBeforeBalance))
                  : "—"
            }
          />
          <Row label="Dues remaining" value={formatCurrency(remaining)} />
          <Row
            label="Wallet before"
            value={duesBeforeBalance != null ? formatCurrency(duesBeforeBalance) : "—"}
          />
          <Row label="Wallet after" value={walletAfter != null ? formatCurrency(walletAfter) : "—"} />
          <Row label="Payment ID" value={metaText(meta, "razorpay_payment_id")} />
          <Row label="Order ID" value={metaText(meta, "razorpay_order_id")} />
          <Row label="When" value={entry ? formatWhen(entry.created_at) : "—"} />
        </View>
      </View>
    </MerchantBottomSheetShell>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12 },
  title: {
    fontSize: 20,
    fontWeight: "700",
    color: GatiMitraMerchant.textPrimary,
    textAlign: "center",
  },
  amount: {
    marginTop: 6,
    fontSize: 28,
    fontWeight: "700",
    color: "#059669",
    textAlign: "center",
  },
  sub: {
    marginTop: 4,
    marginBottom: 16,
    fontSize: 13,
    color: GatiMitraMerchant.textSecondary,
    textAlign: "center",
  },
  card: {
    borderRadius: 14,
    backgroundColor: "#F8FAFC",
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E5E7EB",
  },
  label: { flex: 1, fontSize: 13, color: GatiMitraMerchant.textSecondary },
  value: {
    flex: 1.2,
    fontSize: 13,
    fontWeight: "600",
    color: GatiMitraMerchant.textPrimary,
    textAlign: "right",
  },
});
