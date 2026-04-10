"use client";

/**
 * Wrapper for the unified “charge order” list (pricing rules + tax slabs) with drag handles and arrows.
 * The full interactive list stays in the billing page; this component documents the pattern for tests and reuse.
 */
export function RulePriorityManager({ children }: { children: React.ReactNode }) {
  return <div className="rule-priority-manager space-y-3 rounded-2xl border border-slate-200/70 bg-slate-50/40 p-2">{children}</div>;
}
