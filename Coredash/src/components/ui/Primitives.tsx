"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, type LucideIcon } from "lucide-react";
import { formatPct, GMV_FULL } from "@/lib/format";

const PAGE_SIZES = [5, 10, 25, 50] as const;

function pageWindow(page: number, pageCount: number): Array<number | "…"> {
  if (pageCount <= 7) return Array.from({ length: pageCount }, (_, i) => i + 1);
  const set = new Set([1, pageCount, page - 1, page, page + 1]);
  const nums = [...set].filter((n) => n >= 1 && n <= pageCount).sort((a, b) => a - b);
  const out: Array<number | "…"> = [];
  for (const n of nums) {
    const prev = out[out.length - 1];
    if (typeof prev === "number" && n - prev > 1) out.push("…");
    out.push(n);
  }
  return out;
}

export function PageIntro({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="mb-5">
      <h2 className="text-[18px] font-semibold text-[#1E1C4A]">{title}</h2>
      <p className="mt-1 text-[13px] text-[#6B6894]">{subtitle}</p>
    </div>
  );
}

export function GmvHead() {
  return (
    <span className="inline-flex flex-col items-start leading-tight">
      <span>GMV</span>
      <span className="mt-0.5 text-[9px] font-normal normal-case tracking-normal text-[#8B89B3]">
        {GMV_FULL}
      </span>
    </span>
  );
}

export function KpiCard({
  label,
  sublabel,
  value,
  hint,
  delta,
  icon: Icon,
  tone = "indigo",
}: {
  label: string;
  sublabel?: string;
  value: string;
  hint?: string;
  delta?: number | null;
  icon: LucideIcon;
  tone?: "indigo" | "sky" | "lavender" | "coral" | "green";
}) {
  const tones = {
    indigo: { bg: "#EEF0FF", fg: "#4B49AC" },
    sky: { bg: "#EAF1FF", fg: "#4A7FE8" },
    lavender: { bg: "#EEEDFF", fg: "#7978E9" },
    coral: { bg: "#FDECEC", fg: "#F3797E" },
    green: { bg: "#E8F8F0", fg: "#2BB673" },
  }[tone];

  return (
    <div className="rounded-2xl border border-[#E4E7F7] bg-white p-4 shadow-[0_10px_30px_rgba(75,73,172,0.04)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[12px] font-medium text-[#6B6894]">{label}</p>
          {sublabel ? <p className="mt-0.5 text-[10px] leading-tight text-[#8B89B3]">{sublabel}</p> : null}
          <p className="mt-1 text-[22px] font-semibold tracking-tight text-[#1E1C4A]">{value}</p>
        </div>
        <div
          className="flex h-10 w-10 items-center justify-center rounded-xl"
          style={{ background: tones.bg, color: tones.fg }}
        >
          <Icon className="h-5 w-5" strokeWidth={1.8} />
        </div>
      </div>
      <div className="mt-3 flex items-center gap-2 text-[12px]">
        {delta != null && (
          <span className={delta >= 0 ? "font-medium text-[#2BB673]" : "font-medium text-[#F3797E]"}>
            {delta >= 0 ? "+" : ""}
            {formatPct(delta, 1)}
          </span>
        )}
        {hint ? <span className="text-[#6B6894]">{hint}</span> : null}
      </div>
    </div>
  );
}

