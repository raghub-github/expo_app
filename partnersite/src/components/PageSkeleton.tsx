'use client';

import React from 'react';

/** Base skeleton bar - matches Profile page style (bg-gray-200/100, animate-pulse, rounded) */
export function SkeletonBar({ className = '' }: { className?: string }) {
  return <div className={`h-4 bg-gray-100 rounded animate-pulse ${className}`} />;
}

/** Primary skeleton bar (darker) */
export function SkeletonBarPrimary({ className = '' }: { className?: string }) {
  return <div className={`bg-gray-200 rounded animate-pulse ${className}`} />;
}

/** Reusable skeleton block */
export function SkeletonBlock({ className = '' }: { className?: string }) {
  return <div className={`bg-gray-100 rounded-lg animate-pulse ${className}`} />;
}

/** Profile-style page skeleton - same animation used on Profile page */
export function PageSkeletonProfile() {
  return (
    <div className="bg-gray-50 min-h-screen flex flex-col">
      <div className="bg-white border-b border-gray-200 p-6">
        <div className="h-8 bg-gray-200 rounded w-1/4 animate-pulse" />
      </div>
      <div className="p-6">
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden max-w-3xl mx-auto">
          <div className="flex gap-6 p-6">
            <div className="w-20 h-20 bg-gray-200 rounded-lg animate-pulse" />
            <div className="flex-1 space-y-4">
              <div className="h-6 bg-gray-200 rounded w-1/2 animate-pulse" />
              <div className="h-4 bg-gray-100 rounded w-1/3 animate-pulse" />
            </div>
          </div>
          <div className="p-6 space-y-3">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="h-4 bg-gray-100 rounded animate-pulse w-full" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Orders page skeleton — mobile: compact card list; desktop: larger block */
export function PageSkeletonOrders() {
  return (
    <div className="flex-1 flex flex-col bg-gray-50 min-h-0">
      {/* Header row — compact on mobile */}
      <div className="bg-white border-b border-gray-200 px-3 py-3 md:p-6">
        <div className="flex items-center justify-between gap-2">
          <div className="h-6 md:h-8 bg-gray-200 rounded w-24 md:w-1/4 animate-pulse" />
          <div className="flex gap-2 md:hidden">
            <div className="h-8 w-14 bg-gray-100 rounded-lg animate-pulse" />
            <div className="h-8 w-14 bg-gray-100 rounded-lg animate-pulse" />
          </div>
        </div>
      </div>
      {/* Mobile: order-card style placeholders */}
      <div className="flex-1 p-3 md:p-6 space-y-3 md:hidden">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="bg-white rounded-xl border border-gray-200 p-4 animate-pulse">
            <div className="flex justify-between items-start gap-2 mb-3">
              <div className="h-4 bg-gray-200 rounded w-16" />
              <div className="h-4 bg-gray-100 rounded w-20" />
            </div>
            <div className="h-4 bg-gray-200 rounded w-3/4 mb-2" />
            <div className="h-3 bg-gray-100 rounded w-1/2" />
            <div className="flex gap-2 mt-3">
              <div className="h-6 bg-gray-100 rounded w-12" />
              <div className="h-6 bg-gray-100 rounded w-12" />
            </div>
          </div>
        ))}
      </div>
      {/* Desktop: single large block */}
      <div className="hidden md:block p-6 flex-1">
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="flex gap-6 p-6">
            <div className="w-20 h-20 bg-gray-200 rounded-lg animate-pulse" />
            <div className="flex-1 space-y-4">
              <div className="h-6 bg-gray-200 rounded w-1/2 animate-pulse" />
              <div className="h-4 bg-gray-100 rounded w-1/3 animate-pulse" />
            </div>
          </div>
          <div className="p-6 space-y-3">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="h-4 bg-gray-100 rounded animate-pulse w-full" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Dashboard / cards-style skeleton */
export function PageSkeletonDashboard() {
  return (
    <div className="min-h-screen bg-gray-50 px-4 sm:px-6 lg:px-8 py-8">
      <div className="bg-white border-b border-gray-200 p-6">
        <div className="h-8 bg-gray-200 rounded w-1/4 animate-pulse" />
      </div>
      <div className="p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-28 bg-gray-200 rounded-xl animate-pulse" />
          ))}
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex gap-6 mb-6">
            <div className="w-20 h-20 bg-gray-200 rounded-lg animate-pulse" />
            <div className="flex-1 space-y-3">
              <div className="h-6 bg-gray-200 rounded w-1/2 animate-pulse" />
              <div className="h-4 bg-gray-100 rounded w-1/3 animate-pulse" />
            </div>
          </div>
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-4 bg-gray-100 rounded animate-pulse w-full" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Skeleton row for lists (reviews, etc.) - Profile style */
export function SkeletonReviewRow() {
  return (
    <div className="animate-pulse bg-white rounded-xl border border-gray-200 p-6 mb-4 shadow-sm">
      <div className="flex items-start justify-between">
        <div className="space-y-3 flex-1">
          <div className="flex items-center gap-3">
            <div className="h-6 bg-gray-200 rounded w-32" />
            <div className="h-5 bg-gray-100 rounded w-24" />
          </div>
          <div className="h-4 bg-gray-200 rounded w-3/4 mb-2" />
          <div className="h-3 bg-gray-100 rounded w-full mb-1" />
          <div className="h-3 bg-gray-100 rounded w-2/3" />
        </div>
        <div className="h-8 bg-gray-200 rounded w-24 ml-4" />
      </div>
    </div>
  );
}

/** Menu items grid skeleton - Profile style for inline loading */
export function MenuItemsGridSkeleton() {
  return (
    <div className="w-full flex flex-col gap-8 animate-pulse">
      <div className="w-full grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 mt-2">
        {[...Array(8)].map((_: unknown, i: number) => (
          <div key={i} className="bg-white rounded-xl border border-gray-200 shadow-sm min-h-[160px]">
            <div className="flex p-3 h-full">
              <div className="w-16 h-16 flex-shrink-0 mr-3 bg-gray-200 rounded-lg" />
              <div className="flex-1 space-y-3 py-1">
                <div className="h-4 bg-gray-200 rounded w-3/4" />
                <div className="h-3 bg-gray-100 rounded w-1/2" />
                <div className="h-3 bg-gray-100 rounded w-1/3" />
                <div className="h-3 bg-gray-100 rounded w-1/4" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Generic page skeleton - works for settings, payments, etc. */
export function PageSkeletonGeneric() {
  return (
    <div className="min-h-screen bg-gray-50 px-4 sm:px-6 lg:px-8 py-8">
      <div className="bg-white border-b border-gray-200 p-6">
        <div className="h-8 bg-gray-200 rounded w-1/4 animate-pulse" />
      </div>
      <div className="p-6">
        <div className="max-w-7xl mx-auto">
          <div className="space-y-1 mb-6">
            <div className="h-10 bg-gray-200 rounded w-1/3 animate-pulse" />
            <div className="h-4 bg-gray-100 rounded w-1/2 animate-pulse" />
          </div>
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <div className="flex gap-6 p-6">
              <div className="w-20 h-20 bg-gray-200 rounded-lg animate-pulse" />
              <div className="flex-1 space-y-4">
                <div className="h-6 bg-gray-200 rounded w-1/2 animate-pulse" />
                <div className="h-4 bg-gray-100 rounded w-1/3 animate-pulse" />
              </div>
            </div>
            <div className="p-6 space-y-3">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div key={i} className="h-4 bg-gray-100 rounded animate-pulse w-full" />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
