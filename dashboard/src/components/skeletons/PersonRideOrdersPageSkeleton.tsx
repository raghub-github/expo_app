"use client";

const PAGE_BG = "#F4F6F9";
const CONTENT_BG = "#FFFFFF";
const MINT_GREEN = "#4EE5C1";

/** Skeleton for Person Ride orders list (matches food orders hub layout). */
export function PersonRideOrdersPageSkeleton() {
  return (
    <div className="space-y-2 w-full max-w-full overflow-x-hidden animate-in fade-in duration-150" style={{ backgroundColor: PAGE_BG }}>
      <div className="p-2" style={{ backgroundColor: CONTENT_BG }}>
        <div className="flex flex-wrap items-center gap-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-7 w-28 rounded-md bg-gray-200 animate-pulse" />
          ))}
          <div className="ml-auto h-7 w-24 rounded-md bg-gray-200 animate-pulse" />
        </div>
      </div>
      <div className="p-2 mt-3" style={{ backgroundColor: CONTENT_BG }}>
        <div className="flex items-center gap-2 w-full">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="flex-1 h-9 rounded-md bg-gray-200 animate-pulse" />
          ))}
        </div>
      </div>
      <div className="flex items-center justify-between p-2" style={{ backgroundColor: CONTENT_BG }}>
        <div className="h-4 w-32 rounded bg-gray-200 animate-pulse" />
        <div className="h-7 w-28 rounded-md bg-gray-200 animate-pulse" />
      </div>
      <div className="overflow-x-auto" style={{ backgroundColor: CONTENT_BG, maxHeight: 420 }}>
        <table className="min-w-full text-[11px]">
          <thead className="bg-gray-100">
            <tr>
              {Array.from({ length: 9 }).map((_, i) => (
                <th key={i} className="px-2 py-1.5">
                  <div className="h-3 w-14 rounded bg-gray-200 animate-pulse" />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 8 }).map((_, i) => (
              <tr key={i} className="border-t border-gray-100">
                {Array.from({ length: 9 }).map((__, j) => (
                  <td key={j} className="px-2 py-2">
                    <div className="h-3 w-12 rounded bg-gray-100 animate-pulse" />
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

export function PersonRideTableRowsSkeleton({ rows = 6 }: { rows?: number }) {
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
