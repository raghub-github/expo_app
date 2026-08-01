"use client";

import { useCallback, useEffect, useState } from "react";
import { Gift, Loader2, Plus, Trash2, Save, X } from "lucide-react";
import { ConfirmModal } from "@/components/ui/ConfirmModal";

type Settings = Record<string, unknown>;
type Rule = {
  id: number;
  user_type: string;
  rule_code: string;
  name: string;
  milestone_orders: number;
  reward_amount: number;
  reward_type: string;
  also_credit_referred?: boolean;
  referred_reward_amount?: number | null;
  active: boolean;
  priority: number;
  require_kyc?: boolean | null;
};

type Analytics = {
  totals: {
    totalReferrals: number;
    successful: number;
    pending: number;
    failed?: number;
    rewardDistributed: number;
    conversionRate: number;
    customerReferrals: number;
    riderReferrals: number;
  };
  funnel?: Record<string, number>;
  rewardJobs?: Array<{
    id: number;
    job_key: string;
    status: string;
    attempts: number;
    last_error?: string;
    reward_amount: number;
  }>;
};

type RuleModalState =
  | { mode: "create"; userType: "rider" | "customer" }
  | { mode: "edit"; rule: Rule }
  | null;

const SETTING_TOGGLES: Array<{
  key: string;
  label: string;
  onText: string;
  offText: string;
}> = [
  {
    key: "enabled",
    label: "Referral system enabled",
    onText: "Links, tracking, apply, and rewards all run normally.",
    offText: "Links still open and relationships keep tracking, but no rewards, wallet credits, or reward notifications are sent.",
  },
  {
    key: "reward_enabled",
    label: "Rewards enabled",
    onText: "Eligible referrals can be credited when rules match.",
    offText: "Tracking continues, but the engine will not credit GatiCash or rider wallet for any rule.",
  },
  {
    key: "customer_referral_enabled",
    label: "Customer referral enabled",
    onText: "Customer invite links and auto-apply work for the customer app.",
    offText: "Customer share / apply is paused. Existing customer referral history is kept.",
  },
  {
    key: "rider_referral_enabled",
    label: "Rider referral enabled",
    onText: "Rider invite links and milestone tracking stay active.",
    offText: "Rider referral apply is paused. Existing rider referral history is kept.",
  },
  {
    key: "customer_reward_enabled",
    label: "Customer rewards enabled",
    onText: "Referrer / referred customer GatiCash credits are allowed when eligible.",
    offText: "Customer relationships still update, but no GatiCash is credited.",
  },
  {
    key: "rider_reward_enabled",
    label: "Rider rewards enabled",
    onText: "Rider milestone wallet credits are allowed when eligible.",
    offText: "Rider milestones still track, but no wallet credit is issued.",
  },
  {
    key: "auto_apply_enabled",
    label: "Auto-apply from install link",
    onText: "Install-referrer / deep-link codes apply automatically on first open — no manual entry.",
    offText: "Install attribution is recorded, but the code is not auto-applied; user must enter it (if your flow allows).",
  },
  {
    key: "require_kyc",
    label: "Require rider KYC",
    onText: "Rider milestone rewards only credit after KYC is approved (plus order count).",
    offText: "Rider milestones can credit on order count alone, without waiting for KYC.",
  },
  {
    key: "first_order_only",
    label: "Customer first order only",
    onText: "Customer referral reward triggers only on the referred user’s first qualifying delivered order.",
    offText: "Customer rules can fire on later qualifying delivered orders if the rule allows it.",
  },
];

function Toggle({
  checked,
  onChange,
  disabled,
  id,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  id?: string;
}) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 rounded-full transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2 disabled:opacity-50 ${
        checked ? "bg-teal-600" : "bg-slate-300"
      }`}
    >
      <span
        className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition ${
          checked ? "left-[22px]" : "left-0.5"
        }`}
      />
    </button>
  );
}

