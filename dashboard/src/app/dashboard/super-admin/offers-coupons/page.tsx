"use client";

import { useMemo, useState, type ComponentType, type ReactNode } from "react";
import Link from "next/link";
import { Percent, Sparkles, Tag, Users } from "lucide-react";
import {
  useCreateBillingDiscountMutation,
  useCreateBillingPlatformOfferMutation,
  useDeleteBillingDiscountMutation,
  useDeleteBillingPlatformOfferMutation,
  useGetBillingDiscountsQuery,
  useGetBillingPlatformOffersQuery,
  useUpdateBillingDiscountMutation,
  useUpdateBillingPlatformOfferMutation,
  type BillingAdminDiscountCreateBody,
} from "@/store/api/billingAdminApi";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { PLATFORM_OFFER_KINDS } from "@/lib/billing/platformOfferKinds";
import {
  feeKindTableLabel,
  getPlatformOfferKindSections,
  validatePlatformOfferKindForm,
} from "@/lib/billing/platformOfferKindUi";
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
  icon: ComponentType<{ className?: string; strokeWidth?: number; "aria-hidden"?: boolean }>;
  accent: "indigo" | "emerald" | "violet" | "amber";
}) {
  const accentRing =
    accent === "indigo"
      ? "from-indigo-500/15 to-violet-500/10"
      : accent === "emerald"
        ? "from-emerald-500/15 to-teal-500/10"
        : accent === "amber"
          ? "from-amber-500/15 to-orange-500/10"
          : "from-violet-500/15 to-fuchsia-500/10";
  const iconBg =
    accent === "indigo"
      ? "bg-indigo-500/10 text-indigo-600"
      : accent === "emerald"
        ? "bg-emerald-500/10 text-emerald-600"
        : accent === "amber"
          ? "bg-amber-500/10 text-amber-700"
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

type BuilderMode = "platform_offer" | "checkout_coupon";

function toDatetimeLocal(val: string | null | undefined): string {
  if (val == null || String(val).trim() === "") return "";
  const d = new Date(val);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function readAppliesOn(meta: unknown): string {
  if (meta && typeof meta === "object" && !Array.isArray(meta)) {
    const v = (meta as Record<string, unknown>).discount_applies_on;
    if (typeof v === "string" && v.trim() !== "") return v.trim().toUpperCase();
  }
  return "CART_ITEMS";
}

function readCustomerSegment(meta: unknown): string {
  if (meta && typeof meta === "object" && !Array.isArray(meta)) {
    const v = (meta as Record<string, unknown>).customer_segment;
    if (typeof v === "string" && v.trim() !== "") return v.trim().toUpperCase();
  }
  return "ALL";
}

function mergeCouponMetadata(
  appliesOn: string,
  customerSegment: string,
  baseline: Record<string, unknown> | null,
): unknown {
  const base = baseline && typeof baseline === "object" ? { ...baseline } : {};
  return { ...base, discount_applies_on: appliesOn, customer_segment: customerSegment };
}

function shortScheduleLabel(from: string | null | undefined, until: string | null | undefined): string {
  const a = from != null && String(from).trim() !== "" ? String(from).slice(0, 10) : "";
  const b = until != null && String(until).trim() !== "" ? String(until).slice(0, 10) : "";
  if (!a && !b) return "—";
  if (a && b) return `${a} → ${b}`;
  return a ? `from ${a}` : `until ${b}`;
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

  const [builderMode, setBuilderMode] = useState<BuilderMode>("platform_offer");
  const [editingOfferId, setEditingOfferId] = useState<number | null>(null);
  const [editingCouponId, setEditingCouponId] = useState<number | null>(null);
  const [couponMetaBaseline, setCouponMetaBaseline] = useState<Record<string, unknown> | null>(null);
  const [offerConditionsBaseline, setOfferConditionsBaseline] = useState<Record<string, unknown> | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const [offerForm, setOfferForm] = useState({
    name: "",
    service_type: "FOOD",
    offer_kind: "DISCOUNT",
    offer_audience: "CUSTOMER",
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
    buy_qty: "",
    get_qty: "",
    exclusion_group: "",
    menu_item_ids: "",
    priority: "0",
    is_active: true,
    is_hidden: false,
  });

  const offerKindUi = useMemo(
    () => getPlatformOfferKindSections(offerForm.offer_kind),
    [offerForm.offer_kind],
  );

  const [couponForm, setCouponForm] = useState({
    code: "",
    discount_type: "PERCENTAGE",
    value_numeric: "",
    max_discount_cap: "",
    usage_limit: "",
    per_user_usage_limit: "",
    is_active: true,
    is_hidden: false,
    service_type: "FOOD",
    offer_audience: "CUSTOMER",
    valid_from: "",
    valid_until: "",
    applies_on: "CART_ITEMS",
    customer_segment: "ALL",
  });

  const emptyOfferForm = () => ({
    name: "",
    service_type: "FOOD",
    offer_kind: "DISCOUNT",
    offer_audience: "CUSTOMER",
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
    buy_qty: "",
    get_qty: "",
    exclusion_group: "",
    menu_item_ids: "",
    priority: "0",
    is_active: true,
    is_hidden: false,
  });

  const emptyCouponForm = () => ({
    code: "",
    discount_type: "PERCENTAGE",
    value_numeric: "",
    max_discount_cap: "",
    usage_limit: "",
    per_user_usage_limit: "",
    is_active: true,
    is_hidden: false,
    service_type: "FOOD",
    offer_audience: "CUSTOMER",
    valid_from: "",
    valid_until: "",
    applies_on: "CART_ITEMS",
    customer_segment: "ALL",
  });

  const saveOffer = async () => {
    setErr(null);

    const cartValTrim = String(offerForm.value_numeric ?? "").trim();
    const valueNumeric = cartValTrim === "" ? null : Number(cartValTrim);
    if (valueNumeric != null && Number.isNaN(valueNumeric)) {
      setErr("Cart discount value must be a number.");
      return;
    }
    const kindFormErr = validatePlatformOfferKindForm({
      offerKind: offerForm.offer_kind,
      buyQtyStr: offerForm.buy_qty,
      getQtyStr: offerForm.get_qty,
      menuItemIdsStr: offerForm.menu_item_ids,
      valueNumeric,
    });
    if (kindFormErr) {
      setErr(kindFormErr);
      return;
    }
    const delType = offerForm.delivery_discount_type;
    const delValTrim = String(offerForm.delivery_discount_value ?? "").trim();
    const deliveryDiscountValue =
      !delType || delType === "FULL_WAIVE"
        ? null
        : delValTrim === ""
          ? null
          : Number(delValTrim);
    if (deliveryDiscountValue != null && Number.isNaN(deliveryDiscountValue)) {
      setErr("Delivery adjustment value must be a number.");
      return;
    }

    const minOrderTrim = String(offerForm.min_order_amount ?? "").trim();
    const minOrder = minOrderTrim === "" ? null : Number(minOrderTrim);
    if (minOrder != null && Number.isNaN(minOrder)) {
      setErr("Minimum order amount must be a number.");
      return;
    }
    const maxDiscTrim = String(offerForm.max_discount_amount ?? "").trim();
    const maxDiscount = maxDiscTrim === "" ? null : Number(maxDiscTrim);
    if (maxDiscount != null && Number.isNaN(maxDiscount)) {
      setErr("Maximum discount cap must be a number.");
      return;
    }
    const budgetTrim = String(offerForm.budget_total ?? "").trim();
    const budgetTotal = budgetTrim === "" ? null : Number(budgetTrim);
    if (budgetTotal != null && Number.isNaN(budgetTotal)) {
      setErr("Campaign budget must be a number.");
      return;
    }
    const pri = Number(offerForm.priority || 0);
    if (!Number.isInteger(pri)) {
      setErr("Priority must be a whole number.");
      return;
    }

    const buyTrim = String(offerForm.buy_qty ?? "").trim();
    const getTrim = String(offerForm.get_qty ?? "").trim();
    let buy_qty: number | null = null;
    let get_qty: number | null = null;
    if (buyTrim !== "") {
      buy_qty = parseInt(buyTrim, 10);
      if (!Number.isInteger(buy_qty)) {
        setErr("Buy quantity must be a whole number.");
        return;
      }
    }
    if (getTrim !== "") {
      get_qty = parseInt(getTrim, 10);
      if (!Number.isInteger(get_qty)) {
        setErr("Get / free quantity must be a whole number.");
        return;
      }
    }
    const exclTrim = String(offerForm.exclusion_group ?? "").trim();
    const exclusion_group = exclTrim === "" ? null : exclTrim;
    const idTokens = offerForm.menu_item_ids
      .split(/[\s,]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    const conditions: Record<string, unknown> = {
      ...(editingOfferId != null && offerConditionsBaseline ? { ...offerConditionsBaseline } : {}),
    };
    delete conditions.menu_item_ids;
    if (idTokens.length > 0) conditions.menu_item_ids = idTokens;

    const aud = offerForm.offer_audience.toUpperCase();
    const payload: Record<string, unknown> = {
      name: offerForm.name || null,
      service_type: offerForm.service_type,
      offer_kind: offerForm.offer_kind,
      offer_audience: aud === "MERCHANT" || aud === "RIDER" ? aud : "CUSTOMER",
      funding_mode: "PLATFORM_ONLY",
      platform_share_pct: 100,
      merchant_share_pct: 0,
      max_platform_contribution: null,
      max_merchant_contribution: null,
      target_scope: "GLOBAL",
      geo_level: null,
      geo_ids: [],
      merchant_ids: [],
      customer_segment: offerForm.customer_segment,
      starts_at: offerForm.starts_at ? new Date(offerForm.starts_at).toISOString() : null,
      ends_at: offerForm.ends_at ? new Date(offerForm.ends_at).toISOString() : null,
      min_order_amount: minOrder,
      max_discount_amount: maxDiscount,
      budget_total: budgetTotal,
      is_stackable: offerForm.is_stackable,
      discount_type: offerForm.discount_type,
      value_numeric: valueNumeric,
      delivery_discount_type: delType || null,
      delivery_discount_value: deliveryDiscountValue,
      priority: pri,
      is_active: offerForm.is_active,
      is_hidden: offerForm.is_hidden,
      buy_qty,
      get_qty,
      exclusion_group,
      conditions,
    };
    try {
      if (editingOfferId != null) {
        await updateOffer({ id: editingOfferId, body: payload }).unwrap();
      } else {
        await createOffer(payload).unwrap();
      }
      setEditingOfferId(null);
      setOfferConditionsBaseline(null);
      setOfferForm(emptyOfferForm());
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to save offer");
    }
  };

  const saveCoupon = async () => {
    setErr(null);
    const valueTrim = couponForm.value_numeric.trim();
    const valueNumeric = valueTrim === "" ? null : Number(valueTrim);
    if (valueNumeric != null && Number.isNaN(valueNumeric)) {
      setErr("Discount value must be a number.");
      return;
    }
    const capTrim = couponForm.max_discount_cap.trim();
    const maxCap =
      couponForm.discount_type === "PERCENTAGE" && capTrim !== "" ? Number(capTrim) : null;
    if (maxCap != null && Number.isNaN(maxCap)) {
      setErr("Max discount cap must be a number.");
      return;
    }
    const usageTrim = couponForm.usage_limit.trim();
    const usageLimit = usageTrim !== "" ? Number(usageTrim) : null;
    if (usageLimit != null && (!Number.isInteger(usageLimit) || usageLimit < 0)) {
      setErr("Total usage limit must be a non-negative whole number.");
      return;
    }
    const perUserTrim = couponForm.per_user_usage_limit.trim();
    const perUserLimit = perUserTrim !== "" ? Number(perUserTrim) : null;
    if (perUserLimit != null && (!Number.isInteger(perUserLimit) || perUserLimit < 1)) {
      setErr("Per-user limit must be a positive whole number, or leave empty for unlimited per user.");
      return;
    }
    const aud = couponForm.offer_audience.toUpperCase();
    const offerAudience = aud === "MERCHANT" || aud === "RIDER" ? aud : "CUSTOMER";
    const metadata = mergeCouponMetadata(
      couponForm.applies_on,
      couponForm.customer_segment,
      editingCouponId != null ? couponMetaBaseline : null,
    );
    const payload: Record<string, unknown> = {
      code: couponForm.code.trim().toUpperCase(),
      discount_type: couponForm.discount_type,
      value_numeric: valueNumeric,
      max_discount_cap: maxCap,
      usage_limit: usageLimit,
      is_active: couponForm.is_active,
      is_hidden: couponForm.is_hidden,
      valid_from: couponForm.valid_from ? new Date(couponForm.valid_from).toISOString() : null,
      valid_until: couponForm.valid_until ? new Date(couponForm.valid_until).toISOString() : null,
      service_type: couponForm.service_type,
      offer_audience: offerAudience,
      per_user_usage_limit: perUserLimit,
      metadata,
    };
    try {
      if (editingCouponId != null) {
        await updateCoupon({ id: editingCouponId, body: payload }).unwrap();
      } else {
        await createCoupon(payload as BillingAdminDiscountCreateBody).unwrap();
      }
      setEditingCouponId(null);
      setCouponMetaBaseline(null);
      setCouponForm(emptyCouponForm());
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
    const nonCustomerAudience = offers.filter((o) => String(o.offer_audience ?? "CUSTOMER").toUpperCase() !== "CUSTOMER").length;
    return { total, active, nonCustomerAudience };
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
            Configure platform-wide offers (global scope). Merchant-portal offers are managed separately. Only{" "}
            <span className="font-medium text-slate-800">Customer</span> audience offers apply at customer checkout today.
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

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total offers" value={offerStats.total} icon={Tag} accent="indigo" />
        <StatCard label="Active offers" value={offerStats.active} icon={Sparkles} accent="emerald" />
        <StatCard
          label="Merchant / rider audience"
          value={offerStats.nonCustomerAudience}
          icon={Users}
          accent="violet"
        />
        <StatCard label="Coupons" value={coupons.length} icon={Percent} accent="amber" />
      </section>

      <section className={cardCls}>
        <div className="mb-6 flex flex-col gap-4 border-b border-slate-100 pb-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold tracking-tight text-slate-900">Promo builder</h2>
              <p className="mt-1 text-sm text-slate-500">
                Create a platform offer or a checkout coupon in the same layout. Switch type below; coupons are also listed
                for quick edit.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {builderMode === "platform_offer" && editingOfferId != null ? (
                <span className="inline-flex w-fit items-center rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-800 ring-1 ring-amber-200/80">
                  Editing offer #{editingOfferId}
                </span>
              ) : null}
              {builderMode === "checkout_coupon" && editingCouponId != null ? (
                <span className="inline-flex w-fit items-center rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-800 ring-1 ring-amber-200/80">
                  Editing coupon #{editingCouponId}
                </span>
              ) : null}
            </div>
          </div>
          <div className="flex flex-wrap gap-2 rounded-xl border border-slate-200 bg-slate-50/80 p-1.5">
            <button
              type="button"
              className={cn(
                "min-h-[42px] flex-1 min-w-[160px] rounded-lg px-4 py-2.5 text-sm font-semibold transition",
                builderMode === "platform_offer"
                  ? "bg-white text-indigo-700 shadow-sm ring-1 ring-slate-200/80"
                  : "text-slate-600 hover:bg-white/60 hover:text-slate-900",
              )}
              onClick={() => {
                setBuilderMode("platform_offer");
                setEditingCouponId(null);
                setCouponMetaBaseline(null);
                setCouponForm(emptyCouponForm());
                setOfferConditionsBaseline(null);
              }}
            >
              Platform offer
            </button>
            <button
              type="button"
              className={cn(
                "min-h-[42px] flex-1 min-w-[160px] rounded-lg px-4 py-2.5 text-sm font-semibold transition",
                builderMode === "checkout_coupon"
                  ? "bg-white text-indigo-700 shadow-sm ring-1 ring-slate-200/80"
                  : "text-slate-600 hover:bg-white/60 hover:text-slate-900",
              )}
              onClick={() => {
                setBuilderMode("checkout_coupon");
                setEditingOfferId(null);
                setOfferForm(emptyOfferForm());
                setOfferConditionsBaseline(null);
              }}
            >
              Checkout coupon
            </button>
          </div>
        </div>

        {builderMode === "platform_offer" ? (
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
              <FormField
                label="Offer kind"
                htmlFor="offer-kind"
                hint="Checkout behavior follows this kind: cart, delivery, fee buckets, buy-X-get-Y, and free-item rules are applied in the billing engine."
              >
                <select
                  id="offer-kind"
                  className={selectCls}
                  value={offerForm.offer_kind}
                  onChange={(e) => setOfferForm((f) => ({ ...f, offer_kind: e.target.value }))}
                >
                  {PLATFORM_OFFER_KINDS.map((v) => (
                    <option key={v} value={v}>
                      {v.replace(/_/g, " ")}
                    </option>
                  ))}
                </select>
              </FormField>
              <FormField
                label="Offer audience"
                htmlFor="offer-audience"
                hint="Who this offer is for. Customer checkout only uses Customer audience today."
              >
                <select
                  id="offer-audience"
                  className={selectCls}
                  value={offerForm.offer_audience}
                  onChange={(e) => setOfferForm((f) => ({ ...f, offer_audience: e.target.value }))}
                >
                  {["CUSTOMER", "MERCHANT", "RIDER"].map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              </FormField>
            </div>
            {offerKindUi.kindNotice ? (
              <p
                className="mt-3 rounded-lg border border-amber-200/80 bg-amber-50/90 px-3 py-2 text-xs leading-relaxed text-amber-900"
                role="note"
              >
                {offerKindUi.kindNotice}
              </p>
            ) : null}
          </FormSection>

          <FormSection
            title="Audience"
            description="Who qualifies: new customers, returning customers, or everyone. This is stored on the offer row and is what checkout uses (not a duplicate in conditions JSON)."
          >
            <div className="grid gap-5 sm:grid-cols-2 lg:max-w-xl">
              <FormField
                label="Customer segment"
                htmlFor="offer-segment"
                hint="ALL = no segment gate. NEW / EXISTING match billing context userSegment at checkout."
              >
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

          <FormSection title="Order thresholds" description="Cart rules before the offer applies.">
            <div className="grid gap-5 sm:grid-cols-2">
              <FormField
                label="Minimum order amount"
                htmlFor="offer-min-order"
                hint="Stored on the offer row (min_order_amount). Leave empty for no minimum cart requirement."
              >
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
            {offerKindUi.showExclusionGroup ? (
              <div className="mt-4 max-w-xl">
                <FormField
                  label="Exclusion group"
                  htmlFor="offer-exclusion"
                  hint="Optional label for mutual exclusion (future stacking rules). Stored on the offer row."
                >
                  <input
                    id="offer-exclusion"
                    className={controlCls}
                    placeholder="e.g. weekend_promo"
                    value={offerForm.exclusion_group}
                    onChange={(e) => setOfferForm((f) => ({ ...f, exclusion_group: e.target.value }))}
                  />
                </FormField>
              </div>
            ) : null}
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

          {offerKindUi.showBuyXGetYFields || offerKindUi.showFreeMenuFields ? (
            <FormSection
              title="Buy / get / menu targeting"
              description="Stored as buy_qty, get_qty, and conditions.menu_item_ids. Limits which catalog lines count toward buy-X-get-Y and free-item waivers."
            >
              <div className="space-y-5">
                {offerKindUi.showBuyXGetYFields ? (
                  <div className="grid gap-5 sm:grid-cols-2 lg:max-w-2xl">
                    <FormField label="Buy quantity (X)" htmlFor="offer-buy-qty" hint="Minimum units that must be in the cart from eligible lines.">
                      <input
                        id="offer-buy-qty"
                        className={controlCls}
                        inputMode="numeric"
                        placeholder="e.g. 2"
                        value={offerForm.buy_qty}
                        onChange={(e) => setOfferForm((f) => ({ ...f, buy_qty: e.target.value }))}
                      />
                    </FormField>
                    <FormField label="Get quantity (Y)" htmlFor="offer-get-qty" hint="How many of the cheapest eligible units receive the discount.">
                      <input
                        id="offer-get-qty"
                        className={controlCls}
                        inputMode="numeric"
                        placeholder="e.g. 1"
                        value={offerForm.get_qty}
                        onChange={(e) => setOfferForm((f) => ({ ...f, get_qty: e.target.value }))}
                      />
                    </FormField>
                  </div>
                ) : null}
                {offerKindUi.showFreeMenuFields && !offerKindUi.showBuyXGetYFields ? (
                  <div className="grid gap-5 sm:grid-cols-2 lg:max-w-xl">
                    <FormField
                      label="Free units"
                      htmlFor="offer-free-qty"
                      hint="How many units to waive (cheapest eligible units first)."
                    >
                      <input
                        id="offer-free-qty"
                        className={controlCls}
                        inputMode="numeric"
                        placeholder="e.g. 1"
                        value={offerForm.get_qty}
                        onChange={(e) => setOfferForm((f) => ({ ...f, get_qty: e.target.value }))}
                      />
                    </FormField>
                  </div>
                ) : null}
                <FormField
                  label="Eligible menu item IDs"
                  htmlFor="offer-menu-ids"
                  hint="Comma- or space-separated menu_item_id values. Empty = all lines in the cart (for buy-X-get-Y). Required for free menu item offers."
                >
                  <input
                    id="offer-menu-ids"
                    className={controlCls}
                    placeholder="e.g. 101, 102, 205"
                    value={offerForm.menu_item_ids}
                    onChange={(e) => setOfferForm((f) => ({ ...f, menu_item_ids: e.target.value }))}
                  />
                </FormField>
              </div>
            </FormSection>
          ) : null}

          <FormSection
            title="Discount rules"
            description={
              offerKindUi.showCartDiscount && offerKindUi.showDeliveryBlock
                ? "Cart adjustments apply to the items subtotal; delivery adjustments run after the delivery fee is priced (and after cart platform offers)."
                : offerKindUi.showCartDiscount
                  ? offerKindUi.cartValueHint || "Adjust the priced fee bucket shown in the title."
                  : "Delivery-only or fee-bucket offers use the blocks below."
            }
          >
            <div className="space-y-8">
              {offerKindUi.showCartDiscount ? (
                <div className="rounded-xl border border-slate-100 bg-slate-50/40 p-4 sm:p-5">
                  <p className="mb-4 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                    1 · {offerKindUi.cartBlockTitle}
                  </p>
                  <div className="grid gap-5 sm:grid-cols-2">
                    <FormField
                      label="Discount type"
                      htmlFor="offer-discount-type"
                      hint="PERCENTAGE or FIXED amount for this offer’s target (see title above)."
                    >
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
                      hint={
                        offerKindUi.cartValueHint && offerKindUi.cartValueHint.trim() !== ""
                          ? offerKindUi.cartValueHint
                          : offerForm.discount_type === "PERCENTAGE"
                            ? "e.g. 20 means 20% off the applicable base."
                            : "Fixed currency amount off the applicable base."
                      }
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
                  </div>
                </div>
              ) : null}

              {offerKindUi.showDeliveryBlock ? (
                <div className="rounded-xl border border-slate-100 bg-slate-50/40 p-4 sm:p-5">
                  <p className="mb-4 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                    {offerKindUi.showCartDiscount ? "2 · " : "1 · "}
                    Delivery fee (optional)
                  </p>
                  <div className="grid gap-5 sm:grid-cols-2">
                    <FormField
                      label="Delivery fee adjustment"
                      htmlFor="offer-delivery-type"
                      hint="Runs after delivery is priced. Use with FREE DELIVERY kind or combine with a cart offer when enabled above."
                    >
                      <select
                        id="offer-delivery-type"
                        className={selectCls}
                        value={offerForm.delivery_discount_type}
                        onChange={(e) => setOfferForm((f) => ({ ...f, delivery_discount_type: e.target.value }))}
                      >
                        <option value="">No delivery offer</option>
                        <option value="FULL_WAIVE">Free delivery (waive full fee)</option>
                        <option value="PERCENT">Percent off delivery fee</option>
                        <option value="FIXED">Fixed amount off delivery fee</option>
                      </select>
                    </FormField>
                    <FormField
                      label="Delivery adjustment value"
                      htmlFor="offer-delivery-value"
                      hint={
                        !offerForm.delivery_discount_type
                          ? "Choose a delivery adjustment type first."
                          : offerForm.delivery_discount_type === "FULL_WAIVE"
                            ? "Not used for free delivery — leave empty."
                            : offerForm.delivery_discount_type === "PERCENT"
                              ? "Percent of the delivery fee only (e.g. 50 = half off delivery)."
                              : "Amount in currency subtracted from the delivery fee (capped at the fee)."
                      }
                    >
                      <input
                        id="offer-delivery-value"
                        className={cn(
                          controlCls,
                          (!offerForm.delivery_discount_type || offerForm.delivery_discount_type === "FULL_WAIVE") &&
                            "opacity-60",
                        )}
                        inputMode="decimal"
                        placeholder={
                          offerForm.delivery_discount_type === "PERCENT"
                            ? "e.g. 50"
                            : offerForm.delivery_discount_type === "FIXED"
                              ? "Amount"
                              : "—"
                        }
                        value={offerForm.delivery_discount_value}
                        onChange={(e) => setOfferForm((f) => ({ ...f, delivery_discount_value: e.target.value }))}
                        disabled={
                          !offerForm.delivery_discount_type || offerForm.delivery_discount_type === "FULL_WAIVE"
                        }
                      />
                    </FormField>
                  </div>
                </div>
              ) : null}
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
        ) : (
        <div className="space-y-8">
          <FormSection
            title="Service & applicability"
            description="Vertical, checkout audience, and metadata label. Billing applies the coupon only when checkoutAudience on the calculate request matches offer audience (customer checkout defaults to CUSTOMER)."
          >
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              <FormField label="Service type" htmlFor="coupon-service" hint="Same vertical axis as platform offers (FOOD, PARCEL, RIDE, ALL).">
                <select
                  id="coupon-service"
                  className={selectCls}
                  value={couponForm.service_type}
                  onChange={(e) => setCouponForm((f) => ({ ...f, service_type: e.target.value }))}
                >
                  {["FOOD", "PARCEL", "RIDE", "ALL"].map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              </FormField>
              <FormField
                label="Offer audience"
                htmlFor="coupon-offer-audience"
                hint="Who may redeem this code. Must match checkoutAudience on POST /v1/billing/calculate (customer app defaults to CUSTOMER)."
              >
                <select
                  id="coupon-offer-audience"
                  className={selectCls}
                  value={couponForm.offer_audience}
                  onChange={(e) => setCouponForm((f) => ({ ...f, offer_audience: e.target.value }))}
                >
                  {["CUSTOMER", "MERCHANT", "RIDER"].map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              </FormField>
              <FormField
                label="Applies on (metadata)"
                htmlFor="coupon-applies-on"
                hint="Stored as metadata.discount_applies_on. CART_ITEMS matches current billing behavior."
              >
                <select
                  id="coupon-applies-on"
                  className={selectCls}
                  value={couponForm.applies_on}
                  onChange={(e) => setCouponForm((f) => ({ ...f, applies_on: e.target.value }))}
                >
                  <option value="CART_ITEMS">Items &amp; add-ons subtotal</option>
                  <option value="ORDER_BEFORE_TAX">Entire order before tax (future)</option>
                </select>
              </FormField>
              <FormField
                label="Customer segment (metadata)"
                htmlFor="coupon-segment"
                hint="Stored as metadata.customer_segment. Compared to userSegment on billing/calculate (NEW / EXISTING / ALL)."
              >
                <select
                  id="coupon-segment"
                  className={selectCls}
                  value={couponForm.customer_segment}
                  onChange={(e) => setCouponForm((f) => ({ ...f, customer_segment: e.target.value }))}
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

          <FormSection title="Schedule" description="Optional validity window for this code (stored on the discount row).">
            <div className="grid gap-5 sm:grid-cols-2 lg:max-w-2xl">
              <FormField label="Valid from" htmlFor="coupon-valid-from" hint="Leave empty to start immediately when active.">
                <input
                  id="coupon-valid-from"
                  className={controlCls}
                  type="datetime-local"
                  value={couponForm.valid_from}
                  onChange={(e) => setCouponForm((f) => ({ ...f, valid_from: e.target.value }))}
                />
              </FormField>
              <FormField label="Valid until" htmlFor="coupon-valid-until" hint="Leave empty for no end date.">
                <input
                  id="coupon-valid-until"
                  className={controlCls}
                  type="datetime-local"
                  value={couponForm.valid_until}
                  onChange={(e) => setCouponForm((f) => ({ ...f, valid_until: e.target.value }))}
                />
              </FormField>
            </div>
          </FormSection>

          <div className="rounded-xl border border-slate-100 bg-slate-50/40 p-4 sm:p-5">
            <p className="mb-4 text-[11px] font-semibold uppercase tracking-wider text-slate-500">1 · Code</p>
            <div className="grid gap-5 lg:max-w-xl">
              <FormField
                label="Coupon code"
                htmlFor="coupon-code"
                hint="Stored uppercase. Customers type this at checkout; billing matches it to this row."
              >
                <input
                  id="coupon-code"
                  className={controlCls}
                  placeholder="e.g. WELCOME20"
                  value={couponForm.code}
                  onChange={(e) => setCouponForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))}
                />
              </FormField>
            </div>
          </div>

          <div className="rounded-xl border border-slate-100 bg-slate-50/40 p-4 sm:p-5">
            <p className="mb-4 text-[11px] font-semibold uppercase tracking-wider text-slate-500">2 · Discount</p>
            <div className="grid gap-5 sm:grid-cols-2">
              <FormField
                label="Discount type"
                htmlFor="coupon-discount-type"
                hint="PERCENTAGE = % off items subtotal after other offer discounts. FIXED = flat amount off that subtotal."
              >
                <select
                  id="coupon-discount-type"
                  className={selectCls}
                  value={couponForm.discount_type}
                  onChange={(e) => {
                    const v = e.target.value;
                    setCouponForm((f) => ({
                      ...f,
                      discount_type: v,
                      max_discount_cap: v === "FIXED" ? "" : f.max_discount_cap,
                    }));
                  }}
                >
                  {["PERCENTAGE", "FIXED"].map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              </FormField>
              <FormField
                label="Discount value"
                htmlFor="coupon-value"
                hint={
                  couponForm.discount_type === "PERCENTAGE"
                    ? "Percent of items subtotal (e.g. 15 → 15% off)."
                    : "Fixed currency amount off the items subtotal (not off delivery)."
                }
              >
                <input
                  id="coupon-value"
                  className={controlCls}
                  inputMode="decimal"
                  placeholder={couponForm.discount_type === "PERCENTAGE" ? "e.g. 15" : "Amount"}
                  value={couponForm.value_numeric}
                  onChange={(e) => setCouponForm((f) => ({ ...f, value_numeric: e.target.value }))}
                />
              </FormField>
            </div>
          </div>

          {couponForm.discount_type === "PERCENTAGE" ? (
            <div className="rounded-xl border border-slate-100 bg-slate-50/40 p-4 sm:p-5">
              <p className="mb-4 text-[11px] font-semibold uppercase tracking-wider text-slate-500">3 · Percentage-only options</p>
              <div className="grid gap-5 lg:max-w-xl">
                <FormField
                  label="Max discount cap"
                  htmlFor="coupon-cap"
                  hint="Optional ceiling on the discount amount (e.g. cap 20% off at ₹100). Not used for FIXED coupons."
                >
                  <input
                    id="coupon-cap"
                    className={controlCls}
                    inputMode="decimal"
                    placeholder="Optional"
                    value={couponForm.max_discount_cap}
                    onChange={(e) => setCouponForm((f) => ({ ...f, max_discount_cap: e.target.value }))}
                  />
                </FormField>
              </div>
            </div>
          ) : null}

          <div className="rounded-xl border border-slate-100 bg-slate-50/40 p-4 sm:p-5">
            <p className="mb-4 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              {couponForm.discount_type === "PERCENTAGE" ? "4 · Redemption" : "3 · Redemption"}
            </p>
            <div className="grid gap-5 sm:grid-cols-2 lg:max-w-3xl">
              <FormField
                label="Total redemptions (all users)"
                htmlFor="coupon-usage-total"
                hint="Global cap: how many times this code can be used in total (tracked via used_count). Empty = unlimited."
              >
                <input
                  id="coupon-usage-total"
                  className={controlCls}
                  inputMode="numeric"
                  placeholder="Unlimited if empty"
                  value={couponForm.usage_limit}
                  onChange={(e) => setCouponForm((f) => ({ ...f, usage_limit: e.target.value }))}
                />
              </FormField>
              <FormField
                label="Max uses per user"
                htmlFor="coupon-usage-per-user"
                hint="Per checkout actor. Enforced when calculate sends couponRedemptionsByUser (omit = treated as 0 for quotes). Empty = unlimited per user."
              >
                <input
                  id="coupon-usage-per-user"
                  className={controlCls}
                  inputMode="numeric"
                  placeholder="Unlimited per user if empty"
                  value={couponForm.per_user_usage_limit}
                  onChange={(e) => setCouponForm((f) => ({ ...f, per_user_usage_limit: e.target.value }))}
                />
              </FormField>
            </div>
          </div>

          <div className="flex flex-wrap gap-x-6 gap-y-3 rounded-xl border border-slate-100 bg-slate-50/50 p-4 text-sm text-slate-700">
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
        </div>
        )}

        <div className="mt-8 flex flex-wrap items-center gap-3 border-t border-slate-100 pt-6">
          {builderMode === "platform_offer" ? (
            <>
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
                    setOfferConditionsBaseline(null);
                    setOfferForm(emptyOfferForm());
                  }}
                >
                  Cancel edit
                </button>
              ) : null}
            </>
          ) : (
            <>
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
                  "Create coupon"
                )}
              </button>
              {editingCouponId != null ? (
                <button
                  type="button"
                  className="rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                  onClick={() => {
                    setEditingCouponId(null);
                    setCouponMetaBaseline(null);
                    setCouponForm(emptyCouponForm());
                  }}
                >
                  Cancel edit
                </button>
              ) : null}
            </>
          )}
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
                  <th className="px-4 py-3 pr-3">Buy</th>
                  <th className="px-4 py-3 pr-3">Get</th>
                  <th className="px-4 py-3 pr-3">Fee target</th>
                  <th className="px-4 py-3 pr-3">Audience</th>
                  <th className="px-4 py-3 pr-3">Scope</th>
                  <th className="px-4 py-3 pr-3">Segment</th>
                  <th className="px-4 py-3 pr-3">Budget</th>
                  <th className="px-4 py-3 pr-3">Priority</th>
                  <th className="px-4 py-3 pr-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
              {offersLoading ? (
                <tr>
                  <td className="px-4 py-8 text-center text-slate-500" colSpan={12}>
                    Loading…
                  </td>
                </tr>
              ) : offers.length === 0 ? (
                <tr>
                  <td className="px-4 py-10 text-center text-slate-500" colSpan={12}>
                    No offers yet. Create one with the builder above.
                  </td>
                </tr>
              ) : (
                offers.map((o) => (
                <tr key={o.id} className="transition-colors hover:bg-slate-50/80">
                  <td className="px-4 py-3 pr-3 font-medium text-slate-900">{o.name ?? `Offer #${o.id}`}</td>
                  <td className="px-4 py-3 pr-3 text-slate-700">{o.service_type}</td>
                  <td className="px-4 py-3 pr-3 text-slate-700">{o.offer_kind}</td>
                  <td className="px-4 py-3 pr-3 tabular-nums text-slate-700">
                    {o.buy_qty != null && String(o.buy_qty) !== "" ? o.buy_qty : "—"}
                  </td>
                  <td className="px-4 py-3 pr-3 tabular-nums text-slate-700">
                    {o.get_qty != null && String(o.get_qty) !== "" ? o.get_qty : "—"}
                  </td>
                  <td className="px-4 py-3 pr-3 text-slate-600">{feeKindTableLabel(String(o.offer_kind ?? ""))}</td>
                  <td className="px-4 py-3 pr-3 text-slate-700">
                    {String(o.offer_audience ?? "CUSTOMER").toUpperCase()}
                  </td>
                  <td className="px-4 py-3 pr-3 text-slate-700">{o.target_scope}</td>
                  <td className="px-4 py-3 pr-3 text-slate-700">{o.customer_segment}</td>
                  <td className="px-4 py-3 pr-3 tabular-nums text-slate-700">
                    {o.budget_total != null && String(o.budget_total).trim() !== "" ? o.budget_total : "—"}
                  </td>
                  <td className="px-4 py-3 pr-3 tabular-nums text-slate-700">{o.priority}</td>
                  <td className="px-4 py-3 pr-3">
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        className="rounded-md text-xs font-medium text-indigo-600 hover:text-indigo-500"
                        onClick={() => {
                          setBuilderMode("platform_offer");
                          setEditingCouponId(null);
                          setCouponMetaBaseline(null);
                          setCouponForm(emptyCouponForm());
                          setEditingOfferId(o.id);
                          const cond =
                            o.conditions && typeof o.conditions === "object" && !Array.isArray(o.conditions)
                              ? (o.conditions as Record<string, unknown>)
                              : {};
                          setOfferConditionsBaseline({ ...cond });
                          const rawMenu = cond.menu_item_ids;
                          const menu_item_ids = Array.isArray(rawMenu)
                            ? rawMenu.map((x) => String(x)).join(", ")
                            : "";
                          const aud = String(o.offer_audience ?? "CUSTOMER").toUpperCase();
                          const rowSeg = String(o.customer_segment ?? "ALL").toUpperCase();
                          const condSegRaw = cond.user_segment;
                          const condSeg =
                            typeof condSegRaw === "string" && condSegRaw.trim() !== ""
                              ? condSegRaw.toUpperCase()
                              : "ALL";
                          const customer_segment =
                            rowSeg === "NEW" || rowSeg === "EXISTING"
                              ? rowSeg
                              : condSeg === "NEW" || condSeg === "EXISTING"
                                ? condSeg
                                : "ALL";
                          setOfferForm({
                            name: o.name ?? "",
                            service_type: o.service_type,
                            offer_kind: o.offer_kind ?? "DISCOUNT",
                            offer_audience: aud === "MERCHANT" || aud === "RIDER" ? aud : "CUSTOMER",
                            customer_segment,
                            starts_at: toDatetimeLocal(o.starts_at),
                            ends_at: toDatetimeLocal(o.ends_at),
                            min_order_amount: (() => {
                              const row =
                                o.min_order_amount != null && String(o.min_order_amount).trim() !== ""
                                  ? String(o.min_order_amount)
                                  : "";
                              const json =
                                cond.min_order_value != null && String(cond.min_order_value).trim() !== ""
                                  ? String(cond.min_order_value)
                                  : "";
                              return row !== "" ? row : json;
                            })(),
                            max_discount_amount: o.max_discount_amount ?? "",
                            budget_total: o.budget_total ?? "",
                            is_stackable: o.is_stackable ?? false,
                            discount_type: o.discount_type,
                            value_numeric: o.value_numeric ?? "",
                            delivery_discount_type: o.delivery_discount_type ?? "",
                            delivery_discount_value: o.delivery_discount_value ?? "",
                            buy_qty: o.buy_qty != null && String(o.buy_qty) !== "" ? String(o.buy_qty) : "",
                            get_qty: o.get_qty != null && String(o.get_qty) !== "" ? String(o.get_qty) : "",
                            exclusion_group: o.exclusion_group ?? "",
                            menu_item_ids,
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
          <p className="mt-1 text-sm text-slate-500">
            Promo codes for checkout. Create or edit in the promo builder: choose <span className="font-medium text-slate-700">Checkout coupon</span>{" "}
            at the top, or use Edit here to open that row in the builder.
          </p>
        </div>
        <div className="mt-2 overflow-hidden rounded-xl border border-slate-200/80">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="border-b border-slate-200 bg-slate-50/80 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
                <tr>
                  <th className="px-4 py-3 pr-3">Code</th>
                  <th className="px-4 py-3 pr-3">Audience</th>
                  <th className="px-4 py-3 pr-3">Service</th>
                  <th className="px-4 py-3 pr-3">Discount</th>
                  <th className="px-4 py-3 pr-3">Total cap</th>
                  <th className="px-4 py-3 pr-3">Per user</th>
                  <th className="px-4 py-3 pr-3">Used</th>
                  <th className="px-4 py-3 pr-3">Schedule</th>
                  <th className="px-4 py-3 pr-3">Active</th>
                  <th className="px-4 py-3 pr-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {couponsLoading ? (
                  <tr>
                    <td className="px-4 py-8 text-center text-slate-500" colSpan={10}>
                      Loading…
                    </td>
                  </tr>
                ) : coupons.length === 0 ? (
                  <tr>
                    <td className="px-4 py-10 text-center text-slate-500" colSpan={10}>
                      No coupons yet. Switch the builder to Checkout coupon and create one above.
                    </td>
                  </tr>
                ) : (
                  coupons.map((c) => {
                    const aud = String(c.offer_audience ?? "CUSTOMER").toUpperCase();
                    return (
                      <tr key={c.id} className="transition-colors hover:bg-slate-50/80">
                        <td className="px-4 py-3 pr-3 font-medium text-slate-900">{c.code}</td>
                        <td className="px-4 py-3 pr-3 text-slate-700">{aud}</td>
                        <td className="px-4 py-3 pr-3 text-slate-700">{c.service_type ?? "FOOD"}</td>
                        <td className="px-4 py-3 pr-3 text-slate-700">
                          {c.discount_type} · {c.value_numeric ?? "—"}
                        </td>
                        <td className="px-4 py-3 pr-3 tabular-nums text-slate-700">
                          {c.usage_limit != null ? c.usage_limit : "∞"}
                        </td>
                        <td className="px-4 py-3 pr-3 tabular-nums text-slate-700">
                          {c.per_user_usage_limit != null ? c.per_user_usage_limit : "∞"}
                        </td>
                        <td className="px-4 py-3 pr-3 tabular-nums text-slate-700">{c.used_count}</td>
                        <td className="px-4 py-3 pr-3 text-xs text-slate-600">
                          {shortScheduleLabel(c.valid_from, c.valid_until)}
                        </td>
                        <td className="px-4 py-3 pr-3 text-slate-700">{c.is_active ? "Yes" : "No"}</td>
                        <td className="px-4 py-3 pr-3">
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              className="rounded-md text-xs font-medium text-indigo-600 hover:text-indigo-500"
                              onClick={() => {
                                setBuilderMode("checkout_coupon");
                                setEditingOfferId(null);
                                setOfferForm(emptyOfferForm());
                                setEditingCouponId(c.id);
                                const meta =
                                  c.metadata && typeof c.metadata === "object" && !Array.isArray(c.metadata)
                                    ? { ...(c.metadata as Record<string, unknown>) }
                                    : {};
                                setCouponMetaBaseline(meta);
                                const rowAud = String(c.offer_audience ?? "CUSTOMER").toUpperCase();
                                setCouponForm({
                                  code: c.code,
                                  discount_type: c.discount_type,
                                  value_numeric: c.value_numeric ?? "",
                                  max_discount_cap: c.max_discount_cap ?? "",
                                  usage_limit: c.usage_limit != null ? String(c.usage_limit) : "",
                                  per_user_usage_limit:
                                    c.per_user_usage_limit != null ? String(c.per_user_usage_limit) : "",
                                  is_active: c.is_active,
                                  is_hidden: c.is_hidden,
                                  service_type: (c.service_type ?? "FOOD").toUpperCase(),
                                  offer_audience:
                                    rowAud === "MERCHANT" || rowAud === "RIDER" ? rowAud : "CUSTOMER",
                                  valid_from: toDatetimeLocal(c.valid_from),
                                  valid_until: toDatetimeLocal(c.valid_until),
                                  applies_on: readAppliesOn(c.metadata),
                                  customer_segment: readCustomerSegment(c.metadata),
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
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

    </div>
  );
}
