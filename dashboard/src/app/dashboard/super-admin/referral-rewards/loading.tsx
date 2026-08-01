export default function ReferralRewardsLoading() {
  return (
    <div className="w-full min-w-0 animate-pulse space-y-4 p-6">
      <div className="space-y-2">
        <div className="h-7 w-56 rounded-md bg-slate-200" />
        <div className="h-3 w-80 max-w-full rounded bg-slate-100" />
      </div>
      <div className="flex gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-8 w-28 rounded-lg bg-slate-100" />
        ))}
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-20 rounded-xl bg-slate-100" />
        ))}
      </div>
    </div>
  );
}
