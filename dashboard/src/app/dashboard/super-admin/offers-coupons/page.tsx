"use client";

import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { Layers, Sparkles, Tag } from "lucide-react";
import {
  useCreateBillingDiscountMutation,
  useCreateBillingPlatformOfferMutation,
  useDeleteBillingDiscountMutation,
  useDeleteBillingPlatformOfferMutation,
  useGetBillingDiscountsQuery,
  useGetBillingPlatformOffersQuery,
  useUpdateBillingDiscountMutation,
  useUpdateBillingPlatformOfferMutation,
} from "@/store/api/billingAdminApi";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { cn } from "@/lib/utils";

const cardCls =
  "rounded-2xl border border-slate-200/80 bg-white p-6 text-slate-900 shadow-[0_4px_24px_-4px_rgba(15,23,42,0.08)] ring-1 ring-slate-900/[0.03] sm:p-8";

const controlCls =
  "w-full min-h-[42px] rounded-lg border border-slate-200/90 bg-slate-50/40 px-3 py-2.5 text-sm text-slate-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.6)] transition-[border-color,box-shadow,background-color] placeholder:text-slate-400 focus:border-indigo-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20";

const selectCls = cn(controlCls, "cursor-pointer");

function FormField({
  label,
  hint,
  htmlFor,
  children,
  className,
}: {
  label: string;
  hint?: string;
  htmlFor?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={htmlFor} className="text-[13px] font-medium leading-none text-slate-700">
        {label}
      </label>
      {children}
      {hint ? <p className="text-xs leading-relaxed text-slate-500">{hint}</p> : null}
    </div>
  );
}

function FormSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-4 border-b border-slate-100 pb-6 last:border-0 last:pb-0">
      <div>
        <h3 className="text-sm font-semibold tracking-tight text-slate-900">{title}</h3>
        {description ? <p className="mt-1 text-xs text-slate-500">{description}</p> : null}
      </div>
      {children}
    </div>
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
  accent,
}: {
  label: string;
  value: number;
  icon: typeof Tag;
  accent: "indigo" | "emerald" | "violet";
}) {
  const accentRing =
    accent === "indigo"
      ? "from-indigo-500/15 to-violet-500/10"
      : accent === "emerald"
        ? "from-emerald-500/15 to-teal-500/10"
        : "from-violet-500/15 to-fuchsia-500/10";
  const iconBg =
    accent === "indigo"
      ? "bg-indigo-500/10 text-indigo-600"
      : accent === "emerald"
        ? "bg-emerald-500/10 text-emerald-600"
        : "bg-violet-500/10 text-violet-600";

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl border border-slate-200/70 bg-gradient-to-br p-5 shadow-sm ring-1 ring-slate-900/[0.04]",
        "from-white to-slate-50/90",
      )}
    >
      <div
        className={cn("pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full bg-gradient-to-br blur-2xl", accentRing)}
        aria-hidden
      />
      <div className="relative flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-slate-500">{label}</p>
          <p className="mt-2 text-3xl font-semibold tabular-nums tracking-tight text-slate-900">{value}</p>
        </div>
        <div className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-xl", iconBg)}>
          <Icon className="h-5 w-5" strokeWidth={1.75} aria-hidden />
        </div>
      </div>
    </div>
  );
}

function parseCsvIds(v: string): number[] {
  return v
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isInteger(n) && n > 0);
}

function parseCsvStrings(v: string): string[] {
  return v
    .split(",")
    .map((s) => s.trim())
    .filter((x) => x.length > 0);
}

