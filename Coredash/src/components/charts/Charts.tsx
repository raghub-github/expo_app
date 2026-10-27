"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { chartColors, palette } from "@/lib/theme";
import { formatCount, formatInr } from "@/lib/format";
import { ChartBox } from "@/components/charts/ChartBox";

const tooltipStyle = {
  background: "#fff",
  border: "1px solid #E4E7F7",
  borderRadius: 12,
  fontSize: 12,
};

export function RevenueArea({ data }: { data: { day: string; gmv: number; orders: number }[] }) {
  if (!data.length) {
    return (
      <div className="flex h-[280px] items-center justify-center text-[13px] text-[#6B6894]">
        No trend data in this period
      </div>
    );
  }
  return (
    <ChartBox>
      <AreaChart data={data}>
        <defs>
          <linearGradient id="gmvFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={palette.indigo} stopOpacity={0.28} />
            <stop offset="100%" stopColor={palette.indigo} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke={palette.line} vertical={false} />
        <XAxis dataKey="day" tick={{ fill: palette.muted, fontSize: 11 }} axisLine={false} tickLine={false} />
        <YAxis
          tick={{ fill: palette.muted, fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v) => formatInr(Number(v), true)}
        />
        <Tooltip
          contentStyle={tooltipStyle}
          formatter={(value, name) =>
            name === "gmv" ? formatInr(Number(value)) : formatCount(Number(value))
          }
        />
        <Area type="monotone" dataKey="gmv" stroke={palette.indigo} fill="url(#gmvFill)" strokeWidth={2} />
      </AreaChart>
    </ChartBox>
  );
}

export function ServiceBars({ data }: { data: { type: string; orders: number; gmv: number }[] }) {
  if (!data.length) {
    return (
      <div className="flex h-[280px] items-center justify-center text-[13px] text-[#6B6894]">
        No service volume in this period
      </div>
    );
  }
  return (
    <ChartBox>
      <BarChart data={data}>
        <CartesianGrid stroke={palette.line} vertical={false} />
        <XAxis dataKey="type" tick={{ fill: palette.muted, fontSize: 11 }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fill: palette.muted, fontSize: 11 }} axisLine={false} tickLine={false} />
        <Tooltip contentStyle={tooltipStyle} />
        <Legend />
        <Bar dataKey="orders" name="Orders" fill={palette.indigo} radius={[6, 6, 0, 0]} />
        <Bar dataKey="gmv" name="GMV" fill={palette.peri} radius={[6, 6, 0, 0]} />
      </BarChart>
    </ChartBox>
  );
}

export function HourlyLine({ data }: { data: { hour: number; orders: number }[] }) {
  const rows = data.map((d) => ({ ...d, label: `${String(d.hour).padStart(2, "0")}:00` }));
  return (
    <ChartBox>
      <LineChart data={rows}>
        <CartesianGrid stroke={palette.line} vertical={false} />
        <XAxis dataKey="label" tick={{ fill: palette.muted, fontSize: 10 }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fill: palette.muted, fontSize: 11 }} axisLine={false} tickLine={false} />
        <Tooltip contentStyle={tooltipStyle} />
        <Line type="monotone" dataKey="orders" stroke={palette.lavender} strokeWidth={2} dot={false} />
      </LineChart>
    </ChartBox>
  );
}

