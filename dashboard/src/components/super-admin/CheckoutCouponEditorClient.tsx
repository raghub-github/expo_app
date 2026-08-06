"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  useCreateBillingDiscountMutation,
  useGetBillingDiscountsQuery,
  useUpdateBillingDiscountMutation,
  type BillingAdminDiscountCreateBody,
} from "@/store/api/billingAdminApi";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { cn } from "@/lib/utils";
import {
  COUPON_SERVICES,
  COUPON_USAGE_MODES,
  FOOD_COUPON_TYPES,
  PARCEL_COUPON_TYPES,
  RIDE_COUPON_TYPES,
  emptyCheckoutCouponConfig,
  sanitizeCheckoutCouponConfig,
  type CheckoutCouponConfig,
  type CouponServiceType,
  type CouponUsageMode,
} from "@/lib/billing/checkoutCouponConfig";

const cardCls =
  "w-full rounded-2xl border border-slate-200/80 bg-white p-5 text-slate-900 shadow-[0_4px_24px_-4px_rgba(15,23,42,0.08)] ring-1 ring-slate-900/[0.03] sm:p-8";
const controlCls =
  "w-full min-h-[42px] rounded-lg border border-slate-200/90 bg-slate-50/40 px-3 py-2.5 text-sm text-slate-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.6)] transition-[border-color,box-shadow,background-color] placeholder:text-slate-400 focus:border-indigo-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20";
const selectCls = cn(controlCls, "cursor-pointer");
const checkboxCls = "h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500/30";

const USAGE_LABELS: Record<CouponUsageMode, string> = {
  FIRST_ORDER_ONLY: "First Order Only",
  FIRST_N_ORDERS: "First N Orders",
  EVERY_ORDER: "Every Order",
  MAX_N_PER_CUSTOMER: "Maximum N Uses Per Customer",
  ONCE_PER_DAY: "Once Per Day",
  ONCE_PER_WEEK: "Once Per Week",
  ONCE_PER_MONTH: "Once Per Month",
  ONCE_PER_YEAR: "Once Per Year",
  UNLIMITED: "Unlimited",
  LIFETIME_N: "Lifetime N Uses",
  ONE_TIME_EVER: "One Time Ever",
};

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

function mergeCouponMetadata(
  appliesOn: string,
  customerSegment: string,
  baseline: Record<string, unknown> | null,
): unknown {
  const base = baseline && typeof baseline === "object" ? { ...baseline } : {};
  return { ...base, discount_applies_on: appliesOn, customer_segment: customerSegment };
}

function needsUsageN(mode: CouponUsageMode): boolean {
  return mode === "FIRST_N_ORDERS" || mode === "MAX_N_PER_CUSTOMER" || mode === "LIFETIME_N";
}

function derivePerUserLimit(cfg: CheckoutCouponConfig): number | null {
  switch (cfg.usage_mode) {
    case "FIRST_ORDER_ONLY":
    case "ONE_TIME_EVER":
    case "ONCE_PER_DAY":
    case "ONCE_PER_WEEK":
    case "ONCE_PER_MONTH":
    case "ONCE_PER_YEAR":
      return 1;
    case "FIRST_N_ORDERS":
    case "MAX_N_PER_CUSTOMER":
    case "LIFETIME_N":
      return cfg.usage_n != null && cfg.usage_n >= 1 ? cfg.usage_n : 1;
    case "UNLIMITED":
    case "EVERY_ORDER":
      return null;
    default:
      return cfg.usage_n ?? 1;
  }
}

function deriveServiceTypeColumn(services: CouponServiceType[]): string {
  if (services.length === 0) return "FOOD";
  if (services.length === 1) return services[0]!;
  return "ALL";
}

