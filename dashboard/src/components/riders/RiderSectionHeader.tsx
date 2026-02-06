"use client";

import Link from "next/link";
import { User } from "lucide-react";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";

export interface RiderSectionHeaderRider {
  id: number;
  name: string | null;
  mobile: string;
}

interface RiderSectionHeaderProps {
  title: string;
  description: string;
  rider: RiderSectionHeaderRider | null;
  resolveLoading: boolean;
  error: string | null;
  hasSearch: boolean;
  /** Extra buttons next to "View details" (e.g. "Add Penalty", "Wallet History") */
  actionButtons?: React.ReactNode;
}

export function RiderSectionHeader({
  title,
  description,
  rider,
  resolveLoading,
  error,
  hasSearch,
  actionButtons,
}: RiderSectionHeaderProps) {
  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight">{title}</h1>
          <p className="text-sm text-gray-600 mt-1">{description}</p>
        </div>
        {rider && (
          <div className="flex items-center gap-2 flex-shrink-0">
            <div className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 shadow-sm ring-1 ring-gray-900/5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-100 text-gray-600">
                <User className="h-4 w-4" />
              </div>
              <div className="text-sm">
                <span className="font-medium text-gray-900">GMR{rider.id}</span>
                <span className="text-gray-400 mx-1.5">·</span>
                <span className="text-gray-700">{rider.name || "—"}</span>
                <span className="text-gray-400 mx-1.5">·</span>
                <span className="text-gray-600">{rider.mobile}</span>
              </div>
              <div className="flex items-center gap-2 ml-1">
                <Link
                  href={`/dashboard/riders/${rider.id}`}
                  className="text-xs font-medium text-blue-600 hover:text-blue-700 whitespace-nowrap"
                >
                  View details
                </Link>
                {actionButtons}
              </div>
            </div>
          </div>
        )}
      </div>

      {resolveLoading && (
        <div className="flex justify-center py-8">
          <LoadingSpinner size="md" text="Resolving rider..." />
        </div>
      )}

      {hasSearch && !resolveLoading && error && !rider && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm font-medium text-amber-800">
          {error}
        </div>
      )}
    </div>
  );
}
