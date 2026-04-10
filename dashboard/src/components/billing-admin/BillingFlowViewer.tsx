"use client";

type BreakdownRow = { i: number; step: string; delta: number; running: number };

type SimParsed = {
  itemTotal?: number;
  addonTotal?: number;
  breakdownSteps?: { step: string; amount: number }[];
};

/**
 * Running total table for bill simulation (items → charges → discounts → taxes → final).
 */
export function BillingFlowViewer({
  simParsed,
  breakdownRows,
}: {
  simParsed: SimParsed;
  breakdownRows: BreakdownRow[] | null;
}) {
  if (!breakdownRows || breakdownRows.length === 0) return null;
  const cart = (simParsed.itemTotal ?? 0) + (simParsed.addonTotal ?? 0);
  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold text-slate-900">Bill walkthrough</h3>
      <div className="overflow-x-auto rounded-xl border border-slate-200/80 bg-white/95 shadow-sm">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs text-slate-600">
            <tr>
              <th className="px-3 py-2">#</th>
              <th className="px-3 py-2">Step</th>
              <th className="px-3 py-2 text-right">Δ</th>
              <th className="px-3 py-2 text-right">Running</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-t border-slate-100">
              <td className="px-3 py-1.5 text-slate-500">0</td>
              <td className="px-3 py-1.5">Cart (items + add-ons)</td>
              <td className="px-3 py-1.5 text-right">—</td>
              <td className="px-3 py-1.5 text-right font-medium">₹{cart.toFixed(2)}</td>
            </tr>
            {breakdownRows.map((row) => (
              <tr key={row.i} className="border-t border-slate-100">
                <td className="px-3 py-1.5 text-slate-500">{row.i + 1}</td>
                <td className="px-3 py-1.5">{row.step}</td>
                <td className={`px-3 py-1.5 text-right ${row.delta < 0 ? "text-emerald-700" : "text-slate-900"}`}>
                  {row.delta < 0 ? "−" : "+"}₹{Math.abs(row.delta).toFixed(2)}
                </td>
                <td className="px-3 py-1.5 text-right font-medium">₹{row.running.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
