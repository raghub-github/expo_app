/**
 * Route shell — matches the states grid so navigation never stalls on a lone spinner.
 */
export default function CxAppHomeLoading() {
  return (
    <div className="w-full min-w-0 max-w-none space-y-4">
      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 leading-tight">CXApp Home</h2>
            <p className="mt-0.5 text-xs text-gray-500">Loading states / UT…</p>
          </div>
          <div className="h-9 w-52 rounded-lg border border-gray-200 bg-slate-50" />
        </div>
        <div className="mt-3 rounded-xl border border-gray-200 bg-white p-3">
          <h3 className="text-[24px] font-semibold leading-none text-slate-900">States / UT</h3>
          <div className="relative mt-3 grid grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="h-10 animate-pulse rounded-lg border border-gray-100 bg-slate-50" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
