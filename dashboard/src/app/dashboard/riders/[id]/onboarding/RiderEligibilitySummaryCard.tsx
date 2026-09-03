"use client";

/**
 * Agent/super-admin view of a rider's REAL service eligibility (§41). Shows, from the
 * backend-authoritative onboarding summary: onboarding status, which services are eligible
 * vs blocked (with the missing documents + reasons), and each service-gating document's
 * lifecycle state. Replaces the insufficient "rider verified ✓" with the exact picture.
 */
import React, { useEffect, useState } from "react";

type Decision = {
  eligible: boolean;
  blocking: { code: string; reason: string; requiredAction?: string }[];
  missingDocuments: string[];
};
type Summary = {
  vehicle: { vehicleClass: string | null; fuelKind: string | null; ownership: string; vehicleType: string | null } | null;
  documents: { code: string; requiredForSomeService: boolean; state: string }[];
  services: Record<string, Decision>;
  resolvedGeo: { level: string; refId: string } | null;
  onboarding: {
    status: string;
    paymentEligible: boolean;
    eligibleServices: string[];
    blockedServices: { service: string; missingDocuments: string[]; reasons: string[] }[];
    allEligible: boolean;
    nextAction: string;
  };
  enforced: boolean;
};

const SERVICE_LABEL: Record<string, string> = { food: "Food", parcel: "Parcel", person_ride: "Person Ride" };
const human = (s: string) => s.replaceAll("_", " ").toLowerCase();

function statusColor(status: string): string {
  if (status === "COMPLETE_FULL") return "bg-emerald-100 text-emerald-800";
  if (status === "COMPLETE_LIMITED" || status === "READY_FOR_PAYMENT") return "bg-amber-100 text-amber-800";
  if (status === "MANUAL_REVIEW_REQUIRED") return "bg-indigo-100 text-indigo-800";
  return "bg-rose-100 text-rose-800";
}
function docStateColor(state: string): string {
  if (state === "AUTO_VERIFIED" || state === "MANUALLY_VERIFIED") return "text-emerald-700";
  if (state === "VERIFYING" || state === "SUBMITTED" || state === "MANUAL_REVIEW_REQUIRED") return "text-amber-700";
  if (state === "OPTIONAL_NOT_SUBMITTED" || state === "NOT_STARTED") return "text-slate-400";
  return "text-rose-700";
}

export function RiderEligibilitySummaryCard({ riderId }: { riderId: number }) {
  const [data, setData] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/riders/${riderId}/eligibility-summary`, { cache: "no-store" });
        const json = await res.json();
        if (cancelled) return;
        if (!res.ok) setError(json?.error || "Failed to load eligibility");
        else setData(json as Summary);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load eligibility");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [riderId]);

  if (loading) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-500">
        Loading service eligibility…
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-800">
        Service eligibility unavailable: {error ?? "no data"}
      </div>
    );
  }

  const ob = data.onboarding;
  const allServices = ["food", "parcel", "person_ride"];

  return (
    <div className="rounded-xl border border-indigo-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-indigo-100 px-5 py-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-indigo-700">Service eligibility</p>
          <p className="text-xs text-slate-500">
            Backend-authoritative · document verification ≠ service eligibility
            {data.resolvedGeo ? ` · policy from ${human(data.resolvedGeo.level)}` : " · default policy"}
            {!data.enforced ? " · (enforcement in shadow — advisory)" : ""}
          </p>
        </div>
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusColor(ob.status)}`}>
          {human(ob.status)}
        </span>
      </div>

      <div className="grid gap-4 px-5 py-4 sm:grid-cols-2">
        <div>
          <p className="mb-1.5 text-xs font-semibold uppercase text-slate-500">Services</p>
          <ul className="space-y-1.5 text-sm">
            {allServices.map((s) => {
              const d = data.services[s];
              const blocked = ob.blockedServices.find((b) => b.service === s);
              return (
                <li key={s} className="flex items-start gap-2">
                  <span className={d?.eligible ? "text-emerald-600" : "text-rose-600"}>
                    {d?.eligible ? "✓" : "✕"}
                  </span>
                  <span>
                    <b>{SERVICE_LABEL[s] ?? s}</b>
                    {!d?.eligible && blocked ? (
                      <span className="text-slate-500">
                        {" — "}
                        {blocked.missingDocuments.length
                          ? `needs ${blocked.missingDocuments.map(human).join(", ")}`
                          : blocked.reasons[0] ?? "not eligible"}
                      </span>
                    ) : null}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>

        <div>
          <p className="mb-1.5 text-xs font-semibold uppercase text-slate-500">Documents (service-gating)</p>
          <ul className="space-y-1.5 text-sm">
            {data.documents.map((d) => (
              <li key={d.code} className="flex items-center justify-between gap-2">
                <span>
                  {human(d.code)}
                  {d.requiredForSomeService ? (
                    <span className="ml-1 text-[11px] text-rose-500">required</span>
                  ) : (
                    <span className="ml-1 text-[11px] text-slate-400">optional</span>
                  )}
                </span>
                <span className={`text-xs font-semibold ${docStateColor(d.state)}`}>{human(d.state)}</span>
              </li>
            ))}
          </ul>
          {data.vehicle ? (
            <p className="mt-2 text-[11px] text-slate-400">
              Vehicle: {human(data.vehicle.vehicleClass ?? "unknown")} · {data.vehicle.fuelKind ?? "—"} ·{" "}
              {human(data.vehicle.ownership)}
            </p>
          ) : (
            <p className="mt-2 text-[11px] text-slate-400">No vehicle on file.</p>
          )}
        </div>
      </div>
    </div>
  );
}
