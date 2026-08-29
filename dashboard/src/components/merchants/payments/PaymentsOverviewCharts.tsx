"use client";

import React, { useMemo } from "react";
import { Loader2, TrendingDown, TrendingUp, Package } from "lucide-react";
import { formatInr, formatInrCompact } from "@/lib/format-inr";

export type WalletAnalyticsPeriod = "week" | "month" | "quarter";

export type WalletAnalytics = {
  series: { date: string; label: string; earnings: number; withdrawals: number }[];
  period_total_earnings: number;
  period_total_withdrawals: number;
  period_transaction_count: number;
  total_earned: number;
};

export type PayoutSummary = {
  paid: number;
  in_process: number;
  pending: number;
  failed: number;
  total: number;
};

function buildDualLineChart(
  series: { earnings: number; withdrawals: number }[],
  width: number,
  height: number,
  padL: number,
  padT: number,
  padB: number
) {
  const plotW = width - padL - 8;
  const plotH = height - padT - padB;
  const maxY = Math.max(1, ...series.flatMap((p) => [p.earnings, p.withdrawals]));
  const n = series.length;
  const step = n <= 1 ? 0 : plotW / (n - 1);
  const xAt = (i: number) => padL + (n <= 1 ? plotW / 2 : i * step);
  const yAt = (v: number) => padT + plotH - (v / maxY) * plotH;

  const earnPts = series.map((p, i) => `${xAt(i).toFixed(1)},${yAt(p.earnings).toFixed(1)}`);
  const wdPts = series.map((p, i) => `${xAt(i).toFixed(1)},${yAt(p.withdrawals).toFixed(1)}`);
  const baseY = padT + plotH;

  const area = (pts: string[]) => {
    if (!pts.length) return '';
    const first = pts[0].split(',');
    const last = pts[pts.length - 1].split(',');
    return `M ${pts[0]} L ${pts.slice(1).join(' L ')} L ${last[0]},${baseY} L ${first[0]},${baseY} Z`;
  };

  const yTicks = [0, 0.33, 0.66, 1].map((f) => ({
    y: padT + plotH - f * plotH,
    label: formatInrCompact(Math.round(maxY * f)),
  }));

  return {
    earnPts: earnPts.join(' '),
    wdPts: wdPts.join(' '),
    earnArea: area(earnPts),
    wdArea: area(wdPts),
    yTicks,
    baseY,
    xAt,
  };
}

function donutSegments(summary: { paid: number; in_process: number; pending: number; failed: number }) {
  const parts = [
    { value: summary.paid, color: '#10b981' },
    { value: summary.pending, color: '#f59e0b' },
    { value: summary.in_process, color: '#8b5cf6' },
    { value: summary.failed, color: '#a855f7' },
  ];
  const total = parts.reduce((s, p) => s + p.value, 0);
  if (total <= 0) return { total: 0, arcs: [] as { color: string; dash: string; offset: number }[] };
  const c = 2 * Math.PI * 45;
  let offset = 0;
  const arcs = parts
    .filter((p) => p.value > 0)
    .map((p) => {
      const len = (p.value / total) * c;
      const arc = { color: p.color, dash: `${len} ${c - len}`, offset: -offset };
      offset += len;
      return arc;
    });
  return { total, arcs };
}

type Props = {
  analyticsPeriod: WalletAnalyticsPeriod;
  onAnalyticsPeriodChange: (p: WalletAnalyticsPeriod) => void;
  analytics?: WalletAnalytics;
  analyticsLoading: boolean;
  payoutSummary: PayoutSummary;
  payoutsLoading: boolean;
};

