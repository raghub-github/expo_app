import { baseApi } from "./baseApi";

/**
 * RTK Query API for Dashboard Home section:
 * - Service points (list, create, delete) for the map
 * - Geocode city for the add-service-point form
 */

export interface ServicePoint {
  id: number;
  name: string;
  city: string;
  latitude: number;
  longitude: number;
  address?: string;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface CreateServicePointInput {
  name: string;
  city: string;
  latitude: number;
  longitude: number;
  address?: string | null;
}

export interface GeocodeResult {
  latitude: number;
  longitude: number;
  placeName?: string;
  city?: string;
}

export const dashboardHomeApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    getServicePoints: build.query<ServicePoint[], void>({
      query: () => "/service-points",
      // Keep map points warm across dashboard route switches so Home returns instantly.
      keepUnusedDataFor: 60 * 30, // 30 minutes
      transformResponse: (response: { success?: boolean; data?: ServicePoint[] }) => {
        if (!response?.success || !response.data) return [];
        return Array.isArray(response.data) ? response.data : [];
      },
      providesTags: (result) =>
        result
          ? [
              ...result.map(({ id }) => ({ type: "ServicePoint" as const, id })),
              { type: "ServicePoint", id: "LIST" },
            ]
          : [{ type: "ServicePoint", id: "LIST" }],
    }),

    createServicePoint: build.mutation<ServicePoint, CreateServicePointInput>({
      query: (body) => ({
        url: "/service-points",
        method: "POST",
        body,
      }),
      transformResponse: (response: { success?: boolean; data?: ServicePoint | ServicePoint[] }) => {
        if (!response?.success || !response.data) throw new Error("Failed to create service point");
        const data = response.data;
        return Array.isArray(data) ? data[0]! : (data as ServicePoint);
      },
      invalidatesTags: [{ type: "ServicePoint", id: "LIST" }],
    }),

    deleteServicePoint: build.mutation<{ success: boolean }, number>({
      query: (id) => ({
        url: `/service-points?id=${id}`,
        method: "DELETE",
      }),
      transformResponse: (response: { success?: boolean }) => {
        if (!response?.success) throw new Error("Failed to delete service point");
        return { success: true };
      },
      invalidatesTags: (_result, _error, id) => [
        { type: "ServicePoint", id },
        { type: "ServicePoint", id: "LIST" },
      ],
    }),

    geocodeCity: build.mutation<GeocodeResult, { city: string }>({
      query: (body) => ({
        url: "/service-points/geocode",
        method: "POST",
        body,
      }),
      transformResponse: (response: { success?: boolean; data?: GeocodeResult }) => {
        if (!response?.success || !response.data) throw new Error("Failed to geocode city");
        return response.data;
      },
    }),
  }),
  overrideExisting: false,
});

/** Shown when API returns 401 (session expired). */
export const SESSION_EXPIRED_MESSAGE =
  "Your session has expired. Please log in again to continue.";

export const {
  useGetServicePointsQuery,
  useCreateServicePointMutation,
  useDeleteServicePointMutation,
  useGeocodeCityMutation,
} = dashboardHomeApi;
