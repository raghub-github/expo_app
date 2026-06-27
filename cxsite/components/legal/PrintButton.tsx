"use client";

import { Printer } from "lucide-react";

/**
 * Small client-side print trigger for the legal-page sidebar. Print CSS is
 * defined inline on the markdown article (`@media print`), so this button
 * just invokes `window.print()`.
 */
export default function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 hover:border-emerald-300 transition-colors"
    >
      <Printer size={14} className="text-emerald-600" /> Print / Save PDF
    </button>
  );
}
