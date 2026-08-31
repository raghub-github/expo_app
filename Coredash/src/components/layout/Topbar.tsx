"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { PERIODS, periodLabel, parsePeriod, type Period } from "@/lib/period";
import { NAV } from "@/lib/nav";

export function Topbar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const period = parsePeriod(searchParams.get("period"));
  const current = NAV.find((n) => pathname === n.href || pathname.startsWith(n.href + "/"));

  function setPeriod(next: Period) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("period", next);
    router.replace(`${pathname}?${params.toString()}`);
  }

  return (
    <header className="flex h-[72px] shrink-0 items-center justify-between border-b border-[#E4E7F7] bg-white px-6">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#7DA0FA]">
          GatiMitra
        </p>
        <h1 className="text-[20px] font-semibold tracking-tight text-[#1E1C4A]">
          {current?.name ?? "GatiMitra"}
        </h1>
      </div>
      <div className="flex items-center gap-1 rounded-full bg-[#F4F6FF] p-1">
        {PERIODS.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setPeriod(p)}
            className={`rounded-full px-3 py-1.5 text-[13px] font-medium tracking-wide transition ${
              period === p
                ? "bg-[#4B49AC] text-white"
                : "text-[#6B6894] hover:text-[#4B49AC]"
            }`}
          >
            {periodLabel(p)}
          </button>
        ))}
      </div>
    </header>
  );
}
