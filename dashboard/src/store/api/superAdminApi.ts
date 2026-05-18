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
  tagLightColor?: string | null;
  isActive: boolean;
  createdAt?: string;
}

export interface TicketPriorityDefinition {
  id: number;
  priorityCode: string;
  displayName: string;
  description: string | null;
  sortOrder: number;
  colorHex: string | null;
  /** DB `priority_level` (1 = lowest urgency in seed; higher = more urgent). */
  priorityLevel?: number | null;
  defaultSlaMinutes?: number | null;
  displayIcon?: string | null;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface TicketTitleRow {
  id: number;
  groupId: number | null;
  groupCode: string | null;
  groupName: string | null;
  serviceType: string;
  ticketSection: string;
  sourceRole: string;
  titleCode: string;
  titleText: string;
  description: string | null;
  displayOrder: number | null;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
  subtext?: string | null;
  defaultQuickOptions?: string[] | null;
  /** All tags linked via ticket_title_tags (and legacy tag_id). */
  tagIds?: number[];
  tags?: { id: number; tagCode: string; tagName: string }[];
  /** First tag id (legacy / convenience). */
  tagId?: number | null;
  tagCode?: string | null;
  tagName?: string | null;
  priorityId?: number | null;
  priorityCode?: string | null;
  priorityDisplayName?: string | null;
  merchantSectionId?: string | null;
  /** Customer-app section bucket (orders | payments | account | app | general). Drives /support help-sections grouping. */
  customerSectionId?: string | null;
  /** Order status codes this title is shown for (PG order_status_type values + 'NO_ORDER' sentinel). NULL = always show. */
  applicableOrderStatuses?: string[] | null;
  intakeTicketType?: string | null;
  intakeUnifiedTitle?: string | null;
  intakeUnifiedCategory?: string | null;
  intakeUnifiedPriority?: string | null;
  intakeUnifiedServiceType?: string | null;
  /** Optional parent row for nested help-topic / title trees. */
  parentTitleId?: number | null;
  metadata?: Record<string, unknown>;
  merchantHelpIconName?: string | null;
}

export interface TicketTitleConfigRow {
  id: number;
  ticketTitle: string;
  displayName: string;
  description: string | null;
  applicableToTicketType: unknown;
  applicableToServiceType: unknown;
  applicableToSource: unknown;
  defaultPriority: string | null;
  defaultCategory: string | null;
  defaultAutoAssign: boolean | null;
  defaultAutoAssignToAgentId: number | null;
  isActive: boolean;
  displayOrder: number | null;
  metadata: Record<string, unknown>;
  createdAt?: string;
  updatedAt?: string;
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

    /** Full ticket_groups rows + titles (super-admin ticket settings). */
    listTicketGroupsAdmin: build.query<TicketGroup[], void>({
      query: () => "/tickets/reference-data/groups",
      transformResponse: (response: { success?: boolean; data?: { groups?: TicketGroup[] } }) => {
        if (!response?.success || !Array.isArray(response.data?.groups)) return [];
        return response.data!.groups as TicketGroup[];
      },
      providesTags: [{ type: "Ticket" as const, id: "GROUPS_ADMIN" }],
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
      transformResponse: (response: { success?: boolean; data?: { group?: TicketGroup } & Partial<TicketGroup> }) => {
        if (!response?.success || !response.data) {
          throw new Error(response && "error" in response ? (response as any).error || "Failed to create group" : "Failed to create group");
        }
        const g = response.data.group ?? (typeof response.data.id === "number" ? (response.data as TicketGroup) : null);
        if (!g) {
          throw new Error("Failed to create group");
        }
        return g as TicketGroup;
      },
      invalidatesTags: [
        { type: "Ticket", id: "REFERENCE" },
        { type: "Ticket", id: "GROUPS_ADMIN" },
        { type: "Ticket", id: "TITLES_ADMIN" },
      ],
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
      invalidatesTags: [
        { type: "Ticket", id: "REFERENCE" },
        { type: "Ticket", id: "GROUPS_ADMIN" },
        { type: "Ticket", id: "TITLES_ADMIN" },
      ],
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
      invalidatesTags: [
        { type: "Ticket", id: "REFERENCE" },
        { type: "Ticket", id: "GROUPS_ADMIN" },
        { type: "Ticket", id: "TITLES_ADMIN" },
      ],
    }),

