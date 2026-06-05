'use client';

import { Bike, Loader2, Radio } from 'lucide-react';

export type RiderAssignPendingCardProps = {
  nearbyCount: number;
  assignSoonMessage: string;
  radiusKm?: number;
  loading?: boolean;
  className?: string;
};

export function RiderAssignPendingCard({
  nearbyCount,
  assignSoonMessage,
  radiusKm,
  loading = false,
  className = '',
}: RiderAssignPendingCardProps) {
  return (
    <div
      className={`flex flex-1 min-h-0 flex-col overflow-hidden rounded-xl border border-dashed border-sky-200 bg-gradient-to-b from-sky-50/90 to-white shadow-sm ${className}`}
    >
      <div className="border-b border-sky-100 bg-sky-50/80 px-3 py-1.5">
        <p className="text-[10px] font-bold uppercase tracking-wider text-sky-700">
          Delivery partner
        </p>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center px-4 py-6 text-center">
        {loading ? (
          <>
            <Loader2 className="h-8 w-8 animate-spin text-sky-600" aria-hidden />
            <p className="mt-3 text-sm font-medium text-gray-600">Checking nearby riders…</p>
          </>
        ) : (
          <>
            <div className="relative mb-4">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-white shadow-md ring-2 ring-sky-100">
                <Bike className="h-8 w-8 text-sky-600" aria-hidden />
              </div>
              {nearbyCount > 0 ? (
                <span className="absolute -right-1 -top-1 flex h-7 min-w-[1.75rem] items-center justify-center rounded-full bg-emerald-500 px-1.5 text-xs font-bold text-white shadow">
                  {nearbyCount > 99 ? '99+' : nearbyCount}
                </span>
              ) : null}
            </div>

            <p className="text-base font-bold text-gray-900 leading-snug">{assignSoonMessage}</p>

            <p className="mt-2 flex items-center justify-center gap-1.5 text-xs text-gray-500">
              <Radio size={14} className="text-emerald-500 shrink-0" aria-hidden />
              {nearbyCount > 0
                ? `${nearbyCount} active rider${nearbyCount === 1 ? '' : 's'} nearby`
                : 'Searching for active riders nearby'}
              {radiusKm != null && radiusKm > 0 ? (
                <span className="text-gray-400"> · within {radiusKm} km</span>
              ) : null}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
