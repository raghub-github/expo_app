"use client";

import { Smartphone } from "lucide-react";

export default function DevicesPage() {
  return (
    <div className="p-6">
      <div className="text-xs font-semibold uppercase tracking-wide text-teal-700">Notifications</div>
      <h1 className="text-2xl font-semibold text-slate-900">Devices</h1>
      <p className="mt-1 text-sm text-slate-500">Search a user to see their registered push tokens across customer / merchant / rider apps.</p>
      <div className="mt-6 rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center">
        <div className="mx-auto grid h-12 w-12 place-items-center rounded-lg bg-slate-100">
          <Smartphone className="h-5 w-5 text-slate-500" />
        </div>
        <p className="mt-3 text-sm text-slate-600">Device browser lands in Phase 7 with the token lifecycle audit (registered / rotated / expired).</p>
        <p className="mt-1 text-xs text-slate-400">Until then, use the History page filtered by user_id to see actual deliveries.</p>
      </div>
    </div>
  );
}
