"use client";

import type { Dispatch, ReactNode, SetStateAction } from "react";
import type { GmRuleFormState } from "@/components/rules/gm-rule-form-model";
import { gmForm, GmFormSection } from "@/components/rules/gm-rule-form-ui";

type Catalogs = {
  refundRecipients: string[];
  faultBuckets: string[];
  refundFundingSources?: string[];
  merchantPenaltyRecoverySources?: string[];
  riderPenaltyRecoverySources?: string[];
  customerPenaltyRecoverySources?: string[];
};

type Props = {
  form: GmRuleFormState;
  catalogs: Catalogs | null;
  setForm: Dispatch<SetStateAction<GmRuleFormState>>;
};

function NumField({
  label,
  value,
  onChange,
  step = "0.01",
}: {
  label: string;
  value: number | null | undefined;
  onChange: (v: number | null) => void;
  step?: string;
}) {
  return (
    <label className={gmForm.label}>
      {label}
      <input
        type="number"
        step={step}
        className={gmForm.input}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
      />
    </label>
  );
}

function CheckField({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className={gmForm.check}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

function PartyCard({
  title,
  color,
  dot,
  children,
}: {
  title: string;
  color: string;
  dot: string;
  children: ReactNode;
}) {
  return (
    <div className={`${gmForm.partyCard} ${color}`}>
      <h4 className={gmForm.partyTitle}>
        <span className={`${gmForm.partyDot} ${dot}`} />
        {title}
      </h4>
      <div className={gmForm.partyGrid}>{children}</div>
    </div>
  );
}

export function GmRuleRefundSection({ form, catalogs, setForm }: Props) {
  const setRefund = (patch: Partial<GmRuleFormState["refund"]>) =>
    setForm((f) => ({ ...f, refund: { ...f.refund, ...patch } }));

  return (
    <GmFormSection
      title="Refund configuration"
      hint="Who receives the refund and how much of the order value is returned."
    >
      <div className={gmForm.grid3}>
        <CheckField
          label="Refund allowed"
          checked={form.refund.refund_allowed}
          onChange={(v) => setRefund({ refund_allowed: v })}
        />
        <CheckField
          label="Item-level refund"
          checked={form.refund.item_level_refund}
          onChange={(v) => setRefund({ item_level_refund: v })}
        />
        <CheckField
          label="Approval required"
          checked={form.refund.refund_approval_required}
          onChange={(v) => setRefund({ refund_approval_required: v })}
        />
        <CheckField
          label="Auto refund"
          checked={form.refund.auto_refund}
          onChange={(v) => setRefund({ auto_refund: v })}
        />
        <NumField
          label="Customer refund %"
          value={form.refund.refund_pct}
          onChange={(v) => setRefund({ refund_pct: v })}
        />
        <NumField
          label="Flat refund amount (₹)"
          value={form.refund.refund_flat_amount}
          onChange={(v) => setRefund({ refund_flat_amount: v })}
        />
        <label className={gmForm.label}>
          Refund recipient
          <select
            className={gmForm.input}
            value={form.refund.refund_recipient}
            onChange={(e) => setRefund({ refund_recipient: e.target.value })}
          >
            {(catalogs?.refundRecipients ?? ["ORIGINAL_SOURCE"]).map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </label>
      </div>
    </GmFormSection>
  );
}

export function GmRuleFaultSection({ form, catalogs, setForm }: Props) {
  const setFault = (patch: Partial<GmRuleFormState["fault"]>) =>
    setForm((f) => ({ ...f, fault: { ...f.fault, ...patch } }));
  const setLiability = (patch: Partial<GmRuleFormState["liability"]>) =>
    setForm((f) => ({ ...f, liability: { ...f.liability, ...patch } }));

  return (
    <GmFormSection title="Fault & shared liability">
      <div className={gmForm.grid3}>
        <label className={gmForm.label}>
          Fault bucket
          <select
            className={gmForm.input}
            value={form.fault.fault_bucket}
            onChange={(e) => setFault({ fault_bucket: e.target.value })}
          >
            {(catalogs?.faultBuckets ?? []).map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <NumField
          label="Customer fault %"
          value={form.fault.customer_pct}
          onChange={(v) => setFault({ customer_pct: v ?? 0 })}
        />
        <NumField
          label="Merchant fault %"
          value={form.fault.merchant_pct}
          onChange={(v) => setFault({ merchant_pct: v ?? 0 })}
        />
        <NumField
          label="Rider fault %"
          value={form.fault.rider_pct}
          onChange={(v) => setFault({ rider_pct: v ?? 0 })}
        />
        <NumField
          label="Platform fault %"
          value={form.fault.platform_pct}
          onChange={(v) => setFault({ platform_pct: v ?? 0 })}
        />
        <NumField
          label="GatiMitra fault %"
          value={form.fault.gatimitra_pct}
          onChange={(v) => setFault({ gatimitra_pct: v ?? 0 })}
        />
      </div>
      <p className={`${gmForm.sectionHint} mt-2`}>Liability distribution (must sum to 100%)</p>
      <div className={gmForm.grid3}>
        <CheckField
          label="Platform bears loss"
          checked={form.liability.platform_bears_loss}
          onChange={(v) => setLiability({ platform_bears_loss: v })}
        />
        <NumField
          label="Customer liability %"
          value={form.liability.customer_liability_pct}
          onChange={(v) => setLiability({ customer_liability_pct: v ?? 0 })}
        />
        <NumField
          label="Merchant liability %"
          value={form.liability.merchant_liability_pct}
          onChange={(v) => setLiability({ merchant_liability_pct: v ?? 0 })}
        />
        <NumField
          label="Rider liability %"
          value={form.liability.rider_liability_pct}
          onChange={(v) => setLiability({ rider_liability_pct: v ?? 0 })}
        />
        <NumField
          label="GatiMitra liability %"
          value={form.liability.gatimitra_liability_pct}
          onChange={(v) => setLiability({ gatimitra_liability_pct: v ?? 0 })}
        />
      </div>
    </GmFormSection>
  );
}

export function GmRuleFinancialMatrixSection({ form, setForm }: Omit<Props, "catalogs">) {
  const setMerchant = (patch: Partial<GmRuleFormState["merchant"]>) =>
    setForm((f) => ({ ...f, merchant: { ...f.merchant, ...patch } }));
  const setRider = (patch: Partial<GmRuleFormState["rider"]>) =>
    setForm((f) => ({ ...f, rider: { ...f.rider, ...patch } }));
  const setCustomer = (patch: Partial<GmRuleFormState["customer_penalty"]>) =>
    setForm((f) => ({ ...f, customer_penalty: { ...f.customer_penalty, ...patch } }));
  const setPlatform = (patch: Partial<GmRuleFormState["liability"]>) =>
    setForm((f) => ({ ...f, liability: { ...f.liability, ...patch } }));

  return (
    <GmFormSection
      title="Financial responsibility matrix"
      hint="Who pays, receives settlement, penalties, and compensation."
    >
      <div className={gmForm.matrixGrid}>
        <PartyCard title="Customer" color="border-blue-200/80 bg-blue-50/50" dot="bg-blue-500">
          <NumField
            label="Compensation %"
            value={form.customer_penalty.customer_compensation_pct}
            onChange={(v) => setCustomer({ customer_compensation_pct: v })}
          />
          <NumField
            label="Compensation amount (₹)"
            value={form.customer_penalty.customer_compensation_flat}
            onChange={(v) => setCustomer({ customer_compensation_flat: v })}
          />
          <NumField
            label="Penalty %"
            value={form.customer_penalty.customer_penalty_pct}
            onChange={(v) => setCustomer({ customer_penalty_pct: v })}
          />
          <NumField
            label="Flat penalty (₹)"
            value={form.customer_penalty.customer_flat_penalty}
            onChange={(v) => setCustomer({ customer_flat_penalty: v })}
          />
        </PartyCard>

        <PartyCard title="Merchant" color="border-emerald-200/80 bg-emerald-50/50" dot="bg-emerald-500">
          <NumField
            label="Settlement %"
            value={form.merchant.merchant_receives_pct}
            onChange={(v) => setMerchant({ merchant_receives_pct: v })}
          />
          <NumField
            label="Compensation %"
            value={form.merchant.merchant_compensation_pct}
            onChange={(v) => setMerchant({ merchant_compensation_pct: v })}
          />
          <NumField
            label="Compensation amount (₹)"
            value={form.merchant.merchant_compensation_flat}
            onChange={(v) => setMerchant({ merchant_compensation_flat: v })}
          />
          <NumField
            label="Penalty %"
            value={form.merchant.merchant_penalty_pct}
            onChange={(v) => setMerchant({ merchant_penalty_pct: v })}
          />
          <NumField
            label="Flat penalty (₹)"
            value={form.merchant.merchant_flat_penalty}
            onChange={(v) => setMerchant({ merchant_flat_penalty: v })}
          />
          <CheckField
            label="Settlement hold"
            checked={form.merchant.settlement_hold}
            onChange={(v) => setMerchant({ settlement_hold: v })}
          />
          <NumField
            label="Hold hours"
            value={form.merchant.settlement_hold_hours}
            onChange={(v) => setMerchant({ settlement_hold_hours: v ?? 0 })}
          />
        </PartyCard>

        <PartyCard title="Rider" color="border-amber-200/80 bg-amber-50/50" dot="bg-amber-500">
          <NumField
            label="Settlement %"
            value={form.rider.rider_receives_pct}
            onChange={(v) => setRider({ rider_receives_pct: v })}
          />
          <NumField
            label="Compensation %"
            value={form.rider.rider_compensation_pct}
            onChange={(v) => setRider({ rider_compensation_pct: v })}
          />
          <NumField
            label="Compensation amount (₹)"
            value={form.rider.rider_compensation_flat}
            onChange={(v) => setRider({ rider_compensation_flat: v })}
          />
          <NumField
            label="Penalty %"
            value={form.rider.rider_penalty_pct}
            onChange={(v) => setRider({ rider_penalty_pct: v })}
          />
          <NumField
            label="Flat penalty (₹)"
            value={form.rider.rider_flat_penalty}
            onChange={(v) => setRider({ rider_flat_penalty: v })}
          />
          <CheckField
            label="Settlement hold"
            checked={form.rider.settlement_hold}
            onChange={(v) => setRider({ settlement_hold: v })}
          />
        </PartyCard>

        <PartyCard title="GatiMitra (Platform)" color="border-violet-200/80 bg-violet-50/50" dot="bg-violet-500">
          <NumField
            label="Platform liability %"
            value={form.liability.gatimitra_liability_pct}
            onChange={(v) => setPlatform({ gatimitra_liability_pct: v ?? 0 })}
          />
          <NumField
            label="Platform compensation (₹)"
            value={form.liability.platform_compensation_flat}
            onChange={(v) => setPlatform({ platform_compensation_flat: v })}
          />
          <NumField
            label="Absorbed loss %"
            value={form.liability.platform_absorbed_loss_pct}
            onChange={(v) => setPlatform({ platform_absorbed_loss_pct: v ?? 0 })}
          />
          <NumField
            label="Settlement impact %"
            value={form.liability.platform_settlement_impact_pct}
            onChange={(v) => setPlatform({ platform_settlement_impact_pct: v ?? 0 })}
          />
        </PartyCard>
      </div>
    </GmFormSection>
  );
}

export function GmRuleFundingRecoverySection({ form, catalogs, setForm }: Props) {
  const setFunding = (patch: Partial<GmRuleFormState["funding"]>) =>
    setForm((f) => ({ ...f, funding: { ...f.funding, ...patch } }));

  const liabilitySum =
    form.liability.customer_liability_pct +
    form.liability.merchant_liability_pct +
    form.liability.rider_liability_pct +
    form.liability.gatimitra_liability_pct;

  const fundingSplitSum =
    form.funding.refund_fund_merchant_pct +
    form.funding.refund_fund_rider_pct +
    form.funding.refund_fund_platform_pct +
    form.funding.refund_fund_customer_pct;

  return (
    <GmFormSection
      title="Refund funding & penalty recovery"
      hint="Wallet/balance funding for refunds and penalty recovery sources. Split must equal 100% for shared pool."
    >
      <div className={gmForm.grid3}>
        <label className={`${gmForm.label} col-span-2 md:col-span-3 lg:col-span-4 xl:col-span-5`}>
          Refund funding source
          <select
            className={gmForm.input}
            value={form.funding.refund_funding_source}
            onChange={(e) => setFunding({ refund_funding_source: e.target.value })}
          >
            {(catalogs?.refundFundingSources ?? ["SHARED_LIABILITY_POOL"]).map((v) => (
              <option key={v} value={v}>
                {v.replace(/_/g, " ")}
              </option>
            ))}
          </select>
        </label>

        {form.funding.refund_funding_source === "SHARED_LIABILITY_POOL" && (
          <>
            <NumField
              label="Merchant funds refund %"
              value={form.funding.refund_fund_merchant_pct}
              onChange={(v) => setFunding({ refund_fund_merchant_pct: v ?? 0 })}
            />
            <NumField
              label="Rider funds refund %"
              value={form.funding.refund_fund_rider_pct}
              onChange={(v) => setFunding({ refund_fund_rider_pct: v ?? 0 })}
            />
            <NumField
              label="GatiMitra funds refund %"
              value={form.funding.refund_fund_platform_pct}
              onChange={(v) => setFunding({ refund_fund_platform_pct: v ?? 0 })}
            />
            <NumField
              label="Customer funds refund %"
              value={form.funding.refund_fund_customer_pct}
              onChange={(v) => setFunding({ refund_fund_customer_pct: v ?? 0 })}
            />
            <p
              className={`col-span-2 md:col-span-3 lg:col-span-4 xl:col-span-5 text-[11px] ${Math.round(fundingSplitSum) === 100 ? "text-emerald-700" : "text-red-700"}`}
            >
              Refund funding split total: {fundingSplitSum.toFixed(2)}% (must be 100%)
            </p>
          </>
        )}

        <label className={gmForm.label}>
          Merchant penalty recovery
          <select
            className={gmForm.input}
            value={form.funding.merchant_penalty_recovery_source}
            onChange={(e) => setFunding({ merchant_penalty_recovery_source: e.target.value })}
          >
            {(catalogs?.merchantPenaltyRecoverySources ?? ["MERCHANT_WALLET"]).map((v) => (
              <option key={v} value={v}>
                {v.replace(/_/g, " ")}
              </option>
            ))}
          </select>
        </label>
        <label className={gmForm.label}>
          Rider penalty recovery
          <select
            className={gmForm.input}
            value={form.funding.rider_penalty_recovery_source}
            onChange={(e) => setFunding({ rider_penalty_recovery_source: e.target.value })}
          >
            {(catalogs?.riderPenaltyRecoverySources ?? ["RIDER_WALLET"]).map((v) => (
              <option key={v} value={v}>
                {v.replace(/_/g, " ")}
              </option>
            ))}
          </select>
        </label>
        <label className={gmForm.label}>
          Customer penalty recovery
          <select
            className={gmForm.input}
            value={form.funding.customer_penalty_recovery_source}
            onChange={(e) => setFunding({ customer_penalty_recovery_source: e.target.value })}
          >
            {(catalogs?.customerPenaltyRecoverySources ?? ["CUSTOMER_WALLET"]).map((v) => (
              <option key={v} value={v}>
                {v.replace(/_/g, " ")}
              </option>
            ))}
          </select>
        </label>
      </div>

      <p
        className={`mt-2 text-[11px] ${Math.round(liabilitySum) === 100 ? "text-emerald-700" : "text-red-700"}`}
      >
        Liability distribution total: {liabilitySum.toFixed(2)}% (Customer + Merchant + Rider + Platform must =
        100%)
      </p>
    </GmFormSection>
  );
}

export function GmRuleWalletImpactSection({ form, setForm }: Omit<Props, "catalogs">) {
  const setCustomer = (patch: Partial<GmRuleFormState["customer_penalty"]>) =>
    setForm((f) => ({ ...f, customer_penalty: { ...f.customer_penalty, ...patch } }));
  const setMerchant = (patch: Partial<GmRuleFormState["merchant"]>) =>
    setForm((f) => ({ ...f, merchant: { ...f.merchant, ...patch } }));
  const setRider = (patch: Partial<GmRuleFormState["rider"]>) =>
    setForm((f) => ({ ...f, rider: { ...f.rider, ...patch } }));
  const setFunding = (patch: Partial<GmRuleFormState["funding"]>) =>
    setForm((f) => ({ ...f, funding: { ...f.funding, ...patch } }));

  return (
    <GmFormSection
      title="Wallet impact"
      hint="Gate wallet debits/credits on execution. Ledger entries are always recorded."
    >
      <div className={gmForm.matrixGrid}>
        <PartyCard title="Customer wallet" color="border-blue-200/80 bg-blue-50/40" dot="bg-blue-500">
          <CheckField
            label="Wallet debit"
            checked={form.customer_penalty.customer_wallet_debit}
            onChange={(v) => setCustomer({ customer_wallet_debit: v })}
          />
          <CheckField
            label="Wallet credit"
            checked={form.customer_penalty.customer_wallet_credit}
            onChange={(v) => setCustomer({ customer_wallet_credit: v })}
          />
        </PartyCard>
        <PartyCard title="Merchant wallet" color="border-emerald-200/80 bg-emerald-50/40" dot="bg-emerald-500">
          <CheckField
            label="Wallet debit"
            checked={form.merchant.merchant_wallet_debit}
            onChange={(v) => setMerchant({ merchant_wallet_debit: v })}
          />
          <CheckField
            label="Wallet credit"
            checked={form.merchant.merchant_wallet_credit}
            onChange={(v) => setMerchant({ merchant_wallet_credit: v })}
          />
        </PartyCard>
        <PartyCard title="Rider wallet" color="border-amber-200/80 bg-amber-50/40" dot="bg-amber-500">
          <CheckField
            label="Wallet debit"
            checked={form.rider.rider_wallet_debit}
            onChange={(v) => setRider({ rider_wallet_debit: v })}
          />
          <CheckField
            label="Wallet credit"
            checked={form.rider.rider_wallet_credit}
            onChange={(v) => setRider({ rider_wallet_credit: v })}
          />
        </PartyCard>
        <PartyCard title="Platform wallet" color="border-violet-200/80 bg-violet-50/40" dot="bg-violet-500">
          <CheckField
            label="Wallet debit"
            checked={form.funding.platform_wallet_debit}
            onChange={(v) => setFunding({ platform_wallet_debit: v })}
          />
          <CheckField
            label="Wallet credit"
            checked={form.funding.platform_wallet_credit}
            onChange={(v) => setFunding({ platform_wallet_credit: v })}
          />
        </PartyCard>
      </div>
    </GmFormSection>
  );
}

export function GmRuleLimitsWalletSection({ form, setForm }: Omit<Props, "catalogs">) {
  const setLimits = (patch: Partial<GmRuleFormState["limits"]>) =>
    setForm((f) => ({ ...f, limits: { ...f.limits, ...patch } }));
  const setAuto = (patch: Partial<GmRuleFormState["auto_actions"]>) =>
    setForm((f) => ({ ...f, auto_actions: { ...f.auto_actions, ...patch } }));

  return (
    <>
      <GmFormSection title="Financial limits">
        <div className={gmForm.grid4}>
          <NumField
            label="Min refund (₹)"
            value={form.limits.min_refund_amount}
            onChange={(v) => setLimits({ min_refund_amount: v })}
          />
          <NumField
            label="Max refund (₹)"
            value={form.limits.max_refund_amount}
            onChange={(v) => setLimits({ max_refund_amount: v })}
          />
          <NumField
            label="Max penalty (₹)"
            value={form.limits.max_penalty_amount}
            onChange={(v) => setLimits({ max_penalty_amount: v })}
          />
          <NumField
            label="Max compensation (₹)"
            value={form.limits.max_compensation_amount}
            onChange={(v) => setLimits({ max_compensation_amount: v })}
          />
        </div>
      </GmFormSection>

      <GmFormSection title="Auto actions">
        <div className="flex flex-wrap gap-x-4 gap-y-2">
          {(
            [
              ["auto_wallet_adjustment", "Apply wallet adjustments"],
              ["auto_notification", "Send notifications"],
              ["auto_ticket_creation", "Create support ticket"],
              ["auto_fraud_review", "Flag for fraud review"],
              ["auto_settlement_recalc", "Recalculate settlement"],
            ] as const
          ).map(([key, label]) => (
            <CheckField
              key={key}
              label={label}
              checked={form.auto_actions[key]}
              onChange={(v) => setAuto({ [key]: v })}
            />
          ))}
        </div>
      </GmFormSection>
    </>
  );
}