function RuleFormModal({
  open,
  title,
  initial,
  userType,
  busy,
  onClose,
  onSave,
}: {
  open: boolean;
  title: string;
  initial: {
    name: string;
    milestone_orders: number;
    reward_amount: number;
    referred_reward_amount?: number | null;
    also_credit_referred?: boolean;
    active: boolean;
    require_kyc: boolean;
  };
  userType: "customer" | "rider";
  busy: boolean;
  onClose: () => void;
  onSave: (values: {
    name: string;
    milestone_orders: number;
    reward_amount: number;
    referred_reward_amount?: number | null;
    also_credit_referred?: boolean;
    active: boolean;
    require_kyc: boolean;
  }) => void | Promise<void>;
}) {
  const [name, setName] = useState(initial.name);
  const [qty, setQty] = useState(String(initial.milestone_orders));
  const [amount, setAmount] = useState(String(initial.reward_amount));
  const [referredAmount, setReferredAmount] = useState(
    String(initial.referred_reward_amount ?? initial.reward_amount ?? 0),
  );
  const [alsoCreditReferred, setAlsoCreditReferred] = useState(
    Boolean(initial.also_credit_referred),
  );
  const [active, setActive] = useState(initial.active);
  const [requireKyc, setRequireKyc] = useState(initial.require_kyc);
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName(initial.name);
    setQty(String(initial.milestone_orders));
    setAmount(String(initial.reward_amount));
    setReferredAmount(String(initial.referred_reward_amount ?? initial.reward_amount ?? 0));
    setAlsoCreditReferred(Boolean(initial.also_credit_referred));
    setActive(initial.active);
    setRequireKyc(initial.require_kyc);
    setLocalError(null);
  }, [open, initial]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, busy, onClose]);

  if (!open) return null;

  const rewardLabel = userType === "customer" ? "GatiCash amount (₹)" : "Wallet reward amount (₹)";
  const qtyLabel =
    userType === "customer" ? "Qualifying order count" : "Completed orders (milestone qty)";

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 sm:p-6" role="presentation">
      <button
        type="button"
        className="absolute inset-0 bg-black/45 backdrop-blur-[1px]"
        aria-label="Close dialog"
        disabled={busy}
        onClick={() => !busy && onClose()}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="rule-form-modal-title"
        className="relative w-full max-w-lg rounded-xl border border-gray-200 bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-gray-100 px-4 py-3 sm:px-5">
          <h2 id="rule-form-modal-title" className="text-base font-semibold text-gray-900">
            {title}
          </h2>
          <button
            type="button"
            onClick={() => !busy && onClose()}
            disabled={busy}
            className="shrink-0 rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 disabled:opacity-50"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4 px-4 py-4 sm:px-5">
          {localError && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {localError}
            </div>
          )}

          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Name</span>
            <input
              type="text"
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={busy}
            />
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{qtyLabel}</span>
              <input
                type="number"
                min={0}
                step={1}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                disabled={busy}
              />
              <span className="mt-1 block text-xs text-slate-500">
                How many completed / delivered orders unlock this reward.
              </span>
            </label>
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                {userType === "customer" ? "Referrer GatiCash (₹)" : rewardLabel}
              </span>
              <input
                type="number"
                min={0}
                step={1}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                disabled={busy}
              />
              <span className="mt-1 block text-xs text-slate-500">
                {userType === "customer"
                  ? "Amount credited to the person who shared the link."
                  : "Credited to rider wallet (withdrawable)."}
              </span>
            </label>
          </div>

          {userType === "customer" && (
            <>
              <div className="flex items-start justify-between gap-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-slate-800">Also reward referred friend</p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {alsoCreditReferred
                      ? "Friend also gets GatiCash on first qualifying order."
                      : "Only the referrer is credited."}
                  </p>
                </div>
                <Toggle
                  checked={alsoCreditReferred}
                  onChange={setAlsoCreditReferred}
                  disabled={busy}
                />
              </div>
              {alsoCreditReferred && (
                <label className="block">
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Friend GatiCash (₹)
                  </span>
                  <input
                    type="number"
                    min={0}
                    step={1}
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
                    value={referredAmount}
                    onChange={(e) => setReferredAmount(e.target.value)}
                    disabled={busy}
                  />
                  <span className="mt-1 block text-xs text-slate-500">
                    Amount credited to the invited customer.
                  </span>
                </label>
              )}
            </>
          )}

          <div className="flex items-start justify-between gap-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
            <div>
              <p className="text-sm font-medium text-slate-800">Rule active</p>
              <p className="mt-0.5 text-xs text-slate-500">
                {active
                  ? "This rule is evaluated when events match."
                  : "Rule is kept in history but will not grant rewards."}
              </p>
            </div>
            <Toggle checked={active} onChange={setActive} disabled={busy} />
          </div>

          {userType === "rider" && (
            <div className="flex items-start justify-between gap-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
              <div>
                <p className="text-sm font-medium text-slate-800">Require KYC for this milestone</p>
                <p className="mt-0.5 text-xs text-slate-500">
                  {requireKyc
                    ? "Reward waits until rider KYC is approved."
                    : "Order count alone is enough for this milestone."}
                </p>
              </div>
              <Toggle checked={requireKyc} onChange={setRequireKyc} disabled={busy} />
            </div>
          )}
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-gray-100 bg-gray-50/80 px-4 py-3 sm:flex-row sm:justify-end sm:px-5">
          <button
            type="button"
            onClick={() => !busy && onClose()}
            disabled={busy}
            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              const milestone = Number(qty);
              const reward = Number(amount);
              const referred = Number(referredAmount);
              if (!name.trim()) {
                setLocalError("Name is required");
                return;
              }
              if (!Number.isFinite(milestone) || milestone < 0) {
                setLocalError("Enter a valid order quantity");
                return;
              }
              if (!Number.isFinite(reward) || reward < 0) {
                setLocalError("Enter a valid reward amount");
                return;
              }
              if (
                userType === "customer" &&
                alsoCreditReferred &&
                (!Number.isFinite(referred) || referred < 0)
              ) {
                setLocalError("Enter a valid friend reward amount");
                return;
              }
              setLocalError(null);
              void onSave({
                name: name.trim(),
                milestone_orders: Math.floor(milestone),
                reward_amount: reward,
                referred_reward_amount:
                  userType === "customer" && alsoCreditReferred ? referred : null,
                also_credit_referred: userType === "customer" ? alsoCreditReferred : false,
                active,
                require_kyc: requireKyc,
              });
            }}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-60"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function ReferralEngineAdminClient() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [modalBusy, setModalBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [rules, setRules] = useState<Rule[]>([]);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [tab, setTab] = useState<"settings" | "customer" | "rider" | "analytics">("settings");
  const [ruleModal, setRuleModal] = useState<RuleModalState>(null);
  const [deleteTarget, setDeleteTarget] = useState<Rule | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const load = useCallback(async (opts?: { soft?: boolean }) => {
    if (!opts?.soft) setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/super-admin/referral");
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to load");
        return;
      }
      setSettings(data.settings);
      setRules(data.rules || []);
      setAnalytics(data.analytics || null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Analytics is operational data, not static config. Keep it fresh while the
  // tab is open so migrated/new referrals appear without a browser reload.
  useEffect(() => {
    if (tab !== "analytics") return;
    const timer = window.setInterval(() => {
      void load({ soft: true });
    }, 10_000);
    return () => window.clearInterval(timer);
  }, [tab, load]);

  async function saveSettings() {
    if (!settings) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/super-admin/referral", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled: Boolean(settings.enabled),
          reward_enabled: Boolean(settings.reward_enabled),
          customer_referral_enabled: Boolean(settings.customer_referral_enabled),
          rider_referral_enabled: Boolean(settings.rider_referral_enabled),
          customer_reward_enabled: Boolean(settings.customer_reward_enabled),
          rider_reward_enabled: Boolean(settings.rider_reward_enabled),
          auto_apply_enabled: Boolean(settings.auto_apply_enabled),
          require_kyc: Boolean(settings.require_kyc),
          first_order_only: Boolean(settings.first_order_only),
          min_order_amount: Number(settings.min_order_amount),
          monthly_reward_cap: Number(settings.monthly_reward_cap),
          currency: String(settings.currency || "INR"),
          referral_validity_days:
            settings.referral_validity_days != null
              ? Number(settings.referral_validity_days)
              : undefined,
          reward_expiry_days:
            settings.reward_expiry_days != null ? Number(settings.reward_expiry_days) : undefined,
          reward_claim_window_days:
            settings.reward_claim_window_days != null
              ? Number(settings.reward_claim_window_days)
              : undefined,
          code_prefix_customer:
            settings.code_prefix_customer != null
              ? String(settings.code_prefix_customer)
              : undefined,
          code_prefix_rider:
            settings.code_prefix_rider != null ? String(settings.code_prefix_rider) : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Save failed");
      setSettings(data.settings);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function toggleRule(rule: Rule) {
    const res = await fetch(`/api/super-admin/referral/rules/${rule.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !rule.active }),
    });
    if (!res.ok) {
      const data = await res.json();
      setError(data.error || "Update failed");
      return;
    }
    await load({ soft: true });
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleteBusy(true);
    try {
      const res = await fetch(`/api/super-admin/referral/rules/${deleteTarget.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Delete failed");
        return;
      }
      setDeleteTarget(null);
      await load({ soft: true });
    } finally {
      setDeleteBusy(false);
    }
  }

  async function saveRuleModal(values: {
    name: string;
    milestone_orders: number;
    reward_amount: number;
    referred_reward_amount?: number | null;
    also_credit_referred?: boolean;
    active: boolean;
    require_kyc: boolean;
  }) {
    if (!ruleModal) return;
    setModalBusy(true);
    setError(null);
    try {
      if (ruleModal.mode === "create") {
        const code = `RIDER_M${values.milestone_orders}_${Date.now().toString(36).toUpperCase()}`;
        const res = await fetch("/api/super-admin/referral/rules", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            user_type: "rider",
            rule_code: code,
            name: values.name,
            milestone_orders: values.milestone_orders,
            reward_amount: values.reward_amount,
            reward_type: "WALLET_CREDIT",
            require_kyc: values.require_kyc,
            active: values.active,
            priority: values.milestone_orders,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Create failed");
      } else {
        const res = await fetch(`/api/super-admin/referral/rules/${ruleModal.rule.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: values.name,
            milestone_orders: values.milestone_orders,
            reward_amount: values.reward_amount,
            referred_reward_amount: values.referred_reward_amount,
            also_credit_referred: values.also_credit_referred,
            active: values.active,
            require_kyc: values.require_kyc,
            priority: values.milestone_orders,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Update failed");
      }
      setRuleModal(null);
      await load({ soft: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setModalBusy(false);
    }
  }

  const customerRules = rules.filter((r) => r.user_type === "customer");
  const riderRules = rules.filter((r) => r.user_type === "rider");

  const modalInitial =
    ruleModal?.mode === "edit"
      ? {
          name: ruleModal.rule.name,
          milestone_orders: ruleModal.rule.milestone_orders,
          reward_amount: Number(ruleModal.rule.reward_amount),
          referred_reward_amount:
            ruleModal.rule.referred_reward_amount != null
              ? Number(ruleModal.rule.referred_reward_amount)
              : Number(ruleModal.rule.reward_amount),
          also_credit_referred: Boolean(ruleModal.rule.also_credit_referred),
          active: ruleModal.rule.active,
          require_kyc: Boolean(ruleModal.rule.require_kyc ?? true),
        }
      : {
          name: "250 completed orders",
          milestone_orders: 250,
          reward_amount: 2500,
          referred_reward_amount: null,
          also_credit_referred: false,
          active: true,
          require_kyc: true,
        };

  const modalUserType =
    ruleModal?.mode === "edit"
      ? (ruleModal.rule.user_type as "customer" | "rider")
      : ruleModal?.userType ?? "rider";

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900">
            <Gift className="h-6 w-6 text-teal-600" />
            Referral & Rewards
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Database-driven engine for customer GatiCash and rider wallet milestones. Config version{" "}
            <span className="font-mono">{String(settings?.config_version ?? "—")}</span>
          </p>
        </div>
        {tab === "settings" && settings && (
          <button
            type="button"
            onClick={() => void saveSettings()}
            disabled={saving || loading}
            className="inline-flex items-center gap-2 rounded-lg bg-teal-600 px-4 py-2 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-60"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save settings
          </button>
        )}
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-2">
        {(
          [
            ["settings", "Settings"],
            ["customer", "Customer rules"],
            ["rider", "Rider milestones"],
            ["analytics", "Analytics"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
              tab === id ? "bg-teal-50 text-teal-800" : "text-slate-600 hover:bg-slate-50"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {loading && !settings ? (
        <div className="flex items-center gap-2 py-12 text-slate-600">
          <Loader2 className="h-5 w-5 animate-spin" /> Loading referral engine…
        </div>
      ) : (
        <>
          {tab === "settings" && settings && (
            <div className="space-y-6">
              <div className="grid gap-3 md:grid-cols-2">
                {SETTING_TOGGLES.map(({ key, label, onText, offText }) => {
                  const on = Boolean(settings[key]);
                  return (
                    <div
                      key={key}
                      className="flex items-start justify-between gap-4 rounded-xl border border-slate-200 bg-white px-4 py-3"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-800">{label}</p>
                        <p className="mt-1 text-xs leading-relaxed text-slate-500">
                          {on ? onText : offText}
                        </p>
                      </div>
                      <Toggle
                        checked={on}
                        onChange={(v) => setSettings({ ...settings, [key]: v })}
                      />
                    </div>
                  );
                })}
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="rounded-xl border border-slate-200 bg-white px-4 py-3">
                  <span className="text-xs font-semibold uppercase text-slate-500">Min order amount</span>
                  <input
                    type="number"
                    className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                    value={Number(settings.min_order_amount ?? 0)}
                    onChange={(e) =>
                      setSettings({ ...settings, min_order_amount: Number(e.target.value) })
                    }
                  />
                  <span className="mt-1 block text-xs text-slate-500">
                    Customer referral order must be at least this ₹ amount after delivery to qualify.
                  </span>
                </label>
                <label className="rounded-xl border border-slate-200 bg-white px-4 py-3">
                  <span className="text-xs font-semibold uppercase text-slate-500">Monthly reward cap</span>
                  <input
                    type="number"
                    className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                    value={Number(settings.monthly_reward_cap ?? 0)}
                    onChange={(e) =>
                      setSettings({ ...settings, monthly_reward_cap: Number(e.target.value) })
                    }
                  />
                  <span className="mt-1 block text-xs text-slate-500">
                    Max ₹ a referrer can earn per calendar month. Further referrals still track, but are not credited.
                  </span>
                </label>
                {settings.referral_validity_days != null && (
                  <label className="rounded-xl border border-slate-200 bg-white px-4 py-3">
                    <span className="text-xs font-semibold uppercase text-slate-500">
                      Referral validity (days)
                    </span>
                    <input
                      type="number"
                      className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                      value={Number(settings.referral_validity_days ?? 365)}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          referral_validity_days: Number(e.target.value),
                        })
                      }
                    />
                    <span className="mt-1 block text-xs text-slate-500">
                      How long an applied referral stays eligible before it expires.
                    </span>
                  </label>
                )}
                {settings.reward_expiry_days != null && (
                  <label className="rounded-xl border border-slate-200 bg-white px-4 py-3">
                    <span className="text-xs font-semibold uppercase text-slate-500">
                      Reward expiry (days)
                    </span>
                    <input
                      type="number"
                      className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                      value={Number(settings.reward_expiry_days ?? 90)}
                      onChange={(e) =>
                        setSettings({ ...settings, reward_expiry_days: Number(e.target.value) })
                      }
                    />
                    <span className="mt-1 block text-xs text-slate-500">
                      Days until an unclaimed / pending reward expires after becoming eligible.
                    </span>
                  </label>
                )}
                {settings.code_prefix_customer != null && (
                  <label className="rounded-xl border border-slate-200 bg-white px-4 py-3">
                    <span className="text-xs font-semibold uppercase text-slate-500">
                      Customer code prefix
                    </span>
                    <input
                      type="text"
                      className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm uppercase"
                      value={String(settings.code_prefix_customer ?? "GM")}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          code_prefix_customer: e.target.value.toUpperCase(),
                        })
                      }
                    />
                    <span className="mt-1 block text-xs text-slate-500">
                      Prefix for newly generated customer codes only. Existing codes are never changed.
                    </span>
                  </label>
                )}
                {settings.code_prefix_rider != null && (
                  <label className="rounded-xl border border-slate-200 bg-white px-4 py-3">
                    <span className="text-xs font-semibold uppercase text-slate-500">
                      Rider code prefix
                    </span>
                    <input
                      type="text"
                      className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm uppercase"
                      value={String(settings.code_prefix_rider ?? "RIDER")}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          code_prefix_rider: e.target.value.toUpperCase(),
                        })
                      }
                    />
                    <span className="mt-1 block text-xs text-slate-500">
                      Prefix for newly generated rider codes only. Existing codes are never changed.
                    </span>
                  </label>
                )}
              </div>
            </div>
          )}

          {tab === "customer" && (
            <div className="space-y-3">
              <p className="text-sm text-slate-500">
                Customer rewards are GatiCash only. Edit amount and order qty below — no app update required.
              </p>
              {customerRules.map((rule) => (
                <div
                  key={rule.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3"
                >
                  <div>
                    <p className="font-semibold text-slate-900">{rule.name}</p>
                    <p className="text-xs text-slate-500">
                      {rule.rule_code} · {rule.milestone_orders} order(s) · ₹{rule.reward_amount}{" "}
                      GatiCash
                      {rule.also_credit_referred ? " (+ referred)" : ""}
                      {!rule.active ? " · inactive" : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <Toggle checked={rule.active} onChange={() => void toggleRule(rule)} />
                    <button
                      type="button"
                      className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium hover:bg-slate-50"
                      onClick={() => setRuleModal({ mode: "edit", rule })}
                    >
                      Edit
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {tab === "rider" && (
            <div className="space-y-3">
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => setRuleModal({ mode: "create", userType: "rider" })}
                  className="inline-flex items-center gap-2 rounded-lg bg-teal-600 px-3 py-2 text-sm font-semibold text-white"
                >
                  <Plus className="h-4 w-4" /> Add milestone
                </button>
              </div>
              {riderRules.map((rule) => (
                <div
                  key={rule.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3"
                >
                  <div>
                    <p className="font-semibold text-slate-900">{rule.name}</p>
                    <p className="text-xs text-slate-500">
                      {rule.rule_code} · {rule.milestone_orders} orders · ₹{rule.reward_amount} wallet
                      {!rule.active ? " · inactive" : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <Toggle checked={rule.active} onChange={() => void toggleRule(rule)} />
                    <button
                      type="button"
                      className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium hover:bg-slate-50"
                      onClick={() => setRuleModal({ mode: "edit", rule })}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="rounded-lg border border-red-200 px-3 py-1.5 text-sm text-red-700 hover:bg-red-50"
                      onClick={() => setDeleteTarget(rule)}
                      aria-label={`Delete ${rule.rule_code}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {tab === "analytics" && analytics && (
            <div className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {[
                  ["Total referrals", analytics.totals.totalReferrals],
                  ["Successful", analytics.totals.successful],
                  ["Pending", analytics.totals.pending],
                  ["Failed", analytics.totals.failed ?? 0],
                  ["Conversion %", analytics.totals.conversionRate],
                  ["Reward distributed ₹", analytics.totals.rewardDistributed],
                  [
                    "Customer / Rider",
                    `${analytics.totals.customerReferrals} / ${analytics.totals.riderReferrals}`,
                  ],
                ].map(([label, value]) => (
                  <div
                    key={String(label)}
                    className="rounded-xl border border-slate-200 bg-white px-4 py-4"
                  >
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      {label}
                    </p>
                    <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">{value}</p>
                  </div>
                ))}
              </div>

              {analytics.funnel && (
                <div>
                  <h3 className="mb-2 text-sm font-semibold text-slate-800">Conversion funnel (30d)</h3>
                  <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-5">
                    {Object.entries(analytics.funnel).map(([k, v]) => (
                      <div key={k} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                        <p className="text-[10px] font-semibold uppercase text-slate-500">
                          {k.replace(/_/g, " ")}
                        </p>
                        <p className="text-lg font-bold tabular-nums">{v}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {analytics.rewardJobs && analytics.rewardJobs.length > 0 && (
                <div>
                  <h3 className="mb-2 text-sm font-semibold text-slate-800">
                    Reward jobs needing attention
                  </h3>
                  <div className="space-y-2">
                    {analytics.rewardJobs.map((job) => (
                      <div
                        key={job.id}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                      >
                        <div>
                          <p className="font-mono text-xs text-slate-500">{job.job_key}</p>
                          <p>
                            {job.status} · attempts {job.attempts} · ₹{job.reward_amount}
                            {job.last_error ? ` · ${job.last_error}` : ""}
                          </p>
                        </div>
                        <button
                          type="button"
                          className="rounded-md border px-2 py-1 text-xs font-semibold"
                          onClick={() =>
                            void fetch("/api/super-admin/referral/jobs/retry", {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ jobId: job.id, action: "retry" }),
                            }).then(() => load({ soft: true }))
                          }
                        >
                          Retry
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}

      <RuleFormModal
        open={ruleModal != null}
        title={
          ruleModal?.mode === "create"
            ? "Add rider milestone"
            : ruleModal?.mode === "edit"
              ? `Edit ${ruleModal.rule.user_type === "customer" ? "customer rule" : "milestone"}`
              : "Edit rule"
        }
        initial={modalInitial}
        userType={modalUserType}
        busy={modalBusy}
        onClose={() => !modalBusy && setRuleModal(null)}
        onSave={saveRuleModal}
      />

      <ConfirmModal
        open={deleteTarget != null}
        title="Delete milestone?"
        description={
          deleteTarget
            ? `Delete “${deleteTarget.name}” (${deleteTarget.rule_code})? This cannot be undone.`
            : undefined
        }
        confirmLabel="Delete"
        variant="danger"
        confirmBusy={deleteBusy}
        onClose={() => !deleteBusy && setDeleteTarget(null)}
        onConfirm={confirmDelete}
      />
    </div>
  );
}
