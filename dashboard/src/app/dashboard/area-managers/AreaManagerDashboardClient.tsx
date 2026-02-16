"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  Store,
  Package,
  MapPin,
  AlertTriangle,
  UserCheck,
  UserX,
  Clock,
  Activity,
  Building2,
  Building,
} from "lucide-react";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";

interface MerchantMetrics {
  managerType: "MERCHANT";
  stores: { total: number; verified: number; pending: number; rejected: number; active: number };
  parents: { total: number };
  children: { total: number };
}

interface RiderMetrics {
  managerType: "RIDER";
  riders: { total: number; active: number; inactive: number; blocked: number };
  availability: { online: number; busy: number; offline: number };
  riderShortageAlerts: Array<{
    localityCode: string | null;
    totalRiders: number;
    activeRiders: number;
    online: number;
    busy: number;
    offline: number;
    isZeroCoverage: boolean;
    isLowAvailability: boolean;
  }>;
}

type MetricsData = MerchantMetrics | RiderMetrics;

function StatCard({
  title,
  value,
  icon: Icon,
  href,
  subtitle,
  bgColor = "bg-white",
  iconBgColor = "bg-gray-100",
  iconColor = "text-gray-600",
  textColor = "text-gray-900",
}: {
  title: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
  href?: string;
  subtitle?: string;
  bgColor?: string;
  iconBgColor?: string;
  iconColor?: string;
  textColor?: string;
}) {
  const content = (
    <div className={`rounded-lg border border-gray-200 ${bgColor} p-6 h-full flex flex-col`}>
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <p className="text-sm font-medium text-gray-600 mb-1">{title}</p>
          <p className={`text-3xl font-semibold ${textColor}`}>{value}</p>
          {subtitle != null && (
            <p className="mt-1 text-xs text-gray-500">{subtitle}</p>
          )}
        </div>
        <div className={`rounded-md ${iconBgColor} p-2`}>
          <Icon className={`h-5 w-5 ${iconColor}`} />
        </div>
      </div>
    </div>
  );
  if (href) {
    return (
      <Link href={href} className="block transition hover:shadow-md">
        {content}
      </Link>
    );
  }
  return content;
}

