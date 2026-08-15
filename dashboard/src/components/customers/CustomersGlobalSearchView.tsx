"use client";

import { useState, useEffect, useRef, useLayoutEffect, useMemo } from "react";
import { useAppPathname, useAppSearchParams } from "@/hooks/useAppSearchParams";
import { useRouter } from "next/navigation";
import { CustomerTable } from "@/components/customers/CustomerTable";
import { useCustomersQuery } from "@/hooks/queries/useCustomersQuery";
import { usePermissions } from "@/hooks/queries/usePermissionsQuery";
import { isStructuredCustomerSearch } from "@/lib/customers/search-kind";
import { CustomerNotFoundState } from "@/components/customers/CustomerNotFoundState";

/**
 * Global customer search: matches customer_id, mobile, name, email (API).
 * - One match, or structured GM…/phone search with several rows → open customer detail (first row if multiple).
 * - Name-style search with 2+ matches → table list only; Customer ID links to detail.
 */
export function CustomersGlobalSearchView() {
  const searchParams = useAppSearchParams();
  const pathname = useAppPathname();
  const router = useRouter();
  const { loading: permissionsLoading } = usePermissions();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const prevSearchParamRef = useRef<string | null>(null);
  const searchParamsKey = searchParams.toString();

  useEffect(() => {
    const p = pathname.replace(/\/$/, "") || "";
    if (
      p === "/dashboard/customers/food" ||
      p === "/dashboard/customers/parcel" ||
      p === "/dashboard/customers/person-ride"
    ) {
      router.replace(`/dashboard/customers/all${searchParamsKey ? `?${searchParamsKey}` : ""}`);
    }
  }, [pathname, router, searchParamsKey]);

  useEffect(() => {
    const searchParam = searchParams.get("search");
    if (searchParam !== prevSearchParamRef.current) {
      prevSearchParamRef.current = searchParam;
      setSearch(searchParam || "");
      setPage(1);
    }
  }, [searchParamsKey, searchParams]);

  const trimmed = search.trim();
  const shouldFetch = trimmed.length > 0;

  const { data, isLoading, isFetching, isPlaceholderData, isError, authGateReady } = useCustomersQuery({
    page,
    limit: 20,
    search: trimmed || undefined,
    enabled: shouldFetch && !permissionsLoading,
  });

  const customers = data?.customers ?? [];
  const structured = isStructuredCustomerSearch(trimmed);
  const searchResultsFresh =
    shouldFetch &&
    authGateReady &&
    !isLoading &&
    !isFetching &&
    !isPlaceholderData &&
    !isError;

  /** Prefer exact customer_id match when redirecting (e.g. GM100001 before GM1000010). */
  const customersSorted = useMemo(() => {
    if (customers.length <= 1) return customers;
    const compact = trimmed.replace(/\s/g, "");
    if (!/^GM\d+$/i.test(compact)) return customers;
    const want = compact.toLowerCase();
    return [...customers].sort((a, b) => {
      const aExact = a.customerId.toLowerCase() === want ? 0 : 1;
      const bExact = b.customerId.toLowerCase() === want ? 0 : 1;
      return aExact - bExact;
    });
  }, [customers, trimmed]);

  /** Show table only for name-like search when several users match. */
  const showMultiNameList = searchResultsFresh && customersSorted.length > 1 && !structured;

  /** Auto-open detail for a single user, or structured multi-match (open first). */
  useLayoutEffect(() => {
    // Wait for fresh results for *this* search — placeholder/stale rows open the wrong customer.
    if (!searchResultsFresh) return;
    if (customersSorted.length === 0) return;
    const q = encodeURIComponent(trimmed);

    const shouldAutoRedirect =
      customersSorted.length === 1 ||
      (customersSorted.length > 1 && structured);

    if (!shouldAutoRedirect) return;

    const match = customersSorted[0];
    const compactGm = trimmed.replace(/\s/g, "");
    // For GM… searches, only open when the public customer_id matches exactly.
    if (/^GM\d+$/i.test(compactGm) && match.customerId.toLowerCase() !== compactGm.toLowerCase()) {
      return;
    }

    // Navigate by public customer_id (GM…) so detail loads from customers.customer_id, not stale numeric pk.
    const targetKey = encodeURIComponent(match.customerId);
    const targetPath = `/dashboard/customers/${targetKey}`;

    // Already on the correct customer detail page — no redirect needed.
    // Prefer App Router pathname over window.location to stay consistent with RSC.
    const cleanPath = pathname.split("?")[0].split("#")[0];
    if (cleanPath === targetPath || cleanPath === `/dashboard/customers/${match.customerId}`) {
      return;
    }

    router.replace(`${targetPath}?search=${q}`);
  }, [searchResultsFresh, customersSorted, router, structured, trimmed, pathname]);

  const handlePageChange = (newPage: number) => {
    setPage(newPage);
  };

  const showInitialLoading =
    shouldFetch &&
    !isError &&
    (!authGateReady || isLoading || isFetching || isPlaceholderData) &&
    customersSorted.length === 0;

  // Structured search (GM/phone) that will auto-open detail — one continuous "Loading customer…" instead of list then detail.
  const willAutoOpenDetail =
    shouldFetch &&
    !isError &&
    structured &&
    (isLoading ||
      isFetching ||
      isPlaceholderData ||
      customersSorted.length === 1 ||
      customersSorted.length > 1);

  if (permissionsLoading) {
    return (
      <div className="space-y-6 w-full max-w-full min-w-0 overflow-x-hidden px-2 sm:px-4 md:px-6">
        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <div className="flex items-center justify-center py-8">
            <div className="text-gray-500">Loading...</div>
          </div>
        </div>
      </div>
    );
  }

  if (!shouldFetch) {
    return (
      <div className="space-y-6 w-full max-w-full min-w-0 overflow-x-hidden px-2 sm:px-4 md:px-6">
        <div className="rounded-lg border border-gray-200 bg-white p-12 text-center">
          <p className="text-lg text-gray-700 font-medium">
            One search. Complete customer context —{" "}
            <span className="font-bold bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 bg-clip-text text-transparent">
              powered by GatiMitra
            </span>
          </p>
          <p className="mt-2 text-sm text-gray-500">
            Enter a Customer ID (e.g. GM100001), mobile number, or name to search
          </p>
        </div>
      </div>
    );
  }

  if (showInitialLoading || (willAutoOpenDetail && !showMultiNameList && !isError)) {
    return (
      <div className="space-y-6 w-full max-w-full min-w-0 overflow-x-hidden px-2 sm:px-4 md:px-6">
        <div className="rounded-2xl border border-teal-200/50 bg-gradient-to-br from-[#E6F6F5]/90 to-white p-12 text-center ring-1 ring-[#0f2d42]/5">
          <p className="text-[#0f2d42]/70">Loading customer…</p>
        </div>
      </div>
    );
  }

  if (isError || (trimmed && searchResultsFresh && customersSorted.length === 0)) {
    return (
      <div className="w-full max-w-full min-w-0 overflow-x-hidden">
        <CustomerNotFoundState />
      </div>
    );
  }

  return (
    <div className="space-y-6 w-full max-w-full min-w-0 overflow-x-hidden px-2 sm:px-4 md:px-6">
      <div className="rounded-2xl border border-teal-200/40 bg-gradient-to-br from-[#E6F6F5]/50 via-white to-[#f0fdf9] p-4 sm:p-6 ring-1 ring-[#0f2d42]/5">
        <div className="space-y-4">
          {showMultiNameList && (
            <CustomerTable
              customers={customersSorted}
              loading={isLoading}
              pageType="all"
              searchQuery={trimmed}
              onPageChange={handlePageChange}
              currentPage={data?.pagination?.page ?? 1}
              totalPages={data?.pagination?.totalPages ?? 1}
            />
          )}
        </div>
      </div>
    </div>
  );
}
