"use client";

import { useEffect, useState } from "react";
import {
  Wallet,
  Power,
  Truck,
  Package,
  Users,
  TrendingUp,
  XCircle,
  BarChart3,
  Clock,
  CheckCircle2,
  Calendar,
  ArrowRight,
} from "lucide-react";
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { useStore } from "@/hooks/useStore";
import {
  useStoreWalletQuery,
  useStoreOperationsQuery,
  useStoreStatsQuery,
} from "@/hooks/queries/useMerchantStoreQueries";

function StatCard({
  title,
  value,
  icon,
  color,
}: {
  title: string;
  value: string | number;
  icon: React.ReactNode;
  color: "orange" | "blue" | "emerald" | "purple";
}) {
  const colorClasses = {
    orange: "bg-orange-500/10 border-orange-200",
    blue: "bg-blue-500/10 border-blue-200",
    emerald: "bg-emerald-500/10 border-emerald-200",
    purple: "bg-purple-500/10 border-purple-200",
  };
  const textColors = {
    orange: "text-orange-700",
    blue: "text-blue-700",
    emerald: "text-emerald-700",
    purple: "text-purple-700",
  };
  return (
    <div
      className={`rounded-xl border p-3 shadow-sm bg-white ${colorClasses[color]}`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] sm:text-xs text-gray-600 font-medium truncate">{title}</p>
          <p className="text-lg sm:text-xl font-bold text-gray-900 truncate">{value}</p>
        </div>
        <div className={`p-1.5 rounded-lg flex-shrink-0 ${textColors[color]}`}>{icon}</div>
      </div>
    </div>
  );
}