export function Panel({
  title,
  children,
  className = "",
}: {
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-2xl border border-[#E4E7F7] bg-white p-4 shadow-[0_10px_30px_rgba(75,73,172,0.04)] ${className}`}>
      <h3 className="mb-4 text-[14px] font-semibold text-[#1E1C4A]">{title}</h3>
      {children}
    </section>
  );
}

export function StatusPill({ value }: { value: string }) {
  const v = value.toLowerCase();
  const good = /active|delivered|completed|resolved|closed|online|live|success|verified/.test(v);
  const bad = /cancel|fail|reject|block|open|pending|offline|hold/.test(v);
  const cls = good
    ? "bg-[#E8F8F0] text-[#1F8A56]"
    : bad
      ? "bg-[#FDECEC] text-[#C24B52]"
      : "bg-[#EEF0FF] text-[#4B49AC]";
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${cls}`}>
      {value.replace(/_/g, " ")}
    </span>
  );
}

export function RecordSearch({
  value,
  onChange,
  placeholder,
  count,
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  count?: number;
}) {
  return (
    <div className="mb-3 flex flex-wrap items-center gap-3">
      <input
        className="h-9 w-full max-w-sm rounded-xl border border-[#E4E7F7] bg-[#F8F9FF] px-3 text-[13px] text-[#1E1C4A] outline-none focus:border-[#7DA0FA]"
        placeholder={placeholder || "Search records"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      {count != null ? <p className="text-[12px] text-[#6B6894]">{count} records</p> : null}
    </div>
  );
}

export function DataTable({
  columns,
  rows,
  pageSize,
}: {
  columns: Array<ReactNode>;
  rows: Array<Array<ReactNode>>;
  pageSize?: number;
}) {
  const paginate = pageSize != null && pageSize > 0;
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(pageSize ?? 10);
  const total = rows.length;
  const pageCount = Math.max(1, Math.ceil(total / size) || 1);

  useEffect(() => {
    setPage(1);
  }, [total, size]);

  useEffect(() => {
    if (pageSize && pageSize > 0) setSize(pageSize);
  }, [pageSize]);

  const safePage = Math.min(page, pageCount);
  const shown = useMemo(() => {
    if (!paginate) return rows;
    const start = (safePage - 1) * size;
    return rows.slice(start, start + size);
  }, [paginate, rows, safePage, size]);

  const from = total === 0 ? 0 : (safePage - 1) * size + 1;
  const to = Math.min(safePage * size, total);
  const pages = pageWindow(safePage, pageCount);

  return (
    <div>
      <div className="cd-table-scroll overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-[13px]">
          <thead>
            <tr className="border-b border-[#E4E7F7] text-[11px] uppercase tracking-wide text-[#6B6894]">
              {columns.map((c, i) => (
                <th key={i} className="px-2 py-2 font-medium">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-2 py-8 text-center text-[#6B6894]">
                  No rows in this period
                </td>
              </tr>
            ) : (
              shown.map((row, i) => (
                <tr key={i} className="border-b border-[#F0F2FB] last:border-0">
                  {row.map((cell, j) => (
                    <td key={j} className="px-2 py-2.5 text-[#1E1C4A]">
                      {cell}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {paginate && total > 0 ? (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-[12px] text-[#6B6894]">
          <p>
            Showing{" "}
            <span className="font-medium text-[#1E1C4A]">
              {from}–{to}
            </span>{" "}
            of <span className="font-medium text-[#1E1C4A]">{total}</span>
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-1.5">
              Rows
              <select
                className="h-8 rounded-lg border border-[#E4E7F7] bg-white px-2 text-[12px] text-[#1E1C4A] outline-none focus:border-[#7DA0FA]"
                value={size}
                onChange={(e) => setSize(Number(e.target.value))}
              >
                {PAGE_SIZES.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              disabled={safePage <= 1}
              onClick={() => setPage(safePage - 1)}
              className="inline-flex h-8 items-center gap-0.5 rounded-lg border border-[#E4E7F7] bg-white px-2 font-medium text-[#1E1C4A] disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              Prev
            </button>
            {pages.map((p, i) =>
              p === "…" ? (
                <span key={`e-${i}`} className="px-1">
                  …
                </span>
              ) : (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPage(p)}
                  className={`h-8 min-w-8 rounded-lg px-2 font-medium ${
                    p === safePage
                      ? "bg-[#4B49AC] text-white"
                      : "border border-[#E4E7F7] bg-white text-[#1E1C4A]"
                  }`}
                >
                  {p}
                </button>
              )
            )}
            <button
              type="button"
              disabled={safePage >= pageCount}
              onClick={() => setPage(safePage + 1)}
              className="inline-flex h-8 items-center gap-0.5 rounded-lg border border-[#E4E7F7] bg-white px-2 font-medium text-[#1E1C4A] disabled:cursor-not-allowed disabled:opacity-40"
            >
              Next
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function LoadingGrid({ count = 4 }: { count?: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="h-28 animate-pulse rounded-2xl bg-white" />
      ))}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="rounded-2xl border border-[#F3797E]/30 bg-[#FDECEC] p-5 text-[13px] text-[#C24B52]">
      <p>{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-3 rounded-lg bg-[#F3797E] px-3 py-1.5 text-xs font-semibold text-white"
      >
        Retry
      </button>
    </div>
  );
}