export function CompletionTrend({
  data,
}: {
  data: { day: string; orders: number; delivered: number; cancelled: number; failed: number }[];
}) {
  if (!data.length) {
    return (
      <div className="flex h-[280px] items-center justify-center text-[13px] text-[#6B6894]">
        No daily performance data
      </div>
    );
  }
  return (
    <ChartBox>
      <AreaChart data={data}>
        <defs>
          <linearGradient id="deliveredFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={palette.success} stopOpacity={0.28} />
            <stop offset="100%" stopColor={palette.success} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke={palette.line} vertical={false} />
        <XAxis dataKey="day" tick={{ fill: palette.muted, fontSize: 11 }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fill: palette.muted, fontSize: 11 }} axisLine={false} tickLine={false} />
        <Tooltip contentStyle={tooltipStyle} />
        <Legend />
        <Area
          type="monotone"
          dataKey="delivered"
          name="Delivered"
          stroke={palette.success}
          fill="url(#deliveredFill)"
          strokeWidth={2}
        />
        <Line type="monotone" dataKey="cancelled" name="Cancelled" stroke={palette.coral} strokeWidth={2} dot={false} />
        <Line type="monotone" dataKey="failed" name="Failed" stroke="#B91C1C" strokeWidth={2} dot={false} />
        <Line type="monotone" dataKey="orders" name="Orders" stroke={palette.indigo} strokeWidth={2} dot={false} />
      </AreaChart>
    </ChartBox>
  );
}

export function PerfBars({
  data,
}: {
  data: { type: string; completionRate: number; cancelRate: number; avgMinutes: number }[];
}) {
  if (!data.length) {
    return (
      <div className="flex h-[280px] items-center justify-center text-[13px] text-[#6B6894]">
        No service performance rows
      </div>
    );
  }
  return (
    <ChartBox>
      <BarChart data={data}>
        <CartesianGrid stroke={palette.line} vertical={false} />
        <XAxis dataKey="type" tick={{ fill: palette.muted, fontSize: 11 }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fill: palette.muted, fontSize: 11 }} axisLine={false} tickLine={false} />
        <Tooltip contentStyle={tooltipStyle} />
        <Legend />
        <Bar dataKey="completionRate" name="Completion %" fill={palette.success} radius={[6, 6, 0, 0]} />
        <Bar dataKey="cancelRate" name="Cancel %" fill={palette.coral} radius={[6, 6, 0, 0]} />
      </BarChart>
    </ChartBox>
  );
}

export function CtmBars({ data }: { data: { name: string; orders: number; ctm: number }[] }) {
  const rows = data.map((d) => ({
    ...d,
    name: d.name.length > 16 ? `${d.name.slice(0, 14)}…` : d.name,
  }));
  if (rows.length === 0) {
    return (
      <div className="flex h-[220px] items-center justify-center text-[13px] text-[#6B6894]">
        No delivered orders in this period
      </div>
    );
  }
  return (
    <ChartBox>
      <BarChart data={rows}>
        <CartesianGrid stroke={palette.line} vertical={false} />
        <XAxis dataKey="name" tick={{ fill: palette.muted, fontSize: 10 }} axisLine={false} tickLine={false} />
        <YAxis
          tick={{ fill: palette.muted, fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v) => formatInr(Number(v), true)}
        />
        <Tooltip
          contentStyle={tooltipStyle}
          formatter={(value, name) =>
            name === "CTM" ? formatInr(Number(value)) : formatCount(Number(value))
          }
        />
        <Legend />
        <Bar dataKey="orders" name="Orders" fill={palette.indigo} radius={[6, 6, 0, 0]} />
        <Bar dataKey="ctm" name="CTM" fill={palette.peri} radius={[6, 6, 0, 0]} />
      </BarChart>
    </ChartBox>
  );
}

export function SharePie({ data }: { data: { name: string; value: number }[] }) {
  const rows = data.filter((d) => d.value > 0);
  if (rows.length === 0) {
    return (
      <div className="flex h-[220px] items-center justify-center text-[13px] text-[#6B6894]">
        No values in this period
      </div>
    );
  }
  return (
    <ChartBox>
      <PieChart>
        <Pie data={rows} dataKey="value" nameKey="name" innerRadius={58} outerRadius={92} paddingAngle={3}>
          {rows.map((_, i) => (
            <Cell key={i} fill={chartColors[i % chartColors.length]} />
          ))}
        </Pie>
        <Tooltip contentStyle={tooltipStyle} />
        <Legend />
      </PieChart>
    </ChartBox>
  );
}
