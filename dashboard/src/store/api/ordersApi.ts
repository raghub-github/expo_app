import { baseApi } from "./baseApi";

export interface OrdersCoreRow {
  id: number;
  orderUuid: string;
  orderType: string;
  formattedOrderId: string | null;
  orderId: string | null;
  status: string;
  currentStatus: string | null;
  paymentStatus: string | null;
  createdAt: string;
  updatedAt: string;
  customerId: number | null;
  customerName: string | null;
  customerMobile: string | null;
  riderId: number | null;
  riderName: string | null;
  riderMobile: string | null;
  routedToEmail: string | null;
  latestRemark: string | null;
  merchantParentId: number | null;
  merchantStoreId: number | null;
  storeId?: string | null;
  dropAddressRaw: string | null;
  dropAddressNormalized?: string | null;
  orderSource: string | null;
  isBulkOrder: boolean;
}

export interface CoreOrdersResponse {
  success: boolean;
  data: OrdersCoreRow[];
  pagination?: {
    total?: number;
  };
}

export interface CoreOrdersQueryArgs {
  orderType: "food" | "parcel" | "person-ride";
  statusFilter?: string | null;
  search?: string | null;
  searchType?: string | null;
  page?: number;
  limit?: number;
}

export const ordersApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    getCoreOrders: build.query<CoreOrdersResponse, CoreOrdersQueryArgs>({
      query: ({ orderType, statusFilter, search, searchType, page = 1, limit = 20 }) => {
        const params = new URLSearchParams();
        params.set("orderType", orderType);
        if (statusFilter) params.set("statusFilter", statusFilter);
        if (search?.trim()) params.set("search", search.trim());
        if (searchType) params.set("searchType", searchType);
        params.set("page", String(page));
        params.set("limit", String(limit));
        return `/orders/core?${params.toString()}`;
      },
      providesTags: (result, error, args) => [
        {
          type: "Order" as const,
          id: `core-${args.orderType}-${args.statusFilter ?? "ALL"}`,
        },
      ],
    }),
  }),
  overrideExisting: false,
});

export const { useGetCoreOrdersQuery } = ordersApi;

