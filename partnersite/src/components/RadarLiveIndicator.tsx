'use client';

import React from 'react';

/**
 * Web radar pulse — same visual language as the merchant app (green center + staggered rings).
 */
export function RadarLiveIndicator({ compact }: { compact?: boolean }) {
  const size = compact ? 22 : 32;
  const dot = compact ? 6 : 8;
  return (
    <div
      className="relative flex shrink-0 items-center justify-center pointer-events-none"
      style={{ width: size, height: size }}
      aria-hidden
    >
      <span
        className="partner-radar-ring absolute rounded-full border-2 border-violet-600"
        style={{ width: size, height: size, animationDelay: '0ms' }}
      />
      <span
        className="partner-radar-ring absolute rounded-full border-2 border-blue-600"
        style={{ width: size, height: size, animationDelay: '600ms' }}
      />
      <span
        className="partner-radar-ring absolute rounded-full border-2 border-indigo-900"
        style={{ width: size, height: size, animationDelay: '1200ms' }}
      />
      <span
        className="absolute rounded-full bg-emerald-500"
        style={{
          width: dot,
          height: dot,
        }}
      />
    </div>
  );
}
