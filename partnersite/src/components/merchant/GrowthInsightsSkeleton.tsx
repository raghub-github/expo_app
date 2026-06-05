"use client";

function Pulse({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-slate-200/80 ${className}`} aria-hidden />;
}

function MetricRowSkeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 sm:gap-3 items-center py-3.5">
      <div className="sm:col-span-3">
        <Pulse className="h-4 w-24" />
      </div>
      <div className="sm:col-span-5 flex justify-start sm:justify-center">
        <Pulse className="h-8 w-32" />
      </div>
      <div className="sm:col-span-4 flex justify-start sm:justify-end gap-2">
        <Pulse className="h-5 w-16" />
        <Pulse className="h-5 w-12 rounded-full" />
      </div>
    </div>
  );
}

function SectionSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="mb-10">
      <div className="flex items-center gap-2 pb-3 border-b border-slate-200/80">
        <Pulse className="h-5 w-5 rounded" />
        <Pulse className="h-4 w-32" />
      </div>
      <Pulse className="h-3 w-48 mt-2 mb-2" />
      <div className="divide-y divide-slate-200/70">
        {Array.from({ length: rows }, (_, i) => (
          <MetricRowSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}

export function LivePreviewSkeleton() {
  return (
    <>
      <SectionSkeleton rows={3} />
      <div className="mb-10 flex flex-col lg:flex-row gap-4 lg:gap-6">
        <div className="w-full lg:w-[60%]">
          <SectionSkeleton rows={5} />
        </div>
        <div className="w-full lg:w-[40%]">
          <SectionSkeleton rows={4} />
        </div>
      </div>
      <SectionSkeleton rows={7} />
    </>
  );
}

export function BusinessReportsTableSkeleton() {
  return (
    <div className="mt-2 pb-8">
      <Pulse className="h-3 w-56 mb-3" />
      <div className="overflow-x-auto rounded-lg border border-slate-200/80 bg-white/70 p-3">
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex items-center gap-4">
              <Pulse className="h-4 w-20" />
              <Pulse className="h-8 w-32" />
              <Pulse className="h-4 w-16 ml-auto" />
              <Pulse className="h-4 w-16" />
              <Pulse className="h-5 w-12 rounded-full" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function BusinessReportsChartSkeleton() {
  return (
    <div className="mt-2 pb-8 grid grid-cols-1 sm:grid-cols-2 gap-4">
      {[0, 1, 2].map((i) => (
        <div key={i} className="rounded-lg border border-slate-200/80 bg-white/80 p-4">
          <Pulse className="h-4 w-24 mb-3" />
          <Pulse className="h-24 w-full" />
          <Pulse className="h-5 w-20 mt-3" />
        </div>
      ))}
    </div>
  );
}