export function AreaManagerDashboardClient() {
  const [data, setData] = useState<MetricsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/area-manager/metrics", { credentials: "include" });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error(j?.error ?? "Failed to load metrics");
        }
        const json = await res.json();
        if (!cancelled) {
          setData(json.data);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Something went wrong");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <LoadingSpinner />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4">
        <p className="text-sm font-medium text-red-800">{error}</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <p className="text-gray-500">No metrics available.</p>
      </div>
    );
  }

  if (data.managerType === "MERCHANT") {
    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h2 className="text-2xl font-bold text-gray-900">Store Overview</h2>
        </div>
        <div className="grid gap-6 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
          <StatCard
            title="Parent Stores"
            value={data.parents.total}
            icon={Building2}
            href="/dashboard/area-managers/stores?filter=parent"
            bgColor="bg-white"
            iconBgColor="bg-gray-100"
            iconColor="text-gray-600"
            textColor="text-gray-900"
          />
          <StatCard
            title="Child Stores"
            value={data.children.total}
            icon={Building}
            href="/dashboard/area-managers/stores?filter=all"
            bgColor="bg-white"
            iconBgColor="bg-gray-100"
            iconColor="text-gray-600"
            textColor="text-gray-900"
          />
          <StatCard
            title="Verified Stores"
            value={data.stores.verified}
            icon={UserCheck}
            href="/dashboard/area-managers/stores?status=VERIFIED"
            bgColor="bg-white"
            iconBgColor="bg-gray-100"
            iconColor="text-gray-600"
            textColor="text-gray-900"
          />
          <StatCard
            title="Rejected Stores"
            value={data.stores.rejected}
            icon={UserX}
            href="/dashboard/area-managers/stores?status=REJECTED"
            bgColor="bg-white"
            iconBgColor="bg-gray-100"
            iconColor="text-gray-600"
            textColor="text-gray-900"
          />
          <StatCard
            title="Pending Stores"
            value={data.stores.pending}
            icon={Clock}
            href="/dashboard/area-managers/stores?status=PENDING"
            bgColor="bg-white"
            iconBgColor="bg-gray-100"
            iconColor="text-gray-600"
            textColor="text-gray-900"
          />
          <StatCard
            title="Active Stores"
            value={data.stores.active}
            icon={Activity}
            href="/dashboard/area-managers/stores"
            bgColor="bg-white"
            iconBgColor="bg-gray-100"
            iconColor="text-gray-600"
            textColor="text-gray-900"
          />
        </div>
      </div>
    );
  }

  const riderData = data as RiderMetrics;
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-2xl font-bold text-gray-900">Rider Overview</h2>
      </div>
      <div className="grid gap-6 grid-cols-1 md:grid-cols-2">
        <StatCard
          title="Total Riders"
          value={riderData.riders.total}
          icon={Package}
          href="/dashboard/area-managers/riders"
          bgColor="bg-gradient-to-br from-blue-50 to-blue-100"
          iconBgColor="bg-blue-500"
          iconColor="text-white"
          textColor="text-blue-700"
        />
        <StatCard
          title="Active Riders"
          value={riderData.riders.active}
          icon={UserCheck}
          href="/dashboard/area-managers/riders?status=ACTIVE"
          bgColor="bg-gradient-to-br from-green-50 to-green-100"
          iconBgColor="bg-green-500"
          iconColor="text-white"
          textColor="text-green-700"
        />
        <StatCard
          title="Inactive Riders"
          value={riderData.riders.inactive}
          icon={UserX}
          href="/dashboard/area-managers/riders?status=INACTIVE"
          bgColor="bg-gradient-to-br from-gray-50 to-gray-100"
          iconBgColor="bg-gray-500"
          iconColor="text-white"
          textColor="text-gray-700"
        />
        <StatCard
          title="Blocked Riders"
          value={riderData.riders.blocked}
          icon={UserX}
          href="/dashboard/area-managers/riders?status=BLOCKED"
          bgColor="bg-gradient-to-br from-red-50 to-red-100"
          iconBgColor="bg-red-500"
          iconColor="text-white"
          textColor="text-red-700"
        />
        <StatCard
          title="Available (Online)"
          value={riderData.availability.online}
          icon={Activity}
          href="/dashboard/area-managers/availability"
          subtitle="Currently available"
          bgColor="bg-gradient-to-br from-emerald-50 to-emerald-100"
          iconBgColor="bg-emerald-500"
          iconColor="text-white"
          textColor="text-emerald-700"
        />
        <StatCard
          title="Busy"
          value={riderData.availability.busy}
          icon={Clock}
          href="/dashboard/area-managers/availability"
          bgColor="bg-gradient-to-br from-amber-50 to-amber-100"
          iconBgColor="bg-amber-500"
          iconColor="text-white"
          textColor="text-amber-700"
        />
        <StatCard
          title="Offline"
          value={riderData.availability.offline}
          icon={MapPin}
          href="/dashboard/area-managers/availability"
          bgColor="bg-gradient-to-br from-slate-50 to-slate-100"
          iconBgColor="bg-slate-500"
          iconColor="text-white"
          textColor="text-slate-700"
        />
      </div>
      {riderData.riderShortageAlerts.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
          <div className="flex items-center gap-2 text-amber-800">
            <AlertTriangle className="h-5 w-5 flex-shrink-0" />
            <h3 className="font-medium">Rider shortage alerts</h3>
          </div>
          <ul className="mt-2 list-inside list-disc text-sm text-amber-700">
            {riderData.riderShortageAlerts.slice(0, 10).map((a, i) => (
              <li key={i}>
                Locality {a.localityCode ?? "(unspecified)"}: {a.totalRiders} riders
                {a.isZeroCoverage ? " (zero coverage)" : a.isLowAvailability ? " (low availability)" : ""}
              </li>
            ))}
          </ul>
          <Link
            href="/dashboard/area-managers/availability"
            className="mt-2 inline-block text-sm font-medium text-amber-800 underline"
          >
            View availability
          </Link>
        </div>
      )}
    </div>
  );
}
