"use client";

import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { MoreVertical, Eye, Edit } from "lucide-react";
import { CustomerWithStats } from "@/lib/db/operations/customers";
import { useRouter } from "next/navigation";

interface CustomerTableProps {
  customers: CustomerWithStats[];
  loading?: boolean;
  pageType?: "all" | "food" | "parcel" | "person_ride";
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
  onPageChange,
  currentPage = 1,
  totalPages = 1,
}: CustomerTableProps) {
  const router = useRouter();
  const [openDropdownId, setOpenDropdownId] = useState<number | null>(null);
  const [dropdownPosition, setDropdownPosition] = useState<{ top: number; left: number } | null>(null);
  const buttonRefs = useRef<Record<number, HTMLButtonElement | null>>({});

  // Calculate dropdown position when opened
  useEffect(() => {
    if (openDropdownId !== null && buttonRefs.current[openDropdownId]) {
      const button = buttonRefs.current[openDropdownId];
      if (button) {
        const rect = button.getBoundingClientRect();
        setDropdownPosition({
          top: rect.top - 8, // Position above the button
          left: rect.right - 192, // Align to right edge (192px = w-48)
        });
      }
    } else {
      setDropdownPosition(null);
    }
  }, [openDropdownId]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (openDropdownId !== null) {
        const button = buttonRefs.current[openDropdownId];
        const target = event.target as Node;
        if (button && !button.contains(target)) {
          // Check if click is on the portal dropdown
          const portalDropdown = document.querySelector('[data-customer-action-menu]');
          if (portalDropdown && !portalDropdown.contains(target)) {
            setOpenDropdownId(null);
          }
        }
      }
    };

    if (openDropdownId !== null) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => {
        document.removeEventListener("mousedown", handleClickOutside);
      };
    }
  }, [openDropdownId]);

  const handleViewDetails = (customerId: number) => {
    setOpenDropdownId(null);
    // Navigate to customer details page
    router.push(`/dashboard/customers/${customerId}`);
  };

  const handleEdit = (customerId: number) => {
    setOpenDropdownId(null);
    // Navigate to customer edit page
    router.push(`/dashboard/customers/${customerId}/edit`);
  };

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
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Customer ID
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Name
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Mobile
            </th>
            {pageType === "all" && (
              <>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Order Types
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Total Orders
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Total Spent
                </th>
              </>
            )}
            {pageType === "food" && (
              <>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Food Orders
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Total Spent
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Last Order
                </th>
              </>
            )}
            {pageType === "parcel" && (
              <>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Parcel Orders
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Total Spent
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Last Order
                </th>
              </>
            )}
            {pageType === "person_ride" && (
              <>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Ride Bookings
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Total Spent
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Last Ride
                </th>
              </>
            )}
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Status
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Actions
            </th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {customers.map((customer) => {
            const foodStats = getOrderStatsForType(customer.orderStats, "food");
            const parcelStats = getOrderStatsForType(customer.orderStats, "parcel");
            const rideStats = getOrderStatsForType(customer.orderStats, "person_ride");

            return (
              <tr key={customer.id} className="hover:bg-gray-50">
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                  <button
                    onClick={() => handleViewDetails(customer.id)}
                    className="text-blue-600 hover:text-blue-800 hover:underline cursor-pointer"
                  >
                    {customer.customerId}
                  </button>
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
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                  <button
                    ref={(el) => {
                      buttonRefs.current[customer.id] = el;
                    }}
                    onClick={() =>
                      setOpenDropdownId(
                        openDropdownId === customer.id ? null : customer.id
                      )
                    }
                    className="text-gray-400 hover:text-gray-600 focus:outline-none"
                    aria-label="Customer actions"
                  >
                    <MoreVertical className="h-5 w-5" />
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* Action Dropdown Portal */}
      {openDropdownId !== null &&
        dropdownPosition !== null &&
        typeof document !== "undefined" &&
        createPortal(
          <>
            {/* Backdrop to close on outside click */}
            <div
              className="fixed inset-0 z-[9998]"
              onClick={() => setOpenDropdownId(null)}
              aria-hidden="true"
            />
            {/* Dropdown Menu */}
            <div
              data-customer-action-menu
              className="fixed z-[9999] w-48 bg-white rounded-md shadow-xl border border-gray-200 py-1"
              style={{
                top: `${dropdownPosition.top}px`,
                left: `${dropdownPosition.left}px`,
              }}
              role="menu"
            >
              <button
                onClick={() => handleViewDetails(openDropdownId)}
                className="flex items-center gap-2 w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                role="menuitem"
              >
                <Eye className="h-4 w-4" />
                View Details
              </button>
              <button
                onClick={() => handleEdit(openDropdownId)}
                className="flex items-center gap-2 w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                role="menuitem"
              >
                <Edit className="h-4 w-4" />
                Edit
              </button>
            </div>
          </>,
          document.body
        )}

      {/* Pagination */}
      {totalPages > 1 && onPageChange && (
        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200 bg-white">
          <div className="text-sm text-gray-700">
            Page {currentPage} of {totalPages}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => onPageChange(Math.max(1, currentPage - 1))}
              disabled={currentPage === 1}
              className="px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Previous
            </button>
            <button
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
