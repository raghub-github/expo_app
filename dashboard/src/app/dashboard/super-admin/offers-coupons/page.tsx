"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
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

const cardCls = "rounded-2xl border border-slate-200 bg-white p-5 text-slate-900 shadow-sm";
const inputCls =
  "w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm placeholder:text-slate-500";
const selectCls = "w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm";

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

  return (
    <div className="mx-auto max-w-7xl p-4 sm:p-6 space-y-6 text-slate-900">
      <header className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Super Admin Offers Engine</h1>
          <p className="text-sm text-slate-600 mt-1">
            Independent GatiMitra offers and Hybrid offers are managed here. Merchant-portal offers remain separate.
          </p>
        </div>
        <Link href="/dashboard/super-admin" className="text-sm text-indigo-600 hover:underline">
          ← Super Admin
        </Link>
      </header>

      {err && <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{err}</div>}

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className={cardCls}><div className="text-xs text-slate-500">Total offers</div><div className="text-xl font-semibold">{offerStats.total}</div></div>
        <div className={cardCls}><div className="text-xs text-slate-500">Active offers</div><div className="text-xl font-semibold">{offerStats.active}</div></div>
        <div className={cardCls}><div className="text-xs text-slate-500">Hybrid offers</div><div className="text-xl font-semibold">{offerStats.hybrid}</div></div>
      </section>

      <section className={cardCls}>
        <h2 className="text-base font-semibold">Offer builder</h2>
        <div className="mt-3 grid sm:grid-cols-4 gap-2">
          <input className={inputCls} placeholder="Offer name" value={offerForm.name} onChange={(e) => setOfferForm((f) => ({ ...f, name: e.target.value }))} />
          <select className={selectCls} value={offerForm.service_type} onChange={(e) => setOfferForm((f) => ({ ...f, service_type: e.target.value }))}>
            {["FOOD", "PARCEL", "RIDE", "ALL"].map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
          <select className={selectCls} value={offerForm.offer_kind} onChange={(e) => setOfferForm((f) => ({ ...f, offer_kind: e.target.value }))}>
            {["DISCOUNT", "FREE_DELIVERY", "FLAT_DISCOUNT", "BUY_X_GET_Y", "CASHBACK", "COUPON"].map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
          <select className={selectCls} value={offerForm.funding_mode} onChange={(e) => setOfferForm((f) => ({ ...f, funding_mode: e.target.value }))}>
            {["PLATFORM_ONLY", "HYBRID"].map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
          <input className={inputCls} placeholder="Platform % share" value={offerForm.platform_share_pct} onChange={(e) => setOfferForm((f) => ({ ...f, platform_share_pct: e.target.value }))} />
          <input className={inputCls} placeholder="Merchant % share" value={offerForm.merchant_share_pct} onChange={(e) => setOfferForm((f) => ({ ...f, merchant_share_pct: e.target.value }))} />
          <select className={selectCls} value={offerForm.target_scope} onChange={(e) => setOfferForm((f) => ({ ...f, target_scope: e.target.value }))}>
            {["GLOBAL", "GEO", "MERCHANT", "GEO_MERCHANT"].map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
          <select className={selectCls} value={offerForm.geo_level} onChange={(e) => setOfferForm((f) => ({ ...f, geo_level: e.target.value }))}>
            {["state", "region", "district", "division", "post_office", "pincode"].map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
          <input className={inputCls} placeholder="Geo IDs (comma-separated UUIDs)" value={offerForm.geo_ids_csv} onChange={(e) => setOfferForm((f) => ({ ...f, geo_ids_csv: e.target.value }))} />
          <input className={inputCls} placeholder="Merchant IDs (comma-separated numbers)" value={offerForm.merchant_ids_csv} onChange={(e) => setOfferForm((f) => ({ ...f, merchant_ids_csv: e.target.value }))} />
          <select className={selectCls} value={offerForm.customer_segment} onChange={(e) => setOfferForm((f) => ({ ...f, customer_segment: e.target.value }))}>
            {["ALL", "NEW", "EXISTING"].map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
          <input className={inputCls} placeholder="Min order amount" value={offerForm.min_order_amount} onChange={(e) => setOfferForm((f) => ({ ...f, min_order_amount: e.target.value }))} />
          <input className={inputCls} placeholder="Max discount amount" value={offerForm.max_discount_amount} onChange={(e) => setOfferForm((f) => ({ ...f, max_discount_amount: e.target.value }))} />
          <input className={inputCls} type="datetime-local" value={offerForm.starts_at} onChange={(e) => setOfferForm((f) => ({ ...f, starts_at: e.target.value }))} />
          <input className={inputCls} type="datetime-local" value={offerForm.ends_at} onChange={(e) => setOfferForm((f) => ({ ...f, ends_at: e.target.value }))} />
          <input className={inputCls} placeholder="Campaign budget total" value={offerForm.budget_total} onChange={(e) => setOfferForm((f) => ({ ...f, budget_total: e.target.value }))} />
          <select className={selectCls} value={offerForm.discount_type} onChange={(e) => setOfferForm((f) => ({ ...f, discount_type: e.target.value }))}>
            {["PERCENTAGE", "FIXED"].map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
          <input className={inputCls} placeholder="Discount value" value={offerForm.value_numeric} onChange={(e) => setOfferForm((f) => ({ ...f, value_numeric: e.target.value }))} />
          <select className={selectCls} value={offerForm.delivery_discount_type} onChange={(e) => setOfferForm((f) => ({ ...f, delivery_discount_type: e.target.value }))}>
            <option value="">No delivery offer</option>
            <option value="FULL_WAIVE">FULL_WAIVE</option>
            <option value="PERCENT">PERCENT</option>
            <option value="FIXED">FIXED</option>
          </select>
          <input className={inputCls} placeholder="Delivery discount value" value={offerForm.delivery_discount_value} onChange={(e) => setOfferForm((f) => ({ ...f, delivery_discount_value: e.target.value }))} />
          <input className={inputCls} placeholder="Priority (single-best: lower is stronger)" value={offerForm.priority} onChange={(e) => setOfferForm((f) => ({ ...f, priority: e.target.value }))} />
        </div>
        <div className="mt-2 flex flex-wrap gap-3 text-sm">
          <label className="flex items-center gap-2"><input type="checkbox" checked={offerForm.is_active} onChange={(e) => setOfferForm((f) => ({ ...f, is_active: e.target.checked }))} />Active</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={offerForm.is_hidden} onChange={(e) => setOfferForm((f) => ({ ...f, is_hidden: e.target.checked }))} />Hidden in app</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={offerForm.is_stackable} onChange={(e) => setOfferForm((f) => ({ ...f, is_stackable: e.target.checked }))} />Allow stacking</label>
        </div>
        <button type="button" onClick={() => void saveOffer()} disabled={busy} className="mt-3 rounded-xl bg-indigo-600 text-white text-sm px-4 py-2">
          {busy ? <span className="inline-flex items-center gap-2"><LoadingSpinner variant="button" size="sm" /> Saving…</span> : editingOfferId ? "Save offer" : "Create offer"}
        </button>
      </section>

      <section className={cardCls}>
        <h2 className="text-base font-semibold">Offers table</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-left text-slate-600 border-b">
              <tr>
                <th className="py-2 pr-3">Name</th>
                <th className="py-2 pr-3">Service</th>
                <th className="py-2 pr-3">Kind</th>
                <th className="py-2 pr-3">Funding</th>
                <th className="py-2 pr-3">Scope</th>
                <th className="py-2 pr-3">Segment</th>
                <th className="py-2 pr-3">Priority</th>
                <th className="py-2 pr-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {offersLoading ? (
                <tr><td className="py-3" colSpan={8}>Loading…</td></tr>
              ) : offers.map((o) => (
                <tr key={o.id} className="border-b border-slate-100">
                  <td className="py-2 pr-3">{o.name ?? `Offer #${o.id}`}</td>
                  <td className="py-2 pr-3">{o.service_type}</td>
                  <td className="py-2 pr-3">{o.offer_kind}</td>
                  <td className="py-2 pr-3">{o.funding_mode} ({o.platform_share_pct}%/{o.merchant_share_pct}%)</td>
                  <td className="py-2 pr-3">{o.target_scope}</td>
                  <td className="py-2 pr-3">{o.customer_segment}</td>
                  <td className="py-2 pr-3">{o.priority}</td>
                  <td className="py-2 pr-3">
                    <div className="flex gap-2">
                      <button
                        type="button"
                        className="text-xs text-indigo-600"
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
                      <button type="button" className="text-xs text-red-600" onClick={() => void deleteOffer(o.id)}>Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className={cardCls}>
        <h2 className="text-base font-semibold">Coupons</h2>
        <ul className="mt-3 space-y-2 text-sm">
          {couponsLoading ? (
            <li>Loading…</li>
          ) : (
            coupons.map((c) => (
              <li key={c.id} className="flex justify-between border-b border-gray-100 pb-2">
                <span>{c.code} · {c.discount_type} · {c.value_numeric ?? "—"}</span>
                <span className="flex gap-2">
                  <button
                    type="button"
                    className="text-xs text-indigo-600"
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
                  <button type="button" className="text-xs text-red-600" onClick={() => void deleteCoupon(c.id)}>
                    Delete
                  </button>
                </span>
              </li>
            ))
          )}
        </ul>
        <div className="mt-3 grid sm:grid-cols-2 gap-2">
          <input className={inputCls} placeholder="Coupon code" value={couponForm.code} onChange={(e) => setCouponForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))} />
          <select className={selectCls} value={couponForm.discount_type} onChange={(e) => setCouponForm((f) => ({ ...f, discount_type: e.target.value }))}>
            {["PERCENTAGE", "FIXED"].map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
          <input className={inputCls} placeholder="Value" value={couponForm.value_numeric} onChange={(e) => setCouponForm((f) => ({ ...f, value_numeric: e.target.value }))} />
          <input className={inputCls} placeholder="Max discount cap" value={couponForm.max_discount_cap} onChange={(e) => setCouponForm((f) => ({ ...f, max_discount_cap: e.target.value }))} />
          <input className={inputCls} placeholder="Usage limit" value={couponForm.usage_limit} onChange={(e) => setCouponForm((f) => ({ ...f, usage_limit: e.target.value }))} />
        </div>
        <div className="mt-2 flex gap-3 text-sm">
          <label className="flex items-center gap-2"><input type="checkbox" checked={couponForm.is_active} onChange={(e) => setCouponForm((f) => ({ ...f, is_active: e.target.checked }))} />Active</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={couponForm.is_hidden} onChange={(e) => setCouponForm((f) => ({ ...f, is_hidden: e.target.checked }))} />Hidden in app</label>
        </div>
        <button type="button" onClick={() => void saveCoupon()} disabled={busy} className="mt-3 rounded-xl bg-indigo-600 text-white text-sm px-4 py-2">
          {busy ? <span className="inline-flex items-center gap-2"><LoadingSpinner variant="button" size="sm" /> Saving…</span> : editingCouponId ? "Save coupon" : "Add coupon"}
        </button>
      </section>
    </div>
  );
}
