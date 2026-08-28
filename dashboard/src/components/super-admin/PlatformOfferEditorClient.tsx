"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  useCreateBillingPlatformOfferMutation,
  useGetBillingPlatformOffersQuery,
  useUpdateBillingPlatformOfferMutation,
} from "@/store/api/billingAdminApi";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { PLATFORM_OFFER_KINDS } from "@/lib/billing/platformOfferKinds";
import { PLATFORM_OFFER_SERVICE_TYPES } from "@/lib/billing/platformOfferServiceTypes";
import {
  getPlatformOfferKindSections,
  validatePlatformOfferKindForm,
} from "@/lib/billing/platformOfferKindUi";
import {
  generatePlatformOfferCouponCode,
  normalizePlatformOfferCouponCode,
  validatePlatformOfferCouponCode,
} from "@/lib/billing/platformOfferCouponCode";
import {
  emptyRideParcelPromoConfig,
  parseRideParcelPromoConfig,
  type RideParcelPromoConfig,
} from "@/lib/billing/rideParcelPromo";
import { RideParcelPromoBuilder } from "@/components/super-admin/RideParcelPromoBuilder";
import { cn } from "@/lib/utils";

const cardCls =
  "w-full rounded-2xl border border-slate-200/80 bg-white p-5 text-slate-900 shadow-[0_4px_24px_-4px_rgba(15,23,42,0.08)] ring-1 ring-slate-900/[0.03] sm:p-8";
const controlCls =
  "w-full min-h-[42px] rounded-lg border border-slate-200/90 bg-slate-50/40 px-3 py-2.5 text-sm text-slate-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.6)] transition-[border-color,box-shadow,background-color] placeholder:text-slate-400 focus:border-indigo-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20";
const selectCls = cn(controlCls, "cursor-pointer");
const checkboxCls = "h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500/30";

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

