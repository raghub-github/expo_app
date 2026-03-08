"use client";

import React from "react";
import { TableSkeleton, CardSkeleton } from "@/components/ui/SkeletonLoader";

const WRAPPER_CLASS = "w-full max-w-full overflow-x-hidden animate-in fade-in duration-150";

/** Dashboard home: map + sidebar cards */
function HomeSkeleton() {
  return (
    <div className={WRAPPER_CLASS}>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-6">
        <div className="lg:col-span-2 flex items-start">
          <div className="w-full max-w-[500px] aspect-square rounded-lg bg-gray-200 animate-pulse" />
        </div>
        <div className="space-y-4">
          <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
            <div className="h-6 w-32 bg-gray-200 rounded animate-pulse mb-4" />
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-4 bg-gray-100 rounded animate-pulse w-full" />
              ))}
            </div>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
            <div className="h-4 bg-gray-200 rounded animate-pulse w-3/4 mb-3" />
            <div className="h-10 bg-gray-100 rounded animate-pulse" />
          </div>
        </div>
      </div>
    </div>
  );
}

/** Super Admin: grid of option cards */
function SuperAdminSkeleton() {
  return (
    <div className={WRAPPER_CLASS}>
      <div className="mb-4 h-8 w-48 bg-gray-200 rounded animate-pulse" />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <CardSkeleton key={i} />
        ))}
      </div>
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <div className="h-6 w-56 bg-gray-200 rounded animate-pulse mb-4" />
        <div className="space-y-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-4 bg-gray-100 rounded animate-pulse" />
          ))}
        </div>
      </div>
    </div>
  );
}

/** Customers: filters + table with header row */
function CustomersSkeleton() {
  return (
    <div className={WRAPPER_CLASS}>
      <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
        <div className="h-9 w-56 bg-gray-200 rounded animate-pulse" />
        <div className="flex gap-2">
          <div className="h-10 w-24 bg-gray-200 rounded animate-pulse" />
          <div className="h-10 w-32 bg-gray-200 rounded animate-pulse" />
        </div>
      </div>
      <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
        <div className="border-b border-gray-200 bg-gray-50 px-4 py-3 flex gap-4">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-4 w-20 bg-gray-200 rounded animate-pulse" />
          ))}
        </div>
        <div className="p-4">
          <TableSkeleton rows={10} cols={5} />
        </div>
      </div>
    </div>
  );
}

/** Riders: search/filters + table */
function RidersSkeleton() {
  return (
    <div className={WRAPPER_CLASS}>
      <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
        <div className="h-9 w-56 bg-gray-200 rounded animate-pulse" />
        <div className="flex gap-2">
          <div className="h-10 w-28 bg-gray-200 rounded animate-pulse" />
          <div className="h-10 w-24 bg-gray-200 rounded animate-pulse" />
        </div>
      </div>
      <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
        <div className="border-b border-gray-200 bg-gray-50 px-4 py-3 flex gap-4 flex-wrap">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-4 w-20 bg-gray-200 rounded animate-pulse" />
          ))}
        </div>
        <div className="p-4">
          <TableSkeleton rows={10} cols={5} />
        </div>
      </div>
    </div>
  );
}

/** Merchants: stat cards + table */
function MerchantsSkeleton() {
  return (
    <div className={WRAPPER_CLASS}>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[1, 2, 3, 4].map((i) => (
          <CardSkeleton key={i} />
        ))}
      </div>
      <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
        <div className="border-b border-gray-200 bg-gray-50 px-4 py-3 flex gap-4 flex-wrap">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-4 w-24 bg-gray-200 rounded animate-pulse" />
          ))}
        </div>
        <div className="p-4">
          <TableSkeleton rows={8} cols={5} />
        </div>
      </div>
    </div>
  );
}

