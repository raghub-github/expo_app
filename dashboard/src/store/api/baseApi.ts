import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";

/** If `getSession()` never settles (rare Supabase client deadlock), RTK requests would hang forever. */
const SESSION_HEADER_TIMEOUT_MS = 5000;

const baseQuery = fetchBaseQuery({
  baseUrl: "/api",
  credentials: "include",
  /** Avoid stale browser HTTP cache for GET /api/* after mutations (e.g. billing rules priorities). */
  fetchFn: (input, init) =>
    fetch(input, {
      ...init,
      cache: "no-store",
    }),
  prepareHeaders: async (headers) => {
    if (typeof window === "undefined") return headers;
    try {
      const sessionPromise = (async () => {
        const { supabase } = await import("@/lib/supabase/client");
        const {
          data: { session },
        } = await supabase.auth.getSession();
        return session;
      })();
      const timeoutPromise = new Promise<null>((resolve) => {
        setTimeout(() => resolve(null), SESSION_HEADER_TIMEOUT_MS);
      });
      const session = await Promise.race([sessionPromise, timeoutPromise]);
      if (session?.access_token) {
        headers.set("authorization", `Bearer ${session.access_token}`);
      }
    } catch {
      // Session not available (e.g. logged out)
    }
    return headers;
  },
});

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