export default function OffersCouponsPage() {
  const { data: offers = [], isLoading: offersLoading } = useGetBillingPlatformOffersQuery();
  const { data: coupons = [], isLoading: couponsLoading } = useGetBillingDiscountsQuery();
  const [createOffer, createOfferState] = useCreateBillingPlatformOfferMutation();
  const [updateOffer, updateOfferState] = useUpdateBillingPlatformOfferMutation();
  const [deleteOffer, deleteOfferState] = useDeleteBillingPlatformOfferMutation();
  const [createCoupon, createCouponState] = useCreateBillingDiscountMutation();
  const [updateCoupon, updateCouponState] = useUpdateBillingDiscountMutation();
  const [deleteCoupon, deleteCouponState] = useDeleteBillingDiscountMutation();

  const [editingOfferId, setEditingOfferId] = useState<number | null>(null);
  const [editingCouponId, setEditingCouponId] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const [offerForm, setOfferForm] = useState({
    name: "",
    service_type: "FOOD",
    offer_kind: "DISCOUNT",
    funding_mode: "PLATFORM_ONLY",
    platform_share_pct: "100",
    merchant_share_pct: "0",
    target_scope: "GLOBAL",
    geo_level: "state",
    geo_ids_csv: "",
    merchant_ids_csv: "",
    customer_segment: "ALL",
    starts_at: "",
    ends_at: "",
    min_order_amount: "",
    max_discount_amount: "",
    budget_total: "",
    is_stackable: false,
    discount_type: "PERCENTAGE",
    value_numeric: "",
    delivery_discount_type: "",
    delivery_discount_value: "",
    city: "",
    min_order_value: "",
    user_segment: "ALL",
    priority: "0",
    is_active: true,
    is_hidden: false,
  });

  const [couponForm, setCouponForm] = useState({
    code: "",
    discount_type: "PERCENTAGE",
    value_numeric: "",
    max_discount_cap: "",
    usage_limit: "",
    is_active: true,
    is_hidden: false,
  });

  const saveOffer = async () => {
    setErr(null);
    const payload: Record<string, unknown> = {
      name: offerForm.name || null,
      service_type: offerForm.service_type,
      offer_kind: offerForm.offer_kind,
      funding_mode: offerForm.funding_mode,
      platform_share_pct: Number(offerForm.platform_share_pct || "100"),
      merchant_share_pct: Number(offerForm.merchant_share_pct || "0"),
      target_scope: offerForm.target_scope,
      geo_level: offerForm.target_scope === "GLOBAL" ? null : offerForm.geo_level,
      geo_ids: offerForm.target_scope === "GLOBAL" ? [] : parseCsvStrings(offerForm.geo_ids_csv),
      merchant_ids:
        offerForm.target_scope === "MERCHANT" || offerForm.target_scope === "GEO_MERCHANT"
          ? parseCsvIds(offerForm.merchant_ids_csv)
          : [],
      customer_segment: offerForm.customer_segment,
      starts_at: offerForm.starts_at ? new Date(offerForm.starts_at).toISOString() : null,
      ends_at: offerForm.ends_at ? new Date(offerForm.ends_at).toISOString() : null,
      min_order_amount: offerForm.min_order_amount ? Number(offerForm.min_order_amount) : null,
      max_discount_amount: offerForm.max_discount_amount ? Number(offerForm.max_discount_amount) : null,
      budget_total: offerForm.budget_total ? Number(offerForm.budget_total) : null,
      is_stackable: offerForm.is_stackable,
      discount_type: offerForm.discount_type,
      value_numeric: offerForm.value_numeric || null,
      delivery_discount_type: offerForm.delivery_discount_type || null,
      delivery_discount_value: offerForm.delivery_discount_value || null,
      priority: Number(offerForm.priority || 0),
      is_active: offerForm.is_active,
      is_hidden: offerForm.is_hidden,
      conditions: {
        city: offerForm.city || undefined,
        min_order_value: offerForm.min_order_value ? Number(offerForm.min_order_value) : undefined,
        user_segment: offerForm.user_segment,
      },
    };
    try {
      if (editingOfferId != null) {
        await updateOffer({ id: editingOfferId, body: payload }).unwrap();
      } else {
        await createOffer(payload).unwrap();
      }
      setEditingOfferId(null);
      setOfferForm({
        name: "",
        service_type: "FOOD",
        offer_kind: "DISCOUNT",
        funding_mode: "PLATFORM_ONLY",
        platform_share_pct: "100",
        merchant_share_pct: "0",
        target_scope: "GLOBAL",
        geo_level: "state",
        geo_ids_csv: "",
        merchant_ids_csv: "",
        customer_segment: "ALL",
        starts_at: "",
        ends_at: "",
        min_order_amount: "",
        max_discount_amount: "",
        budget_total: "",
        is_stackable: false,
        discount_type: "PERCENTAGE",
        value_numeric: "",
        delivery_discount_type: "",
        delivery_discount_value: "",
        city: "",
        min_order_value: "",
        user_segment: "ALL",
        priority: "0",
        is_active: true,
        is_hidden: false,
      });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to save offer");
    }
  };

  const saveCoupon = async () => {
    setErr(null);
    const payload: Record<string, unknown> = {
      code: couponForm.code.trim().toUpperCase(),
      discount_type: couponForm.discount_type,
      value_numeric: couponForm.value_numeric || null,
      max_discount_cap: couponForm.max_discount_cap || null,
      usage_limit: couponForm.usage_limit ? Number(couponForm.usage_limit) : null,
      is_active: couponForm.is_active,
      is_hidden: couponForm.is_hidden,
    };
    try {
      if (editingCouponId != null) {
        await updateCoupon({ id: editingCouponId, body: payload }).unwrap();
      } else {
        await createCoupon(payload).unwrap();
      }
      setEditingCouponId(null);
      setCouponForm({
        code: "",
        discount_type: "PERCENTAGE",
        value_numeric: "",
        max_discount_cap: "",
        usage_limit: "",
        is_active: true,
        is_hidden: false,
      });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to save coupon");
    }
  };

  const busy =
    createOfferState.isLoading ||
    updateOfferState.isLoading ||
    deleteOfferState.isLoading ||
    createCouponState.isLoading ||
    updateCouponState.isLoading ||
    deleteCouponState.isLoading;

  const offerStats = useMemo(() => {
    const total = offers.length;
    const active = offers.filter((o) => o.is_active).length;
    const hybrid = offers.filter((o) => o.funding_mode === "HYBRID").length;
    return { total, active, hybrid };
  }, [offers]);

  const checkboxCls =
    "h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500/30";

  return (
    <div className="mx-auto min-h-screen max-w-7xl space-y-8 bg-gradient-to-b from-slate-50/80 to-white p-4 pb-12 text-slate-900 sm:p-6 sm:pb-16">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-indigo-600/90">Super Admin</p>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">Offers & coupons</h1>
          <p className="max-w-2xl text-sm leading-relaxed text-slate-600">
            Configure platform and hybrid offers. Merchant-portal offers are managed separately.
          </p>
        </div>
        <Link
          href="/dashboard/super-admin"
          className="inline-flex shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
        >
          ← Back to Super Admin
        </Link>
      </header>

      {err ? (
        <div
          className="rounded-xl border border-red-200/90 bg-red-50/90 px-4 py-3 text-sm text-red-800 shadow-sm ring-1 ring-red-900/5"
          role="alert"
        >
          {err}
        </div>
      ) : null}

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Total offers" value={offerStats.total} icon={Tag} accent="indigo" />
        <StatCard label="Active offers" value={offerStats.active} icon={Sparkles} accent="emerald" />
        <StatCard label="Hybrid offers" value={offerStats.hybrid} icon={Layers} accent="violet" />
      </section>

      <section className={cardCls}>
        <div className="mb-6 flex flex-col gap-2 border-b border-slate-100 pb-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold tracking-tight text-slate-900">Offer builder</h2>
            <p className="mt-1 text-sm text-slate-500">Define how the offer applies, who sees it, and discount rules.</p>
          </div>
          {editingOfferId != null ? (
            <span className="inline-flex w-fit items-center rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-800 ring-1 ring-amber-200/80">
              Editing offer #{editingOfferId}
            </span>
          ) : null}
        </div>

        <div className="space-y-8">
          <FormSection title="Identity & type" description="Name and classification shown in reporting and eligibility.">
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              <FormField label="Offer name" htmlFor="offer-name" hint="Short internal or customer-facing title.">
                <input
                  id="offer-name"
                  className={controlCls}
                  placeholder="e.g. Flat ₹100 off weekends"
                  value={offerForm.name}
                  onChange={(e) => setOfferForm((f) => ({ ...f, name: e.target.value }))}
                />
              </FormField>
              <FormField label="Service type" htmlFor="offer-service" hint="Which vertical this offer applies to.">
                <select
                  id="offer-service"
                  className={selectCls}
                  value={offerForm.service_type}
                  onChange={(e) => setOfferForm((f) => ({ ...f, service_type: e.target.value }))}
                >
                  {["FOOD", "PARCEL", "RIDE", "ALL"].map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              </FormField>
              <FormField label="Offer kind" htmlFor="offer-kind" hint="Mechanism: discount, delivery, cashback, etc.">
                <select
                  id="offer-kind"
                  className={selectCls}
                  value={offerForm.offer_kind}
                  onChange={(e) => setOfferForm((f) => ({ ...f, offer_kind: e.target.value }))}
                >
                  {["DISCOUNT", "FREE_DELIVERY", "FLAT_DISCOUNT", "BUY_X_GET_Y", "CASHBACK", "COUPON"].map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              </FormField>
              <FormField label="Funding mode" htmlFor="offer-funding" hint="Platform-only vs shared cost with merchants.">
                <select
                  id="offer-funding"
                  className={selectCls}
                  value={offerForm.funding_mode}
                  onChange={(e) => setOfferForm((f) => ({ ...f, funding_mode: e.target.value }))}
                >
                  {["PLATFORM_ONLY", "HYBRID"].map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              </FormField>
            </div>
          </FormSection>

          <FormSection
            title="Funding split"
            description="Percentages should sum to 100 when using hybrid funding."
          >
            <div className="grid gap-5 sm:grid-cols-2">
              <FormField label="Platform share (%)" htmlFor="offer-platform-pct" hint="Share of discount funded by the platform.">
                <input
                  id="offer-platform-pct"
                  className={controlCls}
                  inputMode="decimal"
                  placeholder="100"
                  value={offerForm.platform_share_pct}
                  onChange={(e) => setOfferForm((f) => ({ ...f, platform_share_pct: e.target.value }))}
                />
              </FormField>
              <FormField label="Merchant share (%)" htmlFor="offer-merchant-pct" hint="Share funded by the merchant (hybrid).">
                <input
                  id="offer-merchant-pct"
                  className={controlCls}
                  inputMode="decimal"
                  placeholder="0"
                  value={offerForm.merchant_share_pct}
                  onChange={(e) => setOfferForm((f) => ({ ...f, merchant_share_pct: e.target.value }))}
                />
              </FormField>
            </div>
          </FormSection>

          <FormSection title="Targeting" description="Limit the offer by geography, merchants, or customer segment.">
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              <FormField label="Target scope" htmlFor="offer-scope" hint="GLOBAL = everywhere; narrow with GEO or merchant lists.">
                <select
                  id="offer-scope"
                  className={selectCls}
                  value={offerForm.target_scope}
                  onChange={(e) => setOfferForm((f) => ({ ...f, target_scope: e.target.value }))}
                >
                  {["GLOBAL", "GEO", "MERCHANT", "GEO_MERCHANT"].map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              </FormField>
              <FormField
                label="Geo level"
                htmlFor="offer-geo-level"
                hint="Hierarchy level for geo IDs when scope includes GEO."
              >
                <select
                  id="offer-geo-level"
                  className={selectCls}
                  value={offerForm.geo_level}
                  onChange={(e) => setOfferForm((f) => ({ ...f, geo_level: e.target.value }))}
                  disabled={offerForm.target_scope === "GLOBAL"}
                >
                  {["state", "region", "district", "division", "post_office", "pincode"].map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              </FormField>
              <FormField
                label="Geo IDs"
                htmlFor="offer-geo-ids"
                hint="Comma-separated location UUIDs (when not GLOBAL)."
                className="lg:col-span-2"
              >
                <input
                  id="offer-geo-ids"
                  className={cn(controlCls, offerForm.target_scope === "GLOBAL" && "opacity-60")}
                  placeholder="uuid-1, uuid-2, …"
                  value={offerForm.geo_ids_csv}
                  onChange={(e) => setOfferForm((f) => ({ ...f, geo_ids_csv: e.target.value }))}
                  disabled={offerForm.target_scope === "GLOBAL"}
                />
              </FormField>
              <FormField
                label="Merchant IDs"
                htmlFor="offer-merchant-ids"
                hint="Comma-separated numeric IDs for MERCHANT / GEO_MERCHANT scopes."
                className="lg:col-span-2"
              >
                <input
                  id="offer-merchant-ids"
                  className={cn(
                    controlCls,
                    offerForm.target_scope !== "MERCHANT" && offerForm.target_scope !== "GEO_MERCHANT" && "opacity-60",
                  )}
                  placeholder="e.g. 12, 34, 56"
                  value={offerForm.merchant_ids_csv}
                  onChange={(e) => setOfferForm((f) => ({ ...f, merchant_ids_csv: e.target.value }))}
                  disabled={offerForm.target_scope !== "MERCHANT" && offerForm.target_scope !== "GEO_MERCHANT"}
                />
              </FormField>
              <FormField label="Customer segment" htmlFor="offer-segment" hint="New vs existing users, or all.">
                <select
                  id="offer-segment"
                  className={selectCls}
                  value={offerForm.customer_segment}
                  onChange={(e) => setOfferForm((f) => ({ ...f, customer_segment: e.target.value }))}
                >
                  {["ALL", "NEW", "EXISTING"].map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              </FormField>
            </div>
          </FormSection>

          <FormSection title="Order thresholds" description="Optional cart rules before the offer applies.">
            <div className="grid gap-5 sm:grid-cols-2">
              <FormField label="Minimum order amount" htmlFor="offer-min-order" hint="Leave empty for no minimum.">
                <input
                  id="offer-min-order"
                  className={controlCls}
                  inputMode="decimal"
                  placeholder="Amount in your billing currency"
                  value={offerForm.min_order_amount}
                  onChange={(e) => setOfferForm((f) => ({ ...f, min_order_amount: e.target.value }))}
                />
              </FormField>
              <FormField label="Maximum discount cap" htmlFor="offer-max-discount" hint="Upper bound on discount amount.">
                <input
                  id="offer-max-discount"
                  className={controlCls}
                  inputMode="decimal"
                  placeholder="Optional cap"
                  value={offerForm.max_discount_amount}
                  onChange={(e) => setOfferForm((f) => ({ ...f, max_discount_amount: e.target.value }))}
                />
              </FormField>
            </div>
          </FormSection>

          <FormSection title="Schedule & budget" description="When the offer is valid and optional spend limits.">
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              <FormField label="Starts at" htmlFor="offer-starts" hint="Local date and time when the offer goes live.">
                <input
                  id="offer-starts"
                  className={controlCls}
                  type="datetime-local"
                  value={offerForm.starts_at}
                  onChange={(e) => setOfferForm((f) => ({ ...f, starts_at: e.target.value }))}
                />
              </FormField>
              <FormField label="Ends at" htmlFor="offer-ends" hint="Optional end; leave empty for open-ended.">
                <input
                  id="offer-ends"
                  className={controlCls}
                  type="datetime-local"
                  value={offerForm.ends_at}
                  onChange={(e) => setOfferForm((f) => ({ ...f, ends_at: e.target.value }))}
                />
              </FormField>
              <FormField label="Campaign budget (total)" htmlFor="offer-budget" hint="Optional total promotional budget.">
                <input
                  id="offer-budget"
                  className={controlCls}
                  inputMode="decimal"
                  placeholder="Optional"
                  value={offerForm.budget_total}
                  onChange={(e) => setOfferForm((f) => ({ ...f, budget_total: e.target.value }))}
                />
              </FormField>
            </div>
          </FormSection>

          <FormSection title="Discount rules" description="Main discount and optional delivery fee reduction.">
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              <FormField label="Discount type" htmlFor="offer-discount-type" hint="Percentage off vs fixed amount.">
                <select
                  id="offer-discount-type"
                  className={selectCls}
                  value={offerForm.discount_type}
                  onChange={(e) => setOfferForm((f) => ({ ...f, discount_type: e.target.value }))}
                >
                  {["PERCENTAGE", "FIXED"].map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              </FormField>
              <FormField
                label="Discount value"
                htmlFor="offer-discount-value"
                hint={offerForm.discount_type === "PERCENTAGE" ? "e.g. 20 for 20% off." : "Fixed amount off the order."}
              >
                <input
                  id="offer-discount-value"
                  className={controlCls}
                  inputMode="decimal"
                  placeholder={offerForm.discount_type === "PERCENTAGE" ? "Percent" : "Amount"}
                  value={offerForm.value_numeric}
                  onChange={(e) => setOfferForm((f) => ({ ...f, value_numeric: e.target.value }))}
                />
              </FormField>
              <FormField label="Delivery discount type" htmlFor="offer-delivery-type" hint="Optional fee waiver or reduction.">
                <select
                  id="offer-delivery-type"
                  className={selectCls}
                  value={offerForm.delivery_discount_type}
                  onChange={(e) => setOfferForm((f) => ({ ...f, delivery_discount_type: e.target.value }))}
                >
                  <option value="">No delivery offer</option>
                  <option value="FULL_WAIVE">FULL_WAIVE</option>
                  <option value="PERCENT">PERCENT</option>
                  <option value="FIXED">FIXED</option>
                </select>
              </FormField>
              <FormField label="Delivery discount value" htmlFor="offer-delivery-value" hint="Meaning depends on delivery type above.">
                <input
                  id="offer-delivery-value"
                  className={cn(controlCls, !offerForm.delivery_discount_type && "opacity-60")}
                  inputMode="decimal"
                  placeholder="If applicable"
                  value={offerForm.delivery_discount_value}
                  onChange={(e) => setOfferForm((f) => ({ ...f, delivery_discount_value: e.target.value }))}
                  disabled={!offerForm.delivery_discount_type}
                />
              </FormField>
            </div>
          </FormSection>

          <FormSection title="Priority & visibility" description="Stacking and how the offer appears in the app.">
            <div className="grid gap-5 lg:grid-cols-2">
              <FormField
                label="Priority"
                htmlFor="offer-priority"
                hint="When a single best offer wins, lower numbers rank stronger."
              >
                <input
                  id="offer-priority"
                  className={controlCls}
                  inputMode="numeric"
                  placeholder="0"
                  value={offerForm.priority}
                  onChange={(e) => setOfferForm((f) => ({ ...f, priority: e.target.value }))}
                />
              </FormField>
              <div className="flex flex-col justify-end gap-3 rounded-xl border border-slate-100 bg-slate-50/50 p-4">
                <p className="text-[13px] font-medium text-slate-700">Flags</p>
                <div className="flex flex-wrap gap-x-6 gap-y-3 text-sm text-slate-700">
                  <label className="flex cursor-pointer items-center gap-2.5">
                    <input
                      type="checkbox"
                      className={checkboxCls}
                      checked={offerForm.is_active}
                      onChange={(e) => setOfferForm((f) => ({ ...f, is_active: e.target.checked }))}
                    />
                    Active
                  </label>
                  <label className="flex cursor-pointer items-center gap-2.5">
                    <input
                      type="checkbox"
                      className={checkboxCls}
                      checked={offerForm.is_hidden}
                      onChange={(e) => setOfferForm((f) => ({ ...f, is_hidden: e.target.checked }))}
                    />
                    Hidden in app
                  </label>
                  <label className="flex cursor-pointer items-center gap-2.5">
                    <input
                      type="checkbox"
                      className={checkboxCls}
                      checked={offerForm.is_stackable}
                      onChange={(e) => setOfferForm((f) => ({ ...f, is_stackable: e.target.checked }))}
                    />
                    Allow stacking
                  </label>
                </div>
              </div>
            </div>
          </FormSection>
        </div>

        <div className="mt-8 flex flex-wrap items-center gap-3 border-t border-slate-100 pt-6">
          <button
            type="button"
            onClick={() => void saveOffer()}
            disabled={busy}
            className="inline-flex min-h-[44px] items-center justify-center rounded-lg bg-gradient-to-r from-indigo-600 to-violet-600 px-6 text-sm font-semibold text-white shadow-md shadow-indigo-500/25 transition hover:from-indigo-500 hover:to-violet-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-55"
          >
            {busy ? (
              <span className="inline-flex items-center gap-2">
                <LoadingSpinner variant="button" size="sm" /> Saving…
              </span>
            ) : editingOfferId ? (
              "Save offer"
            ) : (
              "Create offer"
            )}
          </button>
          {editingOfferId != null ? (
            <button
              type="button"
              className="rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              onClick={() => {
                setEditingOfferId(null);
                setOfferForm({
                  name: "",
                  service_type: "FOOD",
                  offer_kind: "DISCOUNT",
                  funding_mode: "PLATFORM_ONLY",
                  platform_share_pct: "100",
                  merchant_share_pct: "0",
                  target_scope: "GLOBAL",
                  geo_level: "state",
                  geo_ids_csv: "",
                  merchant_ids_csv: "",
                  customer_segment: "ALL",
                  starts_at: "",
                  ends_at: "",
                  min_order_amount: "",
                  max_discount_amount: "",
                  budget_total: "",
                  is_stackable: false,
                  discount_type: "PERCENTAGE",
                  value_numeric: "",
                  delivery_discount_type: "",
                  delivery_discount_value: "",
                  city: "",
                  min_order_value: "",
                  user_segment: "ALL",
                  priority: "0",
                  is_active: true,
                  is_hidden: false,
                });
              }}
            >
              Cancel edit
            </button>
          ) : null}
        </div>
      </section>

      <section className={cardCls}>
        <h2 className="text-lg font-semibold tracking-tight text-slate-900">Offers</h2>
        <p className="mt-1 text-sm text-slate-500">All configured platform offers. Edit or remove in one place.</p>
        <div className="mt-6 overflow-hidden rounded-xl border border-slate-200/80">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="border-b border-slate-200 bg-slate-50/80 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
                <tr>
                  <th className="px-4 py-3 pr-3">Name</th>
                  <th className="px-4 py-3 pr-3">Service</th>
                  <th className="px-4 py-3 pr-3">Kind</th>
                  <th className="px-4 py-3 pr-3">Funding</th>
                  <th className="px-4 py-3 pr-3">Scope</th>
                  <th className="px-4 py-3 pr-3">Segment</th>
                  <th className="px-4 py-3 pr-3">Priority</th>
                  <th className="px-4 py-3 pr-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
              {offersLoading ? (
                <tr>
                  <td className="px-4 py-8 text-center text-slate-500" colSpan={8}>
                    Loading…
                  </td>
                </tr>
              ) : offers.length === 0 ? (
                <tr>
                  <td className="px-4 py-10 text-center text-slate-500" colSpan={8}>
                    No offers yet. Create one with the builder above.
                  </td>
                </tr>
              ) : (
                offers.map((o) => (
                <tr key={o.id} className="transition-colors hover:bg-slate-50/80">
                  <td className="px-4 py-3 pr-3 font-medium text-slate-900">{o.name ?? `Offer #${o.id}`}</td>
                  <td className="px-4 py-3 pr-3 text-slate-700">{o.service_type}</td>
                  <td className="px-4 py-3 pr-3 text-slate-700">{o.offer_kind}</td>
                  <td className="px-4 py-3 pr-3 text-slate-700">
                    {o.funding_mode} ({o.platform_share_pct}%/{o.merchant_share_pct}%)
                  </td>
                  <td className="px-4 py-3 pr-3 text-slate-700">{o.target_scope}</td>
                  <td className="px-4 py-3 pr-3 text-slate-700">{o.customer_segment}</td>
                  <td className="px-4 py-3 pr-3 tabular-nums text-slate-700">{o.priority}</td>
                  <td className="px-4 py-3 pr-3">
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        className="rounded-md text-xs font-medium text-indigo-600 hover:text-indigo-500"
                        onClick={() => {
                          setEditingOfferId(o.id);
                          setOfferForm({
                            name: o.name ?? "",
                            service_type: o.service_type,
                            offer_kind: o.offer_kind ?? "DISCOUNT",
                            funding_mode: o.funding_mode ?? "PLATFORM_ONLY",
                            platform_share_pct: o.platform_share_pct ?? "100",
                            merchant_share_pct: o.merchant_share_pct ?? "0",
                            target_scope: o.target_scope ?? "GLOBAL",
                            geo_level: o.geo_level ?? "state",
                            geo_ids_csv: Array.isArray(o.geo_ids) ? o.geo_ids.join(",") : "",
                            merchant_ids_csv: Array.isArray(o.merchant_ids) ? o.merchant_ids.join(",") : "",
                            customer_segment: o.customer_segment ?? "ALL",
                            starts_at: o.starts_at ? String(o.starts_at).slice(0, 16) : "",
                            ends_at: o.ends_at ? String(o.ends_at).slice(0, 16) : "",
                            min_order_amount: o.min_order_amount ?? "",
                            max_discount_amount: o.max_discount_amount ?? "",
                            budget_total: o.budget_total ?? "",
                            is_stackable: o.is_stackable ?? false,
                            discount_type: o.discount_type,
                            value_numeric: o.value_numeric ?? "",
                            delivery_discount_type: o.delivery_discount_type ?? "",
                            delivery_discount_value: o.delivery_discount_value ?? "",
                            city: "",
                            min_order_value: "",
                            user_segment: "ALL",
                            priority: String(o.priority ?? 0),
                            is_active: o.is_active,
                            is_hidden: o.is_hidden,
                          });
                        }}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="rounded-md text-xs font-medium text-red-600 hover:text-red-500"
                        onClick={() => void deleteOffer(o.id)}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
                ))
              )}
            </tbody>
          </table>
          </div>
        </div>
      </section>

      <section className={cardCls}>
        <div className="mb-6 border-b border-slate-100 pb-6">
          <h2 className="text-lg font-semibold tracking-tight text-slate-900">Coupons</h2>
          <p className="mt-1 text-sm text-slate-500">Promo codes for checkout. Values follow the selected discount type.</p>
        </div>
        <ul className="mb-8 space-y-2 text-sm">
          {couponsLoading ? (
            <li className="rounded-lg border border-dashed border-slate-200 px-4 py-8 text-center text-slate-500">Loading…</li>
          ) : coupons.length === 0 ? (
            <li className="rounded-lg border border-dashed border-slate-200 px-4 py-8 text-center text-slate-500">
              No coupons yet. Add one with the form below.
            </li>
          ) : (
            coupons.map((c) => (
              <li
                key={c.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50/40 px-4 py-3 transition hover:border-slate-200 hover:bg-slate-50/80"
              >
                <span className="font-medium text-slate-900">
                  {c.code}{" "}
                  <span className="font-normal text-slate-500">
                    · {c.discount_type} · {c.value_numeric ?? "—"}
                  </span>
                </span>
                <span className="flex gap-2">
                  <button
                    type="button"
                    className="rounded-md text-xs font-medium text-indigo-600 hover:text-indigo-500"
                    onClick={() => {
                      setEditingCouponId(c.id);
                      setCouponForm({
                        code: c.code,
                        discount_type: c.discount_type,
                        value_numeric: c.value_numeric ?? "",
                        max_discount_cap: c.max_discount_cap ?? "",
                        usage_limit: c.usage_limit != null ? String(c.usage_limit) : "",
                        is_active: c.is_active,
                        is_hidden: c.is_hidden,
                      });
                    }}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className="rounded-md text-xs font-medium text-red-600 hover:text-red-500"
                    onClick={() => void deleteCoupon(c.id)}
                  >
                    Delete
                  </button>
                </span>
              </li>
            ))
          )}
        </ul>

        <FormSection title="Coupon details" description="Code is stored uppercase. Cap and usage limit are optional.">
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            <FormField label="Coupon code" htmlFor="coupon-code" hint="What customers enter at checkout.">
              <input
                id="coupon-code"
                className={controlCls}
                placeholder="e.g. WELCOME20"
                value={couponForm.code}
                onChange={(e) => setCouponForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))}
              />
            </FormField>
            <FormField label="Discount type" htmlFor="coupon-discount-type" hint="Percent off order vs fixed amount.">
              <select
                id="coupon-discount-type"
                className={selectCls}
                value={couponForm.discount_type}
                onChange={(e) => setCouponForm((f) => ({ ...f, discount_type: e.target.value }))}
              >
                {["PERCENTAGE", "FIXED"].map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField
              label="Discount value"
              htmlFor="coupon-value"
              hint={couponForm.discount_type === "PERCENTAGE" ? "Percentage (e.g. 15)." : "Fixed amount off."}
            >
              <input
                id="coupon-value"
                className={controlCls}
                inputMode="decimal"
                placeholder={couponForm.discount_type === "PERCENTAGE" ? "Percent" : "Amount"}
                value={couponForm.value_numeric}
                onChange={(e) => setCouponForm((f) => ({ ...f, value_numeric: e.target.value }))}
              />
            </FormField>
            <FormField label="Max discount cap" htmlFor="coupon-cap" hint="Optional ceiling when using percentage.">
              <input
                id="coupon-cap"
                className={controlCls}
                inputMode="decimal"
                placeholder="Optional"
                value={couponForm.max_discount_cap}
                onChange={(e) => setCouponForm((f) => ({ ...f, max_discount_cap: e.target.value }))}
              />
            </FormField>
            <FormField label="Usage limit" htmlFor="coupon-usage" hint="Total redemptions allowed; empty = unlimited.">
              <input
                id="coupon-usage"
                className={controlCls}
                inputMode="numeric"
                placeholder="Unlimited if empty"
                value={couponForm.usage_limit}
                onChange={(e) => setCouponForm((f) => ({ ...f, usage_limit: e.target.value }))}
              />
            </FormField>
          </div>
        </FormSection>

        <div className="mt-6 flex flex-wrap gap-x-6 gap-y-3 rounded-xl border border-slate-100 bg-slate-50/50 p-4 text-sm text-slate-700">
          <label className="flex cursor-pointer items-center gap-2.5">
            <input
              type="checkbox"
              className={checkboxCls}
              checked={couponForm.is_active}
              onChange={(e) => setCouponForm((f) => ({ ...f, is_active: e.target.checked }))}
            />
            Active
          </label>
          <label className="flex cursor-pointer items-center gap-2.5">
            <input
              type="checkbox"
              className={checkboxCls}
              checked={couponForm.is_hidden}
              onChange={(e) => setCouponForm((f) => ({ ...f, is_hidden: e.target.checked }))}
            />
            Hidden in app
          </label>
        </div>
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => void saveCoupon()}
            disabled={busy}
            className="inline-flex min-h-[44px] items-center justify-center rounded-lg bg-gradient-to-r from-indigo-600 to-violet-600 px-6 text-sm font-semibold text-white shadow-md shadow-indigo-500/25 transition hover:from-indigo-500 hover:to-violet-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-55"
          >
            {busy ? (
              <span className="inline-flex items-center gap-2">
                <LoadingSpinner variant="button" size="sm" /> Saving…
              </span>
            ) : editingCouponId ? (
              "Save coupon"
            ) : (
              "Add coupon"
            )}
          </button>
          {editingCouponId != null ? (
            <button
              type="button"
              className="rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              onClick={() => {
                setEditingCouponId(null);
                setCouponForm({
                  code: "",
                  discount_type: "PERCENTAGE",
                  value_numeric: "",
                  max_discount_cap: "",
                  usage_limit: "",
                  is_active: true,
                  is_hidden: false,
                });
              }}
            >
              Cancel edit
            </button>
          ) : null}
        </div>
      </section>
    </div>
  );
}