export function PaymentsOverviewCharts({
  analyticsPeriod,
  onAnalyticsPeriodChange,
  analytics,
  analyticsLoading,
  payoutSummary,
  payoutsLoading,
}: Props) {
  const chartSeries = analytics?.series ?? [];
  const chartGeom = useMemo(
    () => buildDualLineChart(chartSeries, 280, 160, 30, 10, 20),
    [chartSeries]
  );

  const donut = useMemo(() => donutSegments(payoutSummary), [payoutSummary]);
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div className="bg-white rounded-lg shadow-sm p-4 border border-gray-200 min-w-0">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-gray-900">Earnings Overview</h3>
          <select
            className="text-xs border border-gray-300 rounded px-2.5 py-1 bg-white text-gray-600 hover:border-gray-400"
            value={analyticsPeriod}
            onChange={(e) => onAnalyticsPeriodChange(e.target.value as WalletAnalyticsPeriod)}
          >
            <option value="week">This Week</option>
            <option value="month">This Month</option>
            <option value="quarter">Last 3 months</option>
          </select>
        </div>

        <div className="flex gap-4">
          <div className="flex-1">
            <div className="h-40 flex items-center justify-center relative">
              {analyticsLoading ? (
                <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
              ) : chartSeries.length === 0 ? (
                <p className="text-xs text-gray-500">No transactions in this period</p>
              ) : (
                <svg viewBox="0 0 280 160" className="w-full h-full" style={{ maxWidth: '100%' }}>
                  {chartGeom.yTicks.map((t, i) => (
                    <g key={i}>
                      <line
                        x1="30"
                        y1={t.y}
                        x2="270"
                        y2={t.y}
                        stroke={i === 0 ? '#e5e7eb' : '#f3f4f6'}
                        strokeWidth="1"
                      />
                      <text x="0" y={t.y} fontSize="10" fill="#9ca3af" textAnchor="end" dominantBaseline="middle">
                        {t.label}
                      </text>
                    </g>
                  ))}
                  <line x1="30" y1="10" x2="30" y2={chartGeom.baseY} stroke="#d1d5db" strokeWidth="1.5" />
                  <line x1="30" y1={chartGeom.baseY} x2="270" y2={chartGeom.baseY} stroke="#d1d5db" strokeWidth="1.5" />
                  {chartGeom.earnArea ? <path d={chartGeom.earnArea} fill="#d1fae5" opacity="0.6" /> : null}
                  {chartGeom.wdArea ? <path d={chartGeom.wdArea} fill="#fed7aa" opacity="0.6" /> : null}
                  {chartGeom.earnPts ? (
                    <polyline
                      points={chartGeom.earnPts}
                      fill="none"
                      stroke="#10b981"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  ) : null}
                  {chartGeom.wdPts ? (
                    <polyline
                      points={chartGeom.wdPts}
                      fill="none"
                      stroke="#f97316"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  ) : null}
                  {chartSeries.map((p, i) => {
                    const x = chartGeom.xAt(i);
                    const show =
                      analyticsPeriod === 'week' ||
                      i === 0 ||
                      i === chartSeries.length - 1 ||
                      i % Math.max(1, Math.ceil(chartSeries.length / 7)) === 0;
                    if (!show) return null;
                    return (
                      <text
                        key={p.date}
                        x={x}
                        y="158"
                        fontSize="9"
                        fill="#9ca3af"
                        textAnchor="middle"
                        fontWeight="500"
                      >
                        {p.label}
                      </text>
                    );
                  })}
                </svg>
              )}
            </div>
            <div className="flex items-center justify-start gap-4 mt-2">
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-full bg-emerald-500" />
                <span className="text-xs text-gray-600 font-medium">Earnings</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-full bg-orange-500" />
                <span className="text-xs text-gray-600 font-medium">Withdrawals</span>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-4 min-w-fit">
            <div className="flex items-start gap-2.5">
              <div className="p-2 rounded-lg bg-emerald-100 flex-shrink-0">
                <TrendingUp size={16} className="text-emerald-600" />
              </div>
              <div>
                <p className="text-xs text-gray-600 font-medium">Period earnings</p>
                <p className="text-lg font-bold text-gray-900 mt-0.5">
                  {formatInr(analytics?.period_total_earnings ?? 0)}
                </p>
              </div>
            </div>
            <div className="flex items-start gap-2.5">
              <div className="p-2 rounded-lg bg-orange-100 flex-shrink-0">
                <TrendingDown size={16} className="text-orange-600" />
              </div>
              <div>
                <p className="text-xs text-gray-600 font-medium">Period withdrawals</p>
                <p className="text-lg font-bold text-gray-900 mt-0.5">
                  {formatInr(analytics?.period_total_withdrawals ?? 0)}
                </p>
              </div>
            </div>
            <div className="flex items-start gap-2.5">
              <div className="p-2 rounded-lg bg-blue-100 flex-shrink-0">
                <Package size={16} className="text-blue-600" />
              </div>
              <div>
                <p className="text-xs text-gray-600 font-medium">Transactions</p>
                <p className="text-lg font-bold text-gray-900 mt-0.5">
                  {analytics?.period_transaction_count ?? 0}
                </p>
                <p className="text-[10px] text-gray-500 mt-0.5">
                  Lifetime {formatInr(analytics?.total_earned ?? 0)} earned
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm p-4 border border-gray-200 flex flex-col min-w-0">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-gray-900">Payout Summary</h3>
          <button
            type="button"
            className="text-xs font-medium text-blue-600 hover:text-blue-700"
            onClick={() =>
              document.getElementById('payments-ledger-section')?.scrollIntoView({ behavior: 'smooth' })
            }
          >
            View ledger →
          </button>
        </div>
        <div className="flex flex-col sm:flex-row items-center sm:items-start justify-start gap-8 flex-1">
          <div className="flex-shrink-0">
            <div className="relative w-40 h-40 sm:w-44 sm:h-44">
              {payoutsLoading ? (
                <div className="absolute inset-0 flex items-center justify-center">
                  <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
                </div>
              ) : (
                <svg viewBox="0 0 120 120" className="w-full h-full transform -rotate-90">
                  <circle cx="60" cy="60" r="45" fill="none" stroke="#e5e7eb" strokeWidth="10" />
                  {donut.arcs.map((arc, i) => (
                    <circle
                      key={i}
                      cx="60"
                      cy="60"
                      r="45"
                      fill="none"
                      stroke={arc.color}
                      strokeWidth="10"
                      strokeDasharray={arc.dash}
                      strokeDashoffset={arc.offset}
                    />
                  ))}
                </svg>
              )}
              <div className="absolute inset-0 flex flex-col items-center justify-center px-2 text-center">
                <p className="text-lg font-bold text-gray-900 leading-tight">{formatInr(payoutSummary.total)}</p>
                <p className="text-xs text-gray-500 font-medium">Total Payout</p>
              </div>
            </div>
          </div>
          <div className="flex-1 w-full max-w-md space-y-3 sm:pt-2">
            {(
              [
                ['Paid', payoutSummary.paid, 'bg-emerald-500'],
                ['Pending', payoutSummary.pending, 'bg-amber-500'],
                ['Hold', payoutSummary.in_process, 'bg-violet-500'],
                ['Failed', payoutSummary.failed, 'bg-purple-500'],
              ] as const
            ).map(([label, amt, dot]) => (
              <div key={label} className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-2.5">
                  <div className={`w-3 h-3 rounded-full ${dot}`} />
                  <span className="text-sm text-gray-700 font-medium">{label}</span>
                </div>
                <span className="text-sm font-semibold text-gray-900 tabular-nums">{formatInr(amt)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

    </div>
  );
}
