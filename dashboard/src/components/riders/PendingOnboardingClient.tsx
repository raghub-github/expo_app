"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, Phone, RefreshCw, User } from "lucide-react";
import { useAppSearchParams } from "@/hooks/useAppSearchParams";
import { ONBOARDING_STAGE_LABELS } from "@/types/rider-dashboard";
import { buildRidersHomeUrl } from "@/lib/riders/rider-dashboard-navigation";
import { TablePagination } from "./TablePagination";

type PendingRow = {
  id: number;
  name: string | null;
  mobile: string;
  countryCode: string;
  city: string | null;
  state: string | null;
  status: string;
  onboardingStage: string;
  kycStatus: string;
  nextRequiredStep: string | null;
  onboardingProgressPct: number;
  createdAt: string | null;
  updatedAt: string | null;
};

const STAGE_FILTERS = [
  { value: "", label: "All stages" },
  { value: "MOBILE_VERIFIED", label: "Mobile verified" },
  { value: "KYC", label: "KYC / documents" },
  { value: "PAYMENT", label: "Payment pending" },
  { value: "APPROVAL", label: "Pending approval" },
] as const;

function formatStep(step: string | null): string {
  if (!step) return "—";
  const labels: Record<string, string> = {
    aadhaar: "Aadhaar",
    face: "Selfie / face",
    pan: "PAN",
    vehicle: "Vehicle docs",
    payment: "Onboarding fee",
    approval: "Admin approval",
  };
  return labels[step.toLowerCase()] ?? step.replace(/_/g, " ");
}

function formatWhen(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

export function PendingOnboardingClient() {
  const searchParams = useAppSearchParams();
  const search = (searchParams.get("search") || "").trim();

  const [rows, setRows] = useState<PendingRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [stage, setStage] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set("limit", String(pageSize));
      params.set("offset", String((page - 1) * pageSize));
      if (stage) params.set("stage", stage);
      if (search) params.set("search", search);

      const res = await fetch(`/api/riders/pending-onboarding?${params.toString()}`, {
        credentials: "include",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.success) {
        throw new Error(json.error || "Failed to load riders");
      }
      setRows(Array.isArray(json.data) ? json.data : []);
      setTotal(Number(json.total ?? 0));
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("gm-rider-pending-onboarding-refresh"));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load riders");
      setRows([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, stage, search]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setPage(1);
  }, [stage, search, pageSize]);

  return (
    <div className="w-full space-y-4 px-4 py-6 sm:px-6">
      <div className="flex flex-wrap items-center justify-end gap-2 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
        <select
          value={stage}
          onChange={(e) => setStage(e.target.value)}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
        >
          {STAGE_FILTERS.map((f) => (
            <option key={f.value || "all"} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>
        <label className="inline-flex items-center gap-1.5 text-sm text-slate-600">
          <span className="whitespace-nowrap">Rows</span>
          <select
            value={pageSize}
            onChange={(e) => setPageSize(Number(e.target.value))}
            className="rounded-lg border border-slate-200 bg-white px-2 py-2 text-sm text-slate-700"
            aria-label="Rows per page"
          >
            <option value={10}>10</option>
            <option value={25}>25</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
          </select>
        </label>
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
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {error}
        </div>
      ) : null}

      {loading && rows.length === 0 ? (
        <div className="flex min-h-[30vh] items-center justify-center">
          <Loader2 className="h-7 w-7 animate-spin text-indigo-600" />
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-lg border border-slate-200 bg-white px-6 py-12 text-center text-sm text-slate-500">
          No riders with pending onboarding{search || stage ? " for this filter" : ""}.
        </div>
      ) : (
        <>
          <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-slate-500">Rider</th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-slate-500">Mobile</th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-slate-500">Stage</th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-slate-500">Next step</th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-slate-500">Progress</th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-slate-500">City</th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-slate-500">Updated</th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-slate-500">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((r) => {
                  const tel = `${r.countryCode || "+91"}${r.mobile}`.replace(/\s+/g, "");
                  const returnTo = search
                    ? `/dashboard/riders/pending-onboarding?search=${encodeURIComponent(search)}`
                    : "/dashboard/riders/pending-onboarding";
                  return (
                    <tr key={r.id} className="hover:bg-slate-50/80">
                      <td className="whitespace-nowrap px-4 py-2.5 text-sm">
                        <div className="font-medium text-slate-900">GMR{r.id}</div>
                        <div className="text-xs text-slate-500">{r.name || "—"}</div>
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-sm text-slate-700">
                        <a
                          href={`tel:${tel}`}
                          className="inline-flex items-center gap-1.5 font-medium text-blue-600 hover:text-blue-700"
                        >
                          <Phone className="h-3.5 w-3.5" />
                          {r.countryCode} {r.mobile}
                        </a>
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5">
                        <span className="inline-flex rounded-md bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800 ring-1 ring-amber-200/80">
                          {ONBOARDING_STAGE_LABELS[r.onboardingStage] ?? r.onboardingStage}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-sm text-slate-600">
                        {formatStep(r.nextRequiredStep)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-sm tabular-nums text-slate-600">
                        {Math.max(0, Math.min(100, r.onboardingProgressPct))}%
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-sm text-slate-500">
                        {r.city || "—"}
                        {r.state ? `, ${r.state}` : ""}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-xs text-slate-500">
                        {formatWhen(r.updatedAt)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-sm">
                        <div className="flex items-center gap-2">
                          <Link
                            href={buildRidersHomeUrl(r.id)}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-[#121212] px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-black"
                          >
                            <User className="h-3.5 w-3.5" aria-hidden />
                            Open profile
                          </Link>
                          <Link
                            href={`/dashboard/riders/${r.id}/onboarding?returnTo=${encodeURIComponent(returnTo)}`}
                            className="inline-flex items-center rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition-colors hover:bg-slate-50"
                          >
                            Onboarding
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <TablePagination
            page={page}
            pageSize={pageSize}
            total={total}
            onPageChange={setPage}
            disabled={loading}
          />
        </>
      )}
    </div>
  );
}
