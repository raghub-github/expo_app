"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  Loader2,
  RefreshCw,
  Check,
  X,
  Wallet,
  Settings2,
  Store,
  Bike,
  Users,
  ArrowRight,
} from "lucide-react";
import Link from "next/link";
import { readApiJson } from "@/lib/payment/read-api-json";

type Tab = "settlement" | "payouts";
type PaymentParty = "merchant" | "rider" | "customer";

export function PaymentManagementClient() {
  const [party, setParty] = useState<PaymentParty>("merchant");
  const [tab, setTab] = useState<Tab>("payouts");
  const [loading, setLoading] = useState(true);
  const [migrationRequired, setMigrationRequired] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [settlementRules, setSettlementRules] = useState<Record<string, unknown>[]>([]);
  const [holdRules, setHoldRules] = useState<Record<string, unknown>[]>([]);
  const [payoutRules, setPayoutRules] = useState<Record<string, unknown>[]>([]);
  const [commissionRules, setCommissionRules] = useState<Record<string, unknown>[]>([]);
  const [payouts, setPayouts] = useState<Record<string, unknown>[]>([]);
  const [savingId, setSavingId] = useState<string | null>(null);

  const loadConfig = useCallback(async () => {
    setLoading(true);
    setMsg(null);
    try {
      const res = await fetch("/api/super-admin/payment-config", { cache: "no-store" });
      const data = await readApiJson(res);
      if (!res.ok || !data.success) {
        setMsg({ type: "err", text: String(data.error ?? "Failed to load config") });
        return;
      }
      setMigrationRequired(Boolean(data.migrationRequired));
      setSettlementRules((data.settlementRules as Record<string, unknown>[]) ?? []);
      setHoldRules((data.holdRules as Record<string, unknown>[]) ?? []);
      setPayoutRules((data.payoutRules as Record<string, unknown>[]) ?? []);
      setCommissionRules((data.commissionRules as Record<string, unknown>[]) ?? []);
      if (data.migrationRequired) {
        setMsg({
          type: "err",
          text: String(data.message ?? "Run migrations 0239 + 0240 on Supabase SQL editor, then refresh."),
        });
      }
    } catch (e) {
      setMsg({ type: "err", text: e instanceof Error ? e.message : "Load failed" });
    } finally {
      setLoading(false);
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

  const patchRule = async (table: string, id: number, payload: Record<string, unknown>) => {
    setSavingId(`${table}-${id}`);
    try {
      const res = await fetch("/api/super-admin/payment-config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ table, id, payload }),
      });
      const data = await readApiJson(res);
      if (!res.ok || !data.success) {
        setMsg({ type: "err", text: String(data.error ?? "Save failed") });
        return;
      }
      setSettlementRules((data.settlementRules as Record<string, unknown>[]) ?? []);
      setHoldRules((data.holdRules as Record<string, unknown>[]) ?? []);
      setPayoutRules((data.payoutRules as Record<string, unknown>[]) ?? []);
      setCommissionRules((data.commissionRules as Record<string, unknown>[]) ?? []);
      setMsg({ type: "ok", text: "Saved" });
    } catch (e) {
      setMsg({ type: "err", text: e instanceof Error ? e.message : "Save failed" });
    } finally {
      setSavingId(null);
    }
  };

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
        <strong className="text-gray-700">Withdrawals & payouts</strong> â†’ approve merchant bank transfers Â·{" "}
        <strong className="text-gray-700">Settlement</strong> â†’ delivered-order merchant share, hold window & debit limits.
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
          <div className="flex flex-wrap items-end justify-between gap-2 border-b border-gray-200">
            <div className="flex min-w-0 flex-1 flex-wrap gap-2">
              <TabBtn
                active={tab === "payouts"}
                onClick={() => setTab("payouts")}
                icon={<Wallet className="h-4 w-4" />}
              >
                Withdrawals & payouts ({payouts.length})
              </TabBtn>
              <TabBtn
                active={tab === "settlement"}
                onClick={() => setTab("settlement")}
                icon={<Settings2 className="h-4 w-4" />}
              >
                Settlement & debit limits
              </TabBtn>
            </div>
            <Link
              href="/dashboard/super-admin/rule-engine"
              className="mb-0.5 inline-flex shrink-0 items-center gap-2 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-medium text-indigo-800 hover:bg-indigo-100"
            >
              Cancellation / refund rules
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          {tab === "settlement" &&
            (loading ? (
              <div className="flex justify-center py-16">
                <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
              </div>
            ) : (
              <div className="grid gap-6 lg:grid-cols-2">
                <RuleCard
                  title="Delivered - merchant share %"
                  rows={settlementRules}
                  fields={[
                    { key: "merchant_share_value", label: "Merchant share % of order", type: "number" },
                    { key: "platform_commission_value", label: "Platform commission %", type: "number" },
                  ]}
                  table="payment_settlement_rules"
                  savingId={savingId}
                  onSave={patchRule}
                />
                <RuleCard
                  title="Hold period after deliver"
                  rows={holdRules}
                  fields={[{ key: "hold_hours", label: "Hours in refund window (locked)", type: "number" }]}
                  table="payment_hold_rules"
                  savingId={savingId}
                  onSave={patchRule}
                />
                <RuleCard
                  title="Withdraw / payout"
                  rows={payoutRules}
                  fields={[
                    { key: "min_payout_amount", label: "Min payout â‚¹", type: "number" },
                    { key: "requires_admin_approval", label: "Needs super-admin approval", type: "boolean" },
                  ]}
                  table="payment_payout_rules"
                  savingId={savingId}
                  onSave={patchRule}
                />
                <RuleCard
                  title="Commission %"
                  rows={commissionRules}
                  fields={[{ key: "commission_value", label: "Commission %", type: "number" }]}
                  table="payment_commission_rules"
                  savingId={savingId}
                  onSave={patchRule}
                />
              </div>
            ))}

          {tab === "payouts" && (
            <PayoutsTable payouts={payouts} savingId={savingId} onAction={payoutAction} />
          )}
        </>
      )}
    </div>
  );
}

