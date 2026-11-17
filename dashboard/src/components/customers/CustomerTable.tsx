"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight, Download, Loader2 } from "lucide-react";
import { CustomerWithStats } from "@/lib/db/operations/customers";
import { buildCustomerDetailQueryString } from "@/lib/navigation/customer-dashboard-from-order";
import {
  resolveTrustTier,
  TRUST_TIER_LABEL,
  type CustomerTrustTier,
} from "@/lib/customers/trust-tier";
import { downloadCustomersGoogleSheet } from "@/lib/customers/export-customers-csv";

interface CustomerTableProps {
  customers: CustomerWithStats[];
  loading?: boolean;
  pageType?: "all" | "food" | "parcel" | "person_ride";
  /** Preserved in links so the header search bar stays after opening a customer. */
  searchQuery?: string;
  onPageChange?: (page: number) => void;
  currentPage?: number;
  totalPages?: number;
  totalCount?: number;
  pageSize?: number;
  /** Inline Export (omit when Export lives in the Header). */
  showExport?: boolean;
  onExportAll?: () => Promise<CustomerWithStats[]>;
  exportFileName?: string;
}

const outerBorder = "rounded-md border-[0.5px] border-[#121212]/40";
const rowBorder = "border-b-[0.5px] border-[#121212]/10";

function formatCurrency(amount: number | null | undefined) {
  if (amount === null || amount === undefined) return "₹0.00";
  return `₹${Number(amount).toFixed(2)}`;
}

