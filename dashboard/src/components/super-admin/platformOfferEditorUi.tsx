"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export const GM_MINT = "#00A88F";
export const GM_MINT_HOVER = "#009078";

export const editorControlCls =
  "w-full min-h-[34px] rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)] transition-[border-color,box-shadow,background-color] placeholder:text-slate-400 focus:border-[#00A88F] focus:outline-none focus:ring-2 focus:ring-[#00A88F]/20 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500";

export const editorSelectCls = cn(editorControlCls, "cursor-pointer");

export function formatOfferDateLabel(localDatetime: string): string {
  if (!localDatetime) return "Open";
  const d = new Date(localDatetime);
  if (Number.isNaN(d.getTime())) return localDatetime;
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export function formatRupeeAmount(value: number | string | null | undefined): string {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return "—";
  return `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

export function SectionCard({
  title,
  subtitle,
  icon,
  children,
  className,
  accent,
}: {
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
  accent?: boolean;
}) {
  return (
    <section
      className={cn(
        "rounded-xl border bg-white p-3.5 shadow-[0_8px_24px_-18px_rgba(15,23,42,0.28)] sm:p-4",
        accent ? "border-[#00A88F]/25 ring-1 ring-[#00A88F]/10" : "border-slate-200/90",
        className
      )}
    >
      <div className="mb-3 flex items-start gap-2.5">
        {icon ? (
          <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#00A88F]/10 text-[#00A88F]">
            {icon}
          </div>
        ) : null}
        <div className="min-w-0">
          <h2 className="text-[13px] font-semibold tracking-tight text-slate-900">{title}</h2>
          {subtitle ? <p className="mt-0.5 text-xs leading-relaxed text-slate-500">{subtitle}</p> : null}
        </div>
      </div>
      {children}
    </section>
  );
}

export function EditorField({
  label,
  hint,
  htmlFor,
  children,
  className,
}: {
  label: string;
  hint?: string;
  htmlFor?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <div className="flex min-w-0 items-baseline gap-1.5">
        <label htmlFor={htmlFor} className="shrink-0 text-[11px] font-medium text-slate-600">
          {label}
        </label>
        {hint ? (
          <span className="min-w-0 truncate text-[10px] leading-tight text-slate-400" title={hint}>
            {hint}
          </span>
        ) : null}
      </div>
      {children}
    </div>
  );
}

export function StatusBadge({ active }: { active: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide",
        active
          ? "border-emerald-200 bg-emerald-50 text-emerald-800"
          : "border-slate-200 bg-slate-50 text-slate-600"
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", active ? "bg-emerald-500" : "bg-slate-400")} />
      {active ? "ACTIVE" : "INACTIVE"}
    </span>
  );
}

export function StatusToggle({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  hint?: string;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-2">
      <span className="min-w-0">
        <span className="block text-sm font-medium text-slate-800">{label}</span>
        {hint ? <span className="mt-0.5 block text-[11px] text-slate-500">{hint}</span> : null}
      </span>
      <span className="relative inline-flex h-6 w-11 shrink-0 items-center">
        <input
          type="checkbox"
          className="peer sr-only"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span className="absolute inset-0 rounded-full bg-slate-300 transition peer-checked:bg-[#00A88F] peer-focus-visible:ring-2 peer-focus-visible:ring-[#00A88F]/30" />
        <span className="absolute left-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition peer-checked:translate-x-5" />
      </span>
    </label>
  );
}

export function BudgetProgress({
  used,
  total,
}: {
  used: number;
  total: number;
}) {
  if (!(total > 0) || !Number.isFinite(used) || !Number.isFinite(total)) return null;
  const pct = Math.max(0, Math.min(100, (used / total) * 100));
  return (
    <div className="mt-3">
      <div className="h-2 overflow-hidden rounded-full bg-slate-100">
        <div
          className="h-full rounded-full bg-[#00A88F] transition-[width]"
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="mt-1.5 text-[11px] tabular-nums text-slate-500">{pct.toFixed(1)}% used</p>
    </div>
  );
}

export function primaryButtonCls(busy?: boolean) {
  return cn(
    "inline-flex min-h-[36px] items-center justify-center rounded-lg bg-[#00A88F] px-4 text-[13px] font-semibold text-white shadow-[0_6px_16px_-8px_rgba(0,168,143,0.7)] transition hover:bg-[#009078] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#00A88F]/40 disabled:cursor-not-allowed disabled:opacity-60",
    busy && "pointer-events-none"
  );
}

export function secondaryButtonCls() {
  return "inline-flex min-h-[36px] items-center justify-center rounded-lg border border-slate-200 bg-white px-4 text-[13px] font-semibold text-slate-700 hover:bg-slate-50";
}
