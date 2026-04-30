"use client";

import React, { useMemo, useState } from "react";
import { X } from "lucide-react";
import type { GeoChildRow } from "@/lib/geo/geo-shared";
import type { GeoHierarchyLevel } from "@/store/api/geoAdminApi";
import {
  useGeoPlatformOfferBindingCreateMutation,
  useGeoPlatformOfferBindingDeleteMutation,
  useGeoPlatformOfferBindingsQuery,
} from "@/store/api/geoAdminApi";
import { useGetBillingPlatformOffersQuery } from "@/store/api/billingAdminApi";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type NonRoot = Exclude<GeoHierarchyLevel, "root">;

export const PlatformOfferMapModal = React.memo(function PlatformOfferMapModal(props: {
  row: GeoChildRow | null;
  onClose: () => void;
  /** e.g. refetch flat search after bindings change */
  onBindingsChanged?: () => void;
}) {
  const [selectedOfferId, setSelectedOfferId] = useState<string>("");
  const level = props.row?.kind as NonRoot | undefined;
  const refId = props.row?.id;

  const bindingsQ = useGeoPlatformOfferBindingsQuery(
    { level: level ?? "state", refId: refId ?? "00000000-0000-0000-0000-000000000000" },
    { skip: !props.row || !level || !refId }
  );

  const offersQ = useGetBillingPlatformOffersQuery(undefined, { skip: !props.row });
  const [createBinding, createState] = useGeoPlatformOfferBindingCreateMutation();
  const [deleteBinding, deleteState] = useGeoPlatformOfferBindingDeleteMutation();

  const offers = offersQ.data ?? [];
  const boundIds = useMemo(
    () => new Set((bindingsQ.data?.bindings ?? []).map((b) => b.platform_offer_id)),
    [bindingsQ.data?.bindings]
  );

  const addOptions = useMemo(() => {
    return offers
      .filter((o) => o.is_active && !boundIds.has(o.id))
      .sort((a, b) => a.priority - b.priority || a.id - b.id);
  }, [offers, boundIds]);

  const busy = createState.isLoading || deleteState.isLoading;

  const onAdd = async () => {
    if (!level || !refId || !selectedOfferId) return;
    const oid = parseInt(selectedOfferId, 10);
    if (!Number.isInteger(oid)) return;
    try {
      await createBinding({ level, refId, platform_offer_id: oid }).unwrap();
      toast.success("Offer mapped to this location");
      setSelectedOfferId("");
      props.onBindingsChanged?.();
    } catch (e) {
      const msg = e && typeof e === "object" && "data" in e ? String((e as { data?: { error?: string } }).data?.error) : "Failed";
      toast.error(msg || "Failed to map offer");
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
        <div className="sticky top-0 z-[1] flex items-center justify-between border-b border-slate-100 bg-white px-4 py-3">
          <div>
            <p id="po-map-title" className="text-base font-bold text-slate-900">
              Platform offer mapping
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

        <div className="space-y-5 p-4">
          <p className="text-xs leading-relaxed text-slate-600">
            Bindings on this node apply to this location and inherit down the tree (closer bindings win per offer ID).
            For checkout, set offer <strong className="font-medium text-slate-800">target scope</strong> to{" "}
            <strong className="font-medium text-slate-800">GEO</strong> on the{" "}
            <a href="/dashboard/super-admin/offers-coupons" className="font-medium text-teal-700 underline">
              Offers
            </a>{" "}
            page when you want geography to gate the promo.
          </p>

          {effective.length > 0 ? (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Effective (read-only)</p>
              <ul className="mt-2 space-y-2 rounded-lg border border-slate-100 bg-slate-50/80 p-2 text-xs">
                {effective.map((e) => (
                  <li key={e.platform_offer_id} className="rounded-md border border-white/80 bg-white px-2 py-1.5 shadow-sm">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <span className="font-mono font-semibold text-slate-900">#{e.platform_offer_id}</span>
                      <span className="text-slate-600">{e.service_type}</span>
                      <span className="text-slate-500">{e.offer_audience}</span>
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
            <p className="text-xs text-slate-500">No effective platform offers for this node (add a binding below or on a parent).</p>
          )}

          <div>
            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Mapped at this node</p>
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
            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Add mapping</p>
            <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-end">
              <label className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="text-[11px] font-medium text-slate-600">Platform offer</span>
                <select
                  className={cn(
                    "min-h-[42px] w-full rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-2 text-sm text-slate-900",
                    "focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
                  )}
                  value={selectedOfferId}
                  onChange={(e) => setSelectedOfferId(e.target.value)}
                >
                  <option value="">Select offer…</option>
                  {addOptions.map((o) => (
                    <option key={o.id} value={String(o.id)}>
                      #{o.id} · {o.name ?? o.offer_kind} · {o.service_type} · {o.offer_audience}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                disabled={busy || !selectedOfferId}
                onClick={() => void onAdd()}
                className="inline-flex min-h-[42px] shrink-0 items-center justify-center rounded-lg bg-teal-600 px-4 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-50"
              >
                Add
              </button>
            </div>
            {addOptions.length === 0 && offers.length > 0 ? (
              <p className="mt-2 text-[11px] text-slate-500">All active offers are already mapped here.</p>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
});