    listTicketTagsAdmin: build.query<TicketTag[], void>({
      query: () => "/tickets/reference-data/tags",
      transformResponse: (response: { success?: boolean; data?: { tags?: TicketTag[] } }) => {
        if (!response?.success || !Array.isArray(response.data?.tags)) return [];
        return response.data!.tags as TicketTag[];
      },
      providesTags: [{ type: "Ticket" as const, id: "TAGS_ADMIN" }],
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
      transformResponse: (response: { success?: boolean; data?: { tag?: TicketTag } & Partial<TicketTag> }) => {
        if (!response?.success || !response.data) {
          throw new Error(response && "error" in response ? (response as any).error || "Failed to create tag" : "Failed to create tag");
        }
        const t = response.data.tag ?? (typeof response.data.id === "number" ? (response.data as TicketTag) : null);
        if (!t) throw new Error("Failed to create tag");
        return t as TicketTag;
      },
      invalidatesTags: [
        { type: "Ticket", id: "REFERENCE" },
        { type: "Ticket", id: "TAGS_ADMIN" },
      ],
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
      invalidatesTags: [
        { type: "Ticket", id: "REFERENCE" },
        { type: "Ticket", id: "TAGS_ADMIN" },
      ],
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
      invalidatesTags: [
        { type: "Ticket", id: "REFERENCE" },
        { type: "Ticket", id: "TAGS_ADMIN" },
      ],
    }),

    listTicketTitlesAdmin: build.query<TicketTitleRow[], void>({
      query: () => "/tickets/reference-data/titles",
      transformResponse: (response: { success?: boolean; data?: { titles?: TicketTitleRow[] } }) => {
        if (!response?.success || !Array.isArray(response.data?.titles)) return [];
        return response.data!.titles as TicketTitleRow[];
      },
      providesTags: [{ type: "Ticket" as const, id: "TITLES_ADMIN" }],
    }),

    updateTicketTitleAdmin: build.mutation<
      TicketTitleRow,
      {
        id: number;
        updates: Partial<
          Pick<
            TicketTitleRow,
            | "isActive"
            | "titleText"
            | "titleCode"
            | "description"
            | "displayOrder"
            | "groupId"
            | "serviceType"
            | "ticketSection"
            | "sourceRole"
            | "subtext"
            | "defaultQuickOptions"
            | "tagIds"
            | "tagId"
            | "priorityId"
            | "merchantSectionId"
            | "customerSectionId"
            | "applicableOrderStatuses"
            | "intakeTicketType"
            | "intakeUnifiedTitle"
            | "intakeUnifiedCategory"
            | "intakeUnifiedPriority"
            | "intakeUnifiedServiceType"
            | "merchantHelpIconName"
            | "metadata"
            | "parentTitleId"
          >
        >;
      }
    >({
      query: ({ id, updates }) => ({
        url: `/tickets/reference-data/titles/${id}`,
        method: "PATCH",
        body: updates,
      }),
      transformResponse: (response: { success?: boolean; data?: TicketTitleRow }) => {
        if (!response?.success || !response.data) {
          throw new Error(response && "error" in response ? (response as any).error || "Failed to update title" : "Failed to update title");
        }
        return response.data as TicketTitleRow;
      },
      invalidatesTags: [
        { type: "Ticket", id: "TITLES_ADMIN" },
        { type: "Ticket", id: "GROUPS_ADMIN" },
        { type: "Ticket", id: "REFERENCE" },
      ],
    }),

