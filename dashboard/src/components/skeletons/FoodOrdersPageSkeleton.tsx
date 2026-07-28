"use client";

const PAGE_BG = "#f3f5f7";
const CONTENT_BG = "#FFFFFF";
const ACCENT = "#121212";

/** Skeleton matching Food Orders list layout (filters, tabs, table). */
export function FoodOrdersPageSkeleton() {
  return (
    <div className="orders-typo space-y-2 w-full max-w-full overflow-x-hidden animate-in fade-in duration-150" style={{ backgroundColor: PAGE_BG }}>
      <div className="p-2" style={{ backgroundColor: CONTENT_BG }}>
        <div className="flex flex-wrap items-center gap-2">
          {[1, 2, 3, 4, 5, 6, 7].map((i) => (
            <div key={i} className="h-7 w-20 rounded-md bg-gray-200 animate-pulse" />
          ))}
          <div className="ml-auto h-7 w-24 rounded-md bg-gray-200 animate-pulse" />
        </div>
      </div>

      <div className="p-2 mt-3" style={{ backgroundColor: CONTENT_BG }}>
        <div className="flex items-center gap-2 w-full">
          {[1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              className="flex-1 h-9 rounded-md animate-pulse"
              style={{ backgroundColor: i === 1 ? ACCENT : "#eef1f4", opacity: i === 1 ? 0.35 : 1 }}
            />
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between p-2" style={{ backgroundColor: CONTENT_BG }}>
        <div className="h-4 w-36 rounded bg-gray-200 animate-pulse" />
        <div className="flex gap-2">
          <div className="h-7 w-28 rounded-md bg-gray-200 animate-pulse" />
          <div className="h-7 w-32 rounded-md bg-gray-200 animate-pulse" />
        </div>
      </div>

      <div className="overflow-x-auto" style={{ backgroundColor: CONTENT_BG, maxHeight: 400 }}>
        <table className="min-w-full text-[11px]">
          <thead className="bg-gray-100">
            <tr>
              {["Order", "Action", "Routed to", "Order time", "User name", "User mobile", "Merchant id", "Mx locality", "DE provider"].map(
                (col) => (
                  <th key={col} className="px-2 py-1.5 text-left">
                    <div className="h-3 w-16 rounded bg-gray-200 animate-pulse" />
                  </th>
                )
              )}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 8 }).map((_, i) => (
              <tr key={i} className="border-t border-gray-100">
                {Array.from({ length: 9 }).map((__, j) => (
                  <td key={j} className="px-2 py-2">
                    <div
                      className="h-3 rounded bg-gray-100 animate-pulse"
                      style={{ width: j === 0 ? "4.5rem" : j === 4 ? "5rem" : "3rem" }}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function FoodOrdersTableRowsSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <tr key={i} className="border-t border-gray-100">
          {Array.from({ length: 9 }).map((__, j) => (
            <td key={j} className="px-2 py-2">
              <div className="h-3 w-12 rounded bg-gray-100 animate-pulse" />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}
