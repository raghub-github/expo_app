"use client";

import { useCallback, useEffect, useState } from "react";
import { Gift, Loader2, Plus, Trash2, Save, X } from "lucide-react";
import { ConfirmModal } from "@/components/ui/ConfirmModal";

type Settings = Record<string, unknown>;
type ParticipantType = "customer" | "rider" | "merchant";

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
  event_type?: string | null;
  reward_mode?: string | null;
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
    merchantReferrals?: number;
    expiredReferrals?: number;
    referrerRewardAmount?: number;
    referredRewardAmount?: number;
    referrerRewardCount?: number;
    referredRewardCount?: number;
    campaignBudget?: number | null;
    campaignBudgetConsumed?: number;
    campaignBudgetRemaining?: number | null;
    campaignBudgetExhausted?: boolean;
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
  merchantParents?: Array<{
    id: string;
    status: string;
    reward_status?: string;
    completed_orders?: number;
    referrer_parent?: string | null;
    referred_parent?: string | null;
    child_store_count?: number;
  }>;
};

type RuleModalState =
  | { mode: "create"; userType: ParticipantType }
  | { mode: "edit"; rule: Rule }
  | null;

const MERCHANT_EVENT_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "STORE_APPROVED", label: "Store approved" },
  { value: "REGISTRATION_COMPLETED", label: "Registration completed" },
  { value: "KYC_APPROVED", label: "KYC approved" },
  { value: "MENU_COMPLETED", label: "Menu / catalog completed" },
  { value: "FIRST_ORDER_DELIVERED", label: "First qualifying order delivered" },
  { value: "ORDER_DELIVERED_COUNT", label: "X qualifying delivered orders" },
  { value: "ACTIVE_DAYS", label: "Active for X days" },
];

const SERVICE_TOGGLES: Array<{
  key: string;
  label: string;
  helper: string;
}> = [
  {
    key: "customer_referral_enabled",
    label: "Customer Referral",
    helper: "Controls whether new customer referral codes can be used or created.",
  },
  {
    key: "rider_referral_enabled",
    label: "Rider Referral",
    helper: "Controls whether new rider referral codes can be used or created.",
  },
  {
    key: "merchant_referral_enabled",
    label: "Merchant Referral",
    helper: "Controls whether new merchant referral codes can be used or created.",
  },
];

