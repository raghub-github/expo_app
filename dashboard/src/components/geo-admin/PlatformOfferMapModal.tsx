"use client";

import React, { useCallback, useMemo, useState } from "react";
import { X } from "lucide-react";
import type { GeoChildRow } from "@/lib/geo/geo-shared";
import type { GeoHierarchyLevel } from "@/store/api/geoAdminApi";
import {
  useGeoCheckoutCouponBindingCreateMutation,
  useGeoCheckoutCouponBindingDeleteMutation,
  useGeoCheckoutCouponBindingsQuery,
  useGeoPlatformOfferBindingCreateMutation,
  useGeoPlatformOfferBindingDeleteMutation,
  useGeoPlatformOfferBindingsQuery,
} from "@/store/api/geoAdminApi";
import {
  useGetBillingDiscountsQuery,
  useGetBillingPlatformOffersQuery,
} from "@/store/api/billingAdminApi";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type NonRoot = Exclude<GeoHierarchyLevel, "root">;
type Tab = "offers" | "coupons";

function toggleId(prev: number[], id: number): number[] {
  return prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
}

export const PlatformOfferMapModal = React.memo(function PlatformOfferMapModal(props: {
  row: GeoChildRow | null;
  onClose: () => void;
  /** e.g. refetch flat search after bindings change */
  onBindingsChanged?: () => void;
}) {
  const [tab, setTab] = useState<Tab>("offers");
  const [selectedOfferIds, setSelectedOfferIds] = useState<number[]>([]);
  const [selectedCouponIds, setSelectedCouponIds] = useState<number[]>([]);
  const level = props.row?.kind as NonRoot | undefined;
  const refId = props.row?.id;
  const skip = !props.row || !level || !refId;

  const bindingsQ = useGeoPlatformOfferBindingsQuery(
    { level: level ?? "state", refId: refId ?? "00000000-0000-0000-0000-000000000000" },
    { skip }
  );
  const couponBindingsQ = useGeoCheckoutCouponBindingsQuery(
    { level: level ?? "state", refId: refId ?? "00000000-0000-0000-0000-000000000000" },
    { skip }
  );

  const offersQ = useGetBillingPlatformOffersQuery(undefined, { skip: !props.row });
  const couponsQ = useGetBillingDiscountsQuery(undefined, { skip: !props.row });
  const [createBinding, createState] = useGeoPlatformOfferBindingCreateMutation();
  const [deleteBinding, deleteState] = useGeoPlatformOfferBindingDeleteMutation();
  const [createCouponBinding, createCouponState] = useGeoCheckoutCouponBindingCreateMutation();
  const [deleteCouponBinding, deleteCouponState] = useGeoCheckoutCouponBindingDeleteMutation();

  const offers = offersQ.data ?? [];
  const coupons = couponsQ.data ?? [];
  const boundIds = useMemo(() => {
    const s = new Set<number>();
    for (const b of bindingsQ.data?.bindings ?? []) {
      const id = Number(b.platform_offer_id);
      if (Number.isFinite(id) && id > 0) s.add(id);
    }
    return s;
  }, [bindingsQ.data?.bindings]);
  const boundCouponIds = useMemo(() => {
    const s = new Set<number>();
    for (const b of couponBindingsQ.data?.bindings ?? []) {
      const id = Number(b.billing_discount_id);
      if (Number.isFinite(id) && id > 0) s.add(id);
    }
    return s;
  }, [couponBindingsQ.data?.bindings]);

  const addOptions = useMemo(() => {
    return offers
      .filter((o) => {
        const oid = Number(o.id);
        return o.is_active && Number.isFinite(oid) && !boundIds.has(oid);
      })
      .sort((a, b) => a.priority - b.priority || a.id - b.id);
  }, [offers, boundIds]);

  const addCouponOptions = useMemo(() => {
    return coupons
      .filter((c) => {
        const cid = Number(c.id);
        return c.is_active && Number.isFinite(cid) && !boundCouponIds.has(cid);
      })
      .sort((a, b) => a.id - b.id);
  }, [coupons, boundCouponIds]);

  const selectableOfferIds = useMemo(() => new Set(addOptions.map((o) => o.id)), [addOptions]);
  const selectableCouponIds = useMemo(
    () => new Set(addCouponOptions.map((c) => c.id)),
    [addCouponOptions]
  );
  const activeSelectedOfferIds = selectedOfferIds.filter((id) => selectableOfferIds.has(id));
  const activeSelectedCouponIds = selectedCouponIds.filter((id) => selectableCouponIds.has(id));

  const busy =
    createState.isLoading ||
    deleteState.isLoading ||
    createCouponState.isLoading ||
    deleteCouponState.isLoading;

  const onToggleOffer = useCallback((id: number) => {
    setSelectedOfferIds((prev) => toggleId(prev, id));
  }, []);

  const onToggleCoupon = useCallback((id: number) => {
    setSelectedCouponIds((prev) => toggleId(prev, id));
  }, []);

  const onSelectAllOffers = useCallback(() => {
    setSelectedOfferIds(addOptions.map((o) => o.id));
  }, [addOptions]);

  const onClearOfferSelection = useCallback(() => {
    setSelectedOfferIds([]);
  }, []);

  const onSelectAllCoupons = useCallback(() => {
    setSelectedCouponIds(addCouponOptions.map((c) => c.id));
  }, [addCouponOptions]);

  const onClearCouponSelection = useCallback(() => {
    setSelectedCouponIds([]);
  }, []);

  const onAdd = async () => {
    if (!level || !refId || activeSelectedOfferIds.length === 0) return;
    let ok = 0;
    let fail = 0;
    for (const oid of activeSelectedOfferIds) {
      try {
        await createBinding({ level, refId, platform_offer_id: oid }).unwrap();
        ok += 1;
      } catch {
        fail += 1;
      }
    }
    if (ok > 0) {
      toast.success(ok === 1 ? "Offer mapped to this location" : `${ok} offers mapped to this location`);
      setSelectedOfferIds([]);
      props.onBindingsChanged?.();
    }
    if (fail > 0) {
      toast.error(fail === 1 ? "Failed to map 1 offer" : `Failed to map ${fail} offers`);
    }
  };

  const onRemove = async (bindingId: string, offerId: number) => {
    const numericId = parseInt(bindingId, 10);
    if (!Number.isInteger(numericId)) return;
    try {
      await deleteBinding({ id: numericId }).unwrap();
      toast.success(`Removed offer #${offerId}`);
      props.onBindingsChanged?.();
    } catch {
      toast.error("Failed to remove mapping");
    }
  };

  const onAddCoupon = async () => {
    if (!level || !refId || activeSelectedCouponIds.length === 0) return;
    let ok = 0;
    let fail = 0;
    for (const cid of activeSelectedCouponIds) {
      try {
        await createCouponBinding({ level, refId, billing_discount_id: cid }).unwrap();
        ok += 1;
      } catch {
        fail += 1;
      }
    }
    if (ok > 0) {
      toast.success(
        ok === 1 ? "Checkout coupon mapped to this location" : `${ok} checkout coupons mapped`
      );
      setSelectedCouponIds([]);
      props.onBindingsChanged?.();
    }
    if (fail > 0) {
      toast.error(fail === 1 ? "Failed to map 1 coupon" : `Failed to map ${fail} coupons`);
    }
  };

  const onRemoveCoupon = async (bindingId: string, couponId: number) => {
    const numericId = parseInt(bindingId, 10);
    if (!Number.isInteger(numericId)) return;
    try {
      await deleteCouponBinding({ id: numericId }).unwrap();
      toast.success(`Removed coupon #${couponId}`);
      props.onBindingsChanged?.();
    } catch {
      toast.error("Failed to remove coupon mapping");
    }
  };

  if (!props.row || !level) return null;

  const effective = props.row.effective_platform_offers ?? [];

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-slate-900/50 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      role="dialog"
      aria-modal
      aria-labelledby="po-map-title"
    >
      <div className="max-h-[92vh] w-full max-w-lg overflow-auto rounded-t-2xl border border-slate-200 bg-white shadow-2xl sm:max-h-[90vh] sm:rounded-2xl">
        <div className="sticky top-0 z-[1] border-b border-slate-100 bg-white px-4 py-3">
          <div className="flex items-center justify-between">
            <div>
              <p id="po-map-title" className="text-base font-bold text-slate-900">
                Geo mapping
              </p>
              <p className="text-xs text-slate-500">
                {level.replaceAll("_", " ")} · {props.row.name}
              </p>
            </div>
            <button
              type="button"
              onClick={props.onClose}
              className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="mt-3 flex gap-1 rounded-lg bg-slate-100 p-1">
            {(
              [
                ["offers", "Platform offers"],
                ["coupons", "Checkout coupons"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                className={cn(
                  "flex-1 rounded-md px-3 py-1.5 text-xs font-semibold transition",
                  tab === id ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-5 p-4">
          {tab === "offers" ? (
            <>
              <p className="text-xs leading-relaxed text-slate-600">
                Bindings on this node apply here and inherit down the tree. Unmapped platform offers stay
                hidden at checkout.
              </p>

              {effective.length > 0 ? (
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
                    Effective (read-only)
                  </p>
                  <ul className="mt-2 space-y-2 rounded-lg border border-slate-100 bg-slate-50/80 p-2 text-xs">
                    {effective.map((e) => (
                      <li
                        key={e.platform_offer_id}
                        className="rounded-md border border-white/80 bg-white px-2 py-1.5 shadow-sm"
                      >
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                          <span className="font-mono font-semibold text-slate-900">
                            #{e.platform_offer_id}
                          </span>
                          <span className="text-slate-600">{e.service_type}</span>
                          {e.is_inherited ? (
                            <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-900">
                              Inherited
                            </span>
                          ) : (
                            <span className="rounded bg-teal-100 px-1.5 py-0.5 text-[10px] font-semibold text-teal-900">
                              Here
                            </span>
                          )}
                        </div>
                        <p className="mt-0.5 text-[11px] text-slate-600">{e.offer_setup_summary}</p>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <p className="text-xs text-slate-500">
                  No effective platform offers for this node (add a binding below or on a parent).
                </p>
              )}

              <div>
                <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
                  Mapped at this node
                </p>
                {bindingsQ.isLoading ? (
                  <p className="mt-2 text-xs text-slate-500">Loading…</p>
                ) : (bindingsQ.data?.bindings ?? []).length === 0 ? (
                  <p className="mt-2 text-xs text-slate-500">None yet.</p>
                ) : (
                  <ul className="mt-2 space-y-2">
                    {(bindingsQ.data?.bindings ?? []).map((b) => (
                      <li
                        key={b.id}
                        className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                      >
                        <span className="font-mono text-slate-800">Offer #{b.platform_offer_id}</span>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void onRemove(b.id, b.platform_offer_id)}
                          className="shrink-0 rounded-md border border-red-200 px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
                        >
                          Remove
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="border-t border-slate-100 pt-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
                    Add mapping
                  </p>
                  {addOptions.length > 0 ? (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={onSelectAllOffers}
                        className="text-[11px] font-semibold text-teal-700 hover:underline"
                      >
                        Select all
                      </button>
                      <span className="text-slate-300">·</span>
                      <button
                        type="button"
                        onClick={onClearOfferSelection}
                        disabled={activeSelectedOfferIds.length === 0}
                        className="text-[11px] font-semibold text-slate-500 hover:underline disabled:opacity-40"
                      >
                        Clear
                      </button>
                    </div>
                  ) : null}
                </div>

                {addOptions.length === 0 ? (
                  <p className="mt-2 text-xs text-slate-500">No unmapped active offers left to add.</p>
                ) : (
                  <>
                    <ul className="mt-2 max-h-56 space-y-1 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50/40 p-2">
                      {addOptions.map((o) => {
                        const checked = activeSelectedOfferIds.includes(o.id);
                        return (
                          <li key={o.id}>
                            <label
                              className={cn(
                                "flex cursor-pointer items-start gap-2.5 rounded-md px-2 py-2 text-sm transition",
                                checked ? "bg-teal-50" : "hover:bg-white"
                              )}
                            >
                              <input
                                type="checkbox"
                                className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                                checked={checked}
                                onChange={() => onToggleOffer(o.id)}
                              />
                              <span className="min-w-0 leading-snug text-slate-800">
                                <span className="font-mono font-semibold">#{o.id}</span>
                                {" · "}
                                {o.name ?? o.offer_kind}
                                {" · "}
                                <span className="text-slate-500">{o.service_type}</span>
                              </span>
                            </label>
                          </li>
                        );
                      })}
                    </ul>
                    <button
                      type="button"
                      disabled={busy || activeSelectedOfferIds.length === 0}
                      onClick={() => void onAdd()}
                      className="mt-3 inline-flex min-h-[42px] w-full items-center justify-center rounded-lg bg-teal-600 px-4 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-50 sm:w-auto"
                    >
                      {activeSelectedOfferIds.length === 0
                        ? "Add selected"
                        : `Add ${activeSelectedOfferIds.length} selected`}
                    </button>
                  </>
                )}
              </div>
            </>
          ) : (
            <>
              <p className="text-xs leading-relaxed text-slate-600">
                Checkout coupons must be mapped to active geo coverage or they will not appear on Home,
                Checkout, or coupon APIs — and cannot auto-apply.
              </p>

              <div>
                <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
                  Mapped at this node
                </p>
                {couponBindingsQ.isLoading ? (
                  <p className="mt-2 text-xs text-slate-500">Loading…</p>
                ) : (couponBindingsQ.data?.bindings ?? []).length === 0 ? (
                  <p className="mt-2 text-xs text-slate-500">None yet.</p>
                ) : (
                  <ul className="mt-2 space-y-2">
                    {(couponBindingsQ.data?.bindings ?? []).map((b) => {
                      const c = coupons.find((x) => x.id === b.billing_discount_id);
                      return (
                        <li
                          key={b.id}
                          className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                        >
                          <span className="font-mono text-slate-800">
                            #{b.billing_discount_id}
                            {c ? ` · ${c.code}` : ""}
                          </span>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void onRemoveCoupon(b.id, b.billing_discount_id)}
                            className="shrink-0 rounded-md border border-red-200 px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
                          >
                            Remove
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

              <div className="border-t border-slate-100 pt-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
                    Add mapping
                  </p>
                  {addCouponOptions.length > 0 ? (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={onSelectAllCoupons}
                        className="text-[11px] font-semibold text-indigo-700 hover:underline"
                      >
                        Select all
                      </button>
                      <span className="text-slate-300">·</span>
                      <button
                        type="button"
                        onClick={onClearCouponSelection}
                        disabled={activeSelectedCouponIds.length === 0}
                        className="text-[11px] font-semibold text-slate-500 hover:underline disabled:opacity-40"
                      >
                        Clear
                      </button>
                    </div>
                  ) : null}
                </div>

                {addCouponOptions.length === 0 ? (
                  <p className="mt-2 text-xs text-slate-500">No unmapped active coupons left to add.</p>
                ) : (
                  <>
                    <ul className="mt-2 max-h-56 space-y-1 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50/40 p-2">
                      {addCouponOptions.map((c) => {
                        const checked = activeSelectedCouponIds.includes(c.id);
                        return (
                          <li key={c.id}>
                            <label
                              className={cn(
                                "flex cursor-pointer items-start gap-2.5 rounded-md px-2 py-2 text-sm transition",
                                checked ? "bg-indigo-50" : "hover:bg-white"
                              )}
                            >
                              <input
                                type="checkbox"
                                className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                                checked={checked}
                                onChange={() => onToggleCoupon(c.id)}
                              />
                              <span className="min-w-0 leading-snug text-slate-800">
                                <span className="font-mono font-semibold">#{c.id}</span>
                                {" · "}
                                {c.code}
                                {" · "}
                                <span className="text-slate-500">{c.service_type}</span>
                              </span>
                            </label>
                          </li>
                        );
                      })}
                    </ul>
                    <button
                      type="button"
                      disabled={busy || activeSelectedCouponIds.length === 0}
                      onClick={() => void onAddCoupon()}
                      className="mt-3 inline-flex min-h-[42px] w-full items-center justify-center rounded-lg bg-indigo-600 px-4 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50 sm:w-auto"
                    >
                      {activeSelectedCouponIds.length === 0
                        ? "Add selected"
                        : `Add ${activeSelectedCouponIds.length} selected`}
                    </button>
                  </>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
});
