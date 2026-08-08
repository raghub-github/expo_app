"use client";

import React from "react";
import {
  PARTNER_DASHBOARD_METRIC_BOX_SKELETON_CLASS,
  PARTNER_DASHBOARD_TOP_CARD_CLASS,
} from "./partner-dashboard-card-styles";

function MetricBoxSkeleton({ tall = false }: { tall?: boolean }) {
  return (
    <div className={`${PARTNER_DASHBOARD_METRIC_BOX_SKELETON_CLASS} ${tall ? "h-[58px]" : "h-[52px]"}`}>
      <div className="h-2 w-12 rounded bg-slate-200/80" />
      <div className="mt-2 h-4 w-8 rounded bg-slate-200/70" />
    </div>
  );
}

function CardHeaderSkeleton({ withToggle = false }: { withToggle?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-2 mb-3">
      <div className="flex items-center gap-2.5 min-w-0">
        <div className="h-9 w-9 shrink-0 rounded-lg bg-slate-200/80 animate-pulse" />
        <div className="space-y-1.5 min-w-0">
          <div className="h-2.5 w-24 rounded bg-slate-200/80 animate-pulse" />
          <div className="h-2 w-20 rounded bg-slate-200/60 animate-pulse" />
        </div>
      </div>
      {withToggle ? (
        <div className="h-5 w-24 shrink-0 rounded-full bg-slate-200/70 animate-pulse" />
      ) : (
        <div className="h-4 w-20 shrink-0 rounded bg-slate-200/60 animate-pulse" />
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
      <CardHeaderSkeleton withToggle />
      <div className="space-y-2">
        <div className={`${PARTNER_DASHBOARD_METRIC_BOX_SKELETON_CLASS} h-[62px] px-2.5 py-2`}>
          <div className="h-2 w-16 rounded bg-slate-200/80" />
          <div className="mt-2 h-5 w-40 rounded bg-slate-200/70" />
        </div>
        <div className={`${PARTNER_DASHBOARD_METRIC_BOX_SKELETON_CLASS} h-[52px] px-2.5 py-2`}>
          <div className="h-2 w-20 rounded bg-slate-200/80" />
          <div className="mt-2 h-3 w-full max-w-[240px] rounded bg-slate-200/70" />
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between gap-2 pt-2.5 border-t border-slate-200/80">
        <div className="space-y-1.5 flex-1">
          <div className="h-3 w-32 rounded bg-slate-200/80 animate-pulse" />
          <div className="h-2.5 w-40 rounded bg-slate-200/60 animate-pulse" />
        </div>
        <div className="h-6 w-11 shrink-0 rounded-full bg-slate-200/70 animate-pulse" />
      </div>
    </div>
  );
}

export function PartnerDashboardDeliveryCardSkeleton() {
  return (
    <div className={PARTNER_DASHBOARD_TOP_CARD_CLASS}>
      <CardHeaderSkeleton withToggle />
      <div className="grid grid-cols-3 gap-2 mb-3">
        <MetricBoxSkeleton tall />
        <MetricBoxSkeleton tall />
        <MetricBoxSkeleton tall />
      </div>
      <div className="border-t border-slate-200/80 pt-3">
        <SectionLabelSkeleton />
        <div className="grid grid-cols-3 gap-2">
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
      <div className="grid grid-cols-3 gap-2 mb-3">
        <MetricBoxSkeleton tall />
        <MetricBoxSkeleton tall />
        <MetricBoxSkeleton tall />
      </div>
      <div className="border-t border-slate-200/80 pt-3">
        <div className="flex items-center gap-2 mb-2.5">
          <div className="h-7 w-7 shrink-0 rounded-md bg-slate-200/80 animate-pulse" />
          <div className="space-y-1">
            <div className="h-2.5 w-28 rounded bg-slate-200/80 animate-pulse" />
            <div className="h-2 w-24 rounded bg-slate-200/60 animate-pulse" />
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <MetricBoxSkeleton />
          <MetricBoxSkeleton />
          <MetricBoxSkeleton />
          <MetricBoxSkeleton />
        </div>
      </div>
    </div>
  );
}
