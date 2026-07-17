export default function SuperAdminLoading() {
  return (
    <div className="w-full min-w-0 animate-pulse space-y-4 p-1">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-2">
          <div className="h-6 w-48 rounded-md bg-slate-200" />
          <div className="h-3 w-72 max-w-full rounded bg-slate-100" />
        </div>
        <div className="h-9 w-52 rounded-lg bg-slate-200" />
      </div>
      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="mb-3 h-5 w-40 rounded bg-slate-200" />
        <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 9 }).map((_, i) => (
            <div key={i} className="h-10 rounded-lg bg-slate-100" />
          ))}
        </div>
      </div>
    </div>
  );
}
