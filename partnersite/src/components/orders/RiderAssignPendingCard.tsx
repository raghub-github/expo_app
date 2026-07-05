'use client';

import { Bike } from 'lucide-react';

export type RiderAssignPendingCardProps = {
  nearbyCount: number;
  assignSoonMessage: string;
  radiusKm?: number;
  statusSubtitle?: string | null;
  theme?: 'light' | 'dark';
  className?: string;
};

export function formatPendingRiderHeadline(nearbyCount: number, message?: string): string {
  if (message?.trim()) return message.trim();
  if (nearbyCount <= 0) return 'Looking for nearby riders, assigning one soon';
  if (nearbyCount === 1) return '1 rider nearby, assigning one soon';
  return `${nearbyCount} riders nearby, assigning one soon`;
}

export function RiderAssignPendingCard({
  nearbyCount,
  assignSoonMessage,
  statusSubtitle,
  theme = 'light',
  className = '',
}: RiderAssignPendingCardProps) {
  const isDark = theme === 'dark';
  const headline = formatPendingRiderHeadline(nearbyCount, assignSoonMessage);

  return (
    <div
      className={`flex items-start gap-3 border-t border-dashed px-4 py-3 ${
        isDark ? 'border-white/10' : 'border-gray-200'
      } ${className}`}
    >
      <Bike
        className={`mt-0.5 h-5 w-5 shrink-0 ${isDark ? 'text-gray-300' : 'text-gray-600'}`}
        aria-hidden
      />
      <div className="min-w-0 flex-1">
        <p
          className={`text-sm font-bold leading-snug ${
            isDark ? 'text-white' : 'text-gray-900'
          }`}
        >
          {headline}
        </p>
        {statusSubtitle ? (
          <p
            className={`mt-0.5 text-xs leading-snug ${
              isDark ? 'text-gray-400' : 'text-gray-500'
            }`}
          >
            {statusSubtitle}
          </p>
        ) : null}
      </div>
    </div>
  );
}