export function StoreOverviewDashboard({ storeId }: { storeId: string }) {
  const [statsDate, setStatsDate] = useState("");
  const { store: storeFromHook, isLoading: storeLoading } = useStore(storeId);
  const walletQuery = useStoreWalletQuery(storeId);
  const operationsQuery = useStoreOperationsQuery(storeId);
  const statsQuery = useStoreStatsQuery(storeId, statsDate || undefined, {
    refetchInterval: 15000,
  });

  useEffect(() => {
    if (typeof window !== "undefined" && !statsDate) {
      setStatsDate(new Date().toISOString().slice(0, 10));
    }
  }, [statsDate]);

  const store = storeFromHook
    ? { store_id: storeFromHook.store_id ?? "", name: storeFromHook.name ?? "" }
    : null;
  const wallet =
    walletQuery.isSuccess && walletQuery.data
      ? (walletQuery.data as {
          available_balance?: number;
          today_earning?: number;
          yesterday_earning?: number;
          pending_balance?: number;
        })
      : null;
  const operations =
    operationsQuery.isSuccess && operationsQuery.data
      ? (operationsQuery.data as {
          operational_status?: string;
          today_slots?: { start: string; end: string }[];
          restriction_type?: string | null;
        })
      : null;
  const stats =
    statsQuery.isSuccess && statsQuery.data
      ? (statsQuery.data as {
          pendingCount?: number;
          acceptedTodayCount?: number;
          preparingCount?: number;
          outForDeliveryCount?: number;
          deliveredTodayCount?: number;
          cancelledTodayCount?: number;
          totalRevenueToday?: number;
          avgPreparationTimeMinutes?: number;
          acceptanceRatePercent?: number;
        })
      : null;

  const loading =
    storeLoading ||
    walletQuery.isLoading ||
    operationsQuery.isLoading ||
    statsQuery.isLoading;
  const loadError =
    walletQuery.isError || operationsQuery.isError || statsQuery.isError
      ? "Failed to load store data. Please try again."
      : null;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
      </div>
    );
  }

  if (loadError) {
    const refetch = () => {
      walletQuery.refetch();
      operationsQuery.refetch();
      statsQuery.refetch();
    };
    return (
      <div className="rounded-xl border border-red-200 bg-red-50/80 p-6 text-center">
        <p className="text-sm font-medium text-red-800">{loadError}</p>
        <button
          type="button"
          onClick={() => refetch()}
          className="mt-3 cursor-pointer rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
        >
          Retry
        </button>
      </div>
    );
  }

  const isOpen = operations?.operational_status === "OPEN";
  const pendingOrders = stats?.pendingCount ?? 0;
  const acceptedCount = stats?.acceptedTodayCount ?? 0;
  const preparingOrders = stats?.preparingCount ?? 0;
  const deliveredToday = stats?.deliveredTodayCount ?? 0;
  const cancelledOrders = stats?.cancelledTodayCount ?? 0;
  const revenueToday = stats?.totalRevenueToday ?? 0;
  const avgPrepTime = stats?.avgPreparationTimeMinutes ?? 0;
  const acceptanceRate = stats?.acceptanceRatePercent ?? 0;
  const outForDelivery = stats?.outForDeliveryCount ?? 0;

  const walletAvailable = wallet?.available_balance ?? 0;
  const walletToday = wallet?.today_earning ?? 0;
  const walletYesterday = wallet?.yesterday_earning ?? 0;
  const walletPending = wallet?.pending_balance ?? 0;

  const slots = operations?.today_slots ?? [];
  const openingTime = slots[0]?.start ?? "09:00";
  const closingTime = slots[0]?.end ?? "23:00";

  const ordersTrend = [
    { day: "Mon", orders: 0 },
    { day: "Tue", orders: 0 },
    { day: "Wed", orders: 0 },
    { day: "Thu", orders: 0 },
    { day: "Fri", orders: 0 },
    { day: "Sat", orders: 0 },
    { day: "Sun", orders: 0 },
  ];
  const revenueByDay = [
    { d: "Mon", rev: 0 },
    { d: "Tue", rev: 0 },
    { d: "Wed", rev: 0 },
    { d: "Thu", rev: 0 },
    { d: "Fri", rev: 0 },
    { d: "Sat", rev: 0 },
    { d: "Sun", rev: 0 },
  ];

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="rounded-xl border border-emerald-200/80 bg-gradient-to-br from-emerald-50/90 to-green-50/70 p-4 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <div className="p-1.5 rounded-lg bg-emerald-500/20">
              <Wallet className="h-4 w-4 text-emerald-700" />
            </div>
            <p className="text-[10px] font-semibold text-gray-600 uppercase">Wallet &amp; Earnings</p>
          </div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-2">
            <div>
              <p className="text-[9px] font-medium text-gray-500 uppercase">Available</p>
              <p className="text-sm font-bold text-emerald-800">
                ₹{Number(walletAvailable).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
            </div>
            <div>
              <p className="text-[9px] font-medium text-gray-500 uppercase">Today</p>
              <p className="text-sm font-bold text-orange-700">
                ₹{Number(walletToday).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
            </div>
            <div>
              <p className="text-[9px] font-medium text-gray-500 uppercase">Yesterday</p>
              <p className="text-sm font-bold text-slate-700">
                ₹{Number(walletYesterday).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
            </div>
            <div>
              <p className="text-[9px] font-medium text-gray-500 uppercase">Pending</p>
              <p className="text-sm font-bold text-violet-700">
                ₹{Number(walletPending).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
            </div>
          </div>
        </div>

        <div
          className={`rounded-xl border-2 p-4 shadow-sm ${
            isOpen
              ? "bg-gradient-to-br from-emerald-50/90 to-green-50/70 border-emerald-200"
              : "bg-gradient-to-br from-red-50/90 to-rose-50/70 border-red-200"
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-[10px] font-semibold text-gray-500 uppercase">Store Status</p>
              <p className="text-xs font-bold text-gray-900">
                {openingTime} – {closingTime}
              </p>
            </div>
            <div
              className={`p-2 rounded-xl ${
                isOpen ? "bg-emerald-500 text-white" : "bg-red-500 text-white"
              }`}
            >
              <Power className="h-4 w-4" />
            </div>
          </div>
          <div
            className={`flex items-center gap-1.5 mt-2 p-2 rounded-lg border ${
              isOpen ? "bg-emerald-100/40 border-emerald-300" : "bg-red-100/40 border-red-300"
            }`}
          >
            <div
              className={`w-2 h-2 rounded-full ${isOpen ? "bg-emerald-500 animate-pulse" : "bg-red-500"}`}
            />
            <span
              className={`text-xs font-bold ${isOpen ? "text-emerald-700" : "text-red-700"}`}
            >
              {isOpen ? "Open" : "Closed"}
            </span>
          </div>
        </div>

        <div className="rounded-xl border border-gray-200/80 bg-white p-4 shadow-sm">
          <p className="text-[10px] font-semibold text-gray-500 uppercase mb-2">Delivery mode</p>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-violet-700">GatiMitra</span>
            <span className="text-[10px] text-gray-500">Platform riders</span>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-stretch gap-4">
        <div className="flex items-center gap-2 shrink-0">
          <Calendar className="h-4 w-4 text-gray-500" />
          <span className="text-xs font-medium text-gray-700">Date:</span>
          <input
            type="date"
            value={statsDate}
            onChange={(e) => setStatsDate(e.target.value)}
            className="text-xs border border-gray-300 rounded-lg px-2 py-1.5 text-gray-900"
          />
          <button
            type="button"
            onClick={() => setStatsDate(new Date().toISOString().slice(0, 10))}
            className="text-xs font-medium text-indigo-600 hover:text-indigo-700"
          >
            Today
          </button>
        </div>
        <div className="flex-1 min-w-[280px] rounded-xl border border-indigo-200/60 bg-gradient-to-r from-white to-slate-50/80 px-4 py-3 shadow-sm">
          <h3 className="text-sm font-bold text-gray-900 mb-2 flex items-center gap-1.5">
            <span className="w-1.5 h-4 rounded-full bg-indigo-500" />
            Order flow {statsDate ? `(${statsDate})` : ""}
          </h3>
          <div className="flex flex-wrap items-center gap-3 py-1">
            {["Placed", "Accepted", "Preparing", "Delivered"].map((step, i) => (
              <div key={step} className="flex items-center gap-2">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shadow-sm ${
                    i === 0
                      ? "bg-orange-500 text-white ring-2 ring-orange-200"
                      : i === 3
                        ? "bg-emerald-500 text-white ring-2 ring-emerald-200"
                        : "bg-slate-100 text-slate-700 border border-slate-200"
                  }`}
                >
                  {[pendingOrders, acceptedCount, preparingOrders, deliveredToday][i]}
                </div>
                <span className="text-xs font-semibold text-gray-800">{step}</span>
                {i < 3 && <ArrowRight className="h-3.5 w-3.5 text-orange-300 flex-shrink-0" />}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
        <StatCard title="Pending" value={pendingOrders} icon={<Package className="h-4 w-4" />} color="orange" />
        <StatCard title="Preparing" value={preparingOrders} icon={<Users className="h-4 w-4" />} color="blue" />
        <StatCard title="Out for Delivery" value={outForDelivery} icon={<Truck className="h-4 w-4" />} color="purple" />
        <StatCard title="Delivered Today" value={deliveredToday} icon={<TrendingUp className="h-4 w-4" />} color="emerald" />
        <StatCard title="Cancelled" value={cancelledOrders} icon={<XCircle className="h-4 w-4" />} color="orange" />
        <StatCard
          title="Today's Revenue"
          value={`₹${(revenueToday / 1000).toFixed(0)}k`}
          icon={<BarChart3 className="h-4 w-4" />}
          color="purple"
        />
        <StatCard title="Avg Prep (min)" value={avgPrepTime} icon={<Clock className="h-4 w-4" />} color="blue" />
        <StatCard
          title="Acceptance %"
          value={`${acceptanceRate}%`}
          icon={<CheckCircle2 className="h-4 w-4" />}
          color="emerald"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <h3 className="text-sm font-bold text-gray-900 mb-3">Orders trend</h3>
          <div className="h-[180px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={ordersTrend} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="day" tick={{ fontSize: 11 }} stroke="#94a3b8" />
                <YAxis tick={{ fontSize: 11 }} stroke="#94a3b8" />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                <Line type="monotone" dataKey="orders" stroke="#f97316" strokeWidth={2} dot={{ fill: "#f97316", r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <h3 className="text-sm font-bold text-gray-900 mb-3">Revenue</h3>
          <div className="h-[180px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={revenueByDay} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="#8b5cf6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="d" tick={{ fontSize: 11 }} stroke="#94a3b8" />
                <YAxis tick={{ fontSize: 11 }} stroke="#94a3b8" />
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                <Area type="monotone" dataKey="rev" stroke="#8b5cf6" fill="url(#revGrad)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}
