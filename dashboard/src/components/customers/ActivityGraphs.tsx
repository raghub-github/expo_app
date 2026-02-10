"use client";

import {
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { DashboardStats } from "@/lib/db/operations/customer-stats";

interface ActivityGraphsProps {
  stats: DashboardStats;
  loading?: boolean;
}

export function ActivityGraphs({ stats, loading = false }: ActivityGraphsProps) {
  if (loading) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {[1, 2].map((i) => (
          <div
            key={i}
            className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm"
          >
            <div className="h-64 bg-gray-100 rounded animate-pulse" />
          </div>
        ))}
      </div>
    );
  }

  // Daily activity data (last 30 days) - using growth trend data
  const dailyActivityData = stats.growthTrend.slice(-30).map((item) => ({
    date: item.month.split("-")[1] + "/" + item.month.split("-")[0].slice(2),
    newUsers: item.newUsers,
    totalUsers: item.totalUsers,
  }));

  // User activity by status
  const activityByStatus = [
    { status: "Active", count: stats.activeUsers, color: "#10b981" },
    { status: "Inactive", count: stats.inactiveUsers, color: "#f59e0b" },
    { status: "Suspended", count: stats.suspendedUsers, color: "#ef4444" },
    { status: "New (30d)", count: stats.newUsers, color: "#3b82f6" },
  ].map((item) => ({
    ...item,
    fill: item.color, // Add fill property for Bar component
  }));

  // Service activity comparison
  const serviceActivity = [
    {
      service: "Food",
      users: stats.foodUsers,
      color: "#f97316",
    },
    {
      service: "Parcel",
      users: stats.parcelUsers,
      color: "#a855f7",
    },
    {
      service: "Person Ride",
      users: stats.personUsers,
      color: "#22c55e",
    },
  ];

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-semibold text-gray-900">Activity Overview</h2>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Daily User Activity */}
        <div className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            Daily User Activity (Last 30 Days)
          </h3>
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={dailyActivityData}>
              <defs>
                <linearGradient id="colorNewUsers" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.8} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="colorTotalUsers" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.8} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Area
                type="monotone"
                dataKey="newUsers"
                stroke="#3b82f6"
                fillOpacity={1}
                fill="url(#colorNewUsers)"
                name="New Users"
              />
              <Area
                type="monotone"
                dataKey="totalUsers"
                stroke="#10b981"
                fillOpacity={1}
                fill="url(#colorTotalUsers)"
                name="Total Users"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* User Activity by Status */}
        <div className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            User Activity by Status
          </h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={activityByStatus}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="status" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="count" name="User Count" fill="#3b82f6" />
            </BarChart>
          </ResponsiveContainer>
          <div className="mt-4 grid grid-cols-2 gap-4">
            {activityByStatus.map((item) => (
              <div key={item.status} className="flex items-center gap-2">
                <div
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: item.color }}
                />
                <span className="text-sm text-gray-600">{item.status}:</span>
                <span className="text-sm font-semibold text-gray-900">
                  {item.count.toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Service Activity Comparison */}
        <div className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            Service Activity Comparison
          </h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={serviceActivity}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="service" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="users" name="Users" fill="#3b82f6" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* User Engagement Trend */}
        <div className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            User Engagement Trend
          </h3>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={dailyActivityData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Line
                type="monotone"
                dataKey="newUsers"
                stroke="#3b82f6"
                strokeWidth={2}
                name="New Users"
                dot={{ r: 4 }}
              />
              <Line
                type="monotone"
                dataKey="totalUsers"
                stroke="#10b981"
                strokeWidth={2}
                name="Total Users"
                dot={{ r: 4 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
