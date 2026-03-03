"use client";

export function VerificationPageSkeleton() {
  return (
    <div className="space-y-2 animate-in fade-in duration-200">
      <div className="h-4 w-32 rounded bg-gray-200" />
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-100 bg-gray-50/50 px-3 py-2">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex min-w-0 flex-1 items-start gap-2">
              <div className="h-8 w-8 shrink-0 rounded-lg bg-gray-200" />
              <div className="min-w-0 flex-1 space-y-1.5">
                <div className="h-4 w-48 rounded bg-gray-200" />
                <div className="h-3 w-64 rounded bg-gray-100" />
              </div>
            </div>
            <div className="h-8 w-24 shrink-0 rounded bg-gray-100" />
          </div>
        </div>
        <div className="p-3">
          <div className="mb-1.5 h-3 w-72 rounded bg-gray-100" />
          <div className="relative space-y-0">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => (
              <div key={i} className="relative flex gap-2.5" style={{ minHeight: "44px" }}>
                {i < 9 && (
                  <div
                    className="absolute left-[13px] top-7 bottom-0 w-0.5 bg-gray-200"
                    aria-hidden
                  />
                )}
                <div className="relative z-10 h-7 w-7 shrink-0 rounded-full bg-gray-200" />
                <div className="min-w-0 flex-1 pb-2">
                  <div className="rounded-lg border border-gray-200 bg-gray-50/50 p-2">
                    <div className="h-5 w-56 rounded bg-gray-200" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
