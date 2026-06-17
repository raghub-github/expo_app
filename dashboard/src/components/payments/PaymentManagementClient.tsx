"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  RefreshCw,
  Check,
  X,
  Store,
  Bike,
  Users,
  ArrowRight,
} from "lucide-react";
import Link from "next/link";
import { readApiJson } from "@/lib/payment/read-api-json";

type PaymentParty = "merchant" | "rider" | "customer";

export function PaymentManagementClient() {
  const [party, setParty] = useState<PaymentParty>("merchant");
  const [migrationRequired, setMigrationRequired] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [payouts, setPayouts] = useState<Record<string, unknown>[]>([]);
  const [savingId, setSavingId] = useState<string | null>(null);

  const loadConfig = useCallback(async () => {
    setMsg(null);
    try {
      const res = await fetch("/api/super-admin/payment-config", { cache: "no-store" });
      const data = await readApiJson(res);
      if (!res.ok || !data.success) {
        setMsg({ type: "err", text: String(data.error ?? "Failed to load config") });
        return;
      }
      setMigrationRequired(Boolean(data.migrationRequired));
      if (data.migrationRequired) {
        setMsg({
          type: "err",
          text: String(data.message ?? "Run payment migrations on Supabase SQL editor, then refresh."),
        });
      }
    } catch (e) {
      setMsg({ type: "err", text: e instanceof Error ? e.message : "Load failed" });
    }
  }, []);

  const loadPayouts = useCallback(async () => {
    try {
      const res = await fetch("/api/super-admin/payment-payouts", { cache: "no-store" });
      const data = await readApiJson(res);
      if (res.ok && data.success) setPayouts((data.payouts as Record<string, unknown>[]) ?? []);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    void loadConfig();
    void loadPayouts();
  }, [loadConfig, loadPayouts]);

  const payoutAction = async (payoutId: number, action: "approve" | "reject", reason?: string) => {
    setSavingId(`payout-${payoutId}`);
    try {
      const res = await fetch("/api/super-admin/payment-payouts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, payoutId, reason }),
      });
      const data = await readApiJson(res);
      if (!res.ok || !data.success) {
        setMsg({ type: "err", text: String(data.error ?? "Action failed") });
        return;
      }
      setMsg({ type: "ok", text: action === "approve" ? "Payout approved" : "Payout rejected" });
      await loadPayouts();
    } catch (e) {
      setMsg({ type: "err", text: e instanceof Error ? e.message : "Action failed" });
    } finally {
      setSavingId(null);
    }
  };

  const refreshAll = () => {
    void loadConfig();
    void loadPayouts();
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <PaymentPartyToggle party={party} onChange={setParty} />
        <button
          type="button"
          onClick={refreshAll}
          className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          <RefreshCw className="h-4 w-4" />
          Refresh
        </button>
      </div>

      <p className="text-xs text-gray-500 max-w-3xl leading-snug">
        Approve merchant withdrawal requests. Order earnings credit directly to the merchant wallet on delivery.
        Cancellation / refund rules live in{" "}
        <Link href="/dashboard/super-admin/rule-engine" className="text-indigo-600 hover:underline">
          Financial Rule Engine
        </Link>
        .
      </p>

      {migrationRequired && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <strong>Database migration required.</strong> Run{" "}
          <code className="text-xs bg-amber-100 px-1 rounded">0239_super_admin_payment_management_system.sql</code>{" "}
          , then{" "}
          <code className="text-xs bg-amber-100 px-1 rounded">0240a_payment_cancellation_milestone_enums.sql</code>{" "}
          (run alone and commit), then{" "}
          <code className="text-xs bg-amber-100 px-1 rounded">0240_payment_cancellation_scenarios.sql</code> in
          Supabase, then refresh this page.
        </div>
      )}

      {msg && (
        <div
          className={`rounded-lg px-4 py-3 text-sm ${
            msg.type === "ok" ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-800"
          }`}
        >
          {msg.text}
        </div>
      )}

      {party !== "merchant" ? (
        <PaymentPartyComingSoon party={party} />
      ) : (
        <>
          <div className="flex flex-wrap items-end justify-between gap-2 border-b border-gray-200 pb-2">
            <h2 className="text-sm font-semibold text-gray-900">
              Pending withdrawals ({payouts.length})
            </h2>
            <Link
              href="/dashboard/super-admin/rule-engine"
              className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-medium text-indigo-800 hover:bg-indigo-100"
            >
              Cancellation / refund rules
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          <PayoutsTable payouts={payouts} savingId={savingId} onAction={payoutAction} />
        </>
      )}
    </div>
  );
}

