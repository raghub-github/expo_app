"use client";

/**
 * Full-page skeleton for Store Profile. Matches partnersite mx/profile layout.
 */
export function StoreProfileSkeleton() {
  const card = "bg-gray-50 rounded-lg p-3 border border-gray-200";
  const title = "h-4 w-28 rounded bg-gray-200 mb-2 shrink-0";
  const rows = (n: number) =>
    Array.from({ length: n }, (_, i) => (
      <div
        key={i}
        className={`h-3 rounded bg-gray-200 ${i % 3 === 0 ? "w-full" : i % 3 === 1 ? "w-4/5" : "w-2/3"}`}
      />
    ));

  return (
    <div className="bg-gray-50 flex-1 flex flex-col overflow-hidden">
      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
        <div className="px-4 pt-2 pb-3">
          <div className="w-full animate-pulse">
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 mb-2">
              <div className="bg-gradient-to-r from-gray-100 to-gray-50 px-4 py-2 border-b border-gray-200">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                  <div className="flex items-center gap-2.5 flex-1 min-w-0">
                    <div className="w-10 h-10 rounded-lg bg-gray-300 shrink-0" />
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="h-4 w-48 rounded bg-gray-300" />
                      <div className="h-3 w-64 rounded bg-gray-200" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:flex md:flex-wrap gap-2 shrink-0">
                    {[1, 2, 3, 4].map((i) => (
                      <div key={i} className="h-10 w-[70px] rounded-lg bg-gray-200" />
                    ))}
                  </div>
                </div>
              </div>

              <div className="p-2">
                <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)] gap-3 lg:gap-4">
                  <div className="min-w-0 grid grid-cols-1 lg:grid-cols-2 gap-3 lg:gap-4">
                    {[1, 2, 3, 4].map((i) => (
                      <div key={i} className={`${card} ${i === 4 ? "lg:col-span-2" : ""}`}>
                        <div className={title} />
                        <div className="space-y-2">{rows(6)}</div>
                      </div>
                    ))}
                  </div>

                  <div className="min-w-0 flex flex-col gap-3 lg:gap-4">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className={card}>
                        <div className={title} />
                        <div className="space-y-2 py-1">
                          <div className="h-12 rounded bg-gray-200" />
                          <div className="h-12 rounded bg-gray-200" />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mt-5">
                  <div className="bg-gray-100 rounded-lg p-4 border border-gray-200">
                    <div className="flex justify-between mb-3">
                      <div className="h-4 w-24 rounded bg-gray-200" />
                      <div className="h-8 w-20 rounded bg-gray-200" />
                    </div>
                    <div className="h-48 rounded-lg bg-gray-200" />
                  </div>
                  <div className="bg-gray-100 rounded-lg p-4 border border-gray-200">
                    <div className="flex justify-between mb-3">
                      <div className="h-4 w-20 rounded bg-gray-200" />
                      <div className="h-8 w-20 rounded bg-gray-200" />
                    </div>
                    <div className="grid grid-cols-5 gap-2">
                      {[1, 2, 3, 4, 5].map((i) => (
                        <div key={i} className="aspect-square min-h-[80px] rounded-lg bg-gray-200" />
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
