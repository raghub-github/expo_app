"use client";

/**
 * Full-page skeleton for Store Profile. Shown until profile-full API returns.
 * Matches the layout: header strip + 3-column cards + banner/gallery row.
 */
export function StoreProfileSkeleton() {
  return (
    <div className="bg-gray-50 flex-1 flex flex-col overflow-hidden">
      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
        <div className="p-4">
          <div className="max-w-7xl mx-auto w-full animate-pulse">
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 mb-4">
              {/* Header strip */}
              <div className="bg-gradient-to-r from-gray-100 to-gray-50 px-4 py-3 border-b border-gray-200">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                  <div className="flex items-center gap-2.5 flex-1 min-w-0">
                    <div className="w-10 h-10 rounded-lg bg-gray-300 shrink-0" />
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="h-4 w-48 rounded bg-gray-300" />
                      <div className="h-3 w-64 rounded bg-gray-200" />
                      <div className="h-3 w-24 rounded bg-gray-200" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:flex md:flex-wrap gap-2 shrink-0">
                    {[1, 2, 3, 4].map((i) => (
                      <div key={i} className="h-12 w-[70px] rounded-lg bg-gray-200" />
                    ))}
                  </div>
                </div>
              </div>

              <div className="p-4">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                  {/* Column 1 */}
                  <div className="space-y-3">
                    <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                      <div className="h-4 w-28 rounded bg-gray-200 mb-2" />
                      <div className="space-y-2">
                        {[1, 2, 3, 4, 5, 6, 7].map((i) => (
                          <div key={i} className="h-4 rounded bg-gray-200" style={{ width: `${80 - i * 5}%` }} />
                        ))}
                      </div>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                      <div className="flex justify-between mb-2">
                        <div className="h-4 w-20 rounded bg-gray-200" />
                        <div className="h-8 w-28 rounded bg-gray-200" />
                      </div>
                      <div className="space-y-2">
                        {[1, 2, 3, 4, 5].map((i) => (
                          <div key={i} className="h-4 rounded bg-gray-200" style={{ width: `${70 + i * 5}%` }} />
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Column 2 */}
                  <div className="space-y-3">
                    <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                      <div className="h-4 w-32 rounded bg-gray-200 mb-2" />
                      <div className="py-6 space-y-2">
                        {[1, 2, 3, 4, 5, 6, 7].map((i) => (
                          <div key={i} className="h-3 rounded bg-gray-200" style={{ width: `${60 + (i % 3) * 15}%` }} />
                        ))}
                      </div>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                      <div className="h-4 w-24 rounded bg-gray-200 mb-2" />
                      <div className="space-y-2 py-2">
                        <div className="h-3 w-full rounded bg-gray-200" />
                        <div className="h-3 w-[75%] rounded bg-gray-200" />
                        <div className="h-3 w-1/2 rounded bg-gray-200" />
                      </div>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                      <div className="h-4 w-20 rounded bg-gray-200 mb-2" />
                      <div className="space-y-2">
                        <div className="h-3 w-full rounded bg-gray-200" />
                        <div className="h-3 w-2/3 rounded bg-gray-200" />
                        <div className="h-3 w-[50%] rounded bg-gray-200" />
                      </div>
                    </div>
                  </div>

                  {/* Column 3 */}
                  <div className="space-y-3">
                    <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                      <div className="h-4 w-28 rounded bg-gray-200 mb-2" />
                      <div className="space-y-2 py-2">
                        <div className="h-12 rounded bg-gray-200" />
                        <div className="h-12 rounded bg-gray-200" />
                      </div>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                      <div className="h-4 w-20 rounded bg-gray-200 mb-2" />
                      <div className="h-16 rounded bg-gray-200" />
                    </div>
                    <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                      <div className="h-4 w-24 rounded bg-gray-200 mb-2" />
                      <div className="h-20 rounded bg-gray-200" />
                    </div>
                    <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                      <div className="h-4 w-20 rounded bg-gray-200" />
                    </div>
                  </div>
                </div>

                {/* Banner + Gallery row */}
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
