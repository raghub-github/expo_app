"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { PERIODS, periodLabel, parsePeriod, type Period } from "@/lib/period";
import { NAV } from "@/lib/nav";

export type OrdersTab = "analytics" | "history";

export function parseOrdersTab(value: string | null | undefined): OrdersTab {
  return value === "history" ? "history" : "analytics";
}

export function Topbar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const period = parsePeriod(searchParams.get("period"));
  const current = NAV.find((n) => pathname === n.href || pathname.startsWith(n.href + "/"));
  const isOrders = pathname === "/orders" || pathname.startsWith("/orders/");
  const ordersTab = parseOrdersTab(searchParams.get("tab"));

  function setPeriod(next: Period) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("period", next);
    router.replace(`${pathname}?${params.toString()}`);
  }

  function setOrdersTab(next: OrdersTab) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", next);
    router.replace(`${pathname}?${params.toString()}`);
  }

  const title = isOrders
    ? ordersTab === "history"
      ? "Order History"
      : "Order Analytics"
    : current?.name ?? "GatiMitra";

  return (
    <header className="flex h-[72px] shrink-0 items-center justify-between gap-4 border-b border-[#E4E7F7] bg-white px-5 sm:px-6">
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#7DA0FA]">
          GatiMitra
        </p>
        <h1 className="truncate text-[22px] font-semibold leading-tight tracking-tight text-[#1E1C4A]">
          {title}
        </h1>
      </div>

      <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
        {isOrders ? (
          <div className="inline-flex rounded-full bg-[#F4F6FF] p-1">
            {(
              [
                ["analytics", "Analytics"],
                ["history", "Order History"],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setOrdersTab(key)}
                className={`cursor-pointer rounded-full px-3.5 py-1.5 text-[13px] font-semibold transition ${
                  ordersTab === key
                    ? "bg-[#4B49AC] text-white shadow-sm"
                    : "text-[#6B6894] hover:text-[#4B49AC]"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        ) : null}

        <div className="flex items-center gap-1 rounded-full bg-[#F4F6FF] p-1">
          {PERIODS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPeriod(p)}
              className={`rounded-full px-3 py-1.5 text-[13px] font-medium tracking-wide transition ${
                period === p
                  ? "bg-[#4B49AC] text-white shadow-sm"
                  : "text-[#6B6894] hover:text-[#4B49AC]"
              }`}
            >
              {periodLabel(p)}
            </button>
          ))}
        </div>
      </div>
    </header>
  );
}