function couponTypesForServices(services: CouponServiceType[]): string[] {
  const set = new Set<string>();
  if (services.includes("FOOD")) FOOD_COUPON_TYPES.forEach((t) => set.add(t));
  if (services.includes("RIDE")) RIDE_COUPON_TYPES.forEach((t) => set.add(t));
  if (services.includes("PARCEL")) PARCEL_COUPON_TYPES.forEach((t) => set.add(t));
  if (set.size === 0) FOOD_COUPON_TYPES.forEach((t) => set.add(t));
  return Array.from(set);
}

type Props = { mode: "create" | "edit"; couponId?: number };

type FormState = {
  code: string;
  discount_type: string;
  value_numeric: string;
  max_discount_cap: string;
  usage_limit: string;
  is_active: boolean;
  is_hidden: boolean;
  offer_audience: string;
  valid_from: string;
  valid_until: string;
  applies_on: string;
  services: CouponServiceType[];
  cfg: CheckoutCouponConfig;
};

const emptyForm = (): FormState => {
  const cfg = emptyCheckoutCouponConfig();
  return {
    code: "",
    discount_type: "PERCENTAGE",
    value_numeric: "",
    max_discount_cap: "",
    usage_limit: "",
    is_active: true,
    is_hidden: false,
    offer_audience: "CUSTOMER",
    valid_from: "",
    valid_until: "",
    applies_on: "CART_ITEMS",
    services: ["FOOD"],
    cfg,
  };
};

