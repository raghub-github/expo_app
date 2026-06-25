"use client";

import { useCallback, useEffect, useMemo, useState, type ComponentType } from "react";
import {
  Crown,
  Gift,
  Info,
  MoreVertical,
  Pause,
  Pencil,
  Plus,
  Target,
  Trash2,
  Trophy,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { IncentiveProgramListRow } from "@/lib/db/operations/incentive-programs";
import { IncentiveProgramFormModal } from "@/components/super-admin/IncentiveProgramFormModal";

type GeoState = { id: string; name: string };

function StatCard({
  label,
  value,
  icon: Icon,
  accent,
}: {
  label: string;
  value: number | string;
  icon: ComponentType<{ className?: string; strokeWidth?: number }>;
  accent: "teal" | "emerald" | "violet" | "amber";
}) {
  const iconWrap =
    accent === "teal"
      ? "bg-teal-50 text-teal-600 ring-teal-100"
      : accent === "emerald"
        ? "bg-emerald-50 text-emerald-600 ring-emerald-100"
        : accent === "amber"
          ? "bg-amber-50 text-amber-600 ring-amber-100"
          : "bg-violet-50 text-violet-600 ring-violet-100";

  return (
    <div className="flex items-center gap-3 rounded-xl border border-slate-200/80 bg-white px-4 py-3 shadow-sm ring-1 ring-slate-900/[0.02]">
      <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-full ring-1", iconWrap)}>
        <Icon className="h-4 w-4" strokeWidth={2} aria-hidden />
      </div>
      <div className="min-w-0">
        <p className="truncate text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
        <p className="text-xl font-bold tabular-nums leading-tight text-slate-900">{value}</p>
      </div>
    </div>
  );
}

function formatValidity(start: string, end: string, recurrence: string) {
  const a = start.slice(0, 10);
  const b = end.slice(0, 10);
  const range = a === b ? a : `${a} → ${b}`;
  const rec = recurrence.replace("_", " ");
  return { range, rec: `(${rec})` };
}

function shortProgramId(id: string): string {
  return id.replace(/-/g, "").slice(0, 6).toUpperCase();
}

function StatusBadge({ status }: { status: string }) {
  const s = status.toLowerCase();
  const styles =
    s === "active"
      ? "bg-emerald-50 text-emerald-700 ring-emerald-200/80"
      : s === "paused"
        ? "bg-amber-50 text-amber-700 ring-amber-200/80"
        : s === "draft"
          ? "bg-slate-100 text-slate-600 ring-slate-200/80"
          : "bg-red-50 text-red-700 ring-red-200/80";
  const dot =
    s === "active"
      ? "bg-emerald-500"
      : s === "paused"
        ? "bg-amber-500"
        : s === "draft"
          ? "bg-slate-400"
          : "bg-red-500";

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold capitalize ring-1",
        styles,
      )}
    >
      <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", dot)} aria-hidden />
      {status}
    </span>
  );
}

