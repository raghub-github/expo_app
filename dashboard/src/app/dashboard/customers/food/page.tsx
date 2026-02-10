"use client";

import { useState, useEffect, Suspense, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { CustomerTable } from "@/components/customers/CustomerTable";
import { useCustomersQuery } from "@/hooks/queries/useCustomersQuery";
import { usePermissions } from "@/hooks/queries/usePermissionsQuery";
import { Search, AlertCircle } from "lucide-react";

function FoodCustomersPageContent() {
  const searchParams = useSearchParams();
  const { isSuperAdmin, loading: permissionsLoading } = usePermissions();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const prevSearchParamRef = useRef<string | null>(null);

  // Sync search with URL search params (for main search bar)
  useEffect(() => {
    const searchParam = searchParams.get("search");
    if (searchParam !== prevSearchParamRef.current) {
      prevSearchParamRef.current = searchParam;
      setSearch(searchParam || "");
      setPage(1);
    }
  }, [searchParams]);

  // Only fetch if super admin OR if there's a search query
  const shouldFetch = isSuperAdmin || !!search;
  const { data, isLoading, error } = useCustomersQuery({
    page,
    limit: 20,
    search: search || undefined,
    orderType: "food", // Always filter by food orders
    enabled: shouldFetch && !permissionsLoading,
  });

  const handlePageChange = (newPage: number) => {
    setPage(newPage);
  };

  // Show loading while checking permissions
  if (permissionsLoading) {
    return (
      <div className="space-y-6 w-full max-w-full overflow-x-hidden">
        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <div className="flex items-center justify-center py-8">
            <div className="text-gray-500">Loading...</div>
          </div>
        </div>
      </div>
    );
  }

  // Show search prompt for non-super-admins when no search query
  if (!isSuperAdmin && !search) {
    return (
      <div className="space-y-6 w-full max-w-full overflow-x-hidden">
        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <div className="flex flex-col items-center justify-center py-12 space-y-4">
            <div className="rounded-full bg-blue-100 p-4">
              <Search className="h-8 w-8 text-blue-600" />
            </div>
            <div className="text-center space-y-2">
              <h2 className="text-xl font-semibold text-gray-900">Search for Food Customer</h2>
              <p className="text-sm text-gray-600 max-w-md">
                Please use the search bar in the header to search for a food customer by ID, name, or phone number.
                Customer details will be displayed after you search.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 w-full max-w-full overflow-x-hidden">
      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <div className="space-y-4">
          {/* Page Header */}
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-semibold text-gray-900">Food Customers</h1>
          </div>

          {/* Customer Table */}
          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 p-4">
              <p className="text-sm text-red-800">
                Error loading customers: {error instanceof Error ? error.message : "Unknown error"}
              </p>
            </div>
          )}

          {!isSuperAdmin && search && (!data?.customers || data.customers.length === 0) && !isLoading && (
            <div className="rounded-lg bg-yellow-50 border border-yellow-200 p-4">
              <div className="flex items-start space-x-3">
                <AlertCircle className="h-5 w-5 text-yellow-600 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-yellow-800">No customers found</p>
                  <p className="text-sm text-yellow-700 mt-1">
                    No food customers match your search query. Please try a different search term.
                  </p>
                </div>
              </div>
            </div>
          )}

          <CustomerTable
            customers={data?.customers || []}
            loading={isLoading}
            pageType="food"
            onPageChange={handlePageChange}
            currentPage={data?.pagination?.page || 1}
            totalPages={data?.pagination?.totalPages || 1}
          />
        </div>
      </div>
    </div>
  );
}

export default function FoodCustomersPage() {
  return (
    <Suspense fallback={<div className="p-6">Loading...</div>}>
      <FoodCustomersPageContent />
    </Suspense>
  );
}
