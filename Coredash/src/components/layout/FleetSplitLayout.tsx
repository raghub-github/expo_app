"use client";

import { ArrowLeft } from "lucide-react";
import { MobileNavButton } from "@/components/layout/MobileNavButton";

/**
 * Master-detail shell for Customers / Riders / Merchants.
 * Desktop (lg+): list + detail side-by-side.
 * Phone/tablet: list OR detail full-width with back + menu.
 */
export function FleetSplitLayout({
  listWidthClass = "lg:w-[320px]",
  showDetail,
  onBackToList,
  list,
  detail,
  emptyDetail,
}: {
  listWidthClass?: string;
  showDetail: boolean;
  onBackToList: () => void;
  list: React.ReactNode;
  detail: React.ReactNode;
  emptyDetail?: React.ReactNode;
}) {
  return (
    <div className="flex h-full min-h-0 w-full flex-1 overflow-hidden bg-[#F5F6F8]">
      <aside
        className={`min-h-0 w-full shrink-0 flex-col border-r border-[#E5E7EB] bg-white ${listWidthClass} ${
          showDetail ? "hidden lg:flex" : "flex"
        }`}
      >
        <div className="flex items-center gap-2 border-b border-[#EEF0F4] px-3 py-2.5 lg:hidden">
          <MobileNavButton />
          <p className="min-w-0 flex-1 truncate text-[13px] font-semibold text-[#1E1C4A]">Browse</p>
        </div>
        {list}
      </aside>

      <section
        className={`min-h-0 min-w-0 flex-1 flex-col overflow-hidden ${
          showDetail ? "flex" : "hidden lg:flex"
        }`}
      >
        {showDetail || emptyDetail == null ? (
          <>
            <div className="flex shrink-0 items-center justify-between gap-2 border-b border-[#E5E7EB] bg-white px-3 py-2 lg:hidden">
              <MobileNavButton />
              <button
                type="button"
                onClick={onBackToList}
                aria-label="Back to list"
                className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-[#E5E7EB] bg-white px-3 text-[13px] font-semibold text-[#111827] hover:bg-[#F9FAFB]"
              >
                <ArrowLeft className="h-4 w-4" strokeWidth={1.75} />
                List
              </button>
            </div>
            {detail}
          </>
        ) : (
          emptyDetail
        )}
      </section>
    </div>
  );
}