export function RiderIncentiveProgramsClient() {
  const [programs, setPrograms] = useState<IncentiveProgramListRow[]>([]);
  const [states, setStates] = useState<GeoState[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [migrationRequired, setMigrationRequired] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [formModalOpen, setFormModalOpen] = useState(false);
  const [editingProgramId, setEditingProgramId] = useState<string | null>(null);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const [progRes, stateRes] = await Promise.all([
        fetch("/api/super-admin/incentive-programs", { cache: "no-store" }),
        fetch("/api/super-admin/geo/states", { cache: "no-store" }),
      ]);
      const progData = await progRes.json();
      const stateData = await stateRes.json();
      if (!progRes.ok) {
        setMigrationRequired(Boolean(progData.migrationRequired));
        setPrograms([]);
        if (progData.error) setErr(String(progData.error));
      } else {
        setPrograms(progData.programs ?? []);
        setMigrationRequired(false);
      }
      if (stateRes.ok) setStates(stateData.states ?? []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const stats = useMemo(() => {
    const total = programs.length;
    const active = programs.filter((p) => p.status === "active" || p.is_active).length;
    const eligible = programs.reduce((s, p) => s + (p.eligible_count ?? 0), 0);
    const winners = programs.reduce((s, p) => s + (p.winners_count ?? 0), 0);
    return { total, active, eligible, winners };
  }, [programs]);

  const openCreateModal = () => {
    setEditingProgramId(null);
    setFormModalOpen(true);
  };

  const openEditModal = (id: string) => {
    setMenuOpenId(null);
    setEditingProgramId(id);
    setFormModalOpen(true);
  };

  const closeFormModal = () => {
    setFormModalOpen(false);
    setEditingProgramId(null);
  };

  const patchStatus = async (id: string, status: string) => {
    setMenuOpenId(null);
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/super-admin/incentive-programs/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, is_active: status === "active", is_paused: status === "paused" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(String(data.error ?? "Update failed"));
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to update status");
    } finally {
      setBusy(false);
    }
  };

  const removeProgram = async (id: string) => {
    setMenuOpenId(null);
    if (!window.confirm("Delete this incentive program? This cannot be undone.")) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/super-admin/incentive-programs/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(String(data.error ?? "Delete failed"));
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to delete");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Principle banner */}
      <div className="relative overflow-hidden rounded-xl border border-emerald-200/70 bg-gradient-to-r from-emerald-50/90 via-teal-50/50 to-white px-4 py-3 sm:px-5">
        <div className="flex items-start gap-3 pr-16 sm:pr-20">
          <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
            <Info className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
          </div>
          <p className="text-[13px] leading-relaxed text-emerald-950/90">
            <span className="font-semibold text-emerald-900">Principle:</span> Show incentives to scoped riders for
            motivation, but pay only GMitra Max riders who pass thresholds and ranking caps. Target ~10–12%
            qualification rate.
          </p>
        </div>
        <div
          className="pointer-events-none absolute -right-1 bottom-0 top-0 flex w-20 items-center justify-center opacity-90 sm:w-24"
          aria-hidden
        >
          <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-100/80 ring-1 ring-emerald-200/60">
            <Gift className="h-7 w-7 text-emerald-600" strokeWidth={1.5} />
            <span className="absolute -right-0.5 -top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-amber-400 text-[10px] font-bold text-amber-950 shadow-sm">
              ₹
            </span>
          </div>
        </div>
      </div>

      {migrationRequired ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-900" role="alert">
          Run migrations <code className="font-mono">0354</code> & <code className="font-mono">0355</code>, then refresh.
        </div>
      ) : null}

      {err ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-xs text-red-800" role="alert">
          {err}
        </div>
      ) : null}

      {/* Stats row */}
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Total Programs" value={stats.total} icon={Trophy} accent="teal" />
        <StatCard label="Active Programs" value={stats.active} icon={Zap} accent="emerald" />
        <StatCard label="Eligible Riders" value={stats.eligible} icon={Target} accent="violet" />
        <StatCard label="Winners" value={stats.winners} icon={Crown} accent="amber" />
      </section>

      {/* Programs table card */}
      <section className="overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-sm ring-1 ring-slate-900/[0.03]">
        <div className="flex flex-col gap-3 border-b border-slate-100 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Incentive programs</h2>
            <p className="text-xs text-slate-500">All configured rider incentive programs.</p>
          </div>
          <button
            type="button"
            disabled={migrationRequired}
            onClick={openCreateModal}
            className="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-4 text-xs font-semibold text-white shadow-sm transition hover:bg-emerald-500 disabled:pointer-events-none disabled:opacity-50"
          >
            <Plus className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
            Add New Incentive
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-xs">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/60 text-left text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                <th className="px-4 py-2.5 sm:px-5">Name</th>
                <th className="px-3 py-2.5">Service</th>
                <th className="hidden px-3 py-2.5 md:table-cell">Geo</th>
                <th className="px-3 py-2.5">Validity</th>
                <th className="px-3 py-2.5">Status</th>
                <th className="hidden px-3 py-2.5 sm:table-cell">Reward</th>
                <th className="hidden px-3 py-2.5 lg:table-cell">Eligible</th>
                <th className="hidden px-3 py-2.5 lg:table-cell">Winners</th>
                <th className="hidden px-3 py-2.5 xl:table-cell">Est. payout</th>
                <th className="px-3 py-2.5 sm:px-5">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={10} className="px-5 py-10 text-center text-sm text-slate-500">
                    Loading programs…
                  </td>
                </tr>
              ) : programs.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-5 py-12 text-center">
                    <p className="text-sm font-medium text-slate-700">No incentive programs yet</p>
                    <p className="mt-1 text-xs text-slate-500">
                      Click <span className="font-semibold text-emerald-700">Add New Incentive</span> to create your first
                      program.
                    </p>
                  </td>
                </tr>
              ) : (
                programs.map((p) => {
                  const validity = formatValidity(p.start_at, p.end_at, p.recurrence_type);
                  return (
                    <tr key={p.id} className="group transition-colors hover:bg-slate-50/70">
                      <td className="px-4 py-3 sm:px-5">
                        <div className="font-semibold text-slate-900">{p.name}</div>
                        <div className="mt-0.5 font-mono text-[10px] uppercase tracking-wide text-slate-400">{p.code}</div>
                        <span className="mt-1.5 inline-flex rounded-md bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700 ring-1 ring-emerald-200/60">
                          ID: {shortProgramId(p.id)}
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        <span className="inline-flex rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-medium capitalize text-slate-700">
                          {p.service}
                        </span>
                      </td>
                      <td className="hidden max-w-[140px] truncate px-3 py-3 text-slate-600 md:table-cell" title={p.geo_summary}>
                        {p.geo_summary}
                      </td>
                      <td className="px-3 py-3 text-slate-600">
                        <div className="whitespace-nowrap font-medium text-slate-700">{validity.range}</div>
                        <div className="text-[10px] text-slate-400">{validity.rec}</div>
                      </td>
                      <td className="px-3 py-3">
                        <StatusBadge status={p.status} />
                      </td>
                      <td className="hidden px-3 py-3 capitalize text-slate-600 sm:table-cell">{p.reward_type}</td>
                      <td className="hidden px-3 py-3 tabular-nums text-slate-700 lg:table-cell">{p.eligible_count}</td>
                      <td className="hidden px-3 py-3 tabular-nums text-slate-700 lg:table-cell">{p.winners_count}</td>
                      <td className="hidden px-3 py-3 tabular-nums text-slate-600 xl:table-cell">
                        {p.total_payout_estimate ?? "—"}
                      </td>
                      <td className="relative px-3 py-3 sm:px-5">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex flex-col gap-1">
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => openEditModal(p.id)}
                              className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-emerald-700 transition hover:text-emerald-600 disabled:opacity-50"
                            >
                              <Pencil className="h-3 w-3" strokeWidth={2} aria-hidden />
                              Edit
                            </button>
                            {p.status === "active" ? (
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => void patchStatus(p.id, "paused")}
                                className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-amber-700 transition hover:text-amber-600 disabled:opacity-50"
                              >
                                <Pause className="h-3 w-3" strokeWidth={2} aria-hidden />
                                Pause
                              </button>
                            ) : (
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => void patchStatus(p.id, "active")}
                                className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-teal-700 transition hover:text-teal-600 disabled:opacity-50"
                              >
                                <Zap className="h-3 w-3" strokeWidth={2} aria-hidden />
                                Activate
                              </button>
                            )}
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void removeProgram(p.id)}
                              className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-red-600 transition hover:text-red-500 disabled:opacity-50"
                            >
                              <Trash2 className="h-3 w-3" strokeWidth={2} aria-hidden />
                              Delete
                            </button>
                          </div>
                          <div className="relative">
                            <button
                              type="button"
                              className="rounded-md p-1 text-slate-400 opacity-0 transition hover:bg-slate-100 hover:text-slate-600 group-hover:opacity-100"
                              aria-label="More actions"
                              onClick={() => setMenuOpenId(menuOpenId === p.id ? null : p.id)}
                            >
                              <MoreVertical className="h-4 w-4" />
                            </button>
                            {menuOpenId === p.id ? (
                              <>
                                <button
                                  type="button"
                                  className="fixed inset-0 z-10 cursor-default"
                                  aria-label="Close menu"
                                  onClick={() => setMenuOpenId(null)}
                                />
                                <div className="absolute right-0 top-7 z-20 min-w-[120px] rounded-lg border border-slate-200 bg-white py-1 shadow-lg ring-1 ring-slate-900/5">
                                  <button
                                    type="button"
                                    className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[11px] font-medium text-slate-700 hover:bg-slate-50"
                                    onClick={() => openEditModal(p.id)}
                                  >
                                    <Pencil className="h-3 w-3" /> Edit
                                  </button>
                                  {p.status === "active" ? (
                                    <button
                                      type="button"
                                      className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[11px] font-medium text-slate-700 hover:bg-slate-50"
                                      onClick={() => void patchStatus(p.id, "paused")}
                                    >
                                      <Pause className="h-3 w-3" /> Pause
                                    </button>
                                  ) : (
                                    <button
                                      type="button"
                                      className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[11px] font-medium text-slate-700 hover:bg-slate-50"
                                      onClick={() => void patchStatus(p.id, "active")}
                                    >
                                      <Zap className="h-3 w-3" /> Activate
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[11px] font-medium text-red-600 hover:bg-red-50"
                                    onClick={() => void removeProgram(p.id)}
                                  >
                                    <Trash2 className="h-3 w-3" /> Delete
                                  </button>
                                </div>
                              </>
                            ) : null}
                          </div>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      <IncentiveProgramFormModal
        open={formModalOpen}
        editingProgramId={editingProgramId}
        states={states}
        migrationRequired={migrationRequired}
        onClose={closeFormModal}
        onSaved={() => {
          closeFormModal();
          void load();
        }}
      />
    </div>
  );
}
