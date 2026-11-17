"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { MapPin, Search, X } from "lucide-react";
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

const outerBorder = "rounded-md border-[0.5px] border-[#121212]/40";
const rowBorder = "border-b-[0.5px] border-[#121212]/12";

function StatChip({
  label,
  value,
  loading,
  tone,
  href,
}: {
  label: string;
  value: number | undefined;
  loading: boolean;
  tone: "neutral" | "green" | "amber";
  href?: string;
}) {
  const tones = {
    neutral: "bg-[#F4F4F4] text-[#121212] ring-[#121212]/08",
    green: "bg-emerald-50 text-emerald-900 ring-emerald-100",
    amber: "bg-amber-50 text-amber-900 ring-amber-100 hover:ring-amber-300",
  } as const;

  const inner = (
    <span
      className={`inline-flex h-9 items-center gap-2 rounded-full px-3 text-xs ring-1 ${tones[tone]} ${
        href ? "cursor-pointer transition" : ""
      }`}
    >
      <span className="font-medium opacity-70">{label}</span>
      <span className="font-bold tabular-nums">
        {loading ? "…" : (value ?? 0).toLocaleString()}
      </span>
    </span>
  );

  if (href) {
    return (
      <Link href={href} className="shrink-0" aria-label={`${label}: ${value ?? 0}`}>
        {inner}
      </Link>
    );
  }
  return <span className="shrink-0">{inner}</span>;
}

export function CustomerUsersByStateClient() {
  const router = useRouter();
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
    placeholderData: (prev) => prev,
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
    <div className="flex h-full min-h-0 w-full min-w-0 flex-1 flex-col gap-2 overflow-hidden">
      {/* Search + chips — below header, no overlap */}
      <div className="flex shrink-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <label className="relative block w-full max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#121212]/35" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search state / UT…"
              className="h-10 w-full rounded-full border-0 bg-[#F0F0F0] pl-10 pr-9 text-sm text-[#121212] outline-none ring-0 placeholder:text-[#121212]/40 focus:bg-[#EBEBEB]"
              aria-label="Search states"
            />
            {query ? (
              <button
                type="button"
                onClick={() => setQuery("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-full p-0.5 text-[#121212]/40 hover:bg-[#121212]/08 hover:text-[#121212]"
                aria-label="Clear search"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            ) : null}
          </label>
          <span className="hidden items-center gap-1.5 text-xs text-[#121212]/45 sm:inline-flex">
            <MapPin className="h-3.5 w-3.5" />
            {waitingForData ? "…" : `${filtered.length} regions`}
            {isFetching && !waitingForData ? (
              <span className="text-[#121212]/30">· updating</span>
            ) : null}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <StatChip
            label="All"
            value={data?.totalUsers}
            loading={waitingForData}
            tone="neutral"
          />
          <StatChip
            label="With state"
            value={data?.usersWithState}
            loading={waitingForData}
            tone="green"
          />
          <StatChip
            label="Not set"
            value={data?.usersWithoutState}
            loading={waitingForData}
            tone="amber"
            href="/dashboard/customers/all?state=__unset__"
          />
        </div>
      </div>

      {/* Full-height scrollable table — no pagination footer */}
      <div className={`flex min-h-0 flex-1 flex-col overflow-hidden bg-white ${outerBorder}`}>
        <div className="min-h-0 flex-1 overflow-auto">
          <table className="w-full min-w-[640px] border-collapse text-left text-sm">
            <thead className="text-xs font-medium text-[#121212]/55">
              <tr>
                <th className={`sticky top-0 z-20 w-12 bg-[#F7F7F7] px-3 py-2.5 font-medium ${rowBorder}`}>
                  #
                </th>
                <th className={`sticky top-0 z-20 bg-[#F7F7F7] px-3 py-2.5 font-medium ${rowBorder}`}>
                  State / UT
                </th>
                <th
                  className={`sticky top-0 z-20 bg-[#F7F7F7] px-3 py-2.5 text-right font-medium ${rowBorder}`}
                >
                  Users joined
                </th>
                <th
                  className={`sticky top-0 z-20 hidden bg-[#F7F7F7] px-3 py-2.5 font-medium sm:table-cell sm:w-48 ${rowBorder}`}
                >
                  Share
                </th>
                <th
                  className={`sticky top-0 z-20 bg-[#F7F7F7] px-3 py-2.5 text-right font-medium ${rowBorder}`}
                >
                  Action
                </th>
              </tr>
            </thead>
            <tbody>
              {waitingForData ? (
                Array.from({ length: 12 }).map((_, i) => (
                  <tr key={i}>
                    <td colSpan={5} className={`px-3 py-3 ${rowBorder}`}>
                      <div className="h-4 w-2/3 animate-pulse bg-[#121212]/08" />
                    </td>
                  </tr>
                ))
              ) : isError ? (
                <tr>
                  <td colSpan={5} className={`px-3 py-10 text-center ${rowBorder}`}>
                    <p className="text-sm text-rose-600">
                      {error instanceof Error ? error.message : "Failed to load"}
                    </p>
                    <button
                      type="button"
                      onClick={() => void refetch()}
                      className="mt-3 inline-flex h-8 cursor-pointer items-center rounded-md border border-[#121212]/20 bg-white px-3 text-xs font-semibold text-[#121212] hover:bg-[#FAFAFA]"
                    >
                      Retry
                    </button>
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className={`px-3 py-10 text-center text-sm text-[#121212]/50 ${rowBorder}`}
                  >
                    No states match your search.
                  </td>
                </tr>
              ) : (
                filtered.map((row, index) => {
                  const pct = Math.round((row.userCount / maxCount) * 100);
                  const href = `/dashboard/customers/all?state=${encodeURIComponent(row.name)}`;
                  return (
                    <tr
                      key={row.id}
                      className="cursor-pointer bg-white hover:bg-[#FAFAFA]"
                      onClick={() => router.push(href)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          router.push(href);
                        }
                      }}
                      tabIndex={0}
                      role="link"
                      aria-label={`View ${row.userCount} customers from ${row.name}`}
                    >
                      <td className={`px-3 py-2.5 tabular-nums text-[#121212]/40 ${rowBorder}`}>
                        {index + 1}
                      </td>
                      <td className={`px-3 py-2.5 font-bold text-[#121212] ${rowBorder}`}>
                        {row.name}
                      </td>
                      <td
                        className={`px-3 py-2.5 text-right font-semibold tabular-nums text-[#121212] ${rowBorder}`}
                      >
                        {row.userCount.toLocaleString()}
                      </td>
                      <td className={`hidden px-3 py-2.5 sm:table-cell ${rowBorder}`}>
                        <div className="h-1.5 overflow-hidden rounded-full bg-[#121212]/08">
                          <div
                            className="h-full rounded-full bg-[#121212]/55"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </td>
                      <td className={`px-3 py-2.5 text-right ${rowBorder}`}>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            router.push(href);
                          }}
                          className="inline-flex h-8 cursor-pointer items-center rounded-md bg-emerald-600 px-3 text-xs font-semibold text-white hover:bg-emerald-700"
                        >
                          View
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
