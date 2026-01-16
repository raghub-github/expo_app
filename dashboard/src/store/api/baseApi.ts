import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";

const baseQuery = fetchBaseQuery({
  baseUrl: "/api",
  prepareHeaders: async (headers, { getState }) => {
    // Get auth token from Supabase session
    // This will be implemented with actual session retrieval
    const token = typeof window !== "undefined" 
      ? localStorage.getItem("supabase.auth.token")
      : null;

    if (token) {
      headers.set("authorization", `Bearer ${token}`);
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
  ],
  endpoints: () => ({}),
});
