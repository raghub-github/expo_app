"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { PERIODS, periodLabel, parsePeriod, type Period } from "@/lib/period";
import { NAV } from "@/lib/nav";
import { MobileNavButton } from "@/components/layout/MobileNavButton";

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
    <header className="shrink-0 border-b border-[#E4E7F7] bg-white px-3 py-3 sm:px-5 sm:py-0 sm:h-[72px]">
      <div className="flex flex-col gap-3 sm:h-full sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <div className="flex min-w-0 items-center gap-2.5">
          <MobileNavButton />
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#7DA0FA] sm:text-[11px]">
              GatiMitra
            </p>
            <h1 className="truncate text-[18px] font-semibold leading-tight tracking-tight text-[#1E1C4A] sm:text-[22px]">
              {title}
            </h1>
          </div>
        </div>

        <div className="flex min-w-0 flex-wrap items-center gap-2 sm:justify-end">
          {isOrders ? (
            <div className="inline-flex max-w-full overflow-x-auto rounded-full bg-[#F4F6FF] p-1">
              {(
                [
                  ["analytics", "Analytics"],
                  ["history", "History"],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setOrdersTab(key)}
                  className={`cursor-pointer whitespace-nowrap rounded-full px-3 py-1.5 text-[12px] font-semibold transition sm:px-3.5 sm:text-[13px] ${
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

          <div className="flex max-w-full items-center gap-1 overflow-x-auto rounded-full bg-[#F4F6FF] p-1">
            {PERIODS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPeriod(p)}
                className={`shrink-0 rounded-full px-2.5 py-1.5 text-[12px] font-medium tracking-wide transition sm:px-3 sm:text-[13px] ${
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
      </div>
    </header>
  );
}