    createTicketTitleAdmin: build.mutation<
      TicketTitleRow,
      {
        titleText: string;
        titleCode?: string;
        groupId?: number | null;
        description?: string | null;
        displayOrder?: number | null;
        serviceType?: string;
        ticketSection?: string;
        sourceRole?: string;
        subtext?: string | null;
        defaultQuickOptions?: string[] | string | null;
        tagIds?: number[];
        tagId?: number | null;
        priorityId?: number | null;
        merchantSectionId?: string | null;
        customerSectionId?: string | null;
        applicableOrderStatuses?: string[] | null;
        intakeTicketType?: string | null;
        intakeUnifiedTitle?: string | null;
        intakeUnifiedCategory?: string | null;
        intakeUnifiedPriority?: string | null;
        intakeUnifiedServiceType?: string | null;
        merchantHelpIconName?: string | null;
        metadata?: Record<string, unknown> | string | null;
        isActive?: boolean;
        parentTitleId?: number | null;
      }
    >({
      query: (body) => ({
        url: "/tickets/reference-data/titles",
        method: "POST",
        body,
      }),
      transformResponse: (response: { success?: boolean; data?: { title?: TicketTitleRow } }) => {
        if (!response?.success || !response.data?.title) {
          throw new Error(response && "error" in response ? (response as any).error || "Failed to create title" : "Failed to create title");
        }
        return response.data.title as TicketTitleRow;
      },
      invalidatesTags: [
        { type: "Ticket", id: "TITLES_ADMIN" },
        { type: "Ticket", id: "GROUPS_ADMIN" },
        { type: "Ticket", id: "REFERENCE" },
      ],
    }),

    deleteTicketTitleAdmin: build.mutation<{ id: number }, number>({
      query: (id) => ({
        url: `/tickets/reference-data/titles/${id}`,
        method: "DELETE",
      }),
      transformResponse: (response: { success?: boolean; data?: { id?: number } }) => {
        if (!response?.success || response.data?.id == null) {
          throw new Error(response && "error" in response ? (response as any).error || "Failed to delete title" : "Failed to delete title");
        }
        return { id: response.data.id };
      },
      invalidatesTags: [
        { type: "Ticket", id: "TITLES_ADMIN" },
        { type: "Ticket", id: "GROUPS_ADMIN" },
        { type: "Ticket", id: "REFERENCE" },
      ],
    }),

    listTicketPrioritiesAdmin: build.query<TicketPriorityDefinition[], void>({
      query: () => "/tickets/reference-data/priorities",
      transformResponse: (response: { success?: boolean; data?: { priorities?: TicketPriorityDefinition[] } }) => {
        if (!response?.success || !Array.isArray(response.data?.priorities)) return [];
        return response.data!.priorities as TicketPriorityDefinition[];
      },
      providesTags: [{ type: "Ticket" as const, id: "PRIORITIES_ADMIN" }],
    }),

    createTicketPriorityAdmin: build.mutation<
      TicketPriorityDefinition,
      {
        priorityCode: string;
        displayName: string;
        description?: string | null;
        sortOrder?: number;
        colorHex?: string | null;
        priorityLevel?: number | null;
        defaultSlaMinutes?: number | null;
        displayIcon?: string | null;
      }
    >({
      query: (body) => ({
        url: "/tickets/reference-data/priorities",
        method: "POST",
        body,
      }),
      transformResponse: (response: { success?: boolean; data?: { priority?: TicketPriorityDefinition } }) => {
        if (!response?.success || !response.data?.priority) {
          throw new Error(response && "error" in response ? (response as any).error || "Failed to create priority" : "Failed to create priority");
        }
        return response.data.priority as TicketPriorityDefinition;
      },
      invalidatesTags: [{ type: "Ticket", id: "PRIORITIES_ADMIN" }],
    }),

