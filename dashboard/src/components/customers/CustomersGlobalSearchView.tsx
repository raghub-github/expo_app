"use client";

import { useState, useEffect, useRef, useLayoutEffect, useMemo, useCallback } from "react";
import { useAppPathname, useAppSearchParams } from "@/hooks/useAppSearchParams";
import { useRouter } from "next/navigation";
import { CustomerTable } from "@/components/customers/CustomerTable";
import { fetchCustomers, useCustomersQuery } from "@/hooks/queries/useCustomersQuery";
import { usePermissions } from "@/hooks/queries/usePermissionsQuery";
import { isStructuredCustomerSearch } from "@/lib/customers/search-kind";
import { CustomerNotFoundState } from "@/components/customers/CustomerNotFoundState";
import type { CustomerWithStats } from "@/lib/db/operations/customers";

/**
 * Global customer search: matches customer_id, mobile, name, email (API).
 * Also supports `?state=` from Users by State / UT (filtered list, no auto-open).
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
  const prevStateParamRef = useRef<string | null>(null);
  const searchParamsKey = searchParams.toString();

  const stateParam = (searchParams.get("state") || "").trim();
  const isStateFilter = stateParam.length > 0;
  const stateLabel = stateParam === "__unset__" ? "State not set" : stateParam;

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
    if (stateParam !== prevStateParamRef.current) {
      prevStateParamRef.current = stateParam;
      setPage(1);
    }
  }, [searchParamsKey, searchParams, stateParam]);

  const trimmed = search.trim();
  const shouldFetch = trimmed.length > 0 || isStateFilter;

  const { data, isLoading, isFetching, isPlaceholderData, isError, authGateReady } = useCustomersQuery({
    page,
    limit: 20,
    search: trimmed || undefined,
    state: isStateFilter ? stateParam : undefined,
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

  /** Show table for state filter, or name-like search when several users match. */
  const showMultiNameList =
    isStateFilter ||
    (searchResultsFresh && customersSorted.length > 1 && !structured);

  /** Auto-open detail for a single user, or structured multi-match (open first). Never for state browse. */
  useLayoutEffect(() => {
    if (isStateFilter) return;
    if (!searchResultsFresh) return;
    if (customersSorted.length === 0) return;
    const q = encodeURIComponent(trimmed);

    const shouldAutoRedirect =
      customersSorted.length === 1 ||
      (customersSorted.length > 1 && structured);

    if (!shouldAutoRedirect) return;

    const match = customersSorted[0];
    const compactGm = trimmed.replace(/\s/g, "");
    if (/^GM\d+$/i.test(compactGm) && match.customerId.toLowerCase() !== compactGm.toLowerCase()) {
      return;
    }

    const targetKey = encodeURIComponent(match.customerId);
    const targetPath = `/dashboard/customers/${targetKey}`;

    const cleanPath = pathname.split("?")[0].split("#")[0];
    if (cleanPath === targetPath || cleanPath === `/dashboard/customers/${match.customerId}`) {
      return;
    }

    router.replace(`${targetPath}?search=${q}`);
  }, [isStateFilter, searchResultsFresh, customersSorted, router, structured, trimmed, pathname]);

  const handlePageChange = (newPage: number) => {
    setPage(newPage);
  };

  const exportStateCustomers = useCallback(async (): Promise<CustomerWithStats[]> => {
    const all: CustomerWithStats[] = [];
    let pageNum = 1;
    let totalPages = 1;
    do {
      const result = await fetchCustomers({
        page: pageNum,
        limit: 200,
        search: trimmed || undefined,
        state: isStateFilter ? stateParam : undefined,
      });
      all.push(...result.customers);
      totalPages = Math.max(1, result.pagination.totalPages);
      pageNum += 1;
    } while (pageNum <= totalPages && pageNum <= 500);
    return all;
  }, [trimmed, isStateFilter, stateParam]);

  const showInitialLoading =
    shouldFetch &&
    !isError &&
    (!authGateReady || isLoading || isFetching || isPlaceholderData) &&
    customersSorted.length === 0;

  const willAutoOpenDetail =
    !isStateFilter &&
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
      <div className="flex h-full min-h-0 flex-1 items-center justify-center">
        <p className="text-sm text-[#121212]/50">Loading...</p>
      </div>
    );
  }

  if (!shouldFetch) {
    return (
      <div className="flex h-full min-h-0 w-full flex-1 items-center justify-center">
        <div className="rounded-md border-[0.5px] border-[#121212]/40 bg-white p-12 text-center">
          <p className="text-lg font-medium text-[#121212]">
            One search. Complete customer context —{" "}
            <span className="font-bold bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 bg-clip-text text-transparent">
              powered by GatiMitra
            </span>
          </p>
          <p className="mt-2 text-sm text-[#121212]/50">
            Enter a Customer ID (e.g. GM100001), mobile number, or name to search
          </p>
        </div>
      </div>
    );
  }

  if (showInitialLoading || (willAutoOpenDetail && !showMultiNameList && !isError)) {
    return (
      <div className="flex h-full min-h-0 flex-1 items-center justify-center">
        <p className="text-sm text-[#121212]/50">
          {isStateFilter ? "Loading customers…" : "Loading customer…"}
        </p>
      </div>
    );
  }

  if (isError || (shouldFetch && searchResultsFresh && customersSorted.length === 0)) {
    if (isStateFilter) {
      return (
        <div className="flex h-full min-h-0 flex-1 items-center justify-center px-4">
          <p className="text-sm text-[#121212]/55">
            No customers found for {stateLabel}.
          </p>
        </div>
      );
    }
    return (
      <div className="w-full max-w-full min-w-0 overflow-x-hidden">
        <CustomerNotFoundState />
      </div>
    );
  }

  if (isStateFilter && showMultiNameList) {
    const total = data?.pagination?.total ?? customersSorted.length;
    return (
      <div className="flex h-full min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden">
        <CustomerTable
          customers={customersSorted}
          loading={isLoading || isFetching}
          pageType="all"
          searchQuery={trimmed || stateLabel}
          onPageChange={handlePageChange}
          currentPage={data?.pagination?.page ?? page}
          totalPages={data?.pagination?.totalPages ?? 1}
          totalCount={total}
          showExport={false}
        />
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden">
      {showMultiNameList ? (
        <CustomerTable
          customers={customersSorted}
          loading={isLoading}
          pageType="all"
          searchQuery={trimmed || stateLabel}
          onPageChange={handlePageChange}
          currentPage={data?.pagination?.page ?? 1}
          totalPages={data?.pagination?.totalPages ?? 1}
          totalCount={data?.pagination?.total}
          showExport
          onExportAll={exportStateCustomers}
          exportFileName="customers-search"
        />
      ) : null}
    </div>
  );
}
