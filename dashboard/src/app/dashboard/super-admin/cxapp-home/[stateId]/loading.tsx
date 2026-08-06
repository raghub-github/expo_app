/**
 * Light detail shell — avoids reusing the list-page skeleton on state navigation.
 */
export default function CxAppHomeStateLoading() {
  return (
    <div className="w-full min-w-0 max-w-none space-y-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-1">
        <div className="h-7 w-40 rounded bg-slate-100" />
        <span className="text-xs text-slate-500">Loading layout…</span>
      </div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_300px]">
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="h-4 w-48 rounded bg-slate-100" />
          <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-36 rounded-xl border border-gray-100 bg-slate-50" />
            ))}
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <p className="text-center text-sm font-semibold text-slate-700">Live app preview</p>
          <div className="mx-auto mt-3 h-64 w-[200px] rounded-[24px] border-[5px] border-slate-200 bg-white" />
        </div>
      </div>
    </div>
  );
}