    updateTicketPriorityAdmin: build.mutation<
      TicketPriorityDefinition,
      {
        id: number;
        updates: Partial<
          Pick<
            TicketPriorityDefinition,
            | "priorityCode"
            | "displayName"
            | "description"
            | "sortOrder"
            | "colorHex"
            | "priorityLevel"
            | "defaultSlaMinutes"
            | "displayIcon"
            | "isActive"
          >
        >;
      }
    >({
      query: ({ id, updates }) => ({
        url: `/tickets/reference-data/priorities/${id}`,
        method: "PATCH",
        body: updates,
      }),
      transformResponse: (response: { success?: boolean; data?: TicketPriorityDefinition }) => {
        if (!response?.success || !response.data) {
          throw new Error(response && "error" in response ? (response as any).error || "Failed to update priority" : "Failed to update priority");
        }
        return response.data as TicketPriorityDefinition;
      },
      invalidatesTags: [{ type: "Ticket", id: "PRIORITIES_ADMIN" }],
    }),

    deleteTicketPriorityAdmin: build.mutation<{ id: number }, number>({
      query: (id) => ({
        url: `/tickets/reference-data/priorities/${id}`,
        method: "DELETE",
      }),
      transformResponse: (response: { success?: boolean; data?: { id: number } }) => {
        if (!response?.success || !response.data) {
          throw new Error(response && "error" in response ? (response as any).error || "Failed to remove priority" : "Failed to remove priority");
        }
        return { id: response.data.id };
      },
      invalidatesTags: [{ type: "Ticket", id: "PRIORITIES_ADMIN" }],
    }),

    listTicketTitleConfigAdmin: build.query<TicketTitleConfigRow[], void>({
      query: () => "/tickets/reference-data/title-config",
      transformResponse: (response: { success?: boolean; data?: { configs?: TicketTitleConfigRow[] } }) => {
        if (!response?.success || !Array.isArray(response.data?.configs)) return [];
        return response.data!.configs as TicketTitleConfigRow[];
      },
      providesTags: [{ type: "Ticket" as const, id: "TITLE_CONFIG_ADMIN" }],
    }),

    updateTicketTitleConfigAdmin: build.mutation<
      Partial<TicketTitleConfigRow> & { id: number },
      { id: number; updates: Partial<Pick<TicketTitleConfigRow, "isActive" | "displayName" | "displayOrder" | "description">> }
    >({
      query: ({ id, updates }) => ({
        url: `/tickets/reference-data/title-config/${id}`,
        method: "PATCH",
        body: updates,
      }),
      transformResponse: (response: { success?: boolean; data?: Partial<TicketTitleConfigRow> }) => {
        if (!response?.success || !response.data) {
          throw new Error(response && "error" in response ? (response as any).error || "Failed to update" : "Failed to update");
        }
        return response.data as Partial<TicketTitleConfigRow> & { id: number };
      },
      invalidatesTags: [{ type: "Ticket", id: "TITLE_CONFIG_ADMIN" }],
    }),
  }),
  overrideExisting: false,
});

export const {
  useGetTicketReferenceDataQuery,
  useListTicketGroupsAdminQuery,
  useListTicketTagsAdminQuery,
  useListTicketTitlesAdminQuery,
  useListTicketTitleConfigAdminQuery,
  useListTicketPrioritiesAdminQuery,
  useCreateTicketGroupMutation,
  useUpdateTicketGroupMutation,
  useDeleteTicketGroupMutation,
  useCreateTicketTagMutation,
  useUpdateTicketTagMutation,
  useDeleteTicketTagMutation,
  useUpdateTicketTitleAdminMutation,
  useCreateTicketTitleAdminMutation,
  useDeleteTicketTitleAdminMutation,
  useCreateTicketPriorityAdminMutation,
  useUpdateTicketPriorityAdminMutation,
  useDeleteTicketPriorityAdminMutation,
  useUpdateTicketTitleConfigAdminMutation,
} = superAdminApi;