/** Orders: filters + table */
function OrdersSkeleton() {
  return (
    <div className={WRAPPER_CLASS}>
      <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
        <div className="h-9 w-40 bg-gray-200 rounded animate-pulse" />
        <div className="flex gap-2">
          <div className="h-10 w-24 bg-gray-200 rounded animate-pulse" />
          <div className="h-10 w-32 bg-gray-200 rounded animate-pulse" />
        </div>
      </div>
      <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
        <div className="border-b border-gray-200 bg-gray-50 px-4 py-3 flex gap-4 flex-wrap">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-4 w-20 bg-gray-200 rounded animate-pulse" />
          ))}
        </div>
        <div className="p-4">
          <TableSkeleton rows={8} cols={6} />
        </div>
      </div>
    </div>
  );
}

/** Area Managers: stat cards + table */
function AreaManagersSkeleton() {
  return (
    <div className={WRAPPER_CLASS}>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[1, 2, 3, 4].map((i) => (
          <CardSkeleton key={i} />
        ))}
      </div>
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <div className="h-6 w-48 bg-gray-200 rounded animate-pulse mb-4" />
        <div className="space-y-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="flex gap-4">
              <div className="h-4 flex-1 bg-gray-200 rounded animate-pulse" />
              <div className="h-4 flex-1 bg-gray-200 rounded animate-pulse" />
              <div className="h-4 w-24 bg-gray-200 rounded animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Tickets: filters + table */
function TicketsSkeleton() {
  return (
    <div className={WRAPPER_CLASS}>
      <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
        <div className="h-9 w-40 bg-gray-200 rounded animate-pulse" />
        <div className="flex gap-2">
          <div className="h-10 w-28 bg-gray-200 rounded animate-pulse" />
          <div className="h-10 w-24 bg-gray-200 rounded animate-pulse" />
        </div>
      </div>
      <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
        <div className="border-b border-gray-200 bg-gray-50 px-4 py-3 flex gap-4 flex-wrap">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-4 w-24 bg-gray-200 rounded animate-pulse" />
          ))}
        </div>
        <div className="p-4">
          <TableSkeleton rows={8} cols={6} />
        </div>
      </div>
    </div>
  );
}

/** System: simple table */
function SystemSkeleton() {
  return (
    <div className={WRAPPER_CLASS}>
      <div className="mb-4 h-8 w-48 bg-gray-200 rounded animate-pulse" />
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <TableSkeleton rows={8} cols={4} />
      </div>
    </div>
  );
}

/** Analytics: cards + chart area */
function AnalyticsSkeleton() {
  return (
    <div className={WRAPPER_CLASS}>
      <div className="mb-4 h-8 w-40 bg-gray-200 rounded animate-pulse" />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[1, 2, 3, 4].map((i) => (
          <CardSkeleton key={i} />
        ))}
      </div>
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <div className="h-64 bg-gray-100 rounded animate-pulse" />
      </div>
    </div>
  );
}

/** Generic fallback: title + table */
function DefaultTableSkeleton() {
  return (
    <div className={WRAPPER_CLASS}>
      <div className="mb-4 h-8 w-48 bg-gray-200 rounded animate-pulse" />
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <TableSkeleton rows={8} cols={5} />
      </div>
    </div>
  );
}

/** Returns the section skeleton component for the given href (target path). */
export function getSectionSkeletonForHref(href: string): React.ReactNode {
  const path = href.split("?")[0].split("#")[0];
  if (path === "/dashboard") return <HomeSkeleton />;
  if (path.startsWith("/dashboard/super-admin")) return <SuperAdminSkeleton />;
  if (path.startsWith("/dashboard/customers")) return <CustomersSkeleton />;
  if (path.startsWith("/dashboard/riders")) return <RidersSkeleton />;
  if (path.startsWith("/dashboard/merchants")) return <MerchantsSkeleton />;
  if (path.startsWith("/dashboard/orders")) return <OrdersSkeleton />;
  if (path.startsWith("/dashboard/area-managers")) return <AreaManagersSkeleton />;
  if (path.startsWith("/dashboard/tickets")) return <TicketsSkeleton />;
  if (path.startsWith("/dashboard/system")) return <SystemSkeleton />;
  if (path.startsWith("/dashboard/analytics")) return <AnalyticsSkeleton />;
  return <DefaultTableSkeleton />;
}
