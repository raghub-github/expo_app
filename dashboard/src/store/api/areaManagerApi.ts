import { baseApi } from "./baseApi";

export interface AreaManagerMetricsMerchant {
  managerType: "MERCHANT";
  isSuperAdmin?: boolean;
  stores: { total: number; verified: number; pending: number; rejected: number; active: number };
  parents: { total: number };
  children: { total: number };
}

export interface AreaManagerMetricsRider {
  managerType: "RIDER";
  isSuperAdmin?: boolean;
  riders: { total: number; active: number; inactive: number; blocked: number };
  availability: { online: number; busy: number; offline: number };
  riderShortageAlerts: Array<{
    localityCode: string | null;
    totalRiders: number;
    activeRiders: number;
    online: number;
    busy: number;
    offline: number;
    isZeroCoverage: boolean;
    isLowAvailability: boolean;
  }>;
}

export type AreaManagerMetrics = AreaManagerMetricsMerchant | AreaManagerMetricsRider;

export interface AreaManagerListItem {
  id: number;
  userId: number;
  managerType: string;
  areaCode: string | null;
  localityCode: string | null;
  city: string | null;
  status: string;
  fullName: string | null;
  email: string | null;
}

export interface AreaManagerCounts {
  merchant: number;
  rider: number;
}

export interface StoreItem {
  id: number;
  storeId: string;
  name: string;
  ownerPhone: string;
  status: string;
  city?: string | null;
  localityCode: string | null;
  areaCode: string | null;
  parentStoreId: number | null;
  createdAt: string;
  isParent?: boolean;
  currentOnboardingStep?: number | null;
  totalSteps?: number | null;
  pendingChildStoreInternalId?: number | null;
  pendingChildOnboardingStep?: number | null;
}

export interface StoresListResponse {
  items: StoreItem[];
  nextCursor: string | null;
  totalParentCount?: number | null;
  totalChildCount?: number | null;
  totalCount?: number | null;
}

export interface StoresListParams {
  filter?: "parent" | "child";
  status?: string | null;
  parentId?: string | null;
  search?: string | null;
  cursor?: string | null;
  limit?: number;
}

export interface AreaManagerRiderItem {
  id: number;
  mobile: string;
  name: string | null;
  status: string;
  localityCode: string | null;
  availabilityStatus: string;
  createdAt: string;
}

export interface AreaManagerRidersListResponse {
  items: AreaManagerRiderItem[];
  nextCursor: string | null;
}

export interface AreaManagerRidersListParams {
  status?: string | null;
  search?: string | null;
  localityCode?: string | null;
  cursor?: string | null;
  limit?: number;
}

export const areaManagerApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    getAreaManagerMetrics: build.query<AreaManagerMetrics, void>({
      query: () => "/area-manager/metrics",
    }),

    getAreaManagerCounts: build.query<AreaManagerCounts, void>({
      query: () => "/area-manager/list/counts",
    }),

    getAreaManagers: build.query<AreaManagerListItem[], "MERCHANT" | "RIDER">({
      query: (type) => `/area-manager/list?type=${type}`,
    }),

    getAreaManagerStores: build.query<StoresListResponse, StoresListParams | void>({
      query: (params) => {
        const qs = new URLSearchParams();
        if (params?.filter) qs.set("filter", params.filter);
        if (params?.status && params.status !== "ALL") qs.set("status", params.status);
        if (params?.parentId) qs.set("parentId", params.parentId);
        if (params?.search?.trim()) qs.set("search", params.search.trim());
        if (params?.cursor) qs.set("cursor", params.cursor);
        qs.set("limit", String(params?.limit ?? 20));
        const search = qs.toString();
        return search ? `/area-manager/stores?${search}` : "/area-manager/stores";
      },
    }),

    getAreaManagerParentsForChild: build.query<StoreItem[], void>({
      query: () => "/area-manager/stores?filter=parent&limit=100",
      transformResponse: (response: { data?: { items?: StoreItem[] } }) => response?.data?.items ?? [],
    }),

    addAreaManagerStore: build.mutation<
      { success: boolean },
      { storeId: string; name: string; ownerPhone: string; parentStoreId?: number | null }
    >({
      query: (body) => ({
        url: "/area-manager/stores",
        method: "POST",
        body,
      }),
      invalidatesTags: [],
    }),

    getAreaManagerRiders: build.query<AreaManagerRidersListResponse, AreaManagerRidersListParams | void>({
      query: (params) => {
        const qs = new URLSearchParams();
        if (params?.status && params.status !== "ALL") qs.set("status", params.status);
        if (params?.search?.trim()) qs.set("search", params.search.trim());
        if (params?.localityCode?.trim()) qs.set("localityCode", params.localityCode.trim());
        if (params?.cursor) qs.set("cursor", params.cursor);
        qs.set("limit", String(params?.limit ?? 20));
        const search = qs.toString();
        return search ? `/area-manager/riders?${search}` : "/area-manager/riders";
      },
    }),
  }),
  overrideExisting: false,
});

export const {
  useGetAreaManagerMetricsQuery,
  useGetAreaManagerCountsQuery,
  useGetAreaManagersQuery,
  useGetAreaManagerStoresQuery,
  useGetAreaManagerParentsForChildQuery,
  useAddAreaManagerStoreMutation,
  useGetAreaManagerRidersQuery,
} = areaManagerApi;

