import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";
import type { BaseQueryFn, FetchArgs, FetchBaseQueryError } from "@reduxjs/toolkit/query";
import { redirectToLoginOnSessionExpired } from "@/lib/auth/redirect-to-login";
import { isHardSessionDeathCode } from "@/lib/auth/session-errors";

const rawBaseQuery = fetchBaseQuery({
  baseUrl: "/api",
  credentials: "include",
  /** Avoid stale browser HTTP cache for GET /api/* after mutations (e.g. billing rules priorities). */
  fetchFn: (input, init) =>
    fetch(input, {
      ...init,
      cache: "no-store",
    }),
  // Auth uses httpOnly cookies — do NOT call supabase.auth.getSession() here.
  // That refreshes with stale localStorage refresh tokens and throws AuthApiError.
});

const baseQuery: BaseQueryFn<string | FetchArgs, unknown, FetchBaseQueryError> = async (
  args,
  api,
  extraOptions
) => {
  const result = await rawBaseQuery(args, api, extraOptions);
  if (result.error?.status === 401) {
    const code =
      result.error.data && typeof result.error.data === "object"
        ? String((result.error.data as { code?: unknown }).code ?? "")
        : "";
    if (isHardSessionDeathCode(code)) {
      redirectToLoginOnSessionExpired({ reason: code || "session_expired" });
    }
  }
  return result;
};

export const baseApi = createApi({
  reducerPath: "api",
  baseQuery,
  tagTypes: [
    "User",
    "Customer",
    "Rider",
    "Merchant",
    "Order",
    "Ticket",
    "Payment",
    "Offer",
    "Analytics",
    "System",
    "ServicePoint",
    "Billing",
    "Geo",
    "PricingRules",
  ],
  endpoints: () => ({}),
});
