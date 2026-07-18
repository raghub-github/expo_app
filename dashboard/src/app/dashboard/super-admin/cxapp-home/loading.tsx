export default function CxAppHomeLoading() {
  return (
    <div className="w-full min-w-0 max-w-none space-y-4 animate-pulse">
      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-2">
            <div className="h-6 w-36 rounded-md bg-slate-200" />
            <div className="h-3 w-64 max-w-full rounded bg-slate-100" />
          </div>
          <div className="h-9 w-52 rounded-lg border border-gray-200 bg-slate-100" />
        </div>
        <div className="mt-3 rounded-xl border border-gray-200 bg-white p-3">
          <div className="mb-3 flex flex-wrap items-start justify-between gap-2.5">
            <div className="space-y-2">
              <div className="h-7 w-32 rounded bg-slate-200" />
              <div className="h-3 w-56 rounded bg-slate-100" />
            </div>
            <div className="h-10 w-full max-w-[250px] rounded-lg bg-slate-100 sm:w-[250px]" />
          </div>
          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="h-10 rounded-lg border border-gray-100 bg-slate-50" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