function TabBtn({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
        active ? "border-indigo-600 text-indigo-700" : "border-transparent text-gray-500 hover:text-gray-700"
      }`}
    >
      {icon}
      {children}
    </button>
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
        Coming soon. Use <strong>Merchant</strong> for withdrawal approvals and settlement settings.
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

function RuleCard({
  title,
  rows,
  fields,
  table,
  savingId,
  onSave,
}: {
  title: string;
  rows: Record<string, unknown>[];
  fields: { key: string; label: string; type: "number" | "boolean" }[];
  table: string;
  savingId: string | null;
  onSave: (table: string, id: number, payload: Record<string, unknown>) => Promise<void>;
}) {
  const row = rows[0];
  const [draft, setDraft] = useState<Record<string, unknown>>({});

  useEffect(() => {
    if (!row) return;
    const next: Record<string, unknown> = {};
    for (const f of fields) next[f.key] = row[f.key];
    setDraft(next);
  }, [row, fields]);

  if (!row) {
    return (
      <div className="rounded-lg border border-dashed border-gray-200 p-4 text-sm text-gray-500">{title}: no rules yet</div>
    );
  }

  const id = Number(row.id);

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 space-y-3">
      <h3 className="font-semibold text-gray-900">{title}</h3>
      {fields.map((f) => (
        <label key={f.key} className="block text-sm">
          <span className="text-gray-600">{f.label}</span>
          {f.type === "boolean" ? (
            <input
              type="checkbox"
              className="ml-2"
              checked={Boolean(draft[f.key])}
              onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.checked }))}
            />
          ) : (
            <input
              type="number"
              className="mt-1 w-full rounded-md border border-gray-200 px-3 py-2"
              value={Number(draft[f.key] ?? 0)}
              onChange={(e) => setDraft((d) => ({ ...d, [f.key]: Number(e.target.value) }))}
            />
          )}
        </label>
      ))}
      <button
        type="button"
        disabled={savingId === `${table}-${id}`}
        onClick={() => void onSave(table, id, draft)}
        className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
      >
        {savingId === `${table}-${id}` ? "Savingâ€¦" : "Save"}
      </button>
    </div>
  );
}
