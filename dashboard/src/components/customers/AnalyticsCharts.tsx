"use client";

import {
  LineChart,
  Line,
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

interface AnalyticsChartsProps {
  stats: DashboardStats;
  loading?: boolean;
}

export function AnalyticsCharts({ stats, loading = false }: AnalyticsChartsProps) {
  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm"
            >
              <div className="h-64 bg-gray-100 rounded animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Format growth trend data
  const growthTrendData = stats.growthTrend.map((item) => ({
    month: item.month.split("-")[1] + "/" + item.month.split("-")[0].slice(2),
    newUsers: item.newUsers,
    totalUsers: item.totalUsers,
  }));

  // Format user-order relationship data
  const userOrderData = stats.userOrderRelationship.map((item) => ({
    range: item.orderCountRange,
    users: item.userCount,
  }));

  // Format revenue trend data
  const revenueTrendData = stats.revenueTrend.map((item) => ({
    month: item.month.split("-")[1] + "/" + item.month.split("-")[0].slice(2),
    food: Number(item.foodRevenue.toFixed(2)),
    parcel: Number(item.parcelRevenue.toFixed(2)),
    person: Number(item.personRevenue.toFixed(2)),
    total: Number(item.totalRevenue.toFixed(2)),
  }));

  // Service-wise performance
  const servicePerformanceData = stats.serviceStats
    .filter((s) => s.orderType !== "all")
    .map((service) => ({
      service:
        service.orderType === "food"
          ? "Food"
          : service.orderType === "parcel"
          ? "Parcel"
          : "Person Ride",
      users: service.totalUsers,
      orders: service.totalOrders,
      revenue: Number(service.totalRevenue.toFixed(2)),
    }));

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-semibold text-gray-900">
        Analytics & Insights
      </h2>

      {/* User Growth Trends */}
      <div className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          User Growth Trends (Last 12 Months)
        </h3>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={growthTrendData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="month" />
            <YAxis />
            <Tooltip />
            <Legend />
            <Line
              type="monotone"
              dataKey="newUsers"
              stroke="#3b82f6"
              strokeWidth={2}
              name="New Users"
            />
            <Line
              type="monotone"
              dataKey="totalUsers"
              stroke="#10b981"
              strokeWidth={2}
              name="Total Users"
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* User-Order Relationship */}
      <div className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          User-Order Relationship
        </h3>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={userOrderData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="range" />
            <YAxis />
            <Tooltip />
            <Bar dataKey="users" fill="#8b5cf6" name="Number of Users" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Service-wise Performance */}
      <div className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          Service-wise Performance
        </h3>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={servicePerformanceData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="service" />
            <YAxis yAxisId="left" />
            <YAxis yAxisId="right" orientation="right" />
            <Tooltip />
            <Legend />
            <Bar
              yAxisId="left"
              dataKey="users"
              fill="#3b82f6"
              name="Users"
            />
            <Bar
              yAxisId="left"
              dataKey="orders"
              fill="#10b981"
              name="Orders"
            />
            <Bar
              yAxisId="right"
              dataKey="revenue"
              fill="#f59e0b"
              name="Revenue (₹)"
            />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Revenue Growth Trends */}
      <div className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          Revenue Growth Trends (Last 12 Months)
        </h3>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={revenueTrendData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="month" />
            <YAxis />
            <Tooltip
              formatter={(value) =>
                value != null ? `₹${Number(value).toLocaleString()}` : ""
              }
            />            <Legend />
            <Line
              type="monotone"
              dataKey="food"
              stroke="#f97316"
              strokeWidth={2}
              name="Food Revenue"
            />
            <Line
              type="monotone"
              dataKey="parcel"
              stroke="#a855f7"
              strokeWidth={2}
              name="Parcel Revenue"
            />
            <Line
              type="monotone"
              dataKey="person"
              stroke="#22c55e"
              strokeWidth={2}
              name="Person Ride Revenue"
            />
            <Line
              type="monotone"
              dataKey="total"
              stroke="#3b82f6"
              strokeWidth={3}
              name="Total Revenue"
              strokeDasharray="5 5"
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
