"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCw } from "lucide-react";

type FailedItem = {
  id: number;
  storeId: string;
  name: string;
  parentId: number | null;
  status: string;
  city: string | null;
  openVerificationFixStep: number;
  openStepCount: number;
  /** All open rejected steps already have pending resubmit payloads. */
  resubmitted?: boolean;
  latestRejectedAt: string | null;
};

function fixHref(s: FailedItem): string {
  return `/dashboard/area-managers/stores/resubmit-onboarding?storeInternalId=${encodeURIComponent(
    String(s.id)
  )}&parentId=${encodeURIComponent(String(s.parentId ?? ""))}&verification_fix_step=${encodeURIComponent(
    String(s.openVerificationFixStep)
  )}&returnTo=${encodeURIComponent("/dashboard/area-managers/stores/onboarding-failed")}`;
}

export function OnboardingFailedListClient() {
  const router = useRouter();
  const [items, setItems] = useState<FailedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/area-manager/onboarding-failed?limit=100", {
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success) {
        setError(data?.error || "Failed to load stores");
        setItems([]);
        return;
      }
      setItems(Array.isArray(data.items) ? data.items : []);
    } catch {
      setError("Failed to load stores");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="w-full px-4 py-6 sm:px-6">
      <div className="mb-4 flex justify-end">
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Refresh
        </button>
      </div>

      {error ? (
        <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {error}
        </div>
      ) : null}

      {loading && items.length === 0 ? (
        <div className="flex min-h-[30vh] items-center justify-center">
          <Loader2 className="h-7 w-7 animate-spin text-indigo-600" />
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-lg border border-slate-200 bg-white px-6 py-12 text-center text-sm text-slate-500">
          No stores need onboarding corrections right now.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-slate-500">Store ID</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-slate-500">Name</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-slate-500">Status</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-slate-500">Open steps</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-slate-500">City</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-slate-500">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.map((s) => (
                <tr key={s.id} className="hover:bg-slate-50/80">
                  <td className="whitespace-nowrap px-4 py-2.5 text-sm font-medium text-slate-900">
                    {s.storeId}
                    {s.parentId != null ? (
                      <div className="text-[11px] font-normal text-violet-600">Parent: {s.parentId}</div>
                    ) : null}
                  </td>
                  <td className="px-4 py-2.5 text-sm text-slate-900">{s.name}</td>
                  <td className="whitespace-nowrap px-4 py-2.5">
                    <span className="inline rounded bg-rose-100 px-2 py-0.5 text-xs font-medium text-rose-800">
                      {s.status || "Rejected steps"}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-sm text-slate-600">
                    {s.openStepCount} step{s.openStepCount === 1 ? "" : "s"}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-sm text-slate-500">{s.city || "—"}</td>
                  <td className="whitespace-nowrap px-4 py-2.5">
                    {s.resubmitted ? (
                      <span className="inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold uppercase tracking-wide text-emerald-700 ring-1 ring-emerald-200">
                        Resubmitted
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => router.push(fixHref(s))}
                        className="inline-flex cursor-pointer items-center justify-center rounded-lg bg-orange-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-orange-700"
                      >
                        Fix onboarding details
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
