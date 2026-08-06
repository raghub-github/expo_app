/**
 * Light route shell — paints instantly so navigation does not feel stuck on a
 * heavy pulse skeleton while the client bundle / data hydrate.
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
          <div className="mt-4 flex justify-center py-8">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-slate-200 border-t-cyan-600" />
          </div>
        </div>
      </div>
    </div>
  );
}
