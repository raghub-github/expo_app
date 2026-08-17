"use client";

import React from "react";
import {
  PARTNER_DASHBOARD_METRIC_BOX_SKELETON_CLASS,
  PARTNER_DASHBOARD_TOP_CARD_CLASS,
} from "./partner-dashboard-card-styles";

function MetricBoxSkeleton({ tall = false }: { tall?: boolean }) {
  return (
    <div className={`${PARTNER_DASHBOARD_METRIC_BOX_SKELETON_CLASS} ${tall ? "h-[48px]" : "h-[44px]"}`}>
      <div className="h-2 w-12 rounded bg-slate-200/80" />
      <div className="mt-1.5 h-3.5 w-8 rounded bg-slate-200/70" />
    </div>
  );
}

function CardHeaderSkeleton({ withToggle = false }: { withToggle?: boolean }) {
  return (
    <div className="mb-2 flex items-start justify-between gap-2">
      <div className="flex min-w-0 items-center gap-2">
        <div className="h-8 w-8 shrink-0 animate-pulse rounded-lg bg-slate-200/80" />
        <div className="min-w-0 space-y-1">
          <div className="h-2.5 w-24 animate-pulse rounded bg-slate-200/80" />
          <div className="h-2 w-20 animate-pulse rounded bg-slate-200/60" />
        </div>
      </div>
      {withToggle ? (
        <div className="h-5 w-24 shrink-0 animate-pulse rounded-full bg-slate-200/70" />
      ) : (
        <div className="h-4 w-20 shrink-0 animate-pulse rounded bg-slate-200/60" />
      )}
    </div>
  );
}

function SectionLabelSkeleton() {
  return <div className="h-2.5 w-28 rounded bg-slate-200/70 animate-pulse mb-2" />;
}

export function PartnerDashboardStoreStatusSkeleton() {
  return (
    <div className={`${PARTNER_DASHBOARD_TOP_CARD_CLASS} border-slate-200/90`}>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <CardHeaderSkeleton withToggle />
        <div className="mt-1 flex min-h-0 flex-1 flex-col space-y-1.5">
          <div className={`${PARTNER_DASHBOARD_METRIC_BOX_SKELETON_CLASS} h-[52px] px-2 py-1.5`}>
            <div className="h-2 w-16 rounded bg-slate-200/80" />
            <div className="mt-1.5 h-4 w-40 rounded bg-slate-200/70" />
          </div>
          <div className={`${PARTNER_DASHBOARD_METRIC_BOX_SKELETON_CLASS} h-[44px] px-2 py-1.5`}>
            <div className="h-2 w-20 rounded bg-slate-200/80" />
            <div className="mt-1.5 h-3 w-full max-w-[240px] rounded bg-slate-200/70" />
          </div>
        </div>
        <div className="mt-auto flex items-center justify-between gap-2 border-t border-slate-200/80 pt-2">
          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="h-3 w-32 rounded bg-slate-200/80 animate-pulse" />
            <div className="h-2.5 w-40 rounded bg-slate-200/60 animate-pulse" />
          </div>
          <div className="h-6 w-11 shrink-0 rounded-full bg-slate-200/70 animate-pulse" />
        </div>
      </div>
    </div>
  );
}

export function PartnerDashboardDeliveryCardSkeleton() {
  return (
    <div className={PARTNER_DASHBOARD_TOP_CARD_CLASS}>
      <CardHeaderSkeleton withToggle />
      <div className="mb-2 grid grid-cols-3 gap-1.5">
        <MetricBoxSkeleton tall />
        <MetricBoxSkeleton tall />
        <MetricBoxSkeleton tall />
      </div>
      <div className="border-t border-slate-200/80 pt-2">
        <SectionLabelSkeleton />
        <div className="grid grid-cols-3 gap-1.5">
          <MetricBoxSkeleton tall />
          <MetricBoxSkeleton tall />
          <MetricBoxSkeleton tall />
        </div>
      </div>
    </div>
  );
}

export function PartnerDashboardStoreOverviewSkeleton() {
  return (
    <div className={PARTNER_DASHBOARD_TOP_CARD_CLASS}>
      <CardHeaderSkeleton />
      <div className="mb-2 grid grid-cols-3 gap-1.5">
        <MetricBoxSkeleton tall />
        <MetricBoxSkeleton tall />
        <MetricBoxSkeleton tall />
      </div>
      <div className="border-t border-slate-200/80 pt-2">
        <div className="mb-1.5 flex flex-nowrap items-center gap-2">
          <div className="h-6 w-6 shrink-0 animate-pulse rounded-md bg-slate-200/80" />
          <div className="flex flex-nowrap items-center gap-2">
            <div className="h-2.5 w-28 shrink-0 animate-pulse rounded bg-slate-200/80" />
            <div className="h-2 w-24 shrink-0 animate-pulse rounded bg-slate-200/60" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
          <MetricBoxSkeleton />
          <MetricBoxSkeleton />
          <MetricBoxSkeleton />
          <MetricBoxSkeleton />
        </div>
      </div>
    </div>
  );
}
