import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import {
  AlertTriangle,
  Banknote,
  ClipboardList,
  Scale,
  Settings2,
  Shield,
  Wallet,
} from "lucide-react";

/** Shared compact form styling for rule editor pages */
export const gmForm = {
  page: "w-full min-w-0 max-w-none pb-20 pt-0",
  shell: "overflow-hidden rounded-xl border border-slate-200/90 bg-white shadow-[0_8px_30px_rgba(15,23,42,0.06)]",
  hero:
    "relative border-b border-indigo-100/80 bg-gradient-to-r from-indigo-50 via-violet-50/80 to-slate-50 px-4 py-3 sm:px-5 sm:py-4",
  heroTitle: "text-base font-semibold tracking-tight text-slate-900 sm:text-lg",
  heroSub: "mt-0.5 text-xs text-slate-600 sm:text-sm",
  heroBadges: "mt-2 flex flex-wrap items-center gap-2",
  body: "space-y-3 p-3 sm:p-4 lg:p-5",
  footer:
    "sticky bottom-0 z-10 flex items-center justify-between gap-3 border-t border-slate-200/80 bg-white/95 px-3 py-2.5 backdrop-blur sm:px-5",
  section:
    "rounded-lg border border-slate-200/70 bg-gradient-to-b from-white to-slate-50/40 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)] sm:p-3.5",
  sectionHead: "mb-2.5 flex items-start gap-2.5",
  sectionIcon:
    "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-slate-200/80 bg-white text-indigo-600 shadow-sm",
  sectionTitle: "text-xs font-semibold uppercase tracking-wide text-slate-700",
  sectionHint: "mt-0.5 text-[11px] leading-snug text-slate-500",
  label: "block text-[11px] font-medium text-slate-600",
  input:
    "mt-0.5 w-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-900 shadow-sm transition focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-400/20 disabled:bg-slate-50 disabled:text-slate-500",
  grid: "grid gap-2.5 grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6",
  grid4: "grid gap-2.5 grid-cols-2 md:grid-cols-4",
  grid3: "grid gap-2.5 grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5",
  matrixGrid: "grid gap-2.5 lg:grid-cols-2 xl:grid-cols-4",
  partyCard: "rounded-lg border p-2.5 shadow-sm transition hover:shadow-md",
  partyTitle: "mb-2 flex items-center gap-1.5 text-xs font-semibold text-slate-800",
  partyDot: "h-2 w-2 rounded-full",
  partyGrid: "grid gap-2 grid-cols-2 xl:grid-cols-3",
  check:
    "flex cursor-pointer items-center gap-2 rounded-md border border-transparent px-1 py-0.5 text-xs text-slate-700 hover:border-slate-200 hover:bg-white/80",
  pill: "inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide",
  pillDraft: "bg-amber-100 text-amber-800 ring-1 ring-amber-200/80",
  pillActive: "bg-emerald-100 text-emerald-800 ring-1 ring-emerald-200/80",
  pillInactive: "bg-slate-100 text-slate-600 ring-1 ring-slate-200/80",
  pillScenario: "bg-indigo-100 text-indigo-800 ring-1 ring-indigo-200/80",
  error: "rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800",
  btnSecondary:
    "rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50",
  btnPrimary:
    "inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-indigo-700 disabled:opacity-50",
};

const sectionIcons: Record<string, LucideIcon> = {
  "Rule details": ClipboardList,
  Conditions: Settings2,
  "Refund configuration": Banknote,
  "Refund funding & penalty recovery": Scale,
  "Fault & shared liability": AlertTriangle,
  "Financial responsibility matrix": Shield,
  "Wallet impact": Wallet,
  "Financial limits": Scale,
  "Auto actions": Settings2,
  Audit: ClipboardList,
};

export function GmFormSection({
  title,
  hint,
  children,
  className = "",
}: {
  title: string;
  hint?: string;
  children: ReactNode;
  className?: string;
}) {
  const Icon = sectionIcons[title] ?? ClipboardList;

  return (
    <section className={`${gmForm.section} ${className}`}>
      <div className={gmForm.sectionHead}>
        <div className={gmForm.sectionIcon} aria-hidden>
          <Icon className="h-3.5 w-3.5" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className={gmForm.sectionTitle}>{title}</h3>
          {hint ? <p className={gmForm.sectionHint}>{hint}</p> : null}
        </div>
      </div>
      {children}
    </section>
  );
}

export function statusPillClass(status: string): string {
  const s = status.toUpperCase();
  if (s === "ACTIVE") return gmForm.pillActive;
  if (s === "DRAFT") return gmForm.pillDraft;
  return gmForm.pillInactive;
}

function SkeletonBar({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-slate-200/80 ${className}`} aria-hidden />;
}

/** Lightweight placeholder while rule editor RSC loads */
export function GmRuleFormSkeleton() {
  return (
    <div className={gmForm.page}>
      <div className={gmForm.shell}>
        <div className={gmForm.hero}>
          <SkeletonBar className="h-5 w-48" />
          <SkeletonBar className="mt-2 h-3 w-72" />
          <div className="mt-3 flex gap-2">
            <SkeletonBar className="h-5 w-16 rounded-full" />
            <SkeletonBar className="h-5 w-24 rounded-full" />
          </div>
        </div>
        <div className={gmForm.body}>
          {[1, 2, 3].map((i) => (
            <div key={i} className={gmForm.section}>
              <SkeletonBar className="h-4 w-32" />
              <div className={`mt-3 ${gmForm.grid}`}>
                {[1, 2, 3, 4].map((j) => (
                  <SkeletonBar key={j} className="h-9" />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Lightweight placeholder while rules list RSC loads */
export function GmRuleListSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div className="space-y-2">
          <SkeletonBar className="h-8 w-64" />
          <SkeletonBar className="h-4 w-96" />
        </div>
        <SkeletonBar className="h-9 w-28" />
      </div>
      <SkeletonBar className="h-10 w-full" />
      <div className="space-y-2">
        {[1, 2, 3, 4, 5].map((i) => (
          <SkeletonBar key={i} className="h-14 w-full" />
        ))}
      </div>
    </div>
  );
}
