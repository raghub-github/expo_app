/** Full-bleed tickets list shell — matches TicketList layout during route/data load. */
export function TicketsPageSkeleton() {
  return (
    <div className="tickets-typo flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden bg-white">
      <div className="flex shrink-0 items-center gap-2 border-b border-gray-200/90 px-3 py-2">
        <div className="h-7 w-28 animate-pulse rounded-md bg-gray-100" />
        <div className="h-7 w-24 animate-pulse rounded-md bg-gray-100" />
        <div className="ml-auto hidden h-7 w-32 animate-pulse rounded-md bg-gray-100 sm:block" />
      </div>
      <div className="min-h-0 flex-1 divide-y divide-gray-100 overflow-hidden">
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} className="flex items-start gap-3 px-3 py-3.5">
            <div className="mt-1 h-4 w-4 shrink-0 animate-pulse rounded bg-gray-100" />
            <div className="min-w-0 flex-1 space-y-2">
              <div className="flex flex-wrap gap-2">
                <div className="h-5 w-14 animate-pulse rounded-full bg-gray-100" />
                <div className="h-5 w-20 animate-pulse rounded-full bg-gray-100" />
                <div className="h-5 w-16 animate-pulse rounded-full bg-gray-100" />
              </div>
              <div className="h-4 max-w-lg animate-pulse rounded bg-gray-100" style={{ width: `${68 - (i % 3) * 8}%` }} />
              <div className="h-3 max-w-xs animate-pulse rounded bg-gray-100" style={{ width: `${42 - (i % 2) * 6}%` }} />
            </div>
            <div className="hidden shrink-0 gap-2 sm:flex">
              <div className="h-8 w-[4.5rem] animate-pulse rounded-md bg-gray-100" />
              <div className="h-8 w-[4.5rem] animate-pulse rounded-md bg-gray-100" />
            </div>
          </div>
        ))}
      </div>
      <div className="flex shrink-0 items-center justify-between border-t border-gray-200 px-3 py-2">
        <div className="h-8 w-36 animate-pulse rounded-md bg-gray-100" />
        <div className="h-8 w-52 animate-pulse rounded-md bg-gray-100" />
      </div>
    </div>
  );
}
