"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, MapPinned, Search, Users } from "lucide-react";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { queryKeys } from "@/lib/queryKeys";
import { useAuthOptional } from "@/providers/AuthProvider";

type StateRow = {
  id: string;
  name: string;
  userCount: number;
};

type UsersByStateResponse = {
  success: boolean;
  data?: {
    states: StateRow[];
    totalUsers: number;
    usersWithState: number;
    usersWithoutState: number;
    resolvedFromCoords?: number;
  };
  error?: string;
};

export async function fetchUsersByState(): Promise<NonNullable<UsersByStateResponse["data"]>> {
  const res = await fetch("/api/customers/users-by-state", {
    credentials: "include",
    cache: "no-store",
  });
  const json = (await res.json()) as UsersByStateResponse;
  if (!res.ok || !json.success || !json.data) {
    throw new Error(json.error || "Failed to load users by state");
  }
  return json.data;
}

function StatCard({
  label,
  value,
  loading,
  className,
  labelClassName,
}: {
  label: string;
  value: number | undefined;
  loading: boolean;
  className: string;
  labelClassName: string;
}) {
  return (
    <div className={className}>
      <p className={`text-xs font-medium ${labelClassName}`}>{label}</p>
      <p className="mt-1 text-2xl font-bold text-gray-900">
        {loading ? (
          <span className="inline-block h-8 w-16 animate-pulse rounded bg-white/70" />
        ) : (
          (value ?? 0).toLocaleString()
        )}
      </p>
    </div>
  );
}

export function CustomerUsersByStateClient() {
  const [query, setQuery] = useState("");
  const auth = useAuthOptional();
  const authReady = auth == null ? true : Boolean(auth.authReady || auth.user);
  const { data, isPending, isError, error, refetch, isFetching } = useQuery({
    queryKey: queryKeys.customers.usersByState(),
    queryFn: fetchUsersByState,
    enabled: authReady,
    staleTime: 60_000,
    gcTime: 60 * 60 * 1000,
    refetchOnMount: "always",
    refetchOnWindowFocus: false,
  });

  const waitingForData = !isError && (isPending || data == null);

  const filtered = useMemo(() => {
    const rows = data?.states ?? [];
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => r.name.toLowerCase().includes(q));
  }, [data?.states, query]);

  const maxCount = useMemo(
    () => Math.max(1, ...filtered.map((r) => r.userCount)),
    [filtered]
  );

  return (
    <div className="w-full min-w-0 max-w-none space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <Link
            href="/dashboard/customers"
            className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
            aria-label="Back to Customers"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <div className="rounded-lg bg-blue-50 p-1.5 text-blue-600">
                <MapPinned className="h-5 w-5" />
              </div>
              <h1 className="text-xl font-semibold text-gray-900 leading-tight">
                Users by State / UT
              </h1>
            </div>
            <p className="mt-1 text-xs text-gray-500">
              How many customers joined from each state / UT. Missing state is filled from
              lat/lon when available.
            </p>
            {(data?.resolvedFromCoords ?? 0) > 0 ? (
              <p className="mt-1 text-xs text-emerald-700">
                Resolved {(data?.resolvedFromCoords ?? 0).toLocaleString()} user
                {(data?.resolvedFromCoords ?? 0) === 1 ? "" : "s"} from coordinates this load.
              </p>
            ) : null}
          </div>
        </div>
        <label className="relative block w-full max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search state / UT..."
            className="h-10 w-full rounded-lg border border-gray-200 bg-white pl-9 pr-3 text-sm text-gray-800 outline-none placeholder:text-gray-400 focus:border-blue-500"
          />
        </label>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard
          label="All users"
          value={data?.totalUsers}
          loading={waitingForData}
          className="rounded-xl border border-blue-100 bg-blue-50/80 p-4"
          labelClassName="text-blue-700"
        />
        <StatCard
          label="With state / UT"
          value={data?.usersWithState}
          loading={waitingForData}
          className="rounded-xl border border-emerald-100 bg-emerald-50/80 p-4"
          labelClassName="text-emerald-700"
        />
        <StatCard
          label="State not set"
          value={data?.usersWithoutState}
          loading={waitingForData}
          className="rounded-xl border border-amber-100 bg-amber-50/80 p-4"
          labelClassName="text-amber-700"
        />
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-gray-900">
            <Users className="h-4 w-4 text-blue-600" />
            States &amp; Union Territories
            {isFetching && !waitingForData ? (
              <span className="text-[10px] font-medium text-gray-400">Updating…</span>
            ) : null}
          </div>
          <p className="text-xs text-gray-500">
            {waitingForData ? "…" : `${filtered.length} regions`}
          </p>
        </div>

        {waitingForData ? (
          <div className="flex justify-center py-16">
            <LoadingSpinner size="md" text="Loading states..." />
          </div>
        ) : isError ? (
          <div className="px-4 py-10 text-center">
            <p className="text-sm text-red-600">
              {error instanceof Error ? error.message : "Failed to load"}
            </p>
            <button
              type="button"
              onClick={() => void refetch()}
              className="mt-3 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
            >
              Retry
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-gray-500">No states match your search.</p>
        ) : (
          <div className="max-h-[min(70vh,40rem)] overflow-y-auto">
            <table className="min-w-full text-sm">
              <thead className="sticky top-0 z-10 bg-gray-50 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-4 py-2.5">#</th>
                  <th className="px-4 py-2.5">State / UT</th>
                  <th className="px-4 py-2.5 text-right">Users joined</th>
                  <th className="hidden px-4 py-2.5 sm:table-cell sm:w-48">Share</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((row, index) => {
                  const pct = Math.round((row.userCount / maxCount) * 100);
                  return (
                    <tr key={row.id} className="hover:bg-slate-50/80">
                      <td className="px-4 py-2.5 tabular-nums text-gray-400">{index + 1}</td>
                      <td className="px-4 py-2.5 font-medium text-gray-900">{row.name}</td>
                      <td className="px-4 py-2.5 text-right font-semibold tabular-nums text-gray-900">
                        {row.userCount.toLocaleString()}
                      </td>
                      <td className="hidden px-4 py-2.5 sm:table-cell">
                        <div className="h-2 overflow-hidden rounded-full bg-gray-100">
                          <div
                            className="h-full rounded-full bg-blue-500 transition-all"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
