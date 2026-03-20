"use client";

import { GatiSpinner } from "@/components/ui/GatiSpinner";

export default function DashboardLoading() {
  return (
    <div className="absolute inset-0 z-[90] flex flex-1 items-center justify-center bg-[#FFFFFF] min-h-[200px]">
      <GatiSpinner />
    </div>
  );
}
