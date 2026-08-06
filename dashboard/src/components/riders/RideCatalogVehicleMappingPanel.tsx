"use client";

import type {
  CustomerRideServiceCatalogRow,
  RideCatalogVehicleRow,
} from "@/lib/db/operations/customer-ride-service-catalog-admin";

type Props = {
  vehicles: RideCatalogVehicleRow[];
  catalog: CustomerRideServiceCatalogRow[];
  /** vehicleTypeCode → assigned catalog codes */
  draft: Record<string, string[]>;
  onToggle: (vehicleTypeCode: string, catalogCode: string) => void;
};

export function RideCatalogVehicleMappingPanel({
  vehicles,
  catalog,
  draft,
  onToggle,
}: Props) {
  if (vehicles.length === 0) {
    return (
      <div className="px-4 py-10 text-center text-sm text-slate-500">
        No active vehicles yet. Add them under the <strong>Vehicle types</strong> tab first.
      </div>
    );
  }

  if (catalog.length === 0) {
    return (
      <div className="px-4 py-10 text-center text-sm text-slate-500">
        No ride catalog options found.
      </div>
    );
  }

  return (
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
                    {catalog.map((c) => {
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
  );
}
