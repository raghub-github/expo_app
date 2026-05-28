"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  Loader2,
  RefreshCw,
  Check,
  X,
  Wallet,
  Settings2,
  ListX,
  Plus,
  Info,
  Store,
  Bike,
  Users,
} from "lucide-react";
import { readApiJson } from "@/lib/payment/read-api-json";
import {
  PAYMENT_MILESTONE_OPTIONS,
  PAYMENT_CANCELLED_BY_OPTIONS,
  CUSTOMER_REFUND_OPTIONS,
  describeCancellationRule,
} from "@/lib/payment/cancellation-rule-labels";

type Tab = "settlement" | "cancellation" | "payouts";
type PaymentParty = "merchant" | "rider" | "customer";

export function PaymentManagementClient() {
  const [party, setParty] = useState<PaymentParty>("merchant");
  const [tab, setTab] = useState<Tab>("cancellation");
  const [loading, setLoading] = useState(true);
  const [migrationRequired, setMigrationRequired] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [settlementRules, setSettlementRules] = useState<Record<string, unknown>[]>([]);
  const [holdRules, setHoldRules] = useState<Record<string, unknown>[]>([]);
  const [payoutRules, setPayoutRules] = useState<Record<string, unknown>[]>([]);
  const [commissionRules, setCommissionRules] = useState<Record<string, unknown>[]>([]);
  const [cancellationRules, setCancellationRules] = useState<Record<string, unknown>[]>([]);
  const [payouts, setPayouts] = useState<Record<string, unknown>[]>([]);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [editId, setEditId] = useState<number | null>(null);
  const [showNew, setShowNew] = useState(false);

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

  const loadCancellationRules = useCallback(async () => {
    try {
      const res = await fetch("/api/super-admin/payment-cancellation-rules", { cache: "no-store" });
      const data = await readApiJson(res);
      if (res.ok && data.success) {
        setCancellationRules((data.rows as Record<string, unknown>[]) ?? []);
        setMigrationRequired(Boolean(data.migrationRequired));
      }
    } catch {
      /* ignore */
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
    void loadCancellationRules();
    void loadPayouts();
  }, [loadConfig, loadCancellationRules, loadPayouts]);

  useEffect(() => {
    if (party !== "merchant") {
      setShowNew(false);
      setEditId(null);
    }
  }, [party]);

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

  const saveCancellationRule = async (id: number | null, payload: Record<string, unknown>) => {
    setSavingId(id ? `cancel-${id}` : "cancel-new");
    try {
      const res = await fetch(
        id
          ? `/api/super-admin/payment-cancellation-rules/${id}`
          : "/api/super-admin/payment-cancellation-rules",
        {
          method: id ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
      const data = await readApiJson(res);
      if (!res.ok || !data.success) {
        setMsg({ type: "err", text: String(data.error ?? "Save failed") });
        return;
      }
      setMsg({ type: "ok", text: "Cancellation rule saved" });
      setEditId(null);
      setShowNew(false);
      await loadCancellationRules();
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
    void loadCancellationRules();
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
        <strong className="text-gray-700">Delivered</strong> → merchant earning & hold ·{" "}
        <strong className="text-gray-700">Cancellation</strong> → pre/post pickup, fault, refunds ·{" "}
        <strong className="text-gray-700">Payouts</strong> → withdraw approvals.
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
                active={tab === "cancellation"}
                onClick={() => setTab("cancellation")}
                icon={<ListX className="h-4 w-4" />}
              >
                Cancellation rules ({cancellationRules.length})
              </TabBtn>
              <TabBtn
                active={tab === "settlement"}
                onClick={() => setTab("settlement")}
                icon={<Settings2 className="h-4 w-4" />}
              >
                Delivered & settlement
              </TabBtn>
              <TabBtn
                active={tab === "payouts"}
                onClick={() => setTab("payouts")}
                icon={<Wallet className="h-4 w-4" />}
              >
                Payouts ({payouts.length})
              </TabBtn>
            </div>
            {tab === "cancellation" && (
              <button
                type="button"
                disabled={migrationRequired}
                onClick={() => {
                  setShowNew(true);
                  setEditId(null);
                }}
                className="mb-0.5 inline-flex shrink-0 items-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                <Plus className="h-4 w-4" />
                Add rule
              </button>
            )}
          </div>

          {tab === "cancellation" && (
            <CancellationRulesPanel
              rules={cancellationRules}
              migrationRequired={migrationRequired}
              editId={editId}
              setEditId={setEditId}
              showNew={showNew}
              setShowNew={setShowNew}
              savingId={savingId}
              onSave={saveCancellationRule}
            />
          )}

          {tab === "settlement" &&
            (loading ? (
              <div className="flex justify-center py-16">
                <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
              </div>
            ) : (
              <div className="grid gap-6 lg:grid-cols-2">
                <RuleCard
                  title="Delivered — merchant share %"
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
                    { key: "min_payout_amount", label: "Min payout ₹", type: "number" },
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

function CancellationRulesPanel({
  rules,
  migrationRequired,
  editId,
  setEditId,
  showNew,
  setShowNew,
  savingId,
  onSave,
}: {
  rules: Record<string, unknown>[];
  migrationRequired: boolean;
  editId: number | null;
  setEditId: (id: number | null) => void;
  showNew: boolean;
  setShowNew: (v: boolean) => void;
  savingId: string | null;
  onSave: (id: number | null, payload: Record<string, unknown>) => Promise<void>;
}) {
  const [showGuide, setShowGuide] = useState(false);
  const editing = rules.find((r) => Number(r.id) === editId);
  const formOpen = showNew || editId !== null;
  const closeForm = () => {
    setShowNew(false);
    setEditId(null);
  };

  return (
    <div className="space-y-3 pt-3">
      <PaymentSideSheet
        open={formOpen}
        title={editing ? "Edit cancellation rule" : "New cancellation rule"}
        onClose={closeForm}
      >
        <CancellationRuleForm
          key={editing ? String(editing.id) : "new"}
          initial={editing}
          saving={savingId === "cancel-new" || (editId != null && savingId === `cancel-${editId}`)}
          onCancel={closeForm}
          onSave={(payload) => void onSave(editId, payload)}
        />
      </PaymentSideSheet>

      <PaymentSideSheet
        open={showGuide}
        title="Payment rules by order stage"
        onClose={() => setShowGuide(false)}
      >
        <CancellationMilestoneGuide />
      </PaymentSideSheet>

      <div className="rounded-lg border border-gray-200 bg-white overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
            <tr>
              <th className="px-3 py-2">
                <span className="inline-flex items-center gap-1.5">
                  Scenario
                  <button
                    type="button"
                    onClick={() => setShowGuide(true)}
                    className="inline-flex h-5 w-5 items-center justify-center rounded-full text-indigo-600 hover:bg-indigo-50 normal-case"
                    aria-label="How payment rules map to order stages"
                    title="How payment rules map to order stages"
                  >
                    <Info className="h-3.5 w-3.5" />
                  </button>
                </span>
              </th>
              <th className="px-3 py-2">Merchant paid?</th>
              <th className="px-3 py-2">Customer refund</th>
              <th className="px-3 py-2">Platform commission</th>
              <th className="px-3 py-2">Active</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rules.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                  {migrationRequired ? "Run migrations first" : "No rules — add or run seed 0240"}
                </td>
              </tr>
            ) : (
              rules.map((r) => (
                <tr key={String(r.id)} className={editId === Number(r.id) ? "bg-indigo-50" : ""}>
                  <td className="px-3 py-2">
                    <div className="font-medium text-gray-900">{String(r.rule_name)}</div>
                    <div className="text-xs text-gray-500">{describeCancellationRule(r)}</div>
                    <div className="text-[10px] font-mono text-gray-400">{String(r.rule_code)}</div>
                  </td>
                  <td className="px-3 py-2">
                    {r.merchant_gets_payment ? `Yes (${r.merchant_payment_value ?? 0}%)` : "No"}
                  </td>
                  <td className="px-3 py-2">
                    {String(r.customer_refund_mode)} {Number(r.customer_refund_value) > 0 ? `· ${r.customer_refund_value}%` : ""}
                  </td>
                  <td className="px-3 py-2">{r.platform_keeps_commission ? "Keep" : "Waive"}</td>
                  <td className="px-3 py-2">{r.is_active ? "Yes" : "No"}</td>
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      className="text-indigo-600 text-xs font-medium hover:underline"
                      onClick={() => { setEditId(Number(r.id)); setShowNew(false); }}
                    >
                      Edit
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const FORM_LABEL = "mb-1.5 block text-sm font-medium text-gray-900";
const FORM_INPUT =
  "w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/25";
const FORM_CHECK_ROW =
  "flex items-center gap-2.5 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm font-medium text-gray-900";

function CancellationRuleForm({
  initial,
  saving,
  onCancel,
  onSave,
}: {
  initial?: Record<string, unknown>;
  saving: boolean;
  onCancel: () => void;
  onSave: (payload: Record<string, unknown>) => void;
}) {
  const [draft, setDraft] = useState({
    rule_code: String(initial?.rule_code ?? `RULE_${Date.now()}`),
    rule_name: String(initial?.rule_name ?? ""),
    order_milestone: String(initial?.order_milestone ?? "PRE_PICKUP_CANCELLED"),
    cancelled_by: initial?.cancelled_by ? String(initial.cancelled_by) : "",
    merchant_gets_payment: Boolean(initial?.merchant_gets_payment),
    merchant_payment_value: Number(initial?.merchant_payment_value ?? 0),
    customer_refund_mode: String(initial?.customer_refund_mode ?? "FULL"),
    customer_refund_value: Number(initial?.customer_refund_value ?? 100),
    platform_keeps_commission: Boolean(initial?.platform_keeps_commission ?? true),
    priority: Number(initial?.priority ?? 100),
    is_active: Boolean(initial?.is_active ?? true),
  });

  return (
    <div className="flex min-h-full flex-col text-gray-900">
      <div className="flex-1 space-y-4 pb-4">
        <div>
          <span className={FORM_LABEL}>Rule name</span>
          <input
            className={FORM_INPUT}
            value={draft.rule_name}
            onChange={(e) => setDraft((d) => ({ ...d, rule_name: e.target.value }))}
          />
        </div>
        {!initial && (
          <div>
            <span className={FORM_LABEL}>Rule code (unique)</span>
            <input
              className={`${FORM_INPUT} font-mono text-xs`}
              value={draft.rule_code}
              onChange={(e) => setDraft((d) => ({ ...d, rule_code: e.target.value }))}
            />
          </div>
        )}
        <div>
          <span className={FORM_LABEL}>When (order stage)</span>
          <select
            className={FORM_INPUT}
            value={draft.order_milestone}
            onChange={(e) => setDraft((d) => ({ ...d, order_milestone: e.target.value }))}
          >
            {PAYMENT_MILESTONE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label} — {o.hint}
              </option>
            ))}
          </select>
        </div>
        <div>
          <span className={FORM_LABEL}>Cancelled by (fault / party)</span>
          <select
            className={FORM_INPUT}
            value={draft.cancelled_by}
            onChange={(e) => setDraft((d) => ({ ...d, cancelled_by: e.target.value }))}
          >
            {PAYMENT_CANCELLED_BY_OPTIONS.map((o) => (
              <option key={o.value || "any"} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <label className={FORM_CHECK_ROW}>
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
            checked={draft.merchant_gets_payment}
            onChange={(e) => setDraft((d) => ({ ...d, merchant_gets_payment: e.target.checked }))}
          />
          Merchant gets payment
        </label>
        <div>
          <span className={FORM_LABEL}>Merchant payment %</span>
          <input
            type="number"
            min={0}
            max={100}
            className={FORM_INPUT}
            value={draft.merchant_payment_value}
            onChange={(e) => setDraft((d) => ({ ...d, merchant_payment_value: Number(e.target.value) }))}
          />
        </div>
        <div>
          <span className={FORM_LABEL}>Customer refund</span>
          <select
            className={FORM_INPUT}
            value={draft.customer_refund_mode}
            onChange={(e) => setDraft((d) => ({ ...d, customer_refund_mode: e.target.value }))}
          >
            {CUSTOMER_REFUND_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <span className={FORM_LABEL}>Refund %</span>
          <input
            type="number"
            min={0}
            max={100}
            className={FORM_INPUT}
            value={draft.customer_refund_value}
            onChange={(e) => setDraft((d) => ({ ...d, customer_refund_value: Number(e.target.value) }))}
          />
        </div>
        <label className={FORM_CHECK_ROW}>
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
            checked={draft.platform_keeps_commission}
            onChange={(e) => setDraft((d) => ({ ...d, platform_keeps_commission: e.target.checked }))}
          />
          Platform keeps commission
        </label>
        <div>
          <span className={FORM_LABEL}>Priority (lower = first)</span>
          <input
            type="number"
            min={0}
            className={FORM_INPUT}
            value={draft.priority}
            onChange={(e) => setDraft((d) => ({ ...d, priority: Number(e.target.value) }))}
          />
        </div>
      </div>
      <div className="sticky bottom-0 -mx-4 flex gap-2 border-t border-gray-200 bg-white px-4 py-3 shadow-[0_-4px_12px_rgba(0,0,0,0.06)] sm:-mx-5 sm:px-5">
        <button
          type="button"
          disabled={saving}
          onClick={() => onSave(draft)}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50"
        >
          Cancel
        </button>
      </div>
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
        Coming soon. Use <strong>Merchant</strong> to configure cancellation, settlement, and payout
        rules available today.
      </p>
    </div>
  );
}

function CancellationMilestoneGuide() {
  return (
    <div className="text-sm text-indigo-900 space-y-4">
      <p className="text-gray-600">
        Set which payment applies at each order stage. Match <strong>When (order stage)</strong> and{" "}
        <strong>Cancelled by</strong> in each rule.
      </p>
      <ul className="list-disc pl-5 space-y-2 text-indigo-800">
        <li>
          <strong>Pre-pickup</strong> — ORDER_CREATED, ACCEPTED, MERCHANT_PREPARING, PRE_PICKUP_CANCELLED
        </li>
        <li>
          <strong>Post-pickup</strong> — RIDER_ASSIGNED, OUT_FOR_DELIVERY, POST_PICKUP_CANCELLED
        </li>
        <li>
          <strong>Delivered</strong> — tab &quot;Delivered &amp; settlement&quot; (not cancellation)
        </li>
        <li>
          <strong>After delivered cancel/refund</strong> — CANCELLED_AFTER_DELIVERED
        </li>
        <li>
          <strong>Fault</strong> — set <em>Cancelled by</em> = Customer / Merchant / Rider / Admin / System
        </li>
      </ul>
    </div>
  );
}

function PaymentSideSheet({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-[10000] flex justify-end" role="presentation">
      <button
        type="button"
        className="absolute inset-0 bg-slate-900/50 backdrop-blur-[1px]"
        aria-label="Close panel"
        onClick={onClose}
      />
      <aside
        className="relative flex h-dvh w-full max-w-xl flex-col border-l border-gray-200 bg-white text-gray-900 shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="payment-side-sheet-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-gray-200 px-4 py-3">
          <h2 id="payment-side-sheet-title" className="text-base font-semibold text-gray-900 pr-3">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-600 hover:bg-gray-100 hover:text-gray-900"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 sm:px-5 sm:py-4">{children}</div>
      </aside>
    </div>,
    document.body
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
                <td className="px-4 py-3">₹{Number(p.amount ?? 0).toLocaleString("en-IN")}</td>
                <td className="px-4 py-3">₹{Number(p.net_payout_amount ?? 0).toLocaleString("en-IN")}</td>
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
        {savingId === `${table}-${id}` ? "Saving…" : "Save"}
      </button>
    </div>
  );
}