function PaymentPartyToggle({
  party,
  onChange,
}: {
  party: PaymentParty;
  onChange: (p: PaymentParty) => void;
}) {
  const items: { id: PaymentParty; label: string; icon: ReactNode; soon?: boolean }[] = [
    { id: "merchant", label: "Merchant", icon: <Store className="h-3.5 w-3.5" /> },
    { id: "rider", label: "Rider", icon: <Bike className="h-3.5 w-3.5" />, soon: true },
    { id: "customer", label: "Customer", icon: <Users className="h-3.5 w-3.5" />, soon: true },
  ];

  return (
    <div
      className="inline-flex rounded-lg border border-gray-200 bg-gray-50 p-0.5"
      role="tablist"
      aria-label="Payment party"
    >
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          role="tab"
          aria-selected={party === item.id}
          onClick={() => onChange(item.id)}
          className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
            party === item.id
              ? "bg-white text-indigo-700 shadow-sm ring-1 ring-gray-200"
              : "text-gray-600 hover:text-gray-900"
          }`}
        >
          {item.icon}
          {item.label}
          {item.soon ? (
            <span className="rounded bg-gray-200 px-1 py-0.5 text-[10px] font-semibold uppercase text-gray-600">
              Soon
            </span>
          ) : null}
        </button>
      ))}
    </div>
  );
}

function PaymentPartyComingSoon({ party }: { party: PaymentParty }) {
  const label = party === "rider" ? "Rider" : "Customer";
  return (
    <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 px-6 py-16 text-center">
      <p className="text-lg font-semibold text-gray-900">{label} payment settings</p>
      <p className="mt-2 text-sm text-gray-500 max-w-md mx-auto">
        Coming soon. Use <strong>Merchant</strong> for withdrawal approvals.
      </p>
    </div>
  );
}

function PayoutsTable({
  payouts,
  savingId,
  onAction,
}: {
  payouts: Record<string, unknown>[];
  savingId: string | null;
  onAction: (id: number, action: "approve" | "reject", reason?: string) => Promise<void>;
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
      <table className="min-w-full text-sm">
        <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
          <tr>
            <th className="px-4 py-3">Store</th>
            <th className="px-4 py-3">Amount</th>
            <th className="px-4 py-3">Net</th>
            <th className="px-4 py-3">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {payouts.length === 0 ? (
            <tr>
              <td colSpan={4} className="px-4 py-8 text-center text-gray-500">No pending payouts</td>
            </tr>
          ) : (
            payouts.map((p) => (
              <tr key={String(p.id)}>
                <td className="px-4 py-3">{String(p.store_name ?? p.store_code)}</td>
                <td className="px-4 py-3">â‚¹{Number(p.amount ?? 0).toLocaleString("en-IN")}</td>
                <td className="px-4 py-3">â‚¹{Number(p.net_payout_amount ?? 0).toLocaleString("en-IN")}</td>
                <td className="px-4 py-3 flex gap-2">
                  <button
                    type="button"
                    disabled={savingId === `payout-${p.id}`}
                    onClick={() => void onAction(Number(p.id), "approve")}
                    className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-2 py-1 text-xs text-white"
                  >
                    <Check className="h-3 w-3" /> Approve
                  </button>
                  <button
                    type="button"
                    disabled={savingId === `payout-${p.id}`}
                    onClick={() => void onAction(Number(p.id), "reject", "Rejected")}
                    className="inline-flex items-center gap-1 rounded-md bg-red-100 px-2 py-1 text-xs text-red-700"
                  >
                    <X className="h-3 w-3" /> Reject
                  </button>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
