"use client";

import { useState } from "react";
import Link from "next/link";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  Star,
  Filter,
  X,
  Smile,
  Meh,
  Frown,
  MessageSquareText,
  BarChart3,
  CircleHelp,
} from "lucide-react";

type Tab = "overview" | "responses";
type PerfScope = "agent" | "group";

type AnalysisSummary = {
  totalResponses: number;
  averageRating: number | null;
  answered: number;
  unanswered: number;
  positiveCount: number;
  neutralCount: number;
  negativeCount: number;
  positivePct: number;
  neutralPct: number;
  negativePct: number;
  ratingBreakdown: Record<number, number>;
};

type PerfCard = {
  id: number;
  name: string;
  responses: number;
  avgRating: number | null;
  positivePct: number;
};

type ResponseRow = {
  ticketId: number;
  ticketNumber: string;
  rating: number;
  feedback: string | null;
  bucket: string;
  agentName: string | null;
  groupName: string | null;
  collectedAt: string | null;
};

type AgentOption = { userId: number; name: string };
type GroupOption = { id: number; name: string };

const RATING_LABELS: Record<number, string> = {
  5: "Extremely satisfied",
  4: "Satisfied",
  3: "Neither satisfied nor dissatisfied",
  2: "Dissatisfied",
  1: "Extremely dissatisfied",
};

function barColor(rating: number): string {
  if (rating >= 4) return "bg-emerald-500";
  if (rating === 3) return "bg-amber-500";
  return "bg-rose-500";
}

