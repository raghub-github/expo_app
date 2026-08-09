/**
 * Lightweight in-content skeleton for client pages. Do NOT use as a route-level
 * `loading.tsx` export — an empty/null route fallback unmounts the previous page
 * during soft navigation and causes a blank white frame in the dashboard shell.
 */
export function DashboardContentSkeleton({ className = "" }: { className?: string }) {
  return (
    <div
      className={`flex min-h-[200px] flex-1 animate-pulse flex-col gap-3 rounded-lg bg-[#f5f7f9] p-4 ${className}`}
      aria-busy
      aria-label="Loading content"
    >
      <div className="h-8 w-48 rounded-md bg-white/90" />
      <div className="min-h-[120px] flex-1 rounded-lg bg-white/80" />
    </div>
  );
}

/** @deprecated Route-level loading.tsx must not be used in the dashboard — see DashboardContentSkeleton. */
export default function DashboardRouteLoading() {
  return null;
}
