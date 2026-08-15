"use client";

import { useRouter } from "next/navigation";

const CUSTOMERS_HOME = "/dashboard/customers";

function clearLastCustomerSearch() {
  try {
    sessionStorage.removeItem("customerDashboardLastSearch");
  } catch {
    /* ignore */
  }
}

/**
 * Full main-area empty state when a customer lookup misses.
 * Replaces the error modal and yellow inline alert.
 */
export function CustomerNotFoundState({
  backHref = CUSTOMERS_HOME,
}: {
  backHref?: string;
}) {
  const router = useRouter();

  const handleBack = () => {
    clearLastCustomerSearch();
    router.push(backHref);
  };

  return (
    <div className="flex min-h-[min(60vh,28rem)] w-full flex-col items-center justify-center px-6 py-16 text-center">
      <h2 className="text-xl font-semibold text-gray-900 sm:text-2xl">Customer not found</h2>
      <p className="mt-2 max-w-md text-sm text-gray-600 sm:text-base">
        Please check with the correct user id or number
      </p>
      <button
        type="button"
        onClick={handleBack}
        className="mt-6 inline-flex items-center justify-center rounded-lg bg-[#121212] px-5 py-2.5 text-sm font-medium text-white hover:bg-black"
      >
        Back to search and retry
      </button>
    </div>
  );
}
