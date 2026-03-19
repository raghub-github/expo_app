import { baseApi } from "./baseApi";

export interface TicketGroupTitle {
  id?: number;
  titleCode: string;
  titleText: string;
  displayOrder?: number | null;
}

export interface TicketGroup {
  id: number;
  groupCode: string;
  groupName: string;
  groupDescription: string | null;
  parentGroupId: number | null;
  displayOrder: number | null;
  serviceType: string | null;
  ticketSection: string | null;
  ticketCategory: string | null;
  sourceRole: string | null;
  isActive: boolean;
  titles?: TicketGroupTitle[];
}

export interface TicketTag {
  id: number;
  tagCode: string;
  tagName: string;
  tagDescription: string | null;
  tagColor: string | null;
  isActive: boolean;
}

interface ReferenceDataResponse {
  groups: Array<{ id: number; groupCode: string; groupName: string }>;
  tags: Array<{ id: number; tagCode: string; tagName: string }>;
}

export const superAdminApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    getTicketReferenceData: build.query<ReferenceDataResponse, void>({
      query: () => "/tickets/reference-data",
      transformResponse: (response: { success?: boolean; data?: any }) => {
        if (!response?.success || !response.data) {
          return { groups: [], tags: [] };
        }
        return {
          groups: response.data.groups ?? [],
          tags: response.data.tags ?? [],
        } as ReferenceDataResponse;
      },
      providesTags: [{ type: "Ticket" as const, id: "REFERENCE" }],
    }),

    createTicketGroup: build.mutation<
      TicketGroup,
      {
        groupCode: string;
        groupName: string;
        groupDescription?: string | null;
        parentGroupId?: number | null;
        displayOrder?: number | null;
        serviceType?: string | null;
        ticketSection?: string | null;
        ticketCategory?: string | null;
        sourceRole?: string | null;
        titles?: { titleCode: string; titleText: string }[];
      }
    >({
      query: (body) => ({
        url: "/tickets/reference-data/groups",
        method: "POST",
        body,
      }),
      transformResponse: (response: { success?: boolean; data?: { group?: TicketGroup } }) => {
        if (!response?.success || !response.data?.group) {
          throw new Error(response && "error" in response ? (response as any).error || "Failed to create group" : "Failed to create group");
        }
        return response.data.group as TicketGroup;
      },
      invalidatesTags: [{ type: "Ticket", id: "REFERENCE" }],
    }),

    updateTicketGroup: build.mutation<
      TicketGroup,
      { id: number; updates: Partial<TicketGroup> & { titles?: TicketGroupTitle[] } }
    >({
      query: ({ id, updates }) => ({
        url: `/tickets/reference-data/groups/${id}`,
        method: "PATCH",
        body: updates,
      }),
      transformResponse: (response: { success?: boolean; data?: TicketGroup }) => {
        if (!response?.success || !response.data) {
          throw new Error(response && "error" in response ? (response as any).error || "Failed to update group" : "Failed to update group");
        }
        return response.data as TicketGroup;
      },
      invalidatesTags: [{ type: "Ticket", id: "REFERENCE" }],
    }),

    deleteTicketGroup: build.mutation<{ id: number }, number>({
      query: (id) => ({
        url: `/tickets/reference-data/groups/${id}`,
        method: "DELETE",
      }),
      transformResponse: (response: { success?: boolean; data?: { id: number } }) => {
        if (!response?.success || !response.data) {
          throw new Error(response && "error" in response ? (response as any).error || "Failed to delete group" : "Failed to delete group");
        }
        return { id: response.data.id };
      },
      invalidatesTags: [{ type: "Ticket", id: "REFERENCE" }],
    }),

    createTicketTag: build.mutation<
      TicketTag,
      { tagCode: string; tagName: string; tagDescription?: string | null; tagColor?: string | null }
    >({
      query: (body) => ({
        url: "/tickets/reference-data/tags",
        method: "POST",
        body,
      }),
      transformResponse: (response: { success?: boolean; data?: { tag?: TicketTag } }) => {
        if (!response?.success || !response.data?.tag) {
          throw new Error(response && "error" in response ? (response as any).error || "Failed to create tag" : "Failed to create tag");
        }
        return response.data.tag as TicketTag;
      },
      invalidatesTags: [{ type: "Ticket", id: "REFERENCE" }],
    }),

    updateTicketTag: build.mutation<TicketTag, { id: number; updates: Partial<TicketTag> }>({
      query: ({ id, updates }) => ({
        url: `/tickets/reference-data/tags/${id}`,
        method: "PATCH",
        body: updates,
      }),
      transformResponse: (response: { success?: boolean; data?: TicketTag }) => {
        if (!response?.success || !response.data) {
          throw new Error(response && "error" in response ? (response as any).error || "Failed to update tag" : "Failed to update tag");
        }
        return response.data as TicketTag;
      },
      invalidatesTags: [{ type: "Ticket", id: "REFERENCE" }],
    }),

    deleteTicketTag: build.mutation<{ id: number }, number>({
      query: (id) => ({
        url: `/tickets/reference-data/tags/${id}`,
        method: "DELETE",
      }),
      transformResponse: (response: { success?: boolean; data?: { id: number } }) => {
        if (!response?.success || !response.data) {
          throw new Error(response && "error" in response ? (response as any).error || "Failed to delete tag" : "Failed to delete tag");
        }
        return { id: response.data.id };
      },
      invalidatesTags: [{ type: "Ticket", id: "REFERENCE" }],
    }),
  }),
  overrideExisting: false,
});

export const {
  useGetTicketReferenceDataQuery,
  useCreateTicketGroupMutation,
  useUpdateTicketGroupMutation,
  useDeleteTicketGroupMutation,
  useCreateTicketTagMutation,
  useUpdateTicketTagMutation,
  useDeleteTicketTagMutation,
} = superAdminApi;