export function CheckoutCouponEditorClient({ mode, couponId }: Props) {
  const router = useRouter();
  const { data: coupons = [], isLoading } = useGetBillingDiscountsQuery();
  const [createCoupon, createState] = useCreateBillingDiscountMutation();
  const [updateCoupon, updateState] = useUpdateBillingDiscountMutation();
  const [form, setForm] = useState(emptyForm);
  const [metaBaseline, setMetaBaseline] = useState<Record<string, unknown> | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(mode === "create");

  const typeOptions = useMemo(() => couponTypesForServices(form.services), [form.services]);

  useEffect(() => {
    if (mode !== "edit" || couponId == null || isLoading) return;
    const c = coupons.find((x) => Number(x.id) === Number(couponId));
    if (!c) {
      setErr(`Coupon #${couponId} not found.`);
      setHydrated(true);
      return;
    }
    const meta =
      c.metadata && typeof c.metadata === "object" && !Array.isArray(c.metadata)
        ? { ...(c.metadata as Record<string, unknown>) }
        : {};
    setMetaBaseline(meta);
    const rowAud = String(c.offer_audience ?? "CUSTOMER").toUpperCase();
    const cfg = sanitizeCheckoutCouponConfig(c.coupon_config);
    const fromColumn = String(c.service_type ?? "FOOD").toUpperCase();
    let services: CouponServiceType[] =
      cfg.service_types?.length
        ? cfg.service_types
        : fromColumn === "ALL"
          ? [...COUPON_SERVICES]
          : (COUPON_SERVICES as readonly string[]).includes(fromColumn)
            ? [fromColumn as CouponServiceType]
            : ["FOOD"];
    const segment =
      cfg.customer_segment && cfg.customer_segment !== "ALL"
        ? cfg.customer_segment
        : (() => {
            const v = meta.customer_segment;
            return typeof v === "string" ? v.toUpperCase() : "ALL";
          })();
    setForm({
      code: c.code,
      discount_type: c.discount_type,
      value_numeric: c.value_numeric ?? "",
      max_discount_cap:
        c.max_discount_cap != null && c.max_discount_cap !== ""
          ? String(c.max_discount_cap)
          : cfg.max_discount != null
            ? String(cfg.max_discount)
            : "",
      usage_limit: c.usage_limit != null ? String(c.usage_limit) : "",
      is_active: c.is_active,
      is_hidden: c.is_hidden,
      offer_audience: rowAud === "MERCHANT" || rowAud === "RIDER" ? rowAud : "CUSTOMER",
      valid_from: toDatetimeLocal(c.valid_from),
      valid_until: toDatetimeLocal(c.valid_until),
      applies_on: readAppliesOn(c.metadata),
      services,
      cfg: {
        ...cfg,
        customer_segment: (["ALL", "NEW", "EXISTING", "REFERRAL", "SUBSCRIPTION"] as const).includes(
          segment as never,
        )
          ? (segment as CheckoutCouponConfig["customer_segment"])
          : "ALL",
        max_discount:
          cfg.max_discount ??
          (c.max_discount_cap != null && c.max_discount_cap !== ""
            ? Number(c.max_discount_cap)
            : null),
        usage_n:
          cfg.usage_n ??
          (c.per_user_usage_limit != null && c.per_user_usage_limit > 0 ? c.per_user_usage_limit : 1),
        public: cfg.public !== false && !c.is_hidden,
      },
    });
    setHydrated(true);
  }, [mode, couponId, coupons, isLoading]);

  const busy = createState.isLoading || updateState.isLoading;

  const toggleService = (s: CouponServiceType) => {
    setForm((f) => {
      const has = f.services.includes(s);
      const next = has ? f.services.filter((x) => x !== s) : [...f.services, s];
      const services = next.length ? next : (["FOOD"] as CouponServiceType[]);
      const types = couponTypesForServices(services);
      const coupon_type =
        f.cfg.coupon_type && types.includes(f.cfg.coupon_type) ? f.cfg.coupon_type : types[0] ?? "PERCENT";
      return { ...f, services, cfg: { ...f.cfg, service_types: services, coupon_type } };
    });
  };

  const patchCfg = (patch: Partial<CheckoutCouponConfig>) => {
    setForm((f) => ({ ...f, cfg: { ...f.cfg, ...patch } }));
  };

  const save = async () => {
    setErr(null);
    const valueTrim = form.value_numeric.trim();
    const valueNumeric = valueTrim === "" ? null : Number(valueTrim);
    if (valueNumeric != null && Number.isNaN(valueNumeric)) {
      setErr("Discount value must be a number.");
      toast.error("Discount value must be a number.");
      return;
    }
    if (!form.code.trim()) {
      setErr("Coupon code is required.");
      toast.error("Coupon code is required.");
      return;
    }
    if (form.services.length === 0) {
      setErr("Select at least one order type (Food / Parcel / Ride).");
      toast.error("Select at least one order type.");
      return;
    }
    const usageMode = (form.cfg.usage_mode ?? "MAX_N_PER_CUSTOMER") as CouponUsageMode;
    if (needsUsageN(usageMode)) {
      const n = Number(form.cfg.usage_n);
      if (!Number.isInteger(n) || n < 1 || n > 999) {
        setErr("Usage N must be a whole number between 1 and 999.");
        toast.error("Usage N must be between 1 and 999.");
        return;
      }
    }
    const capTrim = form.max_discount_cap.trim();
    const maxCap =
      form.discount_type === "PERCENTAGE" && capTrim !== ""
        ? Number(capTrim)
        : form.cfg.max_discount != null
          ? Number(form.cfg.max_discount)
          : null;
    if (maxCap != null && Number.isNaN(maxCap)) {
      setErr("Max discount must be a number.");
      toast.error("Max discount must be a number.");
      return;
    }
    const usageTrim = form.usage_limit.trim();
    const usageLimit = usageTrim !== "" ? Number(usageTrim) : null;
    if (usageLimit != null && (!Number.isInteger(usageLimit) || usageLimit < 0)) {
      setErr("Total usage limit must be a non-negative whole number.");
      toast.error("Total redemptions must be a non-negative whole number.");
      return;
    }
    const aud = form.offer_audience.toUpperCase();
    const offerAudience = aud === "MERCHANT" || aud === "RIDER" ? aud : "CUSTOMER";
    const cfg: CheckoutCouponConfig = sanitizeCheckoutCouponConfig({
      ...form.cfg,
      usage_mode: usageMode,
      service_types: form.services,
      max_discount: maxCap,
      customer_segment: form.cfg.customer_segment ?? "ALL",
      public: !form.is_hidden,
    });
    const metadata = mergeCouponMetadata(
      form.applies_on,
      cfg.customer_segment ?? "ALL",
      mode === "edit" ? metaBaseline : null,
    );
    const payload: Record<string, unknown> = {
      code: form.code.trim().toUpperCase(),
      discount_type: form.discount_type,
      value_numeric: valueNumeric,
      max_discount_cap: maxCap,
      usage_limit: usageLimit,
      is_active: form.is_active,
      is_hidden: form.is_hidden,
      valid_from: form.valid_from ? new Date(form.valid_from).toISOString() : null,
      valid_until: form.valid_until ? new Date(form.valid_until).toISOString() : null,
      service_type: deriveServiceTypeColumn(form.services),
      offer_audience: offerAudience,
      per_user_usage_limit: derivePerUserLimit(cfg),
      metadata,
      coupon_config: cfg,
    };
    try {
      if (mode === "edit" && couponId != null) {
        await updateCoupon({ id: couponId, body: payload }).unwrap();
        toast.success("Checkout coupon updated");
      } else {
        await createCoupon(payload as BillingAdminDiscountCreateBody).unwrap();
        toast.success("Checkout coupon created");
      }
      router.push("/dashboard/super-admin/offers-coupons");
      router.refresh();
    } catch (e) {
      const msg =
        e && typeof e === "object" && "data" in e
          ? String(
              (e as { data?: { error?: string; message?: string } }).data?.message ??
                (e as { data?: { error?: string } }).data?.error ??
                (e as { message?: string }).message ??
                "Failed to save coupon"
            )
          : e instanceof Error
            ? e.message
            : "Failed to save coupon";
      setErr(msg);
      toast.error(msg);
    }
  };

  if (!hydrated || (mode === "edit" && isLoading)) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full bg-gradient-to-b from-slate-50/80 to-white px-4 pb-16 pt-4 sm:px-6 sm:pt-6 lg:px-8">
      <p className="mb-4 max-w-3xl text-sm text-slate-600">
        Platform checkout coupons for Food, Parcel, and Person Ride. Map geo coverage in{" "}
        <Link href="/dashboard/super-admin/geo" className="font-medium text-indigo-600 hover:underline">
          Geo &amp; coverage
        </Link>{" "}
        — unmapped coupons stay hidden everywhere. Store Offer Engine is not affected.
      </p>

      {err ? (
        <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">
          {err}
        </div>
      ) : null}

      <section className={cn(cardCls, "space-y-6")}>
        <FormSection title="Order type eligibility" description="Select one or more services this coupon can apply to.">
          <div className="flex flex-wrap gap-4">
            {COUPON_SERVICES.map((s) => (
              <label key={s} className="flex cursor-pointer items-center gap-2.5 text-sm text-slate-700">
                <input
                  type="checkbox"
                  className={checkboxCls}
                  checked={form.services.includes(s)}
                  onChange={() => toggleService(s)}
                />
                {s === "FOOD" ? "Food Orders" : s === "PARCEL" ? "Parcel Orders" : "Person Ride Orders"}
              </label>
            ))}
          </div>
        </FormSection>

        <FormSection title="Audience & schedule">
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            <FormField label="Offer audience" htmlFor="coupon-offer-audience">
              <select
                id="coupon-offer-audience"
                className={selectCls}
                value={form.offer_audience}
                onChange={(e) => setForm((f) => ({ ...f, offer_audience: e.target.value }))}
              >
                {["CUSTOMER", "MERCHANT", "RIDER"].map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="Applies on" htmlFor="coupon-applies-on">
              <select
                id="coupon-applies-on"
                className={selectCls}
                value={form.applies_on}
                onChange={(e) => setForm((f) => ({ ...f, applies_on: e.target.value }))}
              >
                <option value="CART_ITEMS">Items &amp; add-ons subtotal</option>
                <option value="ORDER_BEFORE_TAX">Entire order before tax (future)</option>
              </select>
            </FormField>
            <FormField label="Valid from" htmlFor="coupon-valid-from" hint="Empty = start immediately when active.">
              <input
                id="coupon-valid-from"
                className={controlCls}
                type="datetime-local"
                value={form.valid_from}
                onChange={(e) => setForm((f) => ({ ...f, valid_from: e.target.value }))}
              />
            </FormField>
            <FormField label="Valid until" htmlFor="coupon-valid-until" hint="Empty = no end date.">
              <input
                id="coupon-valid-until"
                className={controlCls}
                type="datetime-local"
                value={form.valid_until}
                onChange={(e) => setForm((f) => ({ ...f, valid_until: e.target.value }))}
              />
            </FormField>
          </div>
        </FormSection>

        <FormSection title="Usage rules" description="Server-enforced redemption modes. Customer app cannot bypass these.">
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            <FormField label="Redemption mode" htmlFor="coupon-usage-mode" className="lg:col-span-2">
              <select
                id="coupon-usage-mode"
                className={selectCls}
                value={form.cfg.usage_mode ?? "MAX_N_PER_CUSTOMER"}
                onChange={(e) =>
                  patchCfg({ usage_mode: e.target.value as CouponUsageMode })
                }
              >
                {COUPON_USAGE_MODES.map((m) => (
                  <option key={m} value={m}>
                    {USAGE_LABELS[m]}
                  </option>
                ))}
              </select>
            </FormField>
            {needsUsageN((form.cfg.usage_mode ?? "MAX_N_PER_CUSTOMER") as CouponUsageMode) ? (
              <FormField label="N (1–999)" htmlFor="coupon-usage-n">
                <input
                  id="coupon-usage-n"
                  className={controlCls}
                  inputMode="numeric"
                  value={form.cfg.usage_n != null ? String(form.cfg.usage_n) : ""}
                  onChange={(e) =>
                    patchCfg({
                      usage_n: e.target.value.trim() === "" ? null : Number(e.target.value),
                    })
                  }
                />
              </FormField>
            ) : null}
            <FormField label="Total redemptions" htmlFor="coupon-usage-total" hint="Empty = unlimited across all customers.">
              <input
                id="coupon-usage-total"
                className={controlCls}
                inputMode="numeric"
                placeholder="Unlimited"
                value={form.usage_limit}
                onChange={(e) => setForm((f) => ({ ...f, usage_limit: e.target.value }))}
              />
            </FormField>
          </div>
        </FormSection>

        <FormSection title="Code & discount">
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            <FormField label="Coupon code" htmlFor="coupon-code" className="lg:col-span-2">
              <input
                id="coupon-code"
                className={controlCls}
                placeholder="e.g. WELCOME20"
                value={form.code}
                onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))}
              />
            </FormField>
            <FormField label="Coupon type" htmlFor="coupon-type">
              <select
                id="coupon-type"
                className={selectCls}
                value={form.cfg.coupon_type ?? typeOptions[0] ?? "PERCENT"}
                onChange={(e) => patchCfg({ coupon_type: e.target.value })}
              >
                {typeOptions.map((t) => (
                  <option key={t} value={t}>
                    {t.replaceAll("_", " ")}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="Discount math" htmlFor="coupon-discount-type">
              <select
                id="coupon-discount-type"
                className={selectCls}
                value={form.discount_type}
                onChange={(e) => {
                  const v = e.target.value;
                  setForm((f) => ({
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
            <FormField label="Discount value" htmlFor="coupon-value">
              <input
                id="coupon-value"
                className={controlCls}
                inputMode="decimal"
                placeholder={form.discount_type === "PERCENTAGE" ? "e.g. 15" : "Amount"}
                value={form.value_numeric}
                onChange={(e) => setForm((f) => ({ ...f, value_numeric: e.target.value }))}
              />
            </FormField>
            {form.discount_type === "PERCENTAGE" ? (
              <FormField label="Max discount cap" htmlFor="coupon-cap">
                <input
                  id="coupon-cap"
                  className={controlCls}
                  inputMode="decimal"
                  placeholder="Optional"
                  value={form.max_discount_cap}
                  onChange={(e) => setForm((f) => ({ ...f, max_discount_cap: e.target.value }))}
                />
              </FormField>
            ) : null}
          </div>
        </FormSection>

        <FormSection title="Restrictions" description="Optional gates enforced server-side before a coupon is accepted.">
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            <FormField label="Minimum order value" htmlFor="coupon-mov">
              <input
                id="coupon-mov"
                className={controlCls}
                inputMode="decimal"
                placeholder="Optional"
                value={form.cfg.min_order_value != null ? String(form.cfg.min_order_value) : ""}
                onChange={(e) =>
                  patchCfg({
                    min_order_value: e.target.value.trim() === "" ? null : Number(e.target.value),
                  })
                }
              />
            </FormField>
            <FormField label="Customer segment" htmlFor="coupon-segment">
              <select
                id="coupon-segment"
                className={selectCls}
                value={form.cfg.customer_segment ?? "ALL"}
                onChange={(e) =>
                  patchCfg({
                    customer_segment: e.target.value as CheckoutCouponConfig["customer_segment"],
                  })
                }
              >
                {["ALL", "NEW", "EXISTING", "REFERRAL", "SUBSCRIPTION"].map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="Max ride distance (km)" htmlFor="coupon-ride-km">
              <input
                id="coupon-ride-km"
                className={controlCls}
                inputMode="decimal"
                placeholder="Optional"
                value={form.cfg.max_ride_distance_km != null ? String(form.cfg.max_ride_distance_km) : ""}
                onChange={(e) =>
                  patchCfg({
                    max_ride_distance_km: e.target.value.trim() === "" ? null : Number(e.target.value),
                  })
                }
              />
            </FormField>
            <FormField label="Max parcel distance (km)" htmlFor="coupon-parcel-km">
              <input
                id="coupon-parcel-km"
                className={controlCls}
                inputMode="decimal"
                placeholder="Optional"
                value={
                  form.cfg.max_parcel_distance_km != null ? String(form.cfg.max_parcel_distance_km) : ""
                }
                onChange={(e) =>
                  patchCfg({
                    max_parcel_distance_km: e.target.value.trim() === "" ? null : Number(e.target.value),
                  })
                }
              />
            </FormField>
            <FormField label="Max weight (kg)" htmlFor="coupon-weight">
              <input
                id="coupon-weight"
                className={controlCls}
                inputMode="decimal"
                placeholder="Optional"
                value={form.cfg.max_weight_kg != null ? String(form.cfg.max_weight_kg) : ""}
                onChange={(e) =>
                  patchCfg({
                    max_weight_kg: e.target.value.trim() === "" ? null : Number(e.target.value),
                  })
                }
              />
            </FormField>
            <FormField label="Vehicle types" htmlFor="coupon-vehicles" hint="Comma-separated, e.g. BIKE, AUTO">
              <input
                id="coupon-vehicles"
                className={controlCls}
                value={(form.cfg.vehicle_types ?? []).join(", ")}
                onChange={(e) =>
                  patchCfg({
                    vehicle_types: e.target.value
                      .split(",")
                      .map((x) => x.trim())
                      .filter(Boolean),
                  })
                }
              />
            </FormField>
            <FormField label="Payment modes" htmlFor="coupon-pay" hint="Comma-separated, e.g. COD, UPI, CARD">
              <input
                id="coupon-pay"
                className={controlCls}
                value={(form.cfg.payment_modes ?? []).join(", ")}
                onChange={(e) =>
                  patchCfg({
                    payment_modes: e.target.value
                      .split(",")
                      .map((x) => x.trim())
                      .filter(Boolean),
                  })
                }
              />
            </FormField>
            <FormField label="Priority" htmlFor="coupon-priority" hint="Lower = higher priority when exclusive.">
              <input
                id="coupon-priority"
                className={controlCls}
                inputMode="numeric"
                value={form.cfg.priority != null ? String(form.cfg.priority) : "100"}
                onChange={(e) => patchCfg({ priority: Number(e.target.value) || 100 })}
              />
            </FormField>
          </div>
        </FormSection>

        <FormSection title="Behaviour">
          <div className="flex flex-wrap gap-x-6 gap-y-3 rounded-xl border border-slate-100 bg-slate-50/50 p-4 text-sm text-slate-700">
            {(
              [
                ["is_active", "Active", form.is_active, (v: boolean) => setForm((f) => ({ ...f, is_active: v }))],
                ["is_hidden", "Hidden coupon", form.is_hidden, (v: boolean) => setForm((f) => ({ ...f, is_hidden: v }))],
                ["auto_apply", "Auto apply", !!form.cfg.auto_apply, (v: boolean) => patchCfg({ auto_apply: v })],
                ["manual_entry", "Manual coupon entry", form.cfg.manual_entry !== false, (v: boolean) => patchCfg({ manual_entry: v })],
                ["stackable", "Stackable", !!form.cfg.stackable, (v: boolean) => patchCfg({ stackable: v })],
                ["exclusive", "Exclusive", form.cfg.exclusive !== false, (v: boolean) => patchCfg({ exclusive: v })],
                ["restore_on_cancel", "Restore usage on cancel", form.cfg.restore_on_cancel !== false, (v: boolean) => patchCfg({ restore_on_cancel: v })],
                ["restore_on_refund", "Restore usage on refund", form.cfg.restore_on_refund !== false, (v: boolean) => patchCfg({ restore_on_refund: v })],
              ] as const
            ).map(([key, label, checked, onChange]) => (
              <label key={key} className="flex cursor-pointer items-center gap-2.5">
                <input
                  type="checkbox"
                  className={checkboxCls}
                  checked={checked}
                  onChange={(e) => onChange(e.target.checked)}
                />
                {label}
              </label>
            ))}
          </div>
          <div className="mt-4 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            <FormField label="Consume on" htmlFor="coupon-consume">
              <select
                id="coupon-consume"
                className={selectCls}
                value={form.cfg.consume_on ?? "PLACED"}
                onChange={(e) =>
                  patchCfg({ consume_on: e.target.value === "DELIVERED" ? "DELIVERED" : "PLACED" })
                }
              >
                <option value="PLACED">Order placement</option>
                <option value="DELIVERED">Delivery</option>
              </select>
            </FormField>
          </div>
        </FormSection>

        <div className="flex flex-wrap items-center gap-3 pt-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => void save()}
            className="inline-flex min-h-[44px] items-center justify-center rounded-lg bg-gradient-to-r from-indigo-600 to-violet-600 px-6 text-sm font-semibold text-white shadow-md shadow-indigo-500/25 transition hover:from-indigo-500 hover:to-violet-500 disabled:opacity-60"
          >
            {busy ? (
              <span className="inline-flex items-center gap-2">
                <LoadingSpinner variant="button" size="sm" /> Saving…
              </span>
            ) : mode === "edit" ? (
              "Save coupon"
            ) : (
              "Create coupon"
            )}
          </button>
          <Link
            href="/dashboard/super-admin/offers-coupons"
            className="inline-flex min-h-[44px] items-center justify-center rounded-lg border border-slate-200 bg-white px-5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </Link>
        </div>
      </section>
    </div>
  );
}