const SETTING_TOGGLES: Array<{
  key: string;
  label: string;
  onText: string;
  offText: string;
}> = [
  {
    key: "enabled",
    label: "Referral system enabled",
    onText: "Links, tracking, apply, and rewards all run normally (per service toggle).",
    offText: "Master off: no service can create referrals or credit rewards.",
  },
  {
    key: "reward_enabled",
    label: "Rewards enabled",
    onText: "Eligible referrals can be credited when rules match.",
    offText: "Tracking continues, but the engine will not credit GatiCash or wallets for any rule.",
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
    key: "merchant_reward_enabled",
    label: "Merchant rewards enabled",
    onText: "Merchant wallet credits are allowed when the referred merchant qualifies.",
    offText: "Merchant relationships still update, but no wallet credit is issued.",
  },
  {
    key: "auto_apply_enabled",
    label: "Auto-apply from install link",
    onText: "Install-referrer / deep-link codes apply automatically on first open — no manual entry.",
    offText: "Install attribution is recorded, but the code is not auto-applied; user must enter it (if your flow allows).",
  },
  {
    key: "require_kyc",
    label: "Require KYC (rider / merchant)",
    onText: "Rider and merchant rewards only credit after KYC / store approval when the rule requires it.",
    offText: "Milestones can credit on qualifying events alone, without waiting for KYC.",
  },
  {
    key: "referral_expiry_enabled",
    label: "Referral expiry enabled",
    onText: "Applied referrals expire after the configured validity days if they do not qualify.",
    offText: "Applied referrals stay eligible until rewarded or blocked.",
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
    event_type?: string | null;
  };
  userType: ParticipantType;
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
    event_type?: string | null;
  }) => void | Promise<void>;
}) {
  const [name, setName] = useState(initial.name);
  const [qty, setQty] = useState(
    initial.milestone_orders ? String(initial.milestone_orders) : "",
  );
  const [amount, setAmount] = useState(
    initial.reward_amount ? String(initial.reward_amount) : "",
  );
  const [referredAmount, setReferredAmount] = useState(
    initial.referred_reward_amount != null
      ? String(initial.referred_reward_amount)
      : "",
  );
  const [alsoCreditReferred, setAlsoCreditReferred] = useState(
    Boolean(initial.also_credit_referred),
  );
  const [active, setActive] = useState(initial.active);
  const [requireKyc, setRequireKyc] = useState(initial.require_kyc);
  const [eventType, setEventType] = useState(
    initial.event_type || (userType === "merchant" ? "STORE_APPROVED" : ""),
  );
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName(initial.name);
    setQty(initial.milestone_orders ? String(initial.milestone_orders) : "");
    setAmount(initial.reward_amount ? String(initial.reward_amount) : "");
    setReferredAmount(
      initial.referred_reward_amount != null ? String(initial.referred_reward_amount) : "",
    );
    setAlsoCreditReferred(Boolean(initial.also_credit_referred));
    setActive(initial.active);
    setRequireKyc(initial.require_kyc);
    setEventType(initial.event_type || (userType === "merchant" ? "STORE_APPROVED" : ""));
    setLocalError(null);
  }, [open, initial, userType]);

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

  const rewardNoun =
    userType === "customer" ? "GatiCash" : "wallet credit";
  const qtyLabel =
    userType === "customer"
      ? "Qualifying order count"
      : userType === "merchant"
        ? "Threshold (orders / days)"
        : "Completed orders (milestone qty)";
  const referrerLabel =
    userType === "customer" ? "Referrer GatiCash (₹)" : "Referrer wallet reward (₹)";
  const referredLabel =
    userType === "customer" ? "Friend GatiCash (₹)" : "Referred wallet reward (₹)";
  const countNeeded =
    userType !== "merchant" ||
    eventType === "ORDER_DELIVERED_COUNT" ||
    eventType === "ACTIVE_DAYS" ||
    eventType === "FIRST_ORDER_DELIVERED";

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
        className="relative flex max-h-[min(92vh,880px)] w-full max-w-4xl flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-gray-100 px-4 py-3 sm:px-6">
          <h2 id="rule-form-modal-title" className="min-w-0 break-words text-base font-semibold text-gray-900">
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

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-6">
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

          {userType === "merchant" && (
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Qualifying event
              </span>
              <select
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
                value={eventType}
                onChange={(e) => setEventType(e.target.value)}
                disabled={busy}
              >
                {MERCHANT_EVENT_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <span className="mt-1 block text-xs leading-5 text-slate-500 break-words">
                The referred merchant must complete this event. Amounts stay in this form — never in the app.
              </span>
            </label>
          )}

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {countNeeded && (
            <label className="block min-w-0">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{qtyLabel}</span>
              <input
                type="number"
                min={0}
                step={1}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                disabled={busy}
                placeholder="Enter threshold"
              />
              <span className="mt-1 block text-xs leading-5 text-slate-500 break-words">
                How many completed / delivered orders (or days) unlock this reward.
              </span>
            </label>
            )}
            <label className="block min-w-0">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                {referrerLabel}
              </span>
              <input
                type="number"
                min={0}
                step={1}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                disabled={busy}
                placeholder="Exact ₹ from Super Admin"
              />
              <span className="mt-1 block text-xs leading-5 text-slate-500 break-words">
                Amount credited to the person who shared the link. Apps never override this.
              </span>
            </label>
            {alsoCreditReferred && (
            <label className="block min-w-0 md:col-span-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                {referredLabel}
              </span>
              <input
                type="number"
                min={0}
                step={1}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500"
                value={referredAmount}
                onChange={(e) => setReferredAmount(e.target.value)}
                disabled={busy}
                placeholder="Exact ₹ for the referred party"
              />
              <span className="mt-1 block text-xs leading-5 text-slate-500 break-words">
                Amount credited to the invited {userType}.
              </span>
            </label>
            )}
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="flex min-w-0 items-start justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-slate-800 break-words">Also reward referred {userType}</p>
                <p className="mt-0.5 text-xs leading-5 text-slate-500 break-words">
                  {alsoCreditReferred
                    ? `Both sides receive ${rewardNoun} from the same logical reward event.`
                    : "Only the referrer is credited."}
                </p>
              </div>
              <div className="shrink-0 pt-0.5">
                <Toggle
                  checked={alsoCreditReferred}
                  onChange={setAlsoCreditReferred}
                  disabled={busy}
                />
              </div>
            </div>
            <div className="flex min-w-0 items-start justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-slate-800 break-words">Rule active</p>
                <p className="mt-0.5 text-xs leading-5 text-slate-500 break-words">
                  {active
                    ? "This rule is evaluated when events match."
                    : "Rule is kept in history but will not grant rewards."}
                </p>
              </div>
              <div className="shrink-0 pt-0.5">
                <Toggle checked={active} onChange={setActive} disabled={busy} />
              </div>
            </div>
            {(userType === "rider" || userType === "merchant") && (
              <div className="flex min-w-0 items-start justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 md:col-span-2">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-800 break-words">
                    {userType === "merchant" ? "Require store approval / KYC" : "Require KYC for this milestone"}
                  </p>
                  <p className="mt-0.5 text-xs leading-5 text-slate-500 break-words">
                    {requireKyc
                      ? "Reward waits until KYC / store approval is complete."
                      : "The qualifying event alone is enough for this rule."}
                  </p>
                </div>
                <div className="shrink-0 pt-0.5">
                  <Toggle checked={requireKyc} onChange={setRequireKyc} disabled={busy} />
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="flex shrink-0 flex-col-reverse gap-2 border-t border-gray-100 bg-gray-50/80 px-4 py-3 sm:flex-row sm:justify-end sm:px-6">
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
              const milestone = Number(qty || 0);
              const reward = Number(amount);
              const referred = Number(referredAmount);
              if (!name.trim()) {
                setLocalError("Name is required");
                return;
              }
              if (countNeeded && (!Number.isFinite(milestone) || milestone < 0)) {
                setLocalError("Enter a valid order / day quantity");
                return;
              }
              if (!Number.isFinite(reward) || reward < 0) {
                setLocalError("Enter a valid referrer reward amount");
                return;
              }
              if (alsoCreditReferred && (!Number.isFinite(referred) || referred < 0)) {
                setLocalError("Enter a valid referred-party reward amount");
                return;
              }
              setLocalError(null);
              void onSave({
                name: name.trim(),
                milestone_orders: countNeeded ? Math.floor(milestone) : 0,
                reward_amount: reward,
                referred_reward_amount: alsoCreditReferred ? referred : null,
                also_credit_referred: alsoCreditReferred,
                active,
                require_kyc: requireKyc,
                event_type: userType === "merchant" ? eventType || "STORE_APPROVED" : null,
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
  const [tab, setTab] = useState<"settings" | "customer" | "rider" | "merchant" | "analytics">(
    "settings",
  );
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
          merchant_referral_enabled: Boolean(settings.merchant_referral_enabled),
          merchant_reward_enabled: Boolean(settings.merchant_reward_enabled),
          auto_apply_enabled: Boolean(settings.auto_apply_enabled),
          require_kyc: Boolean(settings.require_kyc),
          first_order_only: Boolean(settings.first_order_only),
          referral_expiry_enabled: Boolean(settings.referral_expiry_enabled),
          reward_mode:
            settings.reward_mode === "highest_only" ? "highest_only" : "incremental",
          min_order_amount: Number(settings.min_order_amount),
          monthly_reward_cap: Number(settings.monthly_reward_cap),
          campaign_budget:
            settings.campaign_budget === "" || settings.campaign_budget == null
              ? null
              : Number(settings.campaign_budget),
          max_successful_referrals:
            settings.max_successful_referrals === "" || settings.max_successful_referrals == null
              ? null
              : Number(settings.max_successful_referrals),
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
          code_prefix_merchant:
            settings.code_prefix_merchant != null
              ? String(settings.code_prefix_merchant)
              : undefined,
          merchant_qualification_scope:
            settings.merchant_qualification_scope === "SINGLE_STORE" ||
            settings.merchant_qualification_scope === "SELECTED_STORES"
              ? settings.merchant_qualification_scope
              : "ALL_CHILD_STORES",
          merchant_qualification_store_ids: Array.isArray(settings.merchant_qualification_store_ids)
            ? (settings.merchant_qualification_store_ids as unknown[])
                .map((v) => Number(v))
                .filter((n) => Number.isFinite(n) && n > 0)
            : [],
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
    event_type?: string | null;
  }) {
    if (!ruleModal) return;
    setModalBusy(true);
    setError(null);
    try {
      if (ruleModal.mode === "create") {
        const userType = ruleModal.userType;
        const prefix =
          userType === "merchant" ? "MX" : userType === "customer" ? "CUST" : "RIDER_M";
        const code = `${prefix}${values.milestone_orders}_${Date.now().toString(36).toUpperCase()}`;
        const res = await fetch("/api/super-admin/referral/rules", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            user_type: userType,
            rule_code: code,
            name: values.name,
            milestone_orders: values.milestone_orders,
            reward_amount: values.reward_amount,
            reward_type: userType === "customer" ? "GATICASH" : "WALLET_CREDIT",
            also_credit_referred: values.also_credit_referred ?? false,
            referred_reward_amount: values.referred_reward_amount ?? null,
            require_kyc: values.require_kyc,
            event_type:
              values.event_type ||
              (userType === "merchant"
                ? "STORE_APPROVED"
                : userType === "customer"
                  ? "FIRST_ORDER_DELIVERED"
                  : "ORDER_DELIVERED_COUNT"),
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
            event_type: values.event_type,
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
  const merchantRules = rules.filter((r) => r.user_type === "merchant");

  const modalInitial =
    ruleModal?.mode === "edit"
      ? {
          name: ruleModal.rule.name,
          milestone_orders: ruleModal.rule.milestone_orders,
          reward_amount: Number(ruleModal.rule.reward_amount),
          referred_reward_amount:
            ruleModal.rule.referred_reward_amount != null
              ? Number(ruleModal.rule.referred_reward_amount)
              : null,
          also_credit_referred: Boolean(ruleModal.rule.also_credit_referred),
          active: ruleModal.rule.active,
          require_kyc: Boolean(ruleModal.rule.require_kyc ?? true),
          event_type: ruleModal.rule.event_type ?? null,
        }
      : {
          name: "",
          milestone_orders: 0,
          reward_amount: 0,
          referred_reward_amount: null,
          also_credit_referred: true,
          active: true,
          require_kyc: true,
          event_type:
            ruleModal?.userType === "merchant"
              ? "STORE_APPROVED"
              : ruleModal?.userType === "customer"
                ? "FIRST_ORDER_DELIVERED"
                : "ORDER_DELIVERED_COUNT",
        };

  const modalUserType: ParticipantType =
    ruleModal?.mode === "edit"
      ? (ruleModal.rule.user_type as ParticipantType)
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
            Database-driven engine for customer GatiCash, rider wallet, and merchant wallet
            referrals. Config version{" "}
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
            ["merchant", "Merchant rules"],
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
              <section className="space-y-3">
                <div>
                  <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-700">
                    Referral Services
                  </h2>
                  <p className="mt-1 text-xs text-slate-500">
                    Independent database-backed toggles. OFF blocks new referral applications
                    and code generation for that audience only. Existing relationships and
                    already-earned rewards are not deleted.
                  </p>
                </div>
                <div className="grid gap-3 md:grid-cols-3">
                  {SERVICE_TOGGLES.map(({ key, label, helper }) => {
                    const on = Boolean(settings[key]);
                    return (
                      <div
                        key={key}
                        className="flex items-start justify-between gap-4 rounded-xl border border-slate-200 bg-white px-4 py-3"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-slate-800">{label}</p>
                          <p
                            className={`mt-1 text-xs font-semibold ${
                              on ? "text-emerald-700" : "text-red-600"
                            }`}
                          >
                            {on ? "Referral service active" : "Referral service disabled"}
                          </p>
                          <p className="mt-1 text-xs leading-relaxed text-slate-500">{helper}</p>
                        </div>
                        <Toggle
                          checked={on}
                          onChange={(v) => setSettings({ ...settings, [key]: v })}
                        />
                      </div>
                    );
                  })}
                </div>
              </section>

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

              <section className="space-y-3 rounded-xl border border-slate-200 bg-white px-4 py-4">
                <div>
                  <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-700">
                    Merchant qualification scope
                  </h2>
                  <p className="mt-1 text-xs text-slate-500">
                    Parent merchant qualification. Child stores never receive a separate merchant
                    referral reward. Default aggregates every eligible child store.
                  </p>
                </div>
                <label className="block">
                  <span className="text-xs font-semibold uppercase text-slate-500">
                    Qualification scope
                  </span>
                  <select
                    className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                    value={String(settings.merchant_qualification_scope ?? "ALL_CHILD_STORES")}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        merchant_qualification_scope: e.target.value,
                      })
                    }
                  >
                    <option value="ALL_CHILD_STORES">ALL_CHILD_STORES — sum all child stores</option>
                    <option value="SINGLE_STORE">
                      SINGLE_STORE — count the strongest single child store
                    </option>
                    <option value="SELECTED_STORES">
                      SELECTED_STORES — sum only listed store IDs
                    </option>
                  </select>
                </label>
                {String(settings.merchant_qualification_scope) === "SELECTED_STORES" ? (
                  <label className="block">
                    <span className="text-xs font-semibold uppercase text-slate-500">
                      Eligible child store IDs
                    </span>
                    <input
                      type="text"
                      className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm font-mono"
                      placeholder="12, 45, 88"
                      value={(Array.isArray(settings.merchant_qualification_store_ids)
                        ? (settings.merchant_qualification_store_ids as unknown[])
                        : []
                      ).join(", ")}
                      onChange={(e) => {
                        const ids = e.target.value
                          .split(/[,\s]+/)
                          .map((part) => Number(part.trim()))
                          .filter((n) => Number.isFinite(n) && n > 0);
                        setSettings({ ...settings, merchant_qualification_store_ids: ids });
                      }}
                    />
                    <span className="mt-1 block text-xs text-slate-500">
                      Numeric merchant_stores.id values. Only these stores contribute toward the
                      referred parent merchant’s progress.
                    </span>
                  </label>
                ) : null}
              </section>

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
                <label className="rounded-xl border border-slate-200 bg-white px-4 py-3">
                  <span className="text-xs font-semibold uppercase text-slate-500">
                    Merchant code prefix
                  </span>
                  <input
                    type="text"
                    className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm uppercase"
                    value={String(settings.code_prefix_merchant ?? "MX")}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        code_prefix_merchant: e.target.value.toUpperCase(),
                      })
                    }
                  />
                  <span className="mt-1 block text-xs text-slate-500">
                    Prefix for newly generated merchant codes only. Existing codes are never changed.
                  </span>
                </label>
                <label className="rounded-xl border border-slate-200 bg-white px-4 py-3">
                  <span className="text-xs font-semibold uppercase text-slate-500">
                    Milestone reward mode
                  </span>
                  <select
                    className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                    value={settings.reward_mode === "highest_only" ? "highest_only" : "incremental"}
                    onChange={(e) =>
                      setSettings({ ...settings, reward_mode: e.target.value })
                    }
                  >
                    <option value="incremental">Incremental (each milestone once)</option>
                    <option value="highest_only">Highest milestone only</option>
                  </select>
                  <span className="mt-1 block text-xs text-slate-500">
                    Incremental pays every reached milestone. Highest-only pays the top achieved tier.
                  </span>
                </label>
                <label className="rounded-xl border border-slate-200 bg-white px-4 py-3">
                  <span className="text-xs font-semibold uppercase text-slate-500">
                    Max successful referrals
                  </span>
                  <input
                    type="number"
                    min={0}
                    className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                    value={
                      settings.max_successful_referrals == null
                        ? ""
                        : String(settings.max_successful_referrals)
                    }
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        max_successful_referrals: e.target.value === "" ? null : Number(e.target.value),
                      })
                    }
                    placeholder="Unlimited"
                  />
                  <span className="mt-1 block text-xs text-slate-500">
                    Leave empty for unlimited successful referrals per referrer.
                  </span>
                </label>
                <label className="rounded-xl border border-slate-200 bg-white px-4 py-3">
                  <span className="text-xs font-semibold uppercase text-slate-500">
                    Campaign budget (₹)
                  </span>
                  <input
                    type="number"
                    min={0}
                    className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                    value={
                      settings.campaign_budget == null ? "" : String(settings.campaign_budget)
                    }
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        campaign_budget: e.target.value === "" ? null : Number(e.target.value),
                      })
                    }
                    placeholder="No campaign cap"
                  />
                  <span className="mt-1 block text-xs text-slate-500">
                    Maximum combined referrer + referred payout. Leave empty for no cap.
                    Server-enforced — concurrent credits cannot exceed this amount.
                  </span>
                  {analytics?.totals?.campaignBudget != null && (
                    <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
                      <div className="rounded-md bg-slate-50 px-2 py-1.5">
                        <p className="text-slate-500">Consumed</p>
                        <p className="font-semibold tabular-nums text-slate-800">
                          ₹{analytics.totals.campaignBudgetConsumed ?? 0}
                        </p>
                      </div>
                      <div className="rounded-md bg-slate-50 px-2 py-1.5">
                        <p className="text-slate-500">Remaining</p>
                        <p className="font-semibold tabular-nums text-slate-800">
                          ₹{analytics.totals.campaignBudgetRemaining ?? 0}
                        </p>
                      </div>
                      <div className="rounded-md bg-slate-50 px-2 py-1.5">
                        <p className="text-slate-500">Status</p>
                        <p className={`font-semibold ${analytics.totals.campaignBudgetExhausted ? "text-red-600" : "text-emerald-700"}`}>
                          {analytics.totals.campaignBudgetExhausted ? "Exhausted" : "Open"}
                        </p>
                      </div>
                    </div>
                  )}
                </label>
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
                      {rule.rule_code} · {rule.milestone_orders} orders · referrer ₹
                      {rule.reward_amount}
                      {rule.also_credit_referred
                        ? ` · referred ₹${rule.referred_reward_amount ?? rule.reward_amount}`
                        : ""}
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

          {tab === "merchant" && (
            <div className="space-y-3">
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm text-slate-500">
                  Merchant rewards are wallet credits. Configure the qualifying event and exact
                  amounts here — apps only display what the backend returns.
                </p>
                <button
                  type="button"
                  onClick={() => setRuleModal({ mode: "create", userType: "merchant" })}
                  className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-teal-600 px-3 py-2 text-sm font-semibold text-white"
                >
                  <Plus className="h-4 w-4" /> Add merchant rule
                </button>
              </div>
              {merchantRules.length === 0 ? (
                <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">
                  No merchant rules yet. Add a rule to start two-sided merchant referrals.
                </p>
              ) : null}
              {merchantRules.map((rule) => (
                <div
                  key={rule.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3"
                >
                  <div>
                    <p className="font-semibold text-slate-900">{rule.name}</p>
                    <p className="text-xs text-slate-500">
                      {rule.rule_code} · {rule.event_type || "STORE_APPROVED"}
                      {rule.milestone_orders ? ` · ${rule.milestone_orders}` : ""} · referrer ₹
                      {rule.reward_amount}
                      {rule.also_credit_referred
                        ? ` · referred ₹${rule.referred_reward_amount ?? rule.reward_amount}`
                        : ""}
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
                    "Customer / Rider / Merchant",
                    `${analytics.totals.customerReferrals} / ${analytics.totals.riderReferrals} / ${analytics.totals.merchantReferrals ?? 0}`,
                  ],
                  ["Campaign budget ₹", analytics.totals.campaignBudget ?? "Unlimited"],
                  ["Budget consumed ₹", analytics.totals.campaignBudgetConsumed ?? analytics.totals.rewardDistributed],
                  ["Budget remaining ₹", analytics.totals.campaignBudgetRemaining ?? "—"],
                  [
                    "Budget status",
                    analytics.totals.campaignBudgetExhausted ? "Exhausted" : "Open",
                  ],
                  ["Referrer rewards ₹", analytics.totals.referrerRewardAmount ?? 0],
                  ["Referred-user rewards ₹", analytics.totals.referredRewardAmount ?? 0],
                  ["Expired", analytics.totals.expiredReferrals ?? 0],
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

              {analytics.merchantParents && analytics.merchantParents.length > 0 && (
                <div>
                  <h3 className="mb-2 text-sm font-semibold text-slate-800">
                    Merchant parent referrals
                  </h3>
                  <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
                    <table className="min-w-full text-left text-sm">
                      <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                        <tr>
                          <th className="px-3 py-2">Referrer parent</th>
                          <th className="px-3 py-2">Referred parent</th>
                          <th className="px-3 py-2">Child stores</th>
                          <th className="px-3 py-2">Progress</th>
                          <th className="px-3 py-2">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {analytics.merchantParents.map((row) => (
                          <tr key={row.id} className="border-t border-slate-100">
                            <td className="px-3 py-2">{row.referrer_parent || "—"}</td>
                            <td className="px-3 py-2">{row.referred_parent || "—"}</td>
                            <td className="px-3 py-2 tabular-nums">{row.child_store_count ?? 0}</td>
                            <td className="px-3 py-2 tabular-nums">{row.completed_orders ?? 0}</td>
                            <td className="px-3 py-2">
                              {row.status}
                              {row.reward_status ? ` · ${row.reward_status}` : ""}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
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
            ? `Add ${ruleModal.userType} rule`
            : ruleModal?.mode === "edit"
              ? `Edit ${ruleModal.rule.user_type} rule`
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
