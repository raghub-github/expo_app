"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CustomerWithStats } from "@/lib/db/operations/customers";
import { buildCustomerDetailQueryString } from "@/lib/navigation/customer-dashboard-from-order";
import {
  resolveTrustTier,
  TRUST_TIER_LABEL,
  trustTierBadgeClass,
  type CustomerTrustTier,
} from "@/lib/customers/trust-tier";

interface CustomerTableProps {
  customers: CustomerWithStats[];
  loading?: boolean;
  pageType?: "all" | "food" | "parcel" | "person_ride";
  /** Preserved in links so the header search bar stays after opening a customer. */
  searchQuery?: string;
  onPageChange?: (page: number) => void;
  currentPage?: number;
  totalPages?: number;
}

const STATUS_COLORS: Record<string, string> = {
  ACTIVE: "bg-green-100 text-green-800",
  INACTIVE: "bg-gray-100 text-gray-800",
  SUSPENDED: "bg-yellow-100 text-yellow-800",
  BLOCKED: "bg-red-100 text-red-800",
  DELETED: "bg-red-100 text-red-800",
};

export function CustomerTable({
  customers,
  loading = false,
  pageType = "all",
  searchQuery,
  onPageChange,
  currentPage = 1,
  totalPages = 1,
}: CustomerTableProps) {
  const urlSearchParams = useSearchParams();
  const searchSuffix = buildCustomerDetailQueryString({
    search: searchQuery,
    fromOrderSource: urlSearchParams,
  });
  const formatCurrency = (amount: number | null | undefined) => {
    if (amount === null || amount === undefined) return "₹0.00";
    return `₹${Number(amount).toFixed(2)}`;
  };

  const formatDate = (date: Date | string | null | undefined) => {
    if (!date) return "Never";
    const d = new Date(date);
    return d.toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  };

  const getOrderStatsForType = (
    stats: CustomerWithStats["orderStats"],
    type: "food" | "parcel" | "person_ride"
  ) => {
    return stats.find((s) => s.orderType === type) || {
      orderType: type,
      totalOrders: 0,
      totalSpent: 0,
      lastOrderAt: null,
    };
  };

  const getAllOrderTypes = (stats: CustomerWithStats["orderStats"]) => {
    const types = stats.map((s) => s.orderType).filter(Boolean) as string[];
    return types.length > 0 ? types.join(", ") : "None";
  };

  const getTotalOrders = (stats: CustomerWithStats["orderStats"]) => {
    return stats.reduce((sum, s) => sum + s.totalOrders, 0);
  };

  const getTotalSpent = (stats: CustomerWithStats["orderStats"]) => {
    return stats.reduce((sum, s) => sum + s.totalSpent, 0);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-gray-500">Loading customers...</div>
      </div>
    );
  }

  if (customers.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500">
        No customers found. Data will be loaded here.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-teal-200/60 bg-gradient-to-br from-[#E6F6F5]/80 to-white shadow-sm ring-1 ring-teal-900/5">
      <table className="min-w-full divide-y divide-teal-100/80">
        <thead className="bg-[#0f2d42]/90">
          <tr>
            <th className="px-6 py-3 text-left text-xs font-medium text-white/90 uppercase tracking-wider">
              Customer ID
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-white/90 uppercase tracking-wider">
              Name
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-white/90 uppercase tracking-wider">
              Mobile
            </th>
            {pageType === "all" && (
              <>
                <th className="px-6 py-3 text-left text-xs font-medium text-white/90 uppercase tracking-wider">
                  Order Types
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-white/90 uppercase tracking-wider">
                  Total Orders
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-white/90 uppercase tracking-wider">
                  Total Spent
                </th>
              </>
            )}
            {pageType === "food" && (
              <>
                <th className="px-6 py-3 text-left text-xs font-medium text-white/90 uppercase tracking-wider">
                  Food Orders
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-white/90 uppercase tracking-wider">
                  Total Spent
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-white/90 uppercase tracking-wider">
                  Last Order
                </th>
              </>
            )}
            {pageType === "parcel" && (
              <>
                <th className="px-6 py-3 text-left text-xs font-medium text-white/90 uppercase tracking-wider">
                  Parcel Orders
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-white/90 uppercase tracking-wider">
                  Total Spent
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-white/90 uppercase tracking-wider">
                  Last Order
                </th>
              </>
            )}
            {pageType === "person_ride" && (
              <>
                <th className="px-6 py-3 text-left text-xs font-medium text-white/90 uppercase tracking-wider">
                  Ride Bookings
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-white/90 uppercase tracking-wider">
                  Total Spent
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-white/90 uppercase tracking-wider">
                  Last Ride
                </th>
              </>
            )}
            <th className="px-6 py-3 text-left text-xs font-medium text-white/90 uppercase tracking-wider">
              GatiCash
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-white/90 uppercase tracking-wider">
              Trust tier
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-white/90 uppercase tracking-wider">
              Status
            </th>
          </tr>
        </thead>
        <tbody className="bg-white/90 divide-y divide-teal-100/90">
          {customers.map((customer) => {
            const foodStats = getOrderStatsForType(customer.orderStats, "food");
            const parcelStats = getOrderStatsForType(customer.orderStats, "parcel");
            const rideStats = getOrderStatsForType(customer.orderStats, "person_ride");

            return (
              <tr key={customer.id} className="hover:bg-teal-50/50 transition-colors">
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                  <Link
                    href={`/dashboard/customers/${customer.id}${searchSuffix}`}
                    className="font-medium text-[#0d5c4a] hover:text-[#0f2d42] hover:underline"
                  >
                    {customer.customerId}
                  </Link>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {customer.fullName}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {customer.primaryMobile}
                </td>
                {pageType === "all" && (
                  <>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {getAllOrderTypes(customer.orderStats)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {getTotalOrders(customer.orderStats)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {formatCurrency(getTotalSpent(customer.orderStats))}
                    </td>
                  </>
                )}
                {pageType === "food" && (
                  <>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {foodStats.totalOrders}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {formatCurrency(foodStats.totalSpent)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {formatDate(foodStats.lastOrderAt)}
                    </td>
                  </>
                )}
                {pageType === "parcel" && (
                  <>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {parcelStats.totalOrders}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {formatCurrency(parcelStats.totalSpent)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {formatDate(parcelStats.lastOrderAt)}
                    </td>
                  </>
                )}
                {pageType === "person_ride" && (
                  <>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {rideStats.totalOrders}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {formatCurrency(rideStats.totalSpent)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {formatDate(rideStats.lastOrderAt)}
                    </td>
                  </>
                )}
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-[#0d5c4a] tabular-nums">
                  {formatCurrency(customer.walletBalance)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  {(() => {
                    const tier = resolveTrustTier(
                      customer.trustTier,
                      customer.trustScore
                    ) as CustomerTrustTier;
                    return (
                      <span
                        className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${trustTierBadgeClass(
                          tier
                        )}`}
                      >
                        {TRUST_TIER_LABEL[tier]}
                      </span>
                    );
                  })()}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span
                    className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                      STATUS_COLORS[customer.accountStatus] ||
                      "bg-gray-100 text-gray-800"
                    }`}
                  >
                    {customer.accountStatus}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {totalPages > 1 && onPageChange && (
        <div className="flex items-center justify-between px-6 py-4 border-t border-teal-100/90 bg-[#f6fdfc]/80">
          <div className="text-sm text-gray-700">
            Page {currentPage} of {totalPages}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => onPageChange(Math.max(1, currentPage - 1))}
              disabled={currentPage === 1}
              className="px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Previous
            </button>
            <button
              type="button"
              onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
              disabled={currentPage === totalPages}
              className="px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