function formatDate(date: Date | string | null | undefined) {
  if (!date) return "—";
  const d = new Date(date);
  return d.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function CustomerTable({
  customers,
  loading = false,
  pageType = "all",
  searchQuery,
  onPageChange,
  currentPage = 1,
  totalPages = 1,
  totalCount,
  pageSize = 20,
  showExport = false,
  onExportAll,
  exportFileName = "customers",
}: CustomerTableProps) {
  const router = useRouter();
  const urlSearchParams = useSearchParams();
  const [exporting, setExporting] = useState(false);
  const searchSuffix = buildCustomerDetailQueryString({
    search: searchQuery,
    fromOrderSource: urlSearchParams,
  });

  const colCount = 10;
  const total = totalCount ?? customers.length;
  const safeTotalPages = Math.max(1, totalPages);
  const page = Math.min(Math.max(1, currentPage), safeTotalPages);
  const rangeStart = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeEnd = total === 0 ? 0 : Math.min(page * pageSize, total);

  const handleExport = async () => {
    setExporting(true);
    try {
      const rows = onExportAll ? await onExportAll() : customers;
      downloadCustomersGoogleSheet(rows, exportFileName);
    } catch (e) {
      console.error("[CustomerTable] export failed", e);
    } finally {
      setExporting(false);
    }
  };

  const getOrderStatsForType = (
    stats: CustomerWithStats["orderStats"],
    type: "food" | "parcel" | "person_ride"
  ) =>
    stats.find((s) => s.orderType === type) || {
      orderType: type,
      totalOrders: 0,
      totalSpent: 0,
      lastOrderAt: null,
    };

  const getAllOrderTypes = (stats: CustomerWithStats["orderStats"]) => {
    const types = stats.map((s) => s.orderType).filter(Boolean) as string[];
    return types.length > 0 ? types.join(", ") : "None";
  };

  const getTotalOrders = (stats: CustomerWithStats["orderStats"]) =>
    stats.reduce((sum, s) => sum + s.totalOrders, 0);

  const getTotalSpent = (stats: CustomerWithStats["orderStats"]) =>
    stats.reduce((sum, s) => sum + s.totalSpent, 0);

  const statusLabel = (status: string) => {
    const s = (status || "").toUpperCase();
    if (s === "ACTIVE") return "Active";
    if (s === "SUSPENDED") return "Suspended";
    if (s === "BLOCKED") return "Blocked";
    if (s === "DEACTIVATED") return "Deactivated";
    return status || "—";
  };

  const statusStyle = (status: string) => {
    const s = (status || "").toUpperCase();
    if (s === "ACTIVE") return "bg-emerald-50 text-emerald-800";
    if (s === "SUSPENDED") return "bg-amber-50 text-amber-800";
    if (s === "BLOCKED" || s === "DEACTIVATED") return "bg-rose-50 text-rose-700";
    return "bg-[#F4F4F4] text-[#121212]/60";
  };

  const pageNumbers = (() => {
    const pages: (number | "...")[] = [];
    if (safeTotalPages <= 7) {
      for (let i = 1; i <= safeTotalPages; i++) pages.push(i);
      return pages;
    }
    pages.push(1);
    if (page > 3) pages.push("...");
    for (let i = Math.max(2, page - 1); i <= Math.min(safeTotalPages - 1, page + 1); i++) {
      pages.push(i);
    }
    if (page < safeTotalPages - 2) pages.push("...");
    pages.push(safeTotalPages);
    return pages;
  })();

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
      {showExport ? (
        <div className="mb-2 flex shrink-0 items-center justify-end">
          <button
            type="button"
            onClick={() => void handleExport()}
            disabled={exporting || (!loading && customers.length === 0)}
            className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-md border border-[#121212]/20 bg-white px-3 text-xs font-semibold text-[#121212] hover:bg-[#FAFAFA] disabled:cursor-not-allowed disabled:opacity-50"
            title="Download Excel — opens in Google Sheets"
          >
            {exporting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Download className="h-3.5 w-3.5" />
            )}
            {exporting ? "Exporting…" : "Export"}
          </button>
        </div>
      ) : null}

      {/* Transactions-style scrollable table shell — fills height, no bottom whitespace */}
      <div className={`flex min-h-0 flex-1 flex-col overflow-hidden bg-white ${outerBorder}`}>
        <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full min-w-[980px] border-collapse text-left text-sm">
          <thead className="text-[10px] font-semibold uppercase tracking-wide text-[#121212]/45">
            <tr>
              <th className={`sticky top-0 z-10 bg-[#F7F7F7] px-3 py-2.5 ${rowBorder}`}>
                Customer ID
              </th>
              <th className={`sticky top-0 z-10 bg-[#F7F7F7] px-3 py-2.5 ${rowBorder}`}>Name</th>
              <th className={`sticky top-0 z-10 bg-[#F7F7F7] px-3 py-2.5 ${rowBorder}`}>Mobile</th>
              {pageType === "all" && (
                <>
                  <th className={`sticky top-0 z-10 bg-[#F7F7F7] px-3 py-2.5 ${rowBorder}`}>
                    Order types
                  </th>
                  <th className={`sticky top-0 z-10 bg-[#F7F7F7] px-3 py-2.5 ${rowBorder}`}>
                    Orders
                  </th>
                  <th className={`sticky top-0 z-10 bg-[#F7F7F7] px-3 py-2.5 ${rowBorder}`}>
                    Spent
                  </th>
                </>
              )}
              {pageType === "food" && (
                <>
                  <th className={`sticky top-0 z-10 bg-[#F7F7F7] px-3 py-2.5 ${rowBorder}`}>
                    Food orders
                  </th>
                  <th className={`sticky top-0 z-10 bg-[#F7F7F7] px-3 py-2.5 ${rowBorder}`}>
                    Spent
                  </th>
                  <th className={`sticky top-0 z-10 bg-[#F7F7F7] px-3 py-2.5 ${rowBorder}`}>
                    Last order
                  </th>
                </>
              )}
              {pageType === "parcel" && (
                <>
                  <th className={`sticky top-0 z-10 bg-[#F7F7F7] px-3 py-2.5 ${rowBorder}`}>
                    Parcel orders
                  </th>
                  <th className={`sticky top-0 z-10 bg-[#F7F7F7] px-3 py-2.5 ${rowBorder}`}>
                    Spent
                  </th>
                  <th className={`sticky top-0 z-10 bg-[#F7F7F7] px-3 py-2.5 ${rowBorder}`}>
                    Last order
                  </th>
                </>
              )}
              {pageType === "person_ride" && (
                <>
                  <th className={`sticky top-0 z-10 bg-[#F7F7F7] px-3 py-2.5 ${rowBorder}`}>
                    Rides
                  </th>
                  <th className={`sticky top-0 z-10 bg-[#F7F7F7] px-3 py-2.5 ${rowBorder}`}>
                    Spent
                  </th>
                  <th className={`sticky top-0 z-10 bg-[#F7F7F7] px-3 py-2.5 ${rowBorder}`}>
                    Last ride
                  </th>
                </>
              )}
              <th className={`sticky top-0 z-10 bg-[#F7F7F7] px-3 py-2.5 ${rowBorder}`}>
                GatiCash
              </th>
              <th className={`sticky top-0 z-10 bg-[#F7F7F7] px-3 py-2.5 ${rowBorder}`}>Trust</th>
              <th className={`sticky top-0 z-10 bg-[#F7F7F7] px-3 py-2.5 ${rowBorder}`}>Status</th>
              <th className={`sticky top-0 z-10 bg-[#F7F7F7] px-3 py-2.5 text-right ${rowBorder}`}>
                Action
              </th>
            </tr>
          </thead>
          <tbody>
            {loading && customers.length === 0 ? (
              <tr>
                <td colSpan={colCount} className="px-3 py-12 text-center text-sm text-[#121212]/45">
                  Loading…
                </td>
              </tr>
            ) : customers.length === 0 ? (
              <tr>
                <td colSpan={colCount} className="px-3 py-12 text-center text-sm text-[#121212]/45">
                  No customers found.
                </td>
              </tr>
            ) : (
              customers.map((customer) => {
                const foodStats = getOrderStatsForType(customer.orderStats, "food");
                const parcelStats = getOrderStatsForType(customer.orderStats, "parcel");
                const rideStats = getOrderStatsForType(customer.orderStats, "person_ride");
                const tier = resolveTrustTier(
                  customer.trustTier,
                  customer.trustScore
                ) as CustomerTrustTier;
                const detailHref = `/dashboard/customers/${encodeURIComponent(customer.customerId)}${searchSuffix}`;
                const isActive = (customer.accountStatus || "").toUpperCase() === "ACTIVE";

                return (
                  <tr
                    key={customer.id}
                    onClick={() => router.push(detailHref)}
                    className={`cursor-pointer ${
                      isActive ? "hover:bg-[#F7F7F7]/70" : "bg-rose-50/50 hover:bg-rose-50"
                    }`}
                  >
                    <td
                      className={`whitespace-nowrap px-3 py-2.5 font-mono text-xs font-semibold text-[#121212] ${rowBorder}`}
                    >
                      <Link
                        href={detailHref}
                        className="hover:underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {customer.customerId}
                      </Link>
                    </td>
                    <td className={`max-w-[180px] px-3 py-2.5 font-medium text-[#121212] ${rowBorder}`}>
                      <span className="block truncate" title={customer.fullName}>
                        {customer.fullName}
                      </span>
                    </td>
                    <td
                      className={`whitespace-nowrap px-3 py-2.5 text-[#121212]/70 ${rowBorder}`}
                    >
                      {customer.primaryMobile}
                    </td>
                    {pageType === "all" && (
                      <>
                        <td
                          className={`whitespace-nowrap px-3 py-2.5 capitalize text-[#121212]/70 ${rowBorder}`}
                        >
                          {getAllOrderTypes(customer.orderStats)}
                        </td>
                        <td
                          className={`whitespace-nowrap px-3 py-2.5 tabular-nums text-[#121212] ${rowBorder}`}
                        >
                          {getTotalOrders(customer.orderStats)}
                        </td>
                        <td
                          className={`whitespace-nowrap px-3 py-2.5 text-right font-semibold tabular-nums text-[#121212] ${rowBorder}`}
                        >
                          {formatCurrency(getTotalSpent(customer.orderStats))}
                        </td>
                      </>
                    )}
                    {pageType === "food" && (
                      <>
                        <td
                          className={`whitespace-nowrap px-3 py-2.5 tabular-nums text-[#121212] ${rowBorder}`}
                        >
                          {foodStats.totalOrders}
                        </td>
                        <td
                          className={`whitespace-nowrap px-3 py-2.5 text-right font-semibold tabular-nums text-[#121212] ${rowBorder}`}
                        >
                          {formatCurrency(foodStats.totalSpent)}
                        </td>
                        <td
                          className={`whitespace-nowrap px-3 py-2.5 text-xs text-[#121212]/60 ${rowBorder}`}
                        >
                          {formatDate(foodStats.lastOrderAt)}
                        </td>
                      </>
                    )}
                    {pageType === "parcel" && (
                      <>
                        <td
                          className={`whitespace-nowrap px-3 py-2.5 tabular-nums text-[#121212] ${rowBorder}`}
                        >
                          {parcelStats.totalOrders}
                        </td>
                        <td
                          className={`whitespace-nowrap px-3 py-2.5 text-right font-semibold tabular-nums text-[#121212] ${rowBorder}`}
                        >
                          {formatCurrency(parcelStats.totalSpent)}
                        </td>
                        <td
                          className={`whitespace-nowrap px-3 py-2.5 text-xs text-[#121212]/60 ${rowBorder}`}
                        >
                          {formatDate(parcelStats.lastOrderAt)}
                        </td>
                      </>
                    )}
                    {pageType === "person_ride" && (
                      <>
                        <td
                          className={`whitespace-nowrap px-3 py-2.5 tabular-nums text-[#121212] ${rowBorder}`}
                        >
                          {rideStats.totalOrders}
                        </td>
                        <td
                          className={`whitespace-nowrap px-3 py-2.5 text-right font-semibold tabular-nums text-[#121212] ${rowBorder}`}
                        >
                          {formatCurrency(rideStats.totalSpent)}
                        </td>
                        <td
                          className={`whitespace-nowrap px-3 py-2.5 text-xs text-[#121212]/60 ${rowBorder}`}
                        >
                          {formatDate(rideStats.lastOrderAt)}
                        </td>
                      </>
                    )}
                    <td
                      className={`whitespace-nowrap px-3 py-2.5 tabular-nums text-[#121212]/65 ${rowBorder}`}
                    >
                      {formatCurrency(customer.walletBalance)}
                    </td>
                    <td className={`whitespace-nowrap px-3 py-2.5 text-[#121212]/70 ${rowBorder}`}>
                      {TRUST_TIER_LABEL[tier]}
                    </td>
                    <td className={`whitespace-nowrap px-3 py-2.5 ${rowBorder}`}>
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${statusStyle(
                          customer.accountStatus
                        )}`}
                      >
                        {statusLabel(customer.accountStatus)}
                      </span>
                    </td>
                    <td className={`px-3 py-2.5 text-right ${rowBorder}`}>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          router.push(detailHref);
                        }}
                        className="inline-flex h-8 cursor-pointer items-center rounded-md bg-emerald-600 px-3 text-xs font-semibold text-white hover:bg-emerald-700"
                      >
                        View
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
        </div>

        {/* Footer pinned to bottom of table card — no extra whitespace below */}
        {onPageChange ? (
          <div className="shrink-0 border-t-[0.5px] border-[#121212]/10 bg-[#F7F7F7] px-3 py-1.5 sm:px-4">
            <div className="flex flex-col items-center justify-between gap-1.5 sm:flex-row sm:gap-3">
              <div className="text-center text-[11px] leading-none text-[#121212]/70 sm:text-left">
                Showing <span className="font-semibold text-[#121212]">{rangeStart}</span> to{" "}
                <span className="font-semibold text-[#121212]">{rangeEnd}</span> of{" "}
                <span className="font-semibold text-[#121212]">{total.toLocaleString()}</span>{" "}
                entries
              </div>
              <div className="flex flex-wrap items-center justify-center gap-1">
                <button
                  type="button"
                  disabled={page <= 1 || loading}
                  onClick={() => onPageChange(Math.max(1, page - 1))}
                  className="flex h-7 cursor-pointer items-center gap-1 rounded-md border-[0.5px] border-[#121212]/20 bg-white px-2 text-[11px] font-medium text-[#121212] hover:bg-white disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Previous</span>
                </button>
                {pageNumbers.map((p, i) =>
                  p === "..." ? (
                    <span key={`e-${i}`} className="px-1.5 text-[11px] text-[#121212]/40">
                      …
                    </span>
                  ) : (
                    <button
                      key={p}
                      type="button"
                      disabled={loading}
                      onClick={() => onPageChange(p)}
                      className={`flex h-7 min-w-[28px] cursor-pointer items-center justify-center rounded-md px-1.5 text-[11px] font-semibold ${
                        p === page
                          ? "bg-[#121212] text-white"
                          : "border-[0.5px] border-[#121212]/20 bg-white text-[#121212] hover:bg-white"
                      }`}
                    >
                      {p}
                    </button>
                  )
                )}
                <button
                  type="button"
                  disabled={page >= safeTotalPages || loading}
                  onClick={() => onPageChange(Math.min(safeTotalPages, page + 1))}
                  className="flex h-7 cursor-pointer items-center gap-1 rounded-md border-[0.5px] border-[#121212]/20 bg-white px-2 text-[11px] font-medium text-[#121212] hover:bg-white disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <span className="hidden sm:inline">Next</span>
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </div>
        ) : totalCount != null ? (
          <div className="shrink-0 border-t-[0.5px] border-[#121212]/10 bg-[#F7F7F7] px-3 py-1.5 text-[11px] text-[#121212]/55">
            {totalCount.toLocaleString()} total
          </div>
        ) : null}
      </div>
    </div>
  );
}
