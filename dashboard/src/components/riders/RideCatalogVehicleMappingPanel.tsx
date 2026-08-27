"use client";

import type {
  CustomerRideServiceCatalogRow,
  RideCatalogVehicleRow,
} from "@/lib/db/operations/customer-ride-service-catalog-admin";
import type { RideCatalogFareDiscountRow } from "@/lib/ride-catalog-fare-discounts";
import { HIDDEN_RIDE_CATALOG_CODES, sortRideCatalogRows } from "@/lib/ride-catalog-display-order";

type Props = {
  vehicles: RideCatalogVehicleRow[];
  catalog: CustomerRideServiceCatalogRow[];
  /** vehicleTypeCode → assigned catalog codes */
  draft: Record<string, string[]>;
  onToggle: (vehicleTypeCode: string, catalogCode: string) => void;
  fareDiscounts: RideCatalogFareDiscountRow[];
  onFareDiscountChange: (catalogCode: string, amountInr: number) => void;
};

export function RideCatalogVehicleMappingPanel({
  vehicles,
  catalog,
  draft,
  onToggle,
  fareDiscounts,
  onFareDiscountChange,
}: Props) {
  if (vehicles.length === 0) {
    return (
      <div className="px-4 py-10 text-center text-sm text-slate-500">
        No active vehicles yet. Add them under the <strong>Vehicle types</strong> tab first.
      </div>
    );
  }

  const visibleCatalog = sortRideCatalogRows(
    catalog.filter((c) => !HIDDEN_RIDE_CATALOG_CODES.has(c.code.toLowerCase()))
  );

  if (visibleCatalog.length === 0) {
    return (
      <div className="px-4 py-10 text-center text-sm text-slate-500">
        No ride catalog options found.
      </div>
    );
  }

  return (
    <div>
      <div className="border-b border-slate-200 bg-slate-50/80 px-4 py-3">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          Always-on fare discount
        </div>
        <p className="mt-0.5 text-xs text-slate-500">
          Customer always sees parent fare minus this amount. Live offers apply on the reduced fare.
        </p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {fareDiscounts.map((row) => (
            <label
              key={row.catalogCode}
              className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2"
            >
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-slate-900">{row.label}</span>
                <span className="block text-[11px] text-slate-500">
                  ₹ off {row.parentLabel} · <span className="font-mono">{row.catalogCode}</span>
                </span>
              </span>
              <span className="flex items-center gap-1">
                <span className="text-xs font-medium text-slate-500">₹</span>
                <input
                  type="number"
                  min={0}
                  max={500}
                  step={1}
                  value={Number.isFinite(row.amountInr) ? row.amountInr : 5}
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    onFareDiscountChange(row.catalogCode, Number.isFinite(n) ? n : 0);
                  }}
                  className="w-20 rounded-md border border-slate-200 px-2 py-1 text-right text-sm font-semibold text-slate-900 outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-200"
                />
              </span>
            </label>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Vehicle</th>
              <th className="px-4 py-3">Assign catalog</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {vehicles.map((v) => {
              const selected = new Set(
                (draft[v.vehicleTypeCode] ?? v.catalogCodes).map((c) => c.toLowerCase())
              );
              return (
                <tr key={v.vehicleTypeCode} className="hover:bg-slate-50/60">
                  <td className="px-4 py-3 align-middle">
                    <div className="font-medium text-slate-900">{v.label}</div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500">
                      <span className="font-mono">{v.vehicleTypeCode}</span>
                      {v.categoryCode ? (
                        <>
                          <span>·</span>
                          <span>{v.categoryCode.replace(/_/g, " ")}</span>
                        </>
                      ) : null}
                    </div>
                  </td>
                  <td className="px-4 py-3 align-middle">
                    <div className="flex flex-wrap gap-1.5">
                      {visibleCatalog.map((c) => {
                        const on = selected.has(c.code.toLowerCase());
                        return (
                          <button
                            key={`${v.vehicleTypeCode}:${c.code}`}
                            type="button"
                            onClick={() => onToggle(v.vehicleTypeCode, c.code)}
                            className={`rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors ${
                              on
                                ? "border-emerald-300 bg-emerald-50 text-emerald-900"
                                : "border-slate-200 bg-white text-slate-500 hover:border-slate-300"
                            }`}
                          >
                            {c.label}
                          </button>
                        );
                      })}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
