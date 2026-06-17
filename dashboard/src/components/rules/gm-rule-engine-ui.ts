/** Shared Financial Rule Engine UI tokens (matches dashboard reference). */
export const re = {
  accent: "#5D3FD3",
  accentHover: "#4F35B8",
  accentSoft: "#F3F0FF",
  accentBorder: "#DDD6FE",
  pageBg: "#F8F9FB",
  card: "rounded-xl border border-slate-200/90 bg-white shadow-[0_1px_3px_rgba(15,23,42,0.06)]",
  input:
    "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm transition focus:border-[#5D3FD3] focus:outline-none focus:ring-2 focus:ring-[#5D3FD3]/20",
  checkbox: "h-4 w-4 rounded border-slate-300 accent-[#5D3FD3]",
  btnPrimary:
    "inline-flex items-center gap-2 rounded-lg bg-[#5D3FD3] px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-[#4F35B8] disabled:opacity-60",
  btnGhost:
    "inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-60",
} as const;
