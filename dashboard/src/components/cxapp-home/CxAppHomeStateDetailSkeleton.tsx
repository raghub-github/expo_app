/** Instant placeholder while a state/UT detail route loads. */
export function CxAppHomeStateDetailSkeleton() {
  return (
    <div className="w-full min-w-0 max-w-none space-y-4 animate-pulse" aria-busy="true" aria-label="Loading state layout">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-3 py-1">
        <div className="h-7 w-48 rounded bg-slate-200" />
        <div className="h-4 w-28 rounded bg-slate-100" />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_300px] xl:items-start">
        <div className="order-2 rounded-xl border border-gray-200 bg-white p-4 shadow-sm xl:order-1">
          <div className="h-4 w-56 rounded bg-slate-200" />
          <div className="mt-2 h-3 w-full max-w-md rounded bg-slate-100" />
          <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-36 rounded-xl border border-gray-100 bg-slate-50" />
            ))}
          </div>
          <div className="mt-4 h-24 rounded-xl bg-slate-50" />
        </div>
        <div className="order-1 h-[520px] rounded-xl border border-gray-200 bg-slate-100 xl:order-2" />
      </div>
    </div>
  );
}
