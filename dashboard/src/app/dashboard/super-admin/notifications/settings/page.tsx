"use client";

import { Info } from "lucide-react";

export default function SettingsPage() {
  return (
    <div className="p-6">
      <div className="text-xs font-semibold uppercase tracking-wide text-teal-700">Notifications</div>
      <h1 className="text-2xl font-semibold text-slate-900">Settings</h1>
      <p className="mt-1 text-sm text-slate-500">Global controls that apply to every send.</p>

      <div className="mt-6 space-y-4">
        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-slate-900">Rate limits</h2>
          <p className="mt-1 text-xs text-slate-500">Per-user hourly cap prevents runaway campaigns from spamming a single account. Default 20/hour.</p>
        </section>
        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-slate-900">Quiet hours</h2>
          <p className="mt-1 text-xs text-slate-500">Marketing + announcement categories are suppressed 22:00–07:00 IST. Critical priority always delivers.</p>
        </section>
        <section className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-slate-900">Scheduled-poll interval</h2>
          <p className="mt-1 text-xs text-slate-500">Backend checks for due scheduled campaigns every 30 s. Change value in <code className="rounded bg-slate-100 px-1">notification_settings.scheduled_poll_interval_sec</code>.</p>
        </section>
        <section className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-5 text-sm text-slate-600">
          <div className="flex items-start gap-2">
            <Info className="mt-0.5 h-4 w-4 text-slate-500" />
            <div>
              Editable settings UI lands in Phase 7. For now, edit values directly in the <code className="rounded bg-white px-1">notification_settings</code> table.
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
