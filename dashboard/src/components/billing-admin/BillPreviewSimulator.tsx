"use client";

import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { BillingFlowViewer } from "./BillingFlowViewer";

type BreakdownRow = { i: number; step: string; delta: number; running: number };

type GstLine = {
  original: number;
  discount: number;
  taxable_value: number;
  gst: number;
};

type SimParsed = {
  error?: string;
  message?: string;
  itemTotal?: number;
  addonTotal?: number;
  discountTotal?: number;
  deliveryFee?: number;
  platformFee?: number;
  packagingFee?: number;
  surgeFee?: number;
  smallOrderFee?: number;
  convenienceFee?: number;
  taxTotal?: number;
  tipAmount?: number;
  donationAmount?: number;
  finalAmount?: number | null;
  itemsNetAfterDiscounts?: number;
  taxesByGroup?: Record<string, number>;
  /** GST audit (matches POST /v1/billing/calculate). */
  components?: {
    items: GstLine;
    delivery: GstLine;
    platform: GstLine;
    surge: GstLine;
    packaging: GstLine;
    small_order: GstLine;
    convenience: GstLine;
  };
  totals?: { total_discount: number; total_tax: number; final_payable: number };
};

const SUMMARY_KEYS: [string, keyof SimParsed][] = [
  ["Items", "itemTotal"],
  ["Add-ons", "addonTotal"],
  ["Discounts", "discountTotal"],
  ["Delivery", "deliveryFee"],
  ["Platform", "platformFee"],
  ["Packaging", "packagingFee"],
  ["Small order", "smallOrderFee"],
  ["Convenience", "convenienceFee"],
  ["Tax", "taxTotal"],
  ["Rider tip (non-taxable)", "tipAmount"],
  ["Donation (non-taxable)", "donationAmount"],
  ["Final", "finalAmount"],
];

/**
 * Admin bill preview: request JSON, run simulation, summary grid + BillingFlowViewer + raw JSON.
 */
export function BillPreviewSimulator({
  simParsed,
  simResult,
  breakdownRows,
  children,
}: {
  simParsed: SimParsed | null;
  simResult: string | null;
  breakdownRows: BreakdownRow[] | null;
  /** Presets, textarea, run button */
  children: React.ReactNode;
}) {
  return (
    <>
      {children}
      {simParsed && (
        <div className="mt-6 space-y-4">
          {simParsed.error && simParsed.finalAmount == null ? (
            <div className="space-y-2">
              {simParsed.message && (
                <p className="text-sm text-red-800 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{simParsed.message}</p>
              )}
              <pre className="text-xs bg-gray-900 text-gray-100 p-3 rounded-lg overflow-auto">{simResult}</pre>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                {SUMMARY_KEYS.map(([k, field]) => {
                  const v = simParsed[field];
                  return (
                    <div key={k} className="rounded-xl border border-slate-200/80 bg-white/95 px-3 py-2.5 shadow-sm">
                      <div className="text-[11px] font-medium text-slate-500">{k}</div>
                      <div className="text-sm font-semibold text-slate-900">
                        {typeof v === "number" ? `₹${v.toFixed(2)}` : "—"}
                      </div>
                    </div>
                  );
                })}
              </div>
              {simParsed.taxesByGroup && Object.keys(simParsed.taxesByGroup).length > 0 && (
                <div className="rounded-xl border border-slate-200/80 bg-white/95 px-3 py-2.5 text-xs shadow-sm">
                  <div className="mb-1 font-semibold text-slate-800">Tax by group</div>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(simParsed.taxesByGroup).map(([g, amt]) => (
                      <span key={g} className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5">
                        <span className="text-slate-600">{g}</span>
                        <span className="font-semibold">₹{amt.toFixed(2)}</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {simParsed.components && (
                <div className="overflow-x-auto rounded-xl border border-slate-200/80 bg-white/95 px-3 py-2.5 text-xs shadow-sm">
                  <div className="mb-2 font-semibold text-slate-800">GST by supply component (after discount)</div>
                  <table className="min-w-full text-[11px]">
                    <thead>
                      <tr className="border-b border-slate-100 text-left text-slate-600">
                        <th className="py-1 pr-2">Component</th>
                        <th className="py-1 pr-2 text-right">Original</th>
                        <th className="py-1 pr-2 text-right">Discount</th>
                        <th className="py-1 pr-2 text-right">Taxable</th>
                        <th className="py-1 text-right">GST</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(
                        [
                          ["Items", simParsed.components.items],
                          ["Delivery", simParsed.components.delivery],
                          ["Platform", simParsed.components.platform],
                          ["Surge", simParsed.components.surge],
                          ["Packaging", simParsed.components.packaging],
                          ["Small order", simParsed.components.small_order],
                          ["Convenience", simParsed.components.convenience],
                        ] as const
                      ).map(([label, row]) => (
                        <tr key={label} className="border-t border-slate-50">
                          <td className="py-1 pr-2 font-medium text-slate-800">{label}</td>
                          <td className="py-1 pr-2 text-right">₹{row.original.toFixed(2)}</td>
                          <td className="py-1 pr-2 text-right text-emerald-800">−₹{row.discount.toFixed(2)}</td>
                          <td className="py-1 pr-2 text-right">₹{row.taxable_value.toFixed(2)}</td>
                          <td className="py-1 text-right">₹{row.gst.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {simParsed.totals && (
                    <div className="mt-2 flex flex-wrap gap-4 border-t border-slate-100 pt-2 text-slate-700">
                      <span>
                        Total discount: <strong>₹{simParsed.totals.total_discount.toFixed(2)}</strong>
                      </span>
                      <span>
                        Total tax: <strong>₹{simParsed.totals.total_tax.toFixed(2)}</strong>
                      </span>
                      <span>
                        Final payable: <strong>₹{simParsed.totals.final_payable.toFixed(2)}</strong>
                      </span>
                    </div>
                  )}
                </div>
              )}
              <BillingFlowViewer simParsed={simParsed} breakdownRows={breakdownRows} />
              <details className="text-xs">
                <summary className="cursor-pointer font-semibold text-indigo-600">Raw JSON response</summary>
                <pre className="mt-2 max-h-80 overflow-auto rounded-xl bg-slate-900 p-3 text-[11px] text-slate-100 shadow-inner">{simResult}</pre>
              </details>
            </>
          )}
        </div>
      )}
    </>
  );
}

export function BillPreviewSimulatorRunButton({
  onClick,
  disabled,
  busy,
}: {
  onClick: () => void;
  disabled: boolean;
  busy: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="mt-3 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-emerald-200/60 transition hover:brightness-105 disabled:opacity-50"
    >
      {busy ? (
        <>
          <LoadingSpinner variant="button" size="sm" /> Running…
        </>
      ) : (
        "Run simulation"
      )}
    </button>
  );
}