function toDatetimeLocal(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

type Props = {
  mode: "create" | "edit";
  offerId?: number;
};

const emptyForm = () => ({
  name: "",
  coupon_code: "",
  service_type: "FOOD",
  offer_kind: "DISCOUNT",
  offer_audience: "CUSTOMER",
  customer_segment: "ALL",
  first_ride_only: false,
  starts_at: "",
  ends_at: "",
  min_order_amount: "",
  max_discount_amount: "",
  budget_total: "",
  max_uses_per_user: "",
  max_uses_total: "",
  max_uses_per_day: "",
  max_uses_per_month: "",
  consume_mode: "ON_PLACED",
  restore_on_cancel: true,
  restore_on_refund: true,
  is_stackable: false,
  discount_type: "PERCENTAGE",
  value_numeric: "",
  delivery_discount_type: "",
  delivery_discount_value: "",
  /** Food platform offers only — stored in promo_config.auto_apply */
  food_auto_apply: false,
  buy_qty: "",
  get_qty: "",
  exclusion_group: "",
  menu_item_ids: "",
  priority: "0",
  is_active: true,
  is_hidden: false,
});

export function PlatformOfferEditorClient({ mode, offerId }: Props) {
  const router = useRouter();
  const { data: offers = [], isLoading } = useGetBillingPlatformOffersQuery();
  const [createOffer, createState] = useCreateBillingPlatformOfferMutation();
  const [updateOffer, updateState] = useUpdateBillingPlatformOfferMutation();
  const [form, setForm] = useState(emptyForm);
  const [promoConfig, setPromoConfig] = useState<RideParcelPromoConfig>(() =>
    emptyRideParcelPromoConfig("RIDE")
  );
  const [conditionsBaseline, setConditionsBaseline] = useState<Record<string, unknown> | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(mode === "create");
  /** When true, changing Name will refresh auto-generated coupon code. */
  const [couponCodeAuto, setCouponCodeAuto] = useState(mode === "create");

  const offerKindUi = useMemo(() => getPlatformOfferKindSections(form.offer_kind), [form.offer_kind]);
  const isRideOrParcel =
    form.service_type === "RIDE" || form.service_type === "PARCEL";

  const onNameChange = (name: string) => {
    setForm((f) => {
      if (!couponCodeAuto) return { ...f, name };
      return { ...f, name, coupon_code: generatePlatformOfferCouponCode(name) };
    });
  };

  useEffect(() => {
    if (mode !== "edit" || offerId == null || isLoading) return;
    if (hydrated) return;
    const o = offers.find((x) => Number(x.id) === Number(offerId));
    if (!o) {
      // List may still be empty while cache is warming — wait before erroring.
      if (offers.length === 0) return;
      setErr(`Offer #${offerId} not found.`);
      setHydrated(true);
      return;
    }
    const cond =
      o.conditions && typeof o.conditions === "object" && !Array.isArray(o.conditions)
        ? (o.conditions as Record<string, unknown>)
        : {};
    setConditionsBaseline({ ...cond });
    const rawMenu = cond.menu_item_ids;
    const menu_item_ids = Array.isArray(rawMenu) ? rawMenu.map((x) => String(x)).join(", ") : "";
    const aud = String(o.offer_audience ?? "CUSTOMER").toUpperCase();
    const rowSeg = String(o.customer_segment ?? "ALL").toUpperCase();
    const condSegRaw = cond.user_segment;
    const condSeg =
      typeof condSegRaw === "string" && condSegRaw.trim() !== "" ? condSegRaw.toUpperCase() : "ALL";
    const customer_segment =
      rowSeg === "NEW" || rowSeg === "EXISTING"
        ? rowSeg
        : condSeg === "NEW" || condSeg === "EXISTING"
          ? condSeg
          : "ALL";
    const minRow =
      o.min_order_amount != null && String(o.min_order_amount).trim() !== ""
        ? String(o.min_order_amount)
        : "";
    const minJson =
      cond.min_order_value != null && String(cond.min_order_value).trim() !== ""
        ? String(cond.min_order_value)
        : "";
    const rawFirstRide = cond.first_ride_only;
    const first_ride_only =
      rawFirstRide === true || rawFirstRide === "true" || rawFirstRide === 1;
    setForm({
      name: o.name ?? "",
      coupon_code: o.coupon_code ?? "",
      service_type: o.service_type,
      offer_kind: o.offer_kind ?? "DISCOUNT",
      offer_audience: aud === "MERCHANT" || aud === "RIDER" ? aud : "CUSTOMER",
      customer_segment,
      first_ride_only,
      starts_at: toDatetimeLocal(o.starts_at),
      ends_at: toDatetimeLocal(o.ends_at),
      min_order_amount: minRow !== "" ? minRow : minJson,
      max_discount_amount: o.max_discount_amount ?? "",
      budget_total: o.budget_total ?? "",
      max_uses_per_user: o.max_uses_per_user != null ? String(o.max_uses_per_user) : "",
      max_uses_total: o.max_uses_total != null ? String(o.max_uses_total) : "",
      max_uses_per_day: o.max_uses_per_day != null ? String(o.max_uses_per_day) : "",
      max_uses_per_month: o.max_uses_per_month != null ? String(o.max_uses_per_month) : "",
      consume_mode:
        String(o.consume_mode ?? "ON_PLACED").toUpperCase() === "ON_DELIVERED"
          ? "ON_DELIVERED"
          : "ON_PLACED",
      restore_on_cancel: o.restore_on_cancel !== false,
      restore_on_refund: o.restore_on_refund !== false,
      is_stackable: o.is_stackable ?? false,
      discount_type: o.discount_type,
      value_numeric: o.value_numeric ?? "",
      delivery_discount_type: (() => {
        const t = String(o.delivery_discount_type ?? "").toUpperCase().trim();
        if (t === "PERCENTAGE") return "PERCENT";
        return t;
      })(),
      delivery_discount_value: o.delivery_discount_value ?? "",
      food_auto_apply: (() => {
        const pc = (o as { promo_config?: unknown }).promo_config;
        if (pc && typeof pc === "object" && !Array.isArray(pc)) {
          return (pc as { auto_apply?: unknown }).auto_apply === true;
        }
        return false;
      })(),
      buy_qty: o.buy_qty != null && String(o.buy_qty) !== "" ? String(o.buy_qty) : "",
      get_qty: o.get_qty != null && String(o.get_qty) !== "" ? String(o.get_qty) : "",
      exclusion_group: o.exclusion_group ?? "",
      menu_item_ids,
      priority: String(o.priority ?? 0),
      is_active: o.is_active ?? true,
      is_hidden: o.is_hidden ?? false,
    });
    const st = String(o.service_type ?? "FOOD").toUpperCase();
    const parsedPromo = parseRideParcelPromoConfig(
      (o as { promo_config?: unknown }).promo_config
    );
    setPromoConfig(
      parsedPromo ??
        emptyRideParcelPromoConfig(st === "PARCEL" ? "PARCEL" : "RIDE")
    );
    setCouponCodeAuto(false);
    setHydrated(true);
  }, [mode, offerId, offers, isLoading, hydrated]);

  const busy = createState.isLoading || updateState.isLoading;

  const save = async () => {
    setErr(null);
    const codeErr = validatePlatformOfferCouponCode(form.coupon_code);
    if (codeErr) {
      setErr(codeErr);
      return;
    }
    const valueNumeric =
      String(form.value_numeric ?? "").trim() === "" ? null : Number(form.value_numeric);
    if (valueNumeric != null && Number.isNaN(valueNumeric)) {
      setErr("Cart discount value must be a number.");
      return;
    }
    const rideParcelService = form.service_type === "RIDE" || form.service_type === "PARCEL";
    if (!rideParcelService) {
      const kindFormErr = validatePlatformOfferKindForm({
        offerKind: form.offer_kind,
        buyQtyStr: form.buy_qty,
        getQtyStr: form.get_qty,
        menuItemIdsStr: form.menu_item_ids,
        valueNumeric,
      });
      if (kindFormErr) {
        setErr(kindFormErr);
        return;
      }
      if (form.offer_kind === "FREE_DELIVERY" && !String(form.delivery_discount_type).trim()) {
        setErr("FREE_DELIVERY requires a delivery discount type.");
        return;
      }
    } else {
      // Special ride/parcel promo types may omit flat/% value.
      const specialTypes = new Set([
        "FREE_FIRST_N",
        "FREE_UP_TO_KM",
        "FLAT_FARE_UP_TO_KM",
        "PAY_FIXED",
        "FARE_CAP",
        "DISTANCE_TIERED",
        "FREE_PICKUP",
        "FREE_DROP",
      ]);
      if (!specialTypes.has(promoConfig.promo_type) && (valueNumeric == null || valueNumeric <= 0)) {
        setErr("Enter a discount value for this offer type.");
        return;
      }
    }

    const parseOptionalInt = (raw: string, label: string): number | null | "err" => {
      const t = String(raw ?? "").trim();
      if (t === "") return null;
      const n = parseInt(t, 10);
      if (!Number.isInteger(n) || n < 1) {
        setErr(`${label} must be a positive whole number.`);
        return "err";
      }
      return n;
    };
    const maxUsesPerUser = parseOptionalInt(form.max_uses_per_user, "Per user limit");
    if (maxUsesPerUser === "err") return;
    const maxUsesTotal = parseOptionalInt(form.max_uses_total, "Lifetime limit");
    if (maxUsesTotal === "err") return;
    const maxUsesPerDay = parseOptionalInt(form.max_uses_per_day, "Daily limit");
    if (maxUsesPerDay === "err") return;
    const maxUsesPerMonth = parseOptionalInt(form.max_uses_per_month, "Monthly limit");
    if (maxUsesPerMonth === "err") return;

    const budgetTrim = String(form.budget_total ?? "").trim();
    const budgetTotal = budgetTrim === "" ? null : Number(budgetTrim);
    if (budgetTotal != null && Number.isNaN(budgetTotal)) {
      setErr("Campaign budget must be a number.");
      return;
    }

    const idTokens = form.menu_item_ids
      .split(/[\s,]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    const conditions: Record<string, unknown> = {
      ...(mode === "edit" && conditionsBaseline ? { ...conditionsBaseline } : {}),
    };
    delete conditions.menu_item_ids;
    delete conditions.min_order_value;
    delete conditions.user_segment;
    delete conditions.first_ride_only;
    if (idTokens.length > 0) conditions.menu_item_ids = idTokens;
    const stUpper = form.service_type.toUpperCase();
    if (form.first_ride_only && (stUpper === "RIDE" || stUpper === "ALL")) {
      conditions.first_ride_only = true;
    }
    // Keep legacy first_ride_only in sync when promo first_n is 1.
    if (
      stUpper === "RIDE" &&
      promoConfig.first_n_completed === 1 &&
      (promoConfig.promo_type === "FREE_FIRST_N" || promoConfig.promo_type === "NEW_USER_N")
    ) {
      conditions.first_ride_only = true;
    }

    const aud = form.offer_audience.toUpperCase();
    let delTypeRaw = rideParcelService ? "" : form.delivery_discount_type;
    // FREE_DELIVERY with PERCENT/FIXED but empty value would cut ₹0 — coerce to FULL_WAIVE.
    if (
      !rideParcelService &&
      form.offer_kind === "FREE_DELIVERY" &&
      (String(delTypeRaw).toUpperCase() === "PERCENT" ||
        String(delTypeRaw).toUpperCase() === "PERCENTAGE" ||
        String(delTypeRaw).toUpperCase() === "FIXED") &&
      !String(form.delivery_discount_value ?? "").trim()
    ) {
      delTypeRaw = "FULL_WAIVE";
    }
    if (!rideParcelService && form.offer_kind === "FREE_DELIVERY" && !String(delTypeRaw).trim()) {
      delTypeRaw = "FULL_WAIVE";
    }
    const delType =
      String(delTypeRaw).toUpperCase() === "PERCENTAGE" ? "PERCENT" : delTypeRaw;
    const delValTrim = String(form.delivery_discount_value ?? "").trim();
    const deliveryDiscountValue =
      !delType || delType === "FULL_WAIVE" ? null : delValTrim === "" ? null : Number(delValTrim);
    if (deliveryDiscountValue != null && Number.isNaN(deliveryDiscountValue)) {
      setErr("Delivery discount value must be a number.");
      return;
    }

    const foodPromoConfig = rideParcelService
      ? promoConfig
      : { auto_apply: form.food_auto_apply === true };

    const payload: Record<string, unknown> = {
      name: form.name || null,
      coupon_code: normalizePlatformOfferCouponCode(form.coupon_code),
      service_type: form.service_type,
      offer_kind: rideParcelService ? "DISCOUNT" : form.offer_kind,
      offer_audience: aud === "MERCHANT" || aud === "RIDER" ? aud : "CUSTOMER",
      funding_mode: "PLATFORM_ONLY",
      platform_share_pct: 100,
      merchant_share_pct: 0,
      target_scope: "GLOBAL",
      geo_level: null,
      geo_ids: [],
      merchant_ids: [],
      customer_segment: form.customer_segment,
      starts_at: form.starts_at ? new Date(form.starts_at).toISOString() : null,
      ends_at: form.ends_at ? new Date(form.ends_at).toISOString() : null,
      min_order_amount:
        String(form.min_order_amount).trim() === "" ? null : Number(form.min_order_amount),
      max_discount_amount:
        String(form.max_discount_amount).trim() === "" ? null : Number(form.max_discount_amount),
      budget_total: budgetTotal,
      max_uses_per_user: maxUsesPerUser,
      max_uses_total: maxUsesTotal,
      max_uses_per_day: maxUsesPerDay,
      max_uses_per_month: maxUsesPerMonth,
      consume_mode: form.consume_mode === "ON_DELIVERED" ? "ON_DELIVERED" : "ON_PLACED",
      restore_on_cancel: form.restore_on_cancel,
      restore_on_refund: form.restore_on_refund,
      is_stackable: form.is_stackable,
      discount_type: form.discount_type,
      value_numeric: valueNumeric,
      delivery_discount_type: delType || null,
      delivery_discount_value: deliveryDiscountValue,
      priority: Number(form.priority || 0) || 0,
      is_active: form.is_active,
      is_hidden: form.is_hidden,
      buy_qty: rideParcelService ? null : form.buy_qty.trim() === "" ? null : parseInt(form.buy_qty, 10),
      get_qty: rideParcelService ? null : form.get_qty.trim() === "" ? null : parseInt(form.get_qty, 10),
      exclusion_group: form.exclusion_group.trim() || null,
      conditions,
      promo_config: foodPromoConfig,
    };

    try {
      if (mode === "edit" && offerId != null) {
        await updateOffer({ id: offerId, body: payload }).unwrap();
        toast.success("Platform offer updated");
      } else {
        await createOffer(payload).unwrap();
        toast.success("Platform offer created");
      }
      router.push("/dashboard/super-admin/offers-coupons");
      router.refresh();
    } catch (e) {
      const msg =
        e && typeof e === "object" && "data" in e
          ? String(
              (e as { data?: { error?: string; message?: string; details?: unknown } }).data?.message ??
                (e as { data?: { error?: string } }).data?.error ??
                (e as { message?: string }).message ??
                "Failed to save offer"
            )
          : e instanceof Error
            ? e.message
            : "Failed to save offer";
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
        Full offer configuration. Map geo coverage in{" "}
        <Link href="/dashboard/super-admin/geo" className="font-medium text-indigo-600 hover:underline">
          Geo &amp; coverage
        </Link>{" "}
        after save — unmapped offers stay hidden at checkout.
      </p>

      {err ? (
        <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">
          {err}
        </div>
      ) : null}

      <section className={cn(cardCls, "space-y-6")}>
        <FormSection title="Basics" description="Identity, coupon code, vertical, kind, and who can redeem.">
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            <FormField label="Offer name" htmlFor="po-name" className="lg:col-span-2">
              <input
                id="po-name"
                className={controlCls}
                placeholder="e.g. Flat ₹100 off weekends"
                value={form.name}
                onChange={(e) => onNameChange(e.target.value)}
              />
            </FormField>
            <FormField
              label="Coupon code"
              htmlFor="po-coupon"
              className="lg:col-span-2"
              hint="Auto-generated from the offer name. Editable. Unique; A–Z, 0–9, _, - only."
            >
              <input
                id="po-coupon"
                className={cn(controlCls, "font-mono uppercase tracking-wide")}
                placeholder="e.g. FLAT100OFF"
                value={form.coupon_code}
                onChange={(e) => {
                  setCouponCodeAuto(false);
                  setForm((f) => ({
                    ...f,
                    coupon_code: normalizePlatformOfferCouponCode(e.target.value),
                  }));
                }}
              />
            </FormField>
            <FormField label="Service" htmlFor="po-service">
              <select
                id="po-service"
                className={selectCls}
                value={form.service_type}
                onChange={(e) => {
                  const service_type = e.target.value;
                  setForm((f) => ({
                    ...f,
                    service_type,
                    first_ride_only:
                      service_type === "RIDE" || service_type === "ALL" ? f.first_ride_only : false,
                    offer_kind:
                      service_type === "RIDE" || service_type === "PARCEL" ? "DISCOUNT" : f.offer_kind,
                  }));
                  if (service_type === "RIDE" || service_type === "PARCEL") {
                    setPromoConfig((prev) => ({
                      ...emptyRideParcelPromoConfig(
                        service_type === "PARCEL" ? "PARCEL" : "RIDE"
                      ),
                      ...prev,
                      promo_type: prev.promo_type || "FLAT_OFF",
                    }));
                  }
                }}
              >
                {PLATFORM_OFFER_SERVICE_TYPES.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="Offer kind" htmlFor="po-kind" hint={offerKindUi.kindNotice}>
              <select
                id="po-kind"
                className={selectCls}
                value={form.offer_kind}
                disabled={isRideOrParcel}
                onChange={(e) => {
                  const kind = e.target.value;
                  setForm((f) => ({
                    ...f,
                    offer_kind: kind,
                    ...(kind === "FREE_DELIVERY" && !String(f.delivery_discount_type).trim()
                      ? { delivery_discount_type: "FULL_WAIVE" }
                      : {}),
                    ...(kind === "FREE_DELIVERY" ? { food_auto_apply: true } : {}),
                  }));
                }}
              >
                {PLATFORM_OFFER_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="Audience" htmlFor="po-aud">
              <select
                id="po-aud"
                className={selectCls}
                value={form.offer_audience}
                onChange={(e) => setForm((f) => ({ ...f, offer_audience: e.target.value }))}
              >
                <option value="CUSTOMER">CUSTOMER</option>
                <option value="MERCHANT">MERCHANT</option>
                <option value="RIDER">RIDER</option>
              </select>
            </FormField>
            <FormField label="Customer segment" htmlFor="po-seg">
              <select
                id="po-seg"
                className={selectCls}
                value={form.customer_segment}
                onChange={(e) => setForm((f) => ({ ...f, customer_segment: e.target.value }))}
              >
                <option value="ALL">ALL</option>
                <option value="NEW">NEW</option>
                <option value="EXISTING">EXISTING</option>
              </select>
            </FormField>
            {(form.service_type === "RIDE" || form.service_type === "ALL") ? (
              <FormField
                label="Eligibility"
                htmlFor="po-first-ride"
                hint="Person Ride only: customer must have zero completed person rides. Independent of Per user limit. Recommended with Per user = 1 and Consume = On delivered."
                className="sm:col-span-2 lg:col-span-2"
              >
                <label
                  htmlFor="po-first-ride"
                  className="flex min-h-[42px] cursor-pointer items-center gap-2.5 rounded-lg border border-slate-200/90 bg-slate-50/40 px-3 py-2.5 text-sm text-slate-800"
                >
                  <input
                    id="po-first-ride"
                    type="checkbox"
                    className={checkboxCls}
                    checked={form.first_ride_only}
                    onChange={(e) => setForm((f) => ({ ...f, first_ride_only: e.target.checked }))}
                  />
                  First Ride Only
                </label>
              </FormField>
            ) : null}
            <FormField
              label="Priority"
              htmlFor="po-pri"
              hint="Lower number sorts first in listings; checkout still picks the max discount."
            >
              <input
                id="po-pri"
                className={controlCls}
                inputMode="numeric"
                value={form.priority}
                onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))}
              />
            </FormField>
            {offerKindUi.showExclusionGroup ? (
              <FormField
                label="Exclusion group"
                htmlFor="po-excl"
                hint="Offers in the same group do not stack together."
              >
                <input
                  id="po-excl"
                  className={controlCls}
                  placeholder="optional"
                  value={form.exclusion_group}
                  onChange={(e) => setForm((f) => ({ ...f, exclusion_group: e.target.value }))}
                />
              </FormField>
            ) : null}
          </div>
        </FormSection>

        {isRideOrParcel ? (
          <FormSection
            title={form.service_type === "PARCEL" ? "Parcel promo builder" : "Ride promo builder"}
            description="Dedicated offer types for Person Ride / Parcel. Food offer fields stay unchanged for FOOD service."
          >
            <RideParcelPromoBuilder
              service={form.service_type === "PARCEL" ? "PARCEL" : "RIDE"}
              promo={promoConfig}
              onChange={setPromoConfig}
              discountType={form.discount_type}
              valueNumeric={form.value_numeric}
              onDiscountTypeChange={(v) => setForm((f) => ({ ...f, discount_type: v }))}
              onValueNumericChange={(v) => setForm((f) => ({ ...f, value_numeric: v }))}
              maxDiscountAmount={form.max_discount_amount}
              onMaxDiscountChange={(v) => setForm((f) => ({ ...f, max_discount_amount: v }))}
              couponCode={form.coupon_code}
              startsAt={form.starts_at}
              endsAt={form.ends_at}
            />
            <div className="mt-4 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              <FormField label="Min order / fare" htmlFor="po-min-rp">
                <input
                  id="po-min-rp"
                  className={controlCls}
                  inputMode="decimal"
                  placeholder="optional"
                  value={form.min_order_amount}
                  onChange={(e) => setForm((f) => ({ ...f, min_order_amount: e.target.value }))}
                />
              </FormField>
            </div>
          </FormSection>
        ) : null}

        {!isRideOrParcel && offerKindUi.showCartDiscount ? (
          <FormSection
            title={offerKindUi.cartBlockTitle}
            description={offerKindUi.cartValueHint || "Cart / fee discount applied at checkout."}
          >
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              <FormField label="Discount type" htmlFor="po-dtype">
                <select
                  id="po-dtype"
                  className={selectCls}
                  value={form.discount_type}
                  onChange={(e) => setForm((f) => ({ ...f, discount_type: e.target.value }))}
                >
                  <option value="PERCENTAGE">PERCENTAGE</option>
                  <option value="FIXED">FIXED</option>
                </select>
              </FormField>
              <FormField label="Value" htmlFor="po-val">
                <input
                  id="po-val"
                  className={controlCls}
                  inputMode="decimal"
                  placeholder={form.discount_type === "PERCENTAGE" ? "e.g. 10" : "e.g. 100"}
                  value={form.value_numeric}
                  onChange={(e) => setForm((f) => ({ ...f, value_numeric: e.target.value }))}
                />
              </FormField>
              <FormField label="Min order amount" htmlFor="po-min">
                <input
                  id="po-min"
                  className={controlCls}
                  inputMode="decimal"
                  placeholder="optional"
                  value={form.min_order_amount}
                  onChange={(e) => setForm((f) => ({ ...f, min_order_amount: e.target.value }))}
                />
              </FormField>
              <FormField label="Max discount cap" htmlFor="po-max">
                <input
                  id="po-max"
                  className={controlCls}
                  inputMode="decimal"
                  placeholder="optional"
                  value={form.max_discount_amount}
                  onChange={(e) => setForm((f) => ({ ...f, max_discount_amount: e.target.value }))}
                />
              </FormField>
            </div>
          </FormSection>
        ) : null}

        {!isRideOrParcel && offerKindUi.showDeliveryBlock ? (
          <FormSection
            title="Delivery discount"
            description="Optional delivery fee relief (required for FREE_DELIVERY)."
          >
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              <FormField label="Delivery discount type" htmlFor="po-ddtype">
                <select
                  id="po-ddtype"
                  className={selectCls}
                  value={form.delivery_discount_type}
                  onChange={(e) => setForm((f) => ({ ...f, delivery_discount_type: e.target.value }))}
                >
                  <option value="">None</option>
                  <option value="FULL_WAIVE">FULL_WAIVE (₹0 delivery)</option>
                  <option value="PERCENT">PERCENT (%)</option>
                  <option value="FIXED">FIXED (₹)</option>
                </select>
              </FormField>
              <FormField
                label="Delivery discount value"
                htmlFor="po-ddval"
                hint="Ignored for FULL_WAIVE. Cap via Max discount amount."
              >
                <input
                  id="po-ddval"
                  className={controlCls}
                  inputMode="decimal"
                  disabled={!form.delivery_discount_type || form.delivery_discount_type === "FULL_WAIVE"}
                  value={form.delivery_discount_value}
                  onChange={(e) => setForm((f) => ({ ...f, delivery_discount_value: e.target.value }))}
                />
              </FormField>
              {!offerKindUi.showCartDiscount ? (
                <FormField label="Min order amount" htmlFor="po-min-del">
                  <input
                    id="po-min-del"
                    className={controlCls}
                    inputMode="decimal"
                    value={form.min_order_amount}
                    onChange={(e) => setForm((f) => ({ ...f, min_order_amount: e.target.value }))}
                  />
                </FormField>
              ) : null}
            </div>
            <label className="mt-4 flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-slate-300 text-indigo-600"
                checked={form.food_auto_apply === true}
                onChange={(e) => setForm((f) => ({ ...f, food_auto_apply: e.target.checked }))}
              />
              Auto Apply when eligible (OFF = customer must apply manually at checkout)
            </label>
          </FormSection>
        ) : null}

        {!isRideOrParcel && !offerKindUi.showDeliveryBlock ? (
          <FormSection title="Apply behaviour" description="Whether checkout may auto-apply this platform offer.">
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-slate-300 text-indigo-600"
                checked={form.food_auto_apply === true}
                onChange={(e) => setForm((f) => ({ ...f, food_auto_apply: e.target.checked }))}
              />
              Auto Apply when eligible (OFF = customer must apply manually at checkout)
            </label>
          </FormSection>
        ) : null}

        {!isRideOrParcel && offerKindUi.showBuyXGetYFields ? (
          <FormSection title="Buy X Get Y" description="Requires buy qty and get qty.">
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              <FormField label="Buy quantity (X)" htmlFor="po-buy">
                <input
                  id="po-buy"
                  className={controlCls}
                  inputMode="numeric"
                  value={form.buy_qty}
                  onChange={(e) => setForm((f) => ({ ...f, buy_qty: e.target.value }))}
                />
              </FormField>
              <FormField label="Get quantity (Y)" htmlFor="po-get">
                <input
                  id="po-get"
                  className={controlCls}
                  inputMode="numeric"
                  value={form.get_qty}
                  onChange={(e) => setForm((f) => ({ ...f, get_qty: e.target.value }))}
                />
              </FormField>
              <FormField
                label="Eligible menu item IDs"
                htmlFor="po-menu-bogo"
                hint="Comma-separated. Empty = all cart lines."
              >
                <input
                  id="po-menu-bogo"
                  className={controlCls}
                  placeholder="101, 102"
                  value={form.menu_item_ids}
                  onChange={(e) => setForm((f) => ({ ...f, menu_item_ids: e.target.value }))}
                />
              </FormField>
            </div>
          </FormSection>
        ) : null}

        {!isRideOrParcel && offerKindUi.showFreeMenuFields ? (
          <FormSection title="Free menu item" description="Waives cheapest eligible units up to free quantity.">
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              <FormField label="Free quantity" htmlFor="po-free-qty">
                <input
                  id="po-free-qty"
                  className={controlCls}
                  inputMode="numeric"
                  value={form.get_qty}
                  onChange={(e) => setForm((f) => ({ ...f, get_qty: e.target.value }))}
                />
              </FormField>
              <FormField
                label="Menu item IDs"
                htmlFor="po-menu-free"
                hint="Required. Comma-separated."
                className="lg:col-span-2"
              >
                <input
                  id="po-menu-free"
                  className={controlCls}
                  placeholder="101, 102"
                  value={form.menu_item_ids}
                  onChange={(e) => setForm((f) => ({ ...f, menu_item_ids: e.target.value }))}
                />
              </FormField>
            </div>
          </FormSection>
        ) : null}

        <FormSection
          title="Schedule, budget & usage limits"
          description="Validity window, spend cap, consume mode, and per-customer caps."
        >
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            <FormField label="Starts at" htmlFor="po-start">
              <input
                id="po-start"
                type="datetime-local"
                className={controlCls}
                value={form.starts_at}
                onChange={(e) => setForm((f) => ({ ...f, starts_at: e.target.value }))}
              />
            </FormField>
            <FormField label="Ends at" htmlFor="po-end" hint="Empty = never expires.">
              <input
                id="po-end"
                type="datetime-local"
                className={controlCls}
                value={form.ends_at}
                onChange={(e) => setForm((f) => ({ ...f, ends_at: e.target.value }))}
              />
            </FormField>
            <FormField label="Campaign budget (₹)" htmlFor="po-budget" hint="Empty = unlimited.">
              <input
                id="po-budget"
                className={controlCls}
                inputMode="decimal"
                value={form.budget_total}
                onChange={(e) => setForm((f) => ({ ...f, budget_total: e.target.value }))}
              />
            </FormField>
            <FormField label="Consume mode" htmlFor="po-consume">
              <select
                id="po-consume"
                className={selectCls}
                value={form.consume_mode}
                onChange={(e) => setForm((f) => ({ ...f, consume_mode: e.target.value }))}
              >
                <option value="ON_PLACED">On order placed</option>
                <option value="ON_DELIVERED">On ride / order completed</option>
              </select>
            </FormField>
            <FormField label="Per user limit" htmlFor="po-per-user" hint="e.g. 1 = once per customer.">
              <input
                id="po-per-user"
                className={controlCls}
                inputMode="numeric"
                placeholder="unlimited"
                value={form.max_uses_per_user}
                onChange={(e) => setForm((f) => ({ ...f, max_uses_per_user: e.target.value }))}
              />
            </FormField>
            <FormField label="Lifetime (all users)" htmlFor="po-life">
              <input
                id="po-life"
                className={controlCls}
                inputMode="numeric"
                placeholder="unlimited"
                value={form.max_uses_total}
                onChange={(e) => setForm((f) => ({ ...f, max_uses_total: e.target.value }))}
              />
            </FormField>
            <FormField label="Daily / user" htmlFor="po-day">
              <input
                id="po-day"
                className={controlCls}
                inputMode="numeric"
                placeholder="unlimited"
                value={form.max_uses_per_day}
                onChange={(e) => setForm((f) => ({ ...f, max_uses_per_day: e.target.value }))}
              />
            </FormField>
            <FormField label="Monthly / user" htmlFor="po-month">
              <input
                id="po-month"
                className={controlCls}
                inputMode="numeric"
                placeholder="unlimited"
                value={form.max_uses_per_month}
                onChange={(e) => setForm((f) => ({ ...f, max_uses_per_month: e.target.value }))}
              />
            </FormField>
          </div>

          <div className="mt-4 flex flex-wrap gap-x-6 gap-y-3 rounded-xl border border-slate-100 bg-slate-50/50 p-4 text-sm text-slate-700">
            <label className="flex cursor-pointer items-center gap-2.5">
              <input
                type="checkbox"
                className={checkboxCls}
                checked={form.restore_on_cancel}
                onChange={(e) => setForm((f) => ({ ...f, restore_on_cancel: e.target.checked }))}
              />
              Restore usage on cancel
            </label>
            <label className="flex cursor-pointer items-center gap-2.5">
              <input
                type="checkbox"
                className={checkboxCls}
                checked={form.restore_on_refund}
                onChange={(e) => setForm((f) => ({ ...f, restore_on_refund: e.target.checked }))}
              />
              Restore usage on refund
            </label>
            <label className="flex cursor-pointer items-center gap-2.5">
              <input
                type="checkbox"
                className={checkboxCls}
                checked={form.is_stackable}
                onChange={(e) => setForm((f) => ({ ...f, is_stackable: e.target.checked }))}
              />
              Stackable (flag)
            </label>
            <label className="flex cursor-pointer items-center gap-2.5">
              <input
                type="checkbox"
                className={checkboxCls}
                checked={form.is_active}
                onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))}
              />
              Active
            </label>
            <label className="flex cursor-pointer items-center gap-2.5">
              <input
                type="checkbox"
                className={checkboxCls}
                checked={form.is_hidden}
                onChange={(e) => setForm((f) => ({ ...f, is_hidden: e.target.checked }))}
              />
              Hidden from listings
            </label>
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
              "Save changes"
            ) : (
              "Create offer"
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
