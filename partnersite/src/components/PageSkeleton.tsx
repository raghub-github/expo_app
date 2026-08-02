'use client';

import React from 'react';
import { usePathname } from 'next/navigation';

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

/**
 * Skeleton for the partner main content area while the route is still gated.
 * Picks the same skeleton the destination page shows for its own loading state, so the
 * transition into the page is seamless. Never covers the sidebar or top bar.
 */
export function PartnerContentSkeleton() {
  const pathname = usePathname() ?? '';
  if (
    pathname.startsWith('/partners/orders') ||
    pathname.startsWith('/partners/food-orders') ||
    pathname.startsWith('/partners/order-history')
  ) {
    return <PageSkeletonOrders />;
  }
  if (pathname.startsWith('/partners/menu')) return <MenuPageSkeleton />;
  if (pathname.startsWith('/partners/profile')) return <PageSkeletonProfile />;
  if (pathname.startsWith('/partners/dashboard')) return <PageSkeletonDashboard />;
  return <PageSkeletonGeneric />;
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

/** Menu items grid skeleton — matches mx/menu card view (compact horizontal cards). */
export function MenuItemsGridSkeleton() {
  return (
    <div className="w-full animate-pulse">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {[...Array(8)].map((_: unknown, i: number) => (
          <div
            key={i}
            className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm"
          >
            <div className="flex h-full gap-2.5 p-2.5">
              <div className="h-14 w-14 shrink-0 rounded-lg bg-gray-200" />
              <div className="min-w-0 flex-1 space-y-2 py-0.5">
                <div className="h-3.5 rounded bg-gray-200 w-[85%]" />
                <div className="h-2.5 rounded bg-gray-100 w-[55%]" />
                <div className="h-2.5 rounded bg-gray-100 w-[40%]" />
                <div className="h-3 rounded bg-gray-200 w-[35%]" />
                <div className="flex gap-1 pt-0.5">
                  <div className="h-5 w-12 rounded bg-gray-100" />
                  <div className="h-5 w-12 rounded bg-gray-100" />
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Full menu management page skeleton — toolbar, filters, and item grid. */
export function MenuPageSkeleton() {
  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-white">
      <header className="shrink-0 animate-pulse border-b border-gray-200 bg-white shadow-sm">
        <div className="mx-shell-header flex flex-nowrap items-center justify-between gap-2 !px-3 py-2 sm:!px-4 lg:!px-6">
          <div className="flex min-w-0 shrink items-center gap-1.5">
            <div className="h-8 w-8 shrink-0 rounded-md bg-gray-100 lg:hidden" />
            <div className="flex flex-nowrap items-center gap-1.5 overflow-hidden">
              {[72, 72, 80, 72].map((w, i) => (
                <div
                  key={i}
                  className="shrink-0 rounded-md border border-gray-200 bg-gray-50 px-2 py-1"
                  style={{ minWidth: w }}
                >
                  <div className="mb-1 h-2.5 w-14 rounded bg-gray-200" />
                  <div className="h-4 w-8 rounded bg-gray-300" />
                </div>
              ))}
            </div>
          </div>
          <div className="flex min-w-0 shrink-0 flex-wrap items-center justify-end gap-2">
            <div className="h-8 w-[72px] rounded-lg bg-gray-200" />
            <div className="h-8 w-[88px] rounded-lg bg-gray-200" />
            <div className="h-8 w-[108px] rounded-lg bg-gray-100" />
            <div className="h-8 w-[120px] rounded-lg bg-gray-100" />
            <div className="h-8 w-[88px] rounded-lg border border-amber-200 bg-amber-50" />
          </div>
        </div>
        <div className="flex flex-col justify-between gap-2 px-3 py-3 sm:flex-row sm:items-center sm:px-4">
          <div className="order-2 h-9 max-w-sm flex-1 rounded-lg bg-gray-100 sm:order-1" />
          <div className="order-1 flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden sm:order-2">
            <div className="h-8 w-28 shrink-0 rounded-md bg-orange-100" />
            <div className="flex min-w-0 flex-1 gap-1.5 overflow-hidden">
              {[64, 72, 80, 68, 76].map((w, i) => (
                <div key={i} className="h-8 shrink-0 rounded-md bg-gray-100" style={{ width: w }} />
              ))}
            </div>
          </div>
        </div>
      </header>
      <div className="flex-1 overflow-y-auto bg-white px-3 py-3 sm:px-4">
        <MenuItemsGridSkeleton />
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
