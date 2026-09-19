"use client";

import { useEffect, useMemo, useState } from "react";
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
import { FlashSaleFoodBuilder, type FlashSaleSelectedItem, type FlashSaleStoreRef } from "@/components/super-admin/FlashSaleFoodBuilder";
import {
  applyFlashSaleSaveDefaults,
  buildFlashSaleConditions,
  flashSaleBudgetRemaining,
  flashSaleRemainingRedemptions,
  isFlashSaleKind,
  parseFlashSaleItems,
  resolveMaxFlashQuantity,
  validateFlashSalePrice,
  validateMaxFlashQuantity,
} from "@/lib/billing/flashSale";
import { cn } from "@/lib/utils";
import {
  BudgetProgress,
  EditorField as FormField,
  editorControlCls as controlCls,
  editorSelectCls as selectCls,
  formatOfferDateLabel,
  formatRupeeAmount,
  primaryButtonCls,
  secondaryButtonCls,
  SectionCard,
  StatusBadge,
  StatusToggle,
} from "@/components/super-admin/platformOfferEditorUi";
import { CalendarDays, Shield, Users, Wallet, Zap } from "lucide-react";

const checkboxCls = "h-4 w-4 rounded border-slate-300 text-[#00A88F] focus:ring-[#00A88F]/30";

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
  const [flashStores, setFlashStores] = useState<FlashSaleStoreRef[]>([]);
  const [flashItems, setFlashItems] = useState<FlashSaleSelectedItem[]>([]);
  const [flashMaxQuantity, setFlashMaxQuantity] = useState("1");
  const [rideSampleFare, setRideSampleFare] = useState("");
  const [editBudgetUsed, setEditBudgetUsed] = useState<string | null>(null);
  const [editRedemptions, setEditRedemptions] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(mode === "create");
  /** When true, changing Name will refresh auto-generated coupon code. */
  const [couponCodeAuto, setCouponCodeAuto] = useState(mode === "create");

  const offerKindUi = useMemo(() => getPlatformOfferKindSections(form.offer_kind), [form.offer_kind]);
  const isRideOrParcel =
    form.service_type === "RIDE" || form.service_type === "PARCEL";
  const isFlashSale = isFlashSaleKind(form.offer_kind);

  useEffect(() => {
    if (!isFlashSale) return;
    setForm((f) => {
      const next = {
        ...f,
        max_uses_per_user: "1",
        food_auto_apply: true,
        offer_audience: "CUSTOMER",
      };
      if (f.max_uses_per_user === "1" && f.food_auto_apply === true && f.offer_audience === "CUSTOMER") {
        return f;
      }
      return next;
    });
    if (isRideOrParcel && promoConfig.promo_type !== "PAY_FIXED") {
      setPromoConfig((prev) => ({ ...prev, promo_type: "PAY_FIXED" }));
    }
  }, [isFlashSale, isRideOrParcel, promoConfig.promo_type]);

  // Resolve store names / GMMC ids after edit hydrate (merchant_ids only has PKs).
  useEffect(() => {
    if (!hydrated || flashStores.length === 0) return;
    const needsResolve = flashStores.some((s) => !s.publicId || /^Store #/.test(s.name));
    if (!needsResolve) return;
    let cancelled = false;
    void (async () => {
      const resolved = await Promise.all(
        flashStores.map(async (s) => {
          if (s.publicId && !/^Store #/.test(s.name)) return s;
          try {
            const r = await fetch(
              `/api/super-admin/flash-sale/stores?id=${encodeURIComponent(String(s.id))}`,
              { credentials: "include" }
            );
            const d = (await r.json().catch(() => ({}))) as {
              stores?: Array<{ id: number; storeId: string; name: string }>;
            };
            const hit = (d.stores ?? []).find((x) => x.id === s.id);
            if (!hit) return s;
            return { id: s.id, name: hit.name, publicId: hit.storeId };
          } catch {
            return s;
          }
        })
      );
      if (cancelled) return;
      setFlashStores(resolved);
      setFlashItems((prev) =>
        prev.map((it) => {
          const st = resolved.find((x) => x.id === it.storeId);
          if (!st) return it;
          return { ...it, storeName: st.name, storePublicId: st.publicId };
        })
      );
    })();
    return () => {
      cancelled = true;
    };
    // Only after hydrate; avoid loops when names update.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated]);

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
    const parsedMerchantIds = (() => {
      const raw = (o as { merchant_ids?: unknown }).merchant_ids;
      const v = Array.isArray(raw) ? raw : [];
      return v.map((x) => Number(x)).filter((n) => Number.isInteger(n) && n > 0);
    })();
    const parsedFlash = parseFlashSaleItems(cond);
    setFlashMaxQuantity(String(resolveMaxFlashQuantity(cond)));
    setFlashStores(
      parsedMerchantIds.map((id) => ({
        id,
        name: `Store #${id}`,
        publicId: "",
      }))
    );
    setFlashItems(
      parsedFlash.map((it) => ({
        menuItemId: it.menuItemId,
        storeId: it.storeId ?? parsedMerchantIds[0] ?? 0,
        storeName:
          it.storeId != null
            ? `Store #${it.storeId}`
            : parsedMerchantIds[0] != null
              ? `Store #${parsedMerchantIds[0]}`
              : "",
        storePublicId: "",
        name: it.menuItemId,
        originalCustomerPrice: 0,
        flashPrice: String(it.flashPrice),
      }))
    );
    setEditBudgetUsed(o.budget_used != null ? String(o.budget_used) : null);
    setEditRedemptions(
      typeof o.flash_redemptions_active === "number" ? o.flash_redemptions_active : null
    );
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

  const flashHeadlinePrice = useMemo(() => {
    const prices = flashItems
      .map((it) => Number(it.flashPrice))
      .filter((n) => Number.isFinite(n) && n >= 0);
    if (prices.length === 0) return null;
    return Math.min(...prices);
  }, [flashItems]);

  const budgetTotalN = Number(form.budget_total);
  const budgetUsedN = Number(editBudgetUsed ?? 0);
  const remainingBudget = flashSaleBudgetRemaining(form.budget_total || null, editBudgetUsed);

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
    const savingFlash = isFlashSaleKind(form.offer_kind);
    if (savingFlash && !rideParcelService) {
      if (flashStores.length < 1) {
        setErr("Select at least one store for this Flash Sale.");
        return;
      }
      const priced = flashItems.filter((it) => it.menuItemId && String(it.flashPrice).trim() !== "");
      if (priced.length === 0) {
        setErr("Select at least one item and set a Flash Sale price.");
        return;
      }
      for (const it of priced) {
        const orig = it.originalCustomerPrice > 0 ? it.originalCustomerPrice : null;
        const priceErr = validateFlashSalePrice(Number(it.flashPrice), orig);
        if (priceErr) {
          setErr(`${it.name}: ${priceErr}`);
          return;
        }
      }
      const qtyErr = validateMaxFlashQuantity(flashMaxQuantity.trim() === "" ? 1 : flashMaxQuantity);
      if (qtyErr) {
        setErr(qtyErr);
        return;
      }
    }
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
    if (savingFlash && !rideParcelService) {
      Object.assign(
        conditions,
        buildFlashSaleConditions({
          items: flashItems.map((it) => ({
            menuItemId: it.menuItemId,
            flashPrice: Number(it.flashPrice),
            storeId: it.storeId > 0 ? it.storeId : null,
          })),
          maxFlashQuantity: parseInt(flashMaxQuantity, 10) || 1,
        })
      );
    } else {
      delete conditions.flash_sale_items;
      if (idTokens.length > 0) conditions.menu_item_ids = idTokens;
    }
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
      ? savingFlash
        ? { ...promoConfig, promo_type: "PAY_FIXED" as const, auto_apply: promoConfig.auto_apply !== false }
        : promoConfig
      : { auto_apply: savingFlash ? true : form.food_auto_apply === true };

    const payload: Record<string, unknown> = applyFlashSaleSaveDefaults({
      name: form.name || null,
      coupon_code: normalizePlatformOfferCouponCode(form.coupon_code),
      service_type: form.service_type,
      offer_kind: rideParcelService && !savingFlash ? "DISCOUNT" : form.offer_kind,
      offer_audience: aud === "MERCHANT" || aud === "RIDER" ? aud : "CUSTOMER",
      funding_mode: "PLATFORM_ONLY",
      platform_share_pct: 100,
      merchant_share_pct: 0,
      target_scope: savingFlash && !rideParcelService ? "MERCHANT" : "GLOBAL",
      geo_level: null,
      geo_ids: [],
      merchant_ids:
        savingFlash && !rideParcelService
          ? [...new Set(flashStores.map((s) => s.id).filter((id) => Number.isInteger(id) && id > 0))]
          : [],
      customer_segment: form.customer_segment,
      starts_at: form.starts_at ? new Date(form.starts_at).toISOString() : null,
      ends_at: form.ends_at ? new Date(form.ends_at).toISOString() : null,
      min_order_amount:
        String(form.min_order_amount).trim() === "" ? null : Number(form.min_order_amount),
      max_discount_amount:
        String(form.max_discount_amount).trim() === "" ? null : Number(form.max_discount_amount),
      budget_total: budgetTotal,
      max_uses_per_user: savingFlash ? 1 : maxUsesPerUser,
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
    });

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
    <div className="w-full max-w-full overflow-x-hidden">
      <div className="mb-3 overflow-hidden rounded-xl border border-[#00A88F]/20 bg-white shadow-[0_8px_24px_-18px_rgba(0,168,143,0.45)]">
        <div className="flex flex-wrap items-center justify-between gap-3 bg-[linear-gradient(135deg,rgba(0,168,143,0.12),rgba(255,255,255,0.94)_58%)] px-4 py-2.5 sm:px-5">
          <div className="min-w-0">
            {isFlashSale ? (
              <p className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#007a68]">
                <Zap className="h-3.5 w-3.5" />
                {form.offer_kind.replaceAll("_", " ")}
              </p>
            ) : (
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                {form.offer_kind.replaceAll("_", " ")}
              </p>
            )}
            <p className="mt-0.5 truncate text-[17px] font-semibold tracking-tight text-slate-950">
              {form.name.trim() || "Untitled offer"}
              {isFlashSale &&
              flashHeadlinePrice != null &&
              !form.name.includes(formatRupeeAmount(flashHeadlinePrice)) ? (
                <span className="ml-2 text-sm font-semibold text-[#007a68]">
                  · Deals @ {formatRupeeAmount(flashHeadlinePrice)}
                </span>
              ) : null}
            </p>
            <p className="mt-0.5 text-[11px] uppercase tracking-wide text-slate-500">
              {form.service_type} • {form.offer_audience} • {form.customer_segment}
              <span className="ml-2 font-normal normal-case tracking-normal text-slate-400">
                {formatOfferDateLabel(form.starts_at)} → {form.ends_at ? formatOfferDateLabel(form.ends_at) : "Open"}
              </span>
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge active={form.is_active} />
            {mode === "edit" && offerId != null ? (
              <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold tabular-nums text-slate-600">
                #{offerId}
              </span>
            ) : null}
          </div>
        </div>
      </div>

      <p className="mb-3 max-w-3xl text-[12px] leading-snug text-slate-500">
        {isFlashSale ? (
          <>
            Flash Sale is store-targeted: it shows on that store&apos;s menu and applies at checkout for matching
            items. Geo map bindings are optional for Flash Sale (unlike cart / delivery platform offers).
          </>
        ) : (
          <>
            Full offer configuration. Map geo coverage in{" "}
            <Link href="/dashboard/super-admin/geo" className="font-medium text-[#007a68] hover:underline">
              Geo &amp; coverage
            </Link>{" "}
            after save — unmapped offers stay hidden at checkout.
          </>
        )}
      </p>

      {err ? (
        <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
          {err}
        </div>
      ) : null}

      <div className="space-y-3">
        <SectionCard title="Basic Information" subtitle="Identity, targeting and offer configuration">
          <div className="grid grid-cols-2 gap-x-3 gap-y-2.5 lg:grid-cols-4">
            <FormField label="Offer name" htmlFor="po-name">
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
              hint="Auto from name · A–Z, 0–9, _, -"
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
                      service_type === "RIDE" || service_type === "PARCEL"
                        ? f.offer_kind === "FLASH_SALE"
                          ? "FLASH_SALE"
                          : "DISCOUNT"
                        : f.offer_kind,
                  }));
                  if (service_type === "RIDE" || service_type === "PARCEL") {
                    setPromoConfig((prev) => ({
                      ...emptyRideParcelPromoConfig(
                        service_type === "PARCEL" ? "PARCEL" : "RIDE"
                      ),
                      ...prev,
                      promo_type:
                        form.offer_kind === "FLASH_SALE" ? "PAY_FIXED" : prev.promo_type || "FLAT_OFF",
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
                disabled={false}
                onChange={(e) => {
                  const kind = e.target.value;
                  setForm((f) => ({
                    ...f,
                    offer_kind: kind,
                    ...(kind === "FREE_DELIVERY" && !String(f.delivery_discount_type).trim()
                      ? { delivery_discount_type: "FULL_WAIVE" }
                      : {}),
                    ...(kind === "FREE_DELIVERY" || kind === "FLASH_SALE" ? { food_auto_apply: true } : {}),
                    ...(kind === "FLASH_SALE" ? { max_uses_per_user: "1", offer_audience: "CUSTOMER" } : {}),
                  }));
                  if (kind === "FLASH_SALE" && (form.service_type === "RIDE" || form.service_type === "PARCEL")) {
                    setPromoConfig((prev) => ({ ...prev, promo_type: "PAY_FIXED" }));
                  }
                }}
              >
                {(isRideOrParcel
                  ? PLATFORM_OFFER_KINDS.filter((k) => k === "DISCOUNT" || k === "FLASH_SALE")
                  : PLATFORM_OFFER_KINDS
                ).map((k) => (
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
                hint="Zero completed person rides"
              >
                <label
                  htmlFor="po-first-ride"
                  className="flex min-h-[34px] cursor-pointer items-center gap-2.5 rounded-lg border border-slate-200/90 bg-slate-50/40 px-3 py-2 text-sm text-slate-800"
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
              hint="Lower number lists first"
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
                hint="Same group does not stack"
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
        </SectionCard>

        {!isRideOrParcel && offerKindUi.showFlashSaleBuilder ? (
          <SectionCard
            accent
            icon={<Zap className="h-4 w-4" />}
            title="Flash Sale Items"
            subtitle="Choose eligible outlets and set Flash Sale prices for individual items."
          >
            <FlashSaleFoodBuilder
              stores={flashStores}
              items={flashItems}
              onStoresChange={setFlashStores}
              onItemsChange={setFlashItems}
            />
          </SectionCard>
        ) : null}

        {!isRideOrParcel && offerKindUi.showFlashSaleBuilder ? (
          <SectionCard
            accent
            icon={<Shield className="h-4 w-4" />}
            title="Flash Quantity Limit"
            subtitle="Maximum Flash Sale quantity allowed per eligible item in each order."
          >
            <div className="grid gap-3 lg:grid-cols-[minmax(0,240px)_1fr]">
              <div className="rounded-xl border border-[#00A88F]/25 bg-[linear-gradient(180deg,#f4fbf9,white)] p-3">
                <FormField
                  label="Max Flash Quantity"
                  htmlFor="po-max-flash-qty"
                  hint="Each eligible Flash Sale item can use the Flash Sale price up to this quantity in the same order."
                >
                  <input
                    id="po-max-flash-qty"
                    className={cn(controlCls, "text-base font-semibold tabular-nums")}
                    inputMode="numeric"
                    type="number"
                    min={1}
                    step={1}
                    value={flashMaxQuantity}
                    onChange={(e) => setFlashMaxQuantity(e.target.value)}
                  />
                </FormField>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3">
                <p className="text-[13px] font-semibold text-slate-900">Quantity Protection</p>
                <p className="mt-0.5 text-[11px] leading-relaxed text-slate-600">
                  This limit applies per eligible Flash Sale item. It does not limit the total number of different
                  Flash Sale items in one order.
                </p>
                <ul className="mt-3 space-y-1.5 text-[12px] leading-relaxed text-slate-600">
                  <li>
                    ✓ 1 Burger + 1 Sandwich + 1 Tandoori Sandwich — allowed when max quantity is{" "}
                    {flashMaxQuantity.trim() || "the configured value"}
                  </li>
                  <li>✕ 2 of the same item — Flash Sale benefit cannot exceed the configured limit</li>
                </ul>
              </div>
            </div>
          </SectionCard>
        ) : null}

        {isRideOrParcel ? (
          <SectionCard
            title={form.service_type === "PARCEL" ? "Parcel promo builder" : "Ride promo builder"}
            subtitle="Dedicated offer types for Person Ride / Parcel. Food offer fields stay unchanged for FOOD service."
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
              flashSaleMode={isFlashSale}
              sampleFare={rideSampleFare}
              onSampleFareChange={setRideSampleFare}
            />
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
          </SectionCard>
        ) : null}

        {!isRideOrParcel && offerKindUi.showCartDiscount ? (
          <SectionCard
            title={offerKindUi.cartBlockTitle}
            subtitle={offerKindUi.cartValueHint || "Cart / fee discount applied at checkout."}
          >
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
          </SectionCard>
        ) : null}

        {!isRideOrParcel && offerKindUi.showDeliveryBlock ? (
          <SectionCard
            title="Delivery discount"
            subtitle="Optional delivery fee relief (required for FREE_DELIVERY)."
          >
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
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
          </SectionCard>
        ) : null}

        {!isRideOrParcel && !offerKindUi.showDeliveryBlock && !offerKindUi.showFlashSaleBuilder ? (
          <SectionCard title="Apply behaviour" subtitle="Whether checkout may auto-apply this platform offer.">
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-slate-300 text-indigo-600"
                checked={form.food_auto_apply === true}
                onChange={(e) => setForm((f) => ({ ...f, food_auto_apply: e.target.checked }))}
              />
              Auto Apply when eligible (OFF = customer must apply manually at checkout)
            </label>
          </SectionCard>
        ) : null}

        {!isRideOrParcel && offerKindUi.showBuyXGetYFields ? (
          <SectionCard title="Buy X Get Y" subtitle="Requires buy qty and get qty.">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
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
          </SectionCard>
        ) : null}

        {!isRideOrParcel && offerKindUi.showFreeMenuFields ? (
          <SectionCard title="Free menu item" subtitle="Waives cheapest eligible units up to free quantity.">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
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
          </SectionCard>
        ) : null}

        <div className="grid gap-3 lg:grid-cols-3">
          <SectionCard
            icon={<CalendarDays className="h-4 w-4" />}
            title="Campaign Schedule"
            subtitle="When this offer starts and ends."
          >
            <div className="grid gap-4">
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
            </div>
          </SectionCard>

          <SectionCard
            icon={<Wallet className="h-4 w-4" />}
            title="Campaign Budget"
            subtitle="Platform spend cap for this campaign."
          >
            <FormField label="Campaign budget (₹)" htmlFor="po-budget" hint="Empty = unlimited.">
              <input
                id="po-budget"
                className={controlCls}
                inputMode="decimal"
                value={form.budget_total}
                onChange={(e) => setForm((f) => ({ ...f, budget_total: e.target.value }))}
              />
            </FormField>
            <div className="mt-4 grid grid-cols-3 gap-2">
              <div className="rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2.5">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Budget</p>
                <p className="mt-1 text-sm font-semibold tabular-nums text-slate-900">
                  {Number.isFinite(budgetTotalN) && budgetTotalN > 0
                    ? formatRupeeAmount(budgetTotalN)
                    : "Unlimited"}
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2.5">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Used</p>
                <p className="mt-1 text-sm font-semibold tabular-nums text-slate-900">
                  {formatRupeeAmount(mode === "edit" ? budgetUsedN : 0)}
                </p>
              </div>
              <div className="rounded-xl border border-[#00A88F]/20 bg-[#00A88F]/5 px-3 py-2.5">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-[#007a68]">Remaining</p>
                <p className="mt-1 text-sm font-semibold tabular-nums text-slate-900">
                  {remainingBudget != null ? formatRupeeAmount(remainingBudget) : "—"}
                </p>
              </div>
            </div>
            {mode === "edit" && Number.isFinite(budgetTotalN) && budgetTotalN > 0 ? (
              <BudgetProgress used={Number.isFinite(budgetUsedN) ? budgetUsedN : 0} total={budgetTotalN} />
            ) : null}
            {isFlashSale && mode === "edit" && editRedemptions != null ? (
              <p className="mt-3 text-[11px] text-slate-500">
                {editRedemptions} active redemption{editRedemptions === 1 ? "" : "s"}
                {flashSaleRemainingRedemptions(form.max_uses_total || null, editRedemptions) != null
                  ? ` · ${flashSaleRemainingRedemptions(form.max_uses_total || null, editRedemptions)} remaining`
                  : ""}
              </p>
            ) : null}
          </SectionCard>

          <SectionCard
            icon={<Users className="h-4 w-4" />}
            title="Usage Limits"
            subtitle="How redemptions are consumed and capped."
          >
            <div className="grid gap-4">
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
              <FormField
                label="Per user limit"
                htmlFor="po-per-user"
                hint={
                  isFlashSale
                    ? "Flash Sale is always one redemption per customer per offer."
                    : "e.g. 1 = once per customer."
                }
              >
                <input
                  id="po-per-user"
                  className={controlCls}
                  inputMode="numeric"
                  placeholder="unlimited"
                  disabled={isFlashSale}
                  value={isFlashSale ? "1" : form.max_uses_per_user}
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
              {isFlashSale ? null : (
                <>
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
                </>
              )}
            </div>
          </SectionCard>
        </div>

        <SectionCard title="Status Controls" subtitle="Usage recovery and listing visibility.">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2.5">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Usage Recovery</p>
              <StatusToggle
                checked={form.restore_on_cancel}
                onChange={(next) => setForm((f) => ({ ...f, restore_on_cancel: next }))}
                label="Restore usage on cancel"
              />
              <StatusToggle
                checked={form.restore_on_refund}
                onChange={(next) => setForm((f) => ({ ...f, restore_on_refund: next }))}
                label="Restore usage on refund"
              />
              {isFlashSale ? null : (
                <StatusToggle
                  checked={form.is_stackable}
                  onChange={(next) => setForm((f) => ({ ...f, is_stackable: next }))}
                  label="Stackable (flag)"
                />
              )}
            </div>
            <div className="space-y-2.5">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Visibility</p>
              <StatusToggle
                checked={form.is_active}
                onChange={(next) => setForm((f) => ({ ...f, is_active: next }))}
                label="Active"
              />
              <StatusToggle
                checked={form.is_hidden}
                onChange={(next) => setForm((f) => ({ ...f, is_hidden: next }))}
                label="Hidden from listings"
              />
            </div>
          </div>
        </SectionCard>
      </div>

      <div className="sticky bottom-0 z-20 mt-3 flex items-center justify-end gap-2 border-t border-slate-200/80 bg-white/95 py-2.5 backdrop-blur-sm">
        <Link href="/dashboard/super-admin/offers-coupons" className={secondaryButtonCls()}>
          Cancel
        </Link>
        <button type="button" disabled={busy} onClick={() => void save()} className={primaryButtonCls(busy)}>
          {busy ? (
            <span className="inline-flex items-center gap-2">
              <LoadingSpinner variant="button" size="sm" /> Saving…
            </span>
          ) : mode === "edit" ? (
            "Save Changes"
          ) : (
            "Create offer"
          )}
        </button>
      </div>
    </div>
  );
}