/** Same size for Overview/Responses and Agent/Group. */
function PillToggle<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
}: {
  value: T;
  options: { id: T; label: string }[];
  onChange: (v: T) => void;
  ariaLabel: string;
}) {
  return (
    <div
      className="inline-flex min-w-[240px] rounded-full border border-slate-200 bg-slate-100/90 p-1 shadow-inner"
      role="tablist"
      aria-label={ariaLabel}
    >
      {options.map((opt) => (
        <button
          key={opt.id}
          type="button"
          role="tab"
          aria-selected={value === opt.id}
          onClick={() => onChange(opt.id)}
          className={`min-w-[110px] flex-1 rounded-full px-5 py-2 text-sm font-semibold capitalize transition-colors ${
            value === opt.id
              ? "bg-teal-600 text-white shadow-sm"
              : "text-slate-600 hover:text-slate-900"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function RatedLabel({ stars }: { stars: number }) {
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap text-xs font-medium text-slate-600">
      <span>Rated</span>
      <span className="tickets-num inline-flex items-center gap-0.5 font-semibold text-slate-800">
        {stars}
        <Star className="h-3 w-3 fill-amber-400 text-amber-400" aria-hidden />
      </span>
      <span className="truncate">{RATING_LABELS[stars]}</span>
    </span>
  );
}

function PerfGrid({ title, items }: { title: string; items: PerfCard[] }) {
  return (
    <section className="space-y-3">
      <h3 className="text-center text-base font-semibold text-slate-800">{title}</h3>
      {items.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50/80 px-4 py-8 text-center text-sm text-slate-500">
          No ratings yet.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {items.map((item) => (
            <div
              key={`${title}-${item.id}`}
              className="rounded-xl border border-slate-200/80 bg-white p-3.5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]"
            >
              <div className="flex items-start justify-between gap-2">
                <p className="truncate text-sm font-semibold text-slate-800" title={item.name}>
                  {item.name}
                </p>
                <span className="tickets-num inline-flex shrink-0 items-center gap-0.5 text-sm font-semibold text-amber-500">
                  {item.avgRating != null ? item.avgRating.toFixed(1) : "—"}
                  <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" aria-hidden />
                </span>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <div>
                  <p className="tickets-num text-lg font-bold text-slate-900">{item.responses}</p>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                    Responses
                  </p>
                </div>
                <div>
                  <p className="tickets-num text-lg font-bold text-slate-900">
                    {item.positivePct.toFixed(1)}%
                  </p>
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                    Positive
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function formatWhen(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function CsatPageClient() {
  const [draftAgent, setDraftAgent] = useState("");
  const [draftGroup, setDraftGroup] = useState("");
  const [draftFrom, setDraftFrom] = useState("");
  const [draftTo, setDraftTo] = useState("");
  const [agentUserId, setAgentUserId] = useState("");
  const [groupId, setGroupId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [tab, setTab] = useState<Tab>("overview");
  const [perfScope, setPerfScope] = useState<PerfScope>("agent");
  const [filterAnimKey, setFilterAnimKey] = useState(0);

  const bumpFilterAnim = () => {
    setFilterAnimKey((k) => k + 1);
  };

  const { data: refData } = useQuery<{
    groups?: GroupOption[];
    agents?: AgentOption[];
  }>({
    queryKey: ["tickets", "reference-data", "csat-filters"],
    queryFn: async () => {
      const [refRes, agentsRes] = await Promise.all([
        fetch("/api/tickets/reference-data", { credentials: "include" }),
        fetch("/api/tickets/agents", { credentials: "include" }),
      ]);
      const refJson = refRes.ok ? await refRes.json() : null;
      const agentsJson = agentsRes.ok ? await agentsRes.json() : null;
      const groupsRaw = (refJson?.data?.groups ?? []) as Array<Record<string, unknown>>;
      const agentsRaw = (agentsJson?.data?.agents ?? []) as Array<Record<string, unknown>>;
      return {
        groups: groupsRaw.map((g) => ({
          id: Number(g.id),
          name: String(g.groupName ?? g.group_name ?? g.name ?? `Group ${g.id}`),
        })),
        agents: agentsRaw
          .map((a) => ({
            userId: Number(a.id ?? a.user_id ?? a.userId),
            name: String(a.name ?? a.full_name ?? a.email ?? `Agent`),
          }))
          .filter((a) => Number.isFinite(a.userId) && a.userId > 0),
      };
    },
    staleTime: 5 * 60_000,
  });

  const { data, isLoading, error, isPlaceholderData } = useQuery<{
    success: boolean;
    data: {
      summary: AnalysisSummary;
      responses: ResponseRow[];
      agents: PerfCard[];
      groups: PerfCard[];
    };
  }>({
    queryKey: ["csatAnalysis", agentUserId, groupId, startDate, endDate],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (startDate) params.set("startDate", startDate);
      if (endDate) params.set("endDate", endDate);
      if (agentUserId) params.set("agentUserId", agentUserId);
      if (groupId) params.set("groupId", groupId);
      const qs = params.toString();
      const res = await fetch(`/api/tickets/csat-analysis${qs ? `?${qs}` : ""}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to load C&D SAT analysis");
      return res.json();
    },
    staleTime: 8_000,
    refetchInterval: 10_000,
    refetchOnWindowFocus: true,
    placeholderData: keepPreviousData,
  });

  const summary = data?.data?.summary ?? {
    totalResponses: 0,
    averageRating: null,
    answered: 0,
    unanswered: 0,
    positiveCount: 0,
    neutralCount: 0,
    negativeCount: 0,
    positivePct: 0,
    neutralPct: 0,
    negativePct: 0,
    ratingBreakdown: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
  };

  const applyFilters = () => {
    setAgentUserId(draftAgent);
    setGroupId(draftGroup);
    setStartDate(draftFrom);
    setEndDate(draftTo);
    bumpFilterAnim();
  };

  const clearFilters = () => {
    setDraftAgent("");
    setDraftGroup("");
    setDraftFrom("");
    setDraftTo("");
    setAgentUserId("");
    setGroupId("");
    setStartDate("");
    setEndDate("");
    bumpFilterAnim();
  };

  const maxBreakdown = Math.max(1, ...Object.values(summary.ratingBreakdown ?? { 1: 0 }));
  const responseCount = data?.data?.responses?.length ?? 0;
  const fieldClass =
    "h-10 w-full min-w-0 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-800 outline-none ring-teal-500/30 focus:ring-2";

  if (error) {
    return (
      <div className="tickets-typo rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
        Could not load C&D SAT analysis. Check ticket permissions or try again.
      </div>
    );
  }

  return (
    <div className="tickets-typo space-y-4" aria-busy={isLoading || isPlaceholderData}>
      <div className="w-full rounded-xl border border-slate-200/80 bg-white px-3 py-3 shadow-[0_1px_2px_rgba(15,23,42,0.04)] sm:px-4">
        <div className="flex w-full flex-wrap items-end gap-3 sm:flex-nowrap">
          <label className="flex min-w-0 flex-1 flex-col gap-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
            Agent
            <select
              value={draftAgent}
              onChange={(e) => setDraftAgent(e.target.value)}
              className={fieldClass}
            >
              <option value="">All agents</option>
              {(refData?.agents ?? []).map((a) => (
                <option key={a.userId} value={String(a.userId)}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex min-w-0 flex-1 flex-col gap-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
            Group
            <select
              value={draftGroup}
              onChange={(e) => setDraftGroup(e.target.value)}
              className={fieldClass}
            >
              <option value="">All groups</option>
              {(refData?.groups ?? []).map((g) => (
                <option key={g.id} value={String(g.id)}>
                  {g.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex min-w-0 flex-1 flex-col gap-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
            Date from
            <input
              type="date"
              value={draftFrom}
              onChange={(e) => setDraftFrom(e.target.value)}
              className={`tickets-num ${fieldClass}`}
            />
          </label>
          <label className="flex min-w-0 flex-1 flex-col gap-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
            Date to
            <input
              type="date"
              value={draftTo}
              onChange={(e) => setDraftTo(e.target.value)}
              className={`tickets-num ${fieldClass}`}
            />
          </label>
          <div className="flex shrink-0 items-center gap-2 pb-px">
            <button
              type="button"
              onClick={applyFilters}
              className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-teal-600 px-4 text-sm font-semibold text-white hover:bg-teal-700"
            >
              <Filter className="h-4 w-4" aria-hidden />
              Apply
            </button>
            <button
              type="button"
              onClick={clearFilters}
              className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              <X className="h-4 w-4" aria-hidden />
              Clear
            </button>
          </div>
        </div>
      </div>

      <div
        key={filterAnimKey}
        className={`space-y-4 ${filterAnimKey > 0 ? "csat-filter-slide-up" : ""}`}
      >
      <div className="flex justify-center">
        <PillToggle
          value={tab}
          onChange={setTab}
          ariaLabel="C&D SAT views"
          options={[
            { id: "overview" as const, label: "Overview" },
            { id: "responses" as const, label: "Responses" },
          ]}
        />
      </div>

      {isLoading && !data ? (
        <div className="flex min-h-[240px] items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-teal-600 border-t-transparent" />
        </div>
      ) : tab === "overview" ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
            {[
              {
                label: "Total responses",
                value: String(summary.totalResponses),
                icon: MessageSquareText,
                tone: "from-teal-600 to-teal-700",
              },
              {
                label: "Average rating",
                value: summary.averageRating != null ? summary.averageRating.toFixed(1) : "—",
                icon: Star,
                tone: "from-slate-700 to-slate-800",
              },
              {
                label: "Total Rated",
                value: String(summary.answered),
                icon: BarChart3,
                tone: "from-teal-600 to-cyan-700",
              },
              {
                label: "Un Rated",
                value: String(summary.unanswered),
                icon: CircleHelp,
                tone: "from-slate-700 to-slate-900",
              },
            ].map((card) => {
              const Icon = card.icon;
              return (
                <div
                  key={card.label}
                  className={`relative overflow-hidden rounded-xl bg-gradient-to-br ${card.tone} px-3.5 py-3.5 text-white shadow-sm`}
                >
                  <Icon className="absolute -right-1 -top-1 h-12 w-12 text-white/10" aria-hidden />
                  <p className="tickets-num text-xl font-bold tabular-nums sm:text-2xl">{card.value}</p>
                  <p className="mt-0.5 text-[11px] font-medium text-white/85">{card.label}</p>
                </div>
              );
            })}
          </div>

          {/* Sentiment + Rating breakdown in one row */}
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 lg:grid-cols-1">
              {[
                {
                  label: "Positive",
                  Icon: Smile,
                  pct: summary.positivePct,
                  count: summary.positiveCount,
                  tone: "border-emerald-200/80 bg-emerald-50/70 text-emerald-700",
                },
                {
                  label: "Neutral",
                  Icon: Meh,
                  pct: summary.neutralPct,
                  count: summary.neutralCount,
                  tone: "border-amber-200/80 bg-amber-50/70 text-amber-700",
                },
                {
                  label: "Negative",
                  Icon: Frown,
                  pct: summary.negativePct,
                  count: summary.negativeCount,
                  tone: "border-rose-200/80 bg-rose-50/70 text-rose-700",
                },
              ].map((s) => (
                <div
                  key={s.label}
                  className={`flex items-center gap-3 rounded-xl border px-3 py-3 shadow-sm sm:flex-col sm:items-center sm:py-4 lg:flex-row lg:items-center lg:py-3 ${s.tone}`}
                >
                  <s.Icon className="h-7 w-7 shrink-0" strokeWidth={1.75} aria-hidden />
                  <div className="min-w-0 sm:text-center lg:text-left">
                    <p className="tickets-num text-xl font-bold text-slate-900">
                      {s.pct.toFixed(1)}%
                    </p>
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                      {s.label}
                      <span className="tickets-num"> · {s.count}</span>
                    </p>
                  </div>
                </div>
              ))}
            </div>

            <div className="rounded-xl border border-slate-200/80 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
              <h3 className="mb-3 text-sm font-semibold text-slate-800">Rating breakdown</h3>
              <div className="space-y-2.5">
                {[5, 4, 3, 2, 1].map((stars) => {
                  const count = summary.ratingBreakdown?.[stars] ?? 0;
                  const widthPct =
                    count === 0 ? 0 : Math.max(4, Math.round((count / maxBreakdown) * 100));
                  return (
                    <div
                      key={stars}
                      className="grid grid-cols-[minmax(0,1fr)_40px] items-center gap-2 sm:grid-cols-[minmax(160px,1fr)_minmax(48px,1fr)_40px]"
                    >
                      <RatedLabel stars={stars} />
                      <div className="hidden h-2 overflow-hidden rounded-full bg-slate-100 sm:block">
                        <div
                          className={`h-full rounded-full transition-[width] duration-300 ${barColor(stars)}`}
                          style={{ width: `${widthPct}%` }}
                        />
                      </div>
                      <p className="tickets-num text-right text-sm font-semibold tabular-nums text-slate-800">
                        {count.toLocaleString()}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="flex justify-center pt-1">
            <PillToggle
              value={perfScope}
              onChange={setPerfScope}
              ariaLabel="Agent or group view"
              options={[
                { id: "agent" as const, label: "Agent" },
                { id: "group" as const, label: "Group" },
              ]}
            />
          </div>

          <PerfGrid
            title={perfScope === "agent" ? "Agent performance" : "Group performance"}
            items={perfScope === "agent" ? (data?.data?.agents ?? []) : (data?.data?.groups ?? [])}
          />
        </div>
      ) : (
        <div className="min-h-[240px] overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
          <div className="border-b border-slate-100 px-3 py-2 text-sm font-semibold text-slate-800">
            Responses
            <span className="tickets-num text-slate-500"> ({responseCount})</span>
          </div>
          {responseCount === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-slate-500">No ratings yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[920px] border-collapse text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/80 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                    <th className="whitespace-nowrap px-3 py-2 font-semibold">Ticket</th>
                    <th className="whitespace-nowrap px-3 py-2 font-semibold">Type</th>
                    <th className="whitespace-nowrap px-3 py-2 font-semibold">Rating</th>
                    <th className="whitespace-nowrap px-3 py-2 font-semibold">Agent</th>
                    <th className="whitespace-nowrap px-3 py-2 font-semibold">Group</th>
                    <th className="whitespace-nowrap px-3 py-2 font-semibold">When</th>
                    <th className="min-w-[160px] px-3 py-2 font-semibold">Comment</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(data?.data?.responses ?? []).map((r) => {
                    const stars = Math.min(5, Math.max(1, Math.round(r.rating)));
                    return (
                      <tr key={r.ticketId} className="hover:bg-slate-50/60">
                        <td className="whitespace-nowrap px-3 py-2 align-middle">
                          <Link
                            href={`/dashboard/tickets/${r.ticketId}?panel=csat`}
                            className="tickets-num font-semibold text-teal-700 hover:underline"
                          >
                            {r.ticketNumber}
                          </Link>
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 align-middle">
                          <span
                            className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                              r.bucket === "csat"
                                ? "bg-emerald-100 text-emerald-700"
                                : r.bucket === "dsat"
                                  ? "bg-rose-100 text-rose-700"
                                  : "bg-amber-100 text-amber-800"
                            }`}
                          >
                            {r.bucket}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 align-middle">
                          <RatedLabel stars={stars} />
                        </td>
                        <td className="max-w-[140px] truncate whitespace-nowrap px-3 py-2 align-middle text-slate-700">
                          {r.agentName || "—"}
                        </td>
                        <td className="max-w-[140px] truncate whitespace-nowrap px-3 py-2 align-middle text-slate-700">
                          {r.groupName || "—"}
                        </td>
                        <td className="tickets-num whitespace-nowrap px-3 py-2 align-middle text-slate-500">
                          {formatWhen(r.collectedAt)}
                        </td>
                        <td className="max-w-[220px] truncate px-3 py-2 align-middle text-slate-700">
                          {r.feedback ? (
                            <span title={r.feedback}>{r.feedback}</span>
                          ) : (
                            <span className="italic text-slate-400">No written comment</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
      </div>
    </div>
  );
}
