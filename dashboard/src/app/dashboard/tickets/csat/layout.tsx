import { CsatSectionHeader } from "@/components/tickets/CsatSectionHeader";

/** Same shell as ticket list/detail: gradient strip + raised white panel */
export default function CsatLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-0 w-full flex-1 flex-col -mt-3 sm:-mt-4 -mb-3 sm:-mb-4 bg-gradient-to-b from-slate-50/80 to-gray-50/90">
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-t-xl border border-gray-200/80 border-b-0 bg-white/95 shadow-sm">
        <div className="min-h-0 flex-1 space-y-6 overflow-auto p-6">
          <CsatSectionHeader />
          {children}
        </div>
      </div>
    </div>
  );
}
