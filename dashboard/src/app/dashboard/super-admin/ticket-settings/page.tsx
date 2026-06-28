"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { FolderGit2, Tag, Plus, Pencil, Trash2, X, List, ListTree, BookMarked, Gauge } from "lucide-react";
import { TicketHelpTopicsPanel } from "@/components/tickets/admin/TicketHelpTopicsPanel";
import { TicketPrioritiesPanel } from "@/components/tickets/admin/TicketPrioritiesPanel";
import { usePermissions } from "@/hooks/usePermissions";
import { useAppPathname, useAppSearchParams } from "@/hooks/useAppSearchParams";
import { useRouter } from "next/navigation";
import {
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
  useUpdateTicketTitleConfigAdminMutation,
  type TicketTitleRow,
  type TicketTitleConfigRow,
} from "@/store/api/superAdminApi";

type TitleRow = { id: number; titleCode: string; titleText: string; displayOrder: number | null };
type Group = {
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
  titles?: Array<{ id: number; titleCode: string; titleText: string; displayOrder: number | null }>;
};

const SERVICE_TYPES = [
  { value: "food", label: "Food" },
  { value: "parcel", label: "Parcel" },
  { value: "person_ride", label: "Person ride" },
  { value: "other", label: "Other" },
];
const TICKET_CATEGORIES = [
  { value: "order_related", label: "Order related" },
  { value: "non_order", label: "Non-order related" },
  { value: "other", label: "Other" },
];
const USER_TYPES = [
  { value: "customer", label: "Customer" },
  { value: "rider", label: "Rider" },
  { value: "merchant", label: "Merchant" },
  { value: "system", label: "System" },
  { value: "other", label: "Others" },
];
const SOURCE_ROLES = [
  { value: "customer", label: "Customer" },
  { value: "rider", label: "Rider" },
  { value: "merchant", label: "Merchant" },
  { value: "system", label: "System" },
  { value: "customer_pickup", label: "Customer (pickup)" },
  { value: "customer_drop", label: "Customer (drop)" },
  { value: "rider_3pl", label: "Rider 3PL" },
  { value: "provider", label: "Provider" },
];

function optionLabel(options: { value: string; label: string }[], value: string | null | undefined): string {
  if (value == null || value === "") return "—";
  return options.find((o) => o.value === value)?.label ?? value;
}

function formatJsonPreview(v: unknown, max = 72): string {
  if (v == null) return "—";
  if (Array.isArray(v) && v.length === 0) return "—";
  const s = typeof v === "string" ? v : JSON.stringify(v);
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

function ActiveSwitch({
  active,
  busy,
  onToggle,
  ariaLabel,
}: {
  active: boolean;
  busy?: boolean;
  onToggle: () => void;
  ariaLabel: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={active}
      aria-label={ariaLabel}
      disabled={busy}
      onClick={onToggle}
      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed ${
        active ? "bg-emerald-500" : "bg-gray-200"
      }`}
    >
      <span
        className={`pointer-events-none mt-0.5 inline-block h-5 w-5 rounded-full bg-white shadow transition ${
          active ? "translate-x-5" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}

function slugSegment(raw: string | null | undefined): string {
  if (raw == null || !String(raw).trim()) return "NA";
  const s = String(raw)
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 24);
  return s || "NA";
}

/** Deterministic code from routing dimensions; suffix if it collides with existing groups. */
function generateTicketGroupCode(
  partial: {
    serviceType?: string | null | undefined;
    ticketCategory?: string | null | undefined;
    ticketSection?: string | null | undefined;
    sourceRole?: string | null | undefined;
  },
  existingCodes: Set<string>,
  excludeCode?: string
): string {
  const base = ["GRP", slugSegment(partial.serviceType), slugSegment(partial.ticketCategory), slugSegment(partial.ticketSection), slugSegment(partial.sourceRole)].join("_");
  const reserved = new Set(existingCodes);
  if (excludeCode) reserved.delete(excludeCode);
  let code = base;
  let n = 0;
  while (reserved.has(code) && n < 500) {
    n += 1;
    code = `${base}_${n}`;
  }
  if (reserved.has(code)) {
    code = `${base}_${Math.random().toString(36).slice(2, 10).toUpperCase()}`;
  }
  return code;
}

type TagRecord = {
  id: number;
  tagCode: string;
  tagName: string;
  tagDescription: string | null;
  tagColor: string | null;
  tagLightColor?: string | null;
  isActive: boolean;
};

const PAGE_SHELL_CLASS = "w-full min-w-0 max-w-none p-4 sm:p-6 lg:px-8 lg:pb-10";

type SettingsTab = "groups" | "tags" | "titles" | "helpTopics" | "priorities" | "titleConfig";

const TAB_VALUES: SettingsTab[] = ["groups", "tags", "titles", "helpTopics", "priorities", "titleConfig"];

const HELP_AUDIENCE_OPTIONS = [
  { value: "all", label: "All audiences" },
  { value: "customer", label: "Customer" },
  { value: "merchant", label: "Merchant" },
  { value: "rider", label: "Rider" },
] as const;

function parseTabParam(raw: string | null): SettingsTab {
  if (raw && TAB_VALUES.includes(raw as SettingsTab)) return raw as SettingsTab;
  return "groups";
}

function formatRtkQueryError(e: unknown): string {
  if (e == null) return "Request failed";
  if (typeof e === "string") return e;
  if (typeof e === "object" && e !== null && "data" in e) {
    const d = (e as { data?: unknown }).data;
    if (typeof d === "object" && d !== null && "error" in d && typeof (d as { error?: string }).error === "string") {
      return (d as { error: string }).error;
    }
  }
  if (typeof e === "object" && e !== null && "error" in e && typeof (e as { error?: string }).error === "string") {
    return (e as { error: string }).error;
  }
  if (e instanceof Error) return e.message;
  try {
    return JSON.stringify(e);
  } catch {
    return String(e);
  }
}

function TicketSettingsPageContent() {
  const router = useRouter();
  const pathname = useAppPathname();
  const searchParams = useAppSearchParams();
  const { isSuperAdmin, loading } = usePermissions();
  const [mounted, setMounted] = useState(false);

  const activeTab = useMemo(() => parseTabParam(searchParams.get("tab")), [searchParams]);

  const setActiveTab = useCallback(
    (tab: SettingsTab) => {
      const p = new URLSearchParams(searchParams.toString());
      p.set("tab", tab);
      router.replace(`${pathname}?${p.toString()}`, { scroll: false });
    },
    [pathname, router, searchParams]
  );

  const helpAudienceRaw = searchParams.get("helpAudience");
  const helpAudience =
    helpAudienceRaw === "customer" || helpAudienceRaw === "merchant" || helpAudienceRaw === "rider" ? helpAudienceRaw : "all";

  const helpServiceRaw = searchParams.get("helpService");
  const helpService = SERVICE_TYPES.some((o) => o.value === helpServiceRaw) ? helpServiceRaw! : "all";

  const setHelpTopicFilters = useCallback(
    (patch: { helpAudience?: string; helpService?: string }) => {
      const p = new URLSearchParams(searchParams.toString());
      const aud = patch.helpAudience ?? helpAudience;
      const srv = patch.helpService ?? helpService;
      if (aud === "all") p.delete("helpAudience");
      else p.set("helpAudience", aud);
      if (srv === "all") p.delete("helpService");
      else p.set("helpService", srv);
      router.replace(`${pathname}?${p.toString()}`, { scroll: false });
    },
    [pathname, router, searchParams, helpAudience, helpService]
  );
  const [groupForm, setGroupForm] = useState<
    (Omit<Partial<Group>, "titles"> & { groupCode: string; groupName: string; titles?: TitleRow[] }) | null
  >(null);
  const [tagForm, setTagForm] = useState<Partial<TagRecord> & { tagCode: string; tagName: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [togglingActiveId, setTogglingActiveId] = useState<number | null>(null);
  const [togglingTagId, setTogglingTagId] = useState<number | null>(null);
  const [togglingConfigId, setTogglingConfigId] = useState<number | null>(null);
  const [togglingTitleId, setTogglingTitleId] = useState<number | null>(null);

  const {
    data: groups = [],
    isLoading: groupsLoading,
    isError: groupsError,
    error: groupsErrorDetail,
    refetch: refetchGroups,
  } = useListTicketGroupsAdminQuery(undefined, {
    skip: !isSuperAdmin,
    refetchOnFocus: false,
    refetchOnReconnect: false,
  });

  const {
    data: tags = [],
    isLoading: tagsLoading,
    isError: tagsError,
    error: tagsErrorDetail,
    refetch: refetchTags,
  } = useListTicketTagsAdminQuery(undefined, {
    skip: !isSuperAdmin,
    refetchOnFocus: false,
    refetchOnReconnect: false,
  });

  const {
    data: ticketTitles = [],
    isLoading: titlesLoading,
    isError: titlesError,
    error: titlesErrorDetail,
    refetch: refetchTitles,
  } = useListTicketTitlesAdminQuery(undefined, {
    skip: !isSuperAdmin || (activeTab !== "helpTopics" && activeTab !== "titles"),
    refetchOnFocus: false,
    refetchOnReconnect: false,
  });

  const {
    data: priorityRows = [],
    isLoading: prioritiesLoading,
    isError: prioritiesError,
    error: prioritiesErrorDetail,
    refetch: refetchPriorities,
  } = useListTicketPrioritiesAdminQuery(undefined, {
    skip: !isSuperAdmin || (activeTab !== "priorities" && activeTab !== "helpTopics"),
    refetchOnFocus: false,
    refetchOnReconnect: false,
  });

  const {
    data: titleConfigs = [],
    isLoading: configLoading,
    isError: configError,
    error: configErrorDetail,
    refetch: refetchTitleConfig,
  } = useListTicketTitleConfigAdminQuery(undefined, {
    skip: !isSuperAdmin || activeTab !== "titleConfig",
    refetchOnFocus: false,
    refetchOnReconnect: false,
  });

  const existingGroupCodes = useMemo(() => new Set(groups.map((g) => g.groupCode)), [groups]);

  const helpFilteredGroups = useMemo(() => {
    return groups.filter((g) => {
      if (helpAudience !== "all" && String(g.ticketSection ?? "").toLowerCase() !== helpAudience) return false;
      if (helpService !== "all" && String(g.serviceType ?? "").toLowerCase() !== helpService) return false;
      return true;
    });
  }, [groups, helpAudience, helpService]);

  const helpFilteredTitles = useMemo(() => {
    return ticketTitles.filter((t) => {
      if (helpAudience !== "all" && String(t.ticketSection ?? "").toLowerCase() !== helpAudience) return false;
      if (helpService !== "all" && String(t.serviceType ?? "").toLowerCase() !== helpService) return false;
      return true;
    });
  }, [ticketTitles, helpAudience, helpService]);

  const [createGroupMutation] = useCreateTicketGroupMutation();
  const [updateGroupMutation] = useUpdateTicketGroupMutation();
  const [deleteGroupMutation] = useDeleteTicketGroupMutation();
  const [createTagMutation] = useCreateTicketTagMutation();
  const [updateTagMutation] = useUpdateTicketTagMutation();
  const [deleteTagMutation] = useDeleteTicketTagMutation();
  const [updateTitleMutation] = useUpdateTicketTitleAdminMutation();
  const [updateTitleConfigMutation] = useUpdateTicketTitleConfigAdminMutation();

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted || loading) return;
    if (!isSuperAdmin) {
      router.push("/dashboard");
    }
  }, [mounted, loading, isSuperAdmin, router]);

  const createGroup = async () => {
    if (!groupForm?.groupName?.trim()) {
      setError("Group name is required");
      return;
    }
    if (!groupForm.serviceType || !groupForm.ticketCategory || !groupForm.ticketSection || !groupForm.sourceRole) {
      setError("Select Service, Order type, User type, and Source of ticket.");
      return;
    }
    if (!groupForm.groupCode?.trim()) {
      setError("Group code could not be generated. Adjust the fields above or click Regenerate.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const titles = (groupForm.titles ?? []).filter((t) => t.titleCode?.trim() && t.titleText?.trim());
      await createGroupMutation({
        groupCode: groupForm.groupCode.trim(),
        groupName: groupForm.groupName.trim(),
        groupDescription: groupForm.groupDescription?.trim() || null,
        parentGroupId: groupForm.parentGroupId ?? null,
        displayOrder: groupForm.displayOrder ?? null,
        serviceType: groupForm.serviceType || null,
        ticketSection: groupForm.ticketSection || null,
        ticketCategory: groupForm.ticketCategory || null,
        sourceRole: groupForm.sourceRole || null,
        titles: titles.map((t) => ({ titleCode: t.titleCode.trim(), titleText: t.titleText.trim() })),
      }).unwrap();
      setGroupForm(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create group");
    } finally {
      setSaving(false);
    }
  };

  const updateGroup = async (id: number, updates: Partial<Group> & { titles?: TitleRow[] }) => {
    setSaving(true);
    setError(null);
    try {
      const payload: Record<string, unknown> = { ...updates };
      if (Array.isArray(updates.titles)) {
        payload.titles = updates.titles
          .filter((t) => t.titleCode?.trim() && t.titleText?.trim())
          .map((t) => ({ titleCode: t.titleCode.trim(), titleText: t.titleText.trim() }));
      }
      await updateGroupMutation({ id, updates: payload as any }).unwrap();
      setGroupForm(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update group");
    } finally {
      setSaving(false);
    }
  };

  const toggleGroupActive = async (g: { id: number; isActive: boolean }) => {
    setTogglingActiveId(g.id);
    setError(null);
    try {
      await updateGroupMutation({ id: g.id, updates: { isActive: !g.isActive } }).unwrap();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update status");
    } finally {
      setTogglingActiveId(null);
    }
  };

  const toggleTagActive = async (t: TagRecord) => {
    setTogglingTagId(t.id);
    setError(null);
    try {
      await updateTagMutation({ id: t.id, updates: { isActive: !t.isActive } }).unwrap();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update tag status");
    } finally {
      setTogglingTagId(null);
    }
  };

  const toggleTitleRowActive = async (row: TicketTitleRow) => {
    setTogglingTitleId(row.id);
    setError(null);
    try {
      await updateTitleMutation({ id: row.id, updates: { isActive: !row.isActive } }).unwrap();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update title status");
    } finally {
      setTogglingTitleId(null);
    }
  };

  const toggleTitleConfigActive = async (row: TicketTitleConfigRow) => {
    setTogglingConfigId(row.id);
    setError(null);
    try {
      await updateTitleConfigMutation({ id: row.id, updates: { isActive: !row.isActive } }).unwrap();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update title config");
    } finally {
      setTogglingConfigId(null);
    }
  };

  const onNewGroupDimensionChange = useCallback(
    (key: "serviceType" | "ticketCategory" | "ticketSection" | "sourceRole", value: string | null) => {
      setGroupForm((f) => {
        if (!f || f.id != null) {
          return f ? { ...f, [key]: value } : f;
        }
        const next = { ...f, [key]: value };
        return { ...next, groupCode: generateTicketGroupCode(next, existingGroupCodes) };
      });
    },
    [existingGroupCodes]
  );

  const deleteGroup = async (id: number) => {
    if (!confirm("Deactivate this group?")) return;
    setSaving(true);
    setError(null);
    try {
      await deleteGroupMutation(id).unwrap();
      setGroupForm(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to deactivate group");
    } finally {
      setSaving(false);
    }
  };

  const createTag = async () => {
    if (!tagForm?.tagCode?.trim() || !tagForm?.tagName?.trim()) {
      setError("Tag code and name required");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await createTagMutation({
        tagCode: tagForm.tagCode.trim(),
        tagName: tagForm.tagName.trim(),
        tagDescription: tagForm.tagDescription?.trim() || null,
        tagColor: tagForm.tagColor?.trim() || null,
      }).unwrap();
      setTagForm(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create tag");
    } finally {
      setSaving(false);
    }
  };

  const updateTag = async (id: number, updates: Partial<TagRecord>) => {
    setSaving(true);
    setError(null);
    try {
      await updateTagMutation({ id, updates }).unwrap();
      setTagForm(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update tag");
    } finally {
      setSaving(false);
    }
  };

  const deleteTag = async (id: number) => {
    if (!confirm("Deactivate this tag?")) return;
    setSaving(true);
    setError(null);
    try {
      await deleteTagMutation(id).unwrap();
      setTagForm(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to deactivate tag");
    } finally {
      setSaving(false);
    }
  };

  if (!mounted || loading || !isSuperAdmin) {
    return (
      <div className={PAGE_SHELL_CLASS}>
        <p className="text-gray-600">Loading...</p>
      </div>
    );
  }

  return (
    <div className={PAGE_SHELL_CLASS}>
      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-50 text-red-700 text-sm">
          {error}
        </div>
      )}

      <div className="flex flex-wrap gap-2 border-b border-gray-200 mb-6">
        <button
          type="button"
          onClick={() => setActiveTab("groups")}
          className={`px-4 py-2 text-sm font-medium rounded-t-lg ${
            activeTab === "groups" ? "bg-white border border-b-0 border-gray-200 text-blue-600" : "text-gray-600 hover:bg-gray-50"
          }`}
        >
          <span className="flex items-center gap-2">
            <FolderGit2 className="h-4 w-4" /> Groups
          </span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("tags")}
          className={`px-4 py-2 text-sm font-medium rounded-t-lg ${
            activeTab === "tags" ? "bg-white border border-b-0 border-gray-200 text-blue-600" : "text-gray-600 hover:bg-gray-50"
          }`}
        >
          <span className="flex items-center gap-2">
            <Tag className="h-4 w-4" /> Tags
          </span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("titles")}
          className={`px-4 py-2 text-sm font-medium rounded-t-lg ${
            activeTab === "titles" ? "bg-white border border-b-0 border-gray-200 text-blue-600" : "text-gray-600 hover:bg-gray-50"
          }`}
        >
          <span className="flex items-center gap-2">
            <List className="h-4 w-4" /> Titles
          </span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("helpTopics")}
          className={`px-4 py-2 text-sm font-medium rounded-t-lg ${
            activeTab === "helpTopics" ? "bg-white border border-b-0 border-gray-200 text-blue-600" : "text-gray-600 hover:bg-gray-50"
          }`}
        >
          <span className="flex items-center gap-2">
            <ListTree className="h-4 w-4" /> Help topics
          </span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("priorities")}
          className={`px-4 py-2 text-sm font-medium rounded-t-lg ${
            activeTab === "priorities" ? "bg-white border border-b-0 border-gray-200 text-blue-600" : "text-gray-600 hover:bg-gray-50"
          }`}
        >
          <span className="flex items-center gap-2">
            <Gauge className="h-4 w-4" /> Priorities
          </span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("titleConfig")}
          className={`px-4 py-2 text-sm font-medium rounded-t-lg ${
            activeTab === "titleConfig" ? "bg-white border border-b-0 border-gray-200 text-blue-600" : "text-gray-600 hover:bg-gray-50"
          }`}
        >
          <span className="flex items-center gap-2">
            <BookMarked className="h-4 w-4" /> Title catalog
          </span>
        </button>
      </div>

      {activeTab === "groups" && (
        groupsError ? (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            <p className="font-medium">Could not load ticket groups</p>
            <p className="mt-1 text-red-700">{formatRtkQueryError(groupsErrorDetail)}</p>
            <button
              type="button"
              onClick={() => void refetchGroups()}
              className="mt-3 rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700"
            >
              Retry
            </button>
          </div>
        ) : groupsLoading ? (
          <p className="text-gray-500">Loading groups...</p>
        ) : (
        <div>
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold text-gray-800">Ticket groups</h2>
            <button
              type="button"
              onClick={() => {
                const seed = {
                  groupCode: "",
                  groupName: "",
                  titles: [] as TitleRow[],
                  serviceType: null as string | null,
                  ticketCategory: null as string | null,
                  ticketSection: null as string | null,
                  sourceRole: null as string | null,
                  groupDescription: undefined as string | undefined,
                };
                setGroupForm({
                  ...seed,
                  groupCode: generateTicketGroupCode(seed, existingGroupCodes),
                });
              }}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              <Plus className="h-4 w-4" /> Add group
            </button>
          </div>
          {groupForm && !groupForm.id && (
            <div className="mb-6 p-4 rounded-lg border border-gray-200 bg-gray-50 space-y-4">
              <div>
                <h3 className="font-medium text-gray-800">New group</h3>
                <p className="mt-1 text-xs text-gray-500">
                  Choose a display name and routing fields. The group code is generated automatically; after you create the group you can add titles and more from Edit.
                </p>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Group name</label>
                <input
                  type="text"
                  value={groupForm.groupName}
                  onChange={(e) => setGroupForm((f) => f && { ...f, groupName: e.target.value })}
                  placeholder="e.g. Rider — Earnings & app"
                  className="w-full max-w-xl rounded border border-gray-300 px-3 py-2 text-sm"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Service</label>
                  <select
                    value={groupForm.serviceType ?? ""}
                    onChange={(e) => onNewGroupDimensionChange("serviceType", e.target.value || null)}
                    className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
                  >
                    <option value="">— Select —</option>
                    {SERVICE_TYPES.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Order type</label>
                  <select
                    value={groupForm.ticketCategory ?? ""}
                    onChange={(e) => onNewGroupDimensionChange("ticketCategory", e.target.value || null)}
                    className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
                  >
                    <option value="">— Select —</option>
                    {TICKET_CATEGORIES.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">User type</label>
                  <select
                    value={groupForm.ticketSection ?? ""}
                    onChange={(e) => onNewGroupDimensionChange("ticketSection", e.target.value || null)}
                    className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
                  >
                    <option value="">— Select —</option>
                    {USER_TYPES.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Source of ticket</label>
                  <select
                    value={groupForm.sourceRole ?? ""}
                    onChange={(e) => onNewGroupDimensionChange("sourceRole", e.target.value || null)}
                    className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
                  >
                    <option value="">— Select —</option>
                    {SOURCE_ROLES.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div className="min-w-0 flex-1">
                  <label className="block text-xs font-medium text-gray-600 mb-1">Generated code</label>
                  <p className="rounded border border-dashed border-gray-300 bg-white px-3 py-2 text-sm font-mono text-gray-800 break-all">
                    {groupForm.groupCode || "—"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setGroupForm((f) =>
                      f && !f.id
                        ? {
                            ...f,
                            groupCode: generateTicketGroupCode(f, existingGroupCodes, f.groupCode),
                          }
                        : f
                    )
                  }
                  className="shrink-0 rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50"
                >
                  Regenerate code
                </button>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Description (optional)</label>
                <input
                  type="text"
                  value={groupForm.groupDescription ?? ""}
                  onChange={(e) => setGroupForm((f) => f && { ...f, groupDescription: e.target.value || undefined })}
                  className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-xs font-medium text-gray-600">Titles (multiple per group)</label>
                  <button
                    type="button"
                    onClick={() =>
                      setGroupForm((f) =>
                        f && {
                          ...f,
                          titles: [...(f.titles ?? []), { id: 0, titleCode: "", titleText: "", displayOrder: null }],
                        }
                      )}                    className="text-xs text-blue-600 hover:underline"
                  >
                    + Add title
                  </button>
                </div>
                <div className="space-y-2">
                  {(groupForm.titles ?? []).map((t, i) => (
                    <div key={i} className="flex gap-2 items-center">
                      <input
                        type="text"
                        value={t.titleCode}
                        onChange={(e) => {
                          const next = [...(groupForm?.titles ?? [])];
                          next[i] = { ...next[i], titleCode: e.target.value };
                          setGroupForm((f) => f && { ...f, titles: next });
                        }}
                        placeholder="Code (e.g. penalty_issue)"
                        className="flex-1 rounded border border-gray-300 px-2 py-1.5 text-sm"
                      />
                      <input
                        type="text"
                        value={t.titleText}
                        onChange={(e) => {
                          const next = [...(groupForm?.titles ?? [])];
                          next[i] = { ...next[i], titleText: e.target.value };
                          setGroupForm((f) => f && { ...f, titles: next });
                        }}
                        placeholder="Display text (e.g. Penalty issue)"
                        className="flex-1 rounded border border-gray-300 px-2 py-1.5 text-sm"
                      />
                      <button
                        type="button"
                        onClick={() => setGroupForm((f) => f && { ...f, titles: (f.titles ?? []).filter((_, j) => j !== i) })}
                        className="p-1.5 rounded text-gray-500 hover:bg-red-50 hover:text-red-600"
                        title="Remove"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={createGroup}
                  disabled={saving}
                  className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {saving ? "Saving..." : "Create"}
                </button>
                <button
                  type="button"
                  onClick={() => setGroupForm(null)}
                  className="rounded border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
          <div className="rounded-lg border border-gray-200 overflow-x-auto">
            <table className="w-full text-sm min-w-[800px]">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left py-2 px-3 font-medium text-gray-700">Code</th>
                  <th className="text-left py-2 px-3 font-medium text-gray-700">Name</th>
                  <th className="text-left py-2 px-3 font-medium text-gray-700">Service</th>
                  <th className="text-left py-2 px-3 font-medium text-gray-700">Order type</th>
                  <th className="text-left py-2 px-3 font-medium text-gray-700">Source</th>
                  <th className="text-left py-2 px-3 font-medium text-gray-700">User type</th>
                  <th className="text-left py-2 px-3 font-medium text-gray-700">Titles</th>
                  <th className="text-left py-2 px-3 font-medium text-gray-700">Active</th>
                  <th className="w-24">Actions</th>
                </tr>
              </thead>
              <tbody>
                {groups.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-6 text-center text-gray-500">
                      No groups yet. Add one above.
                    </td>
                  </tr>
                ) : (
                  groups.map((g) => (
                    <tr key={g.id} className="border-b border-gray-100 hover:bg-gray-50/50">
                      <td className="py-2 px-3 font-mono text-xs text-gray-700">{g.groupCode}</td>
                      <td className="py-2 px-3 text-gray-800">{g.groupName}</td>
                      <td className="py-2 px-3 text-gray-600">{optionLabel(SERVICE_TYPES, g.serviceType)}</td>
                      <td className="py-2 px-3 text-gray-600">{optionLabel(TICKET_CATEGORIES, g.ticketCategory)}</td>
                      <td className="py-2 px-3 text-gray-600">{optionLabel(SOURCE_ROLES, g.sourceRole)}</td>
                      <td className="py-2 px-3 text-gray-600">{optionLabel(USER_TYPES, g.ticketSection)}</td>
                      <td className="py-2 px-3 text-gray-600">{(g.titles?.length ?? 0)}</td>
                      <td className="py-2 px-3">
                        <ActiveSwitch
                          active={g.isActive}
                          busy={togglingActiveId === g.id}
                          onToggle={() => void toggleGroupActive(g)}
                          ariaLabel={g.isActive ? "Active — click to deactivate" : "Inactive — click to activate"}
                        />
                      </td>
                      <td className="py-2 px-3">
                        <div className="flex gap-1">
                          <button
                            type="button"
                            onClick={() => setGroupForm({
                              ...g,
                              titles: (g.titles ?? []).map((t) => ({
                                id: t.id ?? 0,
                                titleCode: t.titleCode,
                                titleText: t.titleText,
                                displayOrder: t.displayOrder ?? null,
                              })),
                            })}
                            className="p-1.5 rounded text-gray-500 hover:bg-gray-200 hover:text-gray-700"
                            title="Edit — add titles and details"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteGroup(g.id)}
                            disabled={saving}
                            className="p-1.5 rounded text-gray-500 hover:bg-red-50 hover:text-red-600"
                            title="Deactivate group"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          {groupForm?.id != null && (
            <div className="mt-6 p-4 rounded-lg border border-gray-200 bg-gray-50 space-y-4">
              <h3 className="font-medium text-gray-800">Edit group</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Service type</label>
                  <select
                    value={groupForm.serviceType ?? ""}
                    onChange={(e) => setGroupForm((f) => f && { ...f, serviceType: e.target.value || null })}
                    className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
                  >
                    <option value="">— Select —</option>
                    {SERVICE_TYPES.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Order related</label>
                  <select
                    value={groupForm.ticketCategory ?? ""}
                    onChange={(e) => setGroupForm((f) => f && { ...f, ticketCategory: e.target.value || null })}
                    className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
                  >
                    <option value="">— Select —</option>
                    {TICKET_CATEGORIES.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Source of ticket</label>
                  <select
                    value={groupForm.sourceRole ?? ""}
                    onChange={(e) => setGroupForm((f) => f && { ...f, sourceRole: e.target.value || null })}
                    className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
                  >
                    <option value="">— Select —</option>
                    {SOURCE_ROLES.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">User type</label>
                  <select
                    value={groupForm.ticketSection ?? ""}
                    onChange={(e) => setGroupForm((f) => f && { ...f, ticketSection: e.target.value || null })}
                    className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
                  >
                    <option value="">— Select —</option>
                    {USER_TYPES.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Code</label>
                  <p className="rounded border border-gray-200 bg-gray-100 px-3 py-2 text-sm font-mono text-gray-800 break-all">
                    {groupForm.groupCode}
                  </p>
                  <p className="mt-1 text-[10px] text-gray-500">Codes stay fixed after creation so tickets and rules stay stable.</p>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Group name</label>
                  <input
                    type="text"
                    value={groupForm.groupName}
                    onChange={(e) => setGroupForm((f) => f && { ...f, groupName: e.target.value })}
                    className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Description (optional)</label>
                <input
                  type="text"
                  value={groupForm.groupDescription ?? ""}
                  onChange={(e) => setGroupForm((f) => f && { ...f, groupDescription: e.target.value || undefined })}
                  className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-xs font-medium text-gray-600">Titles</label>
                  <button
                    type="button"
                    onClick={() =>
                      setGroupForm((f) =>
                        f && {
                          ...f,
                          titles: [...(f.titles ?? []), { id: 0, titleCode: "", titleText: "", displayOrder: null }],
                        }
                      )}                    className="text-xs text-blue-600 hover:underline"
                  >
                    + Add title
                  </button>
                </div>
                <div className="space-y-2">
                  {(groupForm.titles ?? []).map((t, i) => (
                    <div key={i} className="flex gap-2 items-center">
                      <input
                        type="text"
                        value={t.titleCode}
                        onChange={(e) => {
                          const next = [...(groupForm?.titles ?? [])];
                          next[i] = { ...next[i], titleCode: e.target.value };
                          setGroupForm((f) => f && { ...f, titles: next });
                        }}
                        placeholder="Code"
                        className="flex-1 rounded border border-gray-300 px-2 py-1.5 text-sm"
                      />
                      <input
                        type="text"
                        value={t.titleText}
                        onChange={(e) => {
                          const next = [...(groupForm?.titles ?? [])];
                          next[i] = { ...next[i], titleText: e.target.value };
                          setGroupForm((f) => f && { ...f, titles: next });
                        }}
                        placeholder="Display text"
                        className="flex-1 rounded border border-gray-300 px-2 py-1.5 text-sm"
                      />
                      <button
                        type="button"
                        onClick={() => setGroupForm((f) => f && { ...f, titles: (f.titles ?? []).filter((_, j) => j !== i) })}
                        className="p-1.5 rounded text-gray-500 hover:bg-red-50 hover:text-red-600"
                        title="Remove"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => groupForm.id && updateGroup(groupForm.id, {
                    groupName: groupForm.groupName,
                    groupDescription: groupForm.groupDescription ?? null,
                    serviceType: groupForm.serviceType ?? null,
                    ticketSection: groupForm.ticketSection ?? null,
                    ticketCategory: groupForm.ticketCategory ?? null,
                    sourceRole: groupForm.sourceRole ?? null,
                    titles: (groupForm.titles ?? []).map((t) => ({
                      id: t.id ?? 0,
                      titleCode: t.titleCode,
                      titleText: t.titleText,
                      displayOrder: t.displayOrder ?? null,
                    })),
                  })}
                  disabled={saving}
                  className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {saving ? "Saving..." : "Save"}
                </button>
                <button
                  type="button"
                  onClick={() => setGroupForm(null)}
                  className="rounded border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
        )
      )}

      {activeTab === "tags" && (
        tagsError ? (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            <p className="font-medium">Could not load ticket tags</p>
            <p className="mt-1 text-red-700">{formatRtkQueryError(tagsErrorDetail)}</p>
            <button
              type="button"
              onClick={() => void refetchTags()}
              className="mt-3 rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700"
            >
              Retry
            </button>
          </div>
        ) : tagsLoading ? (
          <p className="text-gray-500">Loading tags...</p>
        ) : (
        <div className="w-full min-w-0">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold text-gray-800">Ticket tags</h2>
            <button
              type="button"
              onClick={() => setTagForm({ tagCode: "", tagName: "" })}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              <Plus className="h-4 w-4" /> Add tag
            </button>
          </div>
          {tagForm && !tagForm.id && (
            <div className="mb-6 p-4 rounded-lg border border-gray-200 bg-gray-50 space-y-3">
              <h3 className="font-medium text-gray-800">New tag</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Code</label>
                  <input
                    type="text"
                    value={tagForm.tagCode}
                    onChange={(e) => setTagForm((f) => f && { ...f, tagCode: e.target.value })}
                    placeholder="e.g. escalation"
                    className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Name</label>
                  <input
                    type="text"
                    value={tagForm.tagName}
                    onChange={(e) => setTagForm((f) => f && { ...f, tagName: e.target.value })}
                    placeholder="e.g. Escalation"
                    className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Color (optional, hex)</label>
                <input
                  type="text"
                  value={tagForm.tagColor ?? ""}
                  onChange={(e) => setTagForm((f) => f && { ...f, tagColor: e.target.value || undefined })}
                  placeholder="#3B82F6"
                  className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
                />
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={createTag}
                  disabled={saving}
                  className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {saving ? "Saving..." : "Create"}
                </button>
                <button
                  type="button"
                  onClick={() => setTagForm(null)}
                  className="rounded border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
          <div className="rounded-lg border border-gray-200 overflow-x-auto">
            <table className="w-full text-sm min-w-[720px]">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left py-2 px-3 font-medium text-gray-700">Code</th>
                  <th className="text-left py-2 px-3 font-medium text-gray-700">Name</th>
                  <th className="text-left py-2 px-3 font-medium text-gray-700">Color</th>
                  <th className="text-left py-2 px-3 font-medium text-gray-700">Light</th>
                  <th className="text-left py-2 px-3 font-medium text-gray-700">Active</th>
                  <th className="w-24" />
                </tr>
              </thead>
              <tbody>
                {tags.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-6 text-center text-gray-500">
                      No tags yet. Add one above.
                    </td>
                  </tr>
                ) : (
                  tags.map((t) => (
                    <tr key={t.id} className="border-b border-gray-100 hover:bg-gray-50/50">
                      <td className="py-2 px-3 font-mono text-xs text-gray-700">{t.tagCode}</td>
                      <td className="py-2 px-3 text-gray-800">{t.tagName}</td>
                      <td className="py-2 px-3">
                        {t.tagColor ? (
                          <span className="inline-flex items-center gap-1">
                            <span className="w-4 h-4 rounded border border-gray-300 inline-block shrink-0" style={{ backgroundColor: t.tagColor }} />
                            <span className="truncate max-w-[120px]">{t.tagColor}</span>
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="py-2 px-3 text-xs text-gray-600">
                        {t.tagLightColor ? (
                          <span className="inline-flex items-center gap-1">
                            <span className="w-4 h-4 rounded border border-gray-300 inline-block shrink-0 bg-gray-50" style={{ backgroundColor: t.tagLightColor }} />
                            {t.tagLightColor}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="py-2 px-3">
                        <ActiveSwitch
                          active={t.isActive}
                          busy={togglingTagId === t.id}
                          onToggle={() => void toggleTagActive(t)}
                          ariaLabel={t.isActive ? "Tag active" : "Tag inactive"}
                        />
                      </td>
                      <td className="py-2 px-3">
                        <div className="flex gap-1">
                          <button
                            type="button"
                            onClick={() => setTagForm({ ...t })}
                            className="p-1.5 rounded text-gray-500 hover:bg-gray-200 hover:text-gray-700"
                            title="Edit"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteTag(t.id)}
                            disabled={saving}
                            className="p-1.5 rounded text-gray-500 hover:bg-red-50 hover:text-red-600"
                            title="Deactivate"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          {tagForm?.id != null && (
            <div className="mt-6 p-4 rounded-lg border border-gray-200 bg-gray-50 space-y-3">
              <h3 className="font-medium text-gray-800">Edit tag</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Code</label>
                  <input
                    type="text"
                    value={tagForm.tagCode}
                    onChange={(e) => setTagForm((f) => f && { ...f, tagCode: e.target.value })}
                    className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Name</label>
                  <input
                    type="text"
                    value={tagForm.tagName}
                    onChange={(e) => setTagForm((f) => f && { ...f, tagName: e.target.value })}
                    className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Color (optional)</label>
                <input
                  type="text"
                  value={tagForm.tagColor ?? ""}
                  onChange={(e) => setTagForm((f) => f && { ...f, tagColor: e.target.value || undefined })}
                  className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
                />
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => tagForm.id && updateTag(tagForm.id, { tagCode: tagForm.tagCode, tagName: tagForm.tagName, tagColor: tagForm.tagColor ?? null })}
                  disabled={saving}
                  className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {saving ? "Saving..." : "Save"}
                </button>
                <button
                  type="button"
                  onClick={() => setTagForm(null)}
                  className="rounded border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
        )
      )}

      {activeTab === "titles" &&
        (titlesError ? (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            <p className="font-medium">Could not load ticket titles</p>
            <p className="mt-1 text-red-700">{formatRtkQueryError(titlesErrorDetail)}</p>
            <button
              type="button"
              onClick={() => void refetchTitles()}
              className="mt-3 rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700"
            >
              Retry
            </button>
          </div>
        ) : titlesLoading ? (
          <p className="text-gray-500">Loading titles...</p>
        ) : (
          <div className="w-full min-w-0">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-800">Ticket titles ({ticketTitles.length})</h2>
            </div>
            <div className="rounded-lg border border-gray-200 overflow-x-auto">
              <table className="w-full text-sm min-w-[1100px]">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left py-2 px-3 font-medium text-gray-700">Title code</th>
                    <th className="text-left py-2 px-3 font-medium text-gray-700">Display text</th>
                    <th className="text-left py-2 px-3 font-medium text-gray-700">Group</th>
                    <th className="text-left py-2 px-3 font-medium text-gray-700">Service</th>
                    <th className="text-left py-2 px-3 font-medium text-gray-700">Section</th>
                    <th className="text-left py-2 px-3 font-medium text-gray-700">Source</th>
                    <th className="text-left py-2 px-3 font-medium text-gray-700">Sort</th>
                    <th className="text-left py-2 px-3 font-medium text-gray-700">Active</th>
                  </tr>
                </thead>
                <tbody>
                  {ticketTitles.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-gray-500">
                        No rows in ticket_titles.
                      </td>
                    </tr>
                  ) : (
                    ticketTitles.map((row) => (
                      <tr key={row.id} className="border-b border-gray-100 hover:bg-gray-50/50">
                        <td className="py-2 px-3 font-mono text-xs text-gray-800 break-all max-w-[200px]">{row.titleCode}</td>
                        <td className="py-2 px-3 text-gray-800">{row.titleText}</td>
                        <td className="py-2 px-3 text-gray-600 text-xs">
                          {row.groupName ? (
                            <span>
                              <span className="font-medium text-gray-800">{row.groupName}</span>
                              {row.groupCode ? <span className="block text-gray-400 font-mono">{row.groupCode}</span> : null}
                            </span>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="py-2 px-3 text-gray-600">{optionLabel(SERVICE_TYPES, row.serviceType)}</td>
                        <td className="py-2 px-3 text-gray-600">{optionLabel(USER_TYPES, row.ticketSection)}</td>
                        <td className="py-2 px-3 text-gray-600">{optionLabel(SOURCE_ROLES, row.sourceRole)}</td>
                        <td className="py-2 px-3 text-gray-500">{row.displayOrder ?? "—"}</td>
                        <td className="py-2 px-3">
                          <ActiveSwitch
                            active={row.isActive}
                            busy={togglingTitleId === row.id}
                            onToggle={() => void toggleTitleRowActive(row)}
                            ariaLabel={row.isActive ? "Title active" : "Title inactive"}
                          />
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ))}

      {activeTab === "helpTopics" &&
        (titlesError || prioritiesError || tagsError ? (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            <p className="font-medium">Could not load help topics</p>
            <ul className="mt-2 list-disc pl-5 text-red-700 space-y-1">
              {titlesError ? <li>Titles: {formatRtkQueryError(titlesErrorDetail)}</li> : null}
              {prioritiesError ? <li>Priorities: {formatRtkQueryError(prioritiesErrorDetail)}</li> : null}
              {tagsError ? <li>Tags: {formatRtkQueryError(tagsErrorDetail)}</li> : null}
            </ul>
            <button
              type="button"
              onClick={() => {
                void refetchTitles();
                void refetchPriorities();
                void refetchTags();
              }}
              className="mt-3 rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700"
            >
              Retry all
            </button>
          </div>
        ) : titlesLoading || prioritiesLoading || tagsLoading ? (
          <p className="text-gray-500">Loading help topics...</p>
        ) : (
          <TicketHelpTopicsPanel
            groups={helpFilteredGroups}
            allGroups={groups}
            titles={helpFilteredTitles}
            tags={tags}
            priorities={priorityRows}
            serviceTypeOptions={SERVICE_TYPES}
            userTypeOptions={USER_TYPES}
            sourceRoleOptions={SOURCE_ROLES}
            helpAudience={helpAudience}
            helpService={helpService}
            helpAudienceOptions={[...HELP_AUDIENCE_OPTIONS]}
            onHelpAudienceChange={(v) => setHelpTopicFilters({ helpAudience: v })}
            onHelpServiceChange={(v) => setHelpTopicFilters({ helpService: v })}
            onError={(msg) => setError(msg)}
          />
        ))}

      {activeTab === "priorities" &&
        (prioritiesError ? (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            <p className="font-medium">Could not load priorities</p>
            <p className="mt-1 text-red-700">{formatRtkQueryError(prioritiesErrorDetail)}</p>
            <button
              type="button"
              onClick={() => void refetchPriorities()}
              className="mt-3 rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700"
            >
              Retry
            </button>
          </div>
        ) : prioritiesLoading ? (
          <p className="text-gray-500">Loading priorities...</p>
        ) : (
          <TicketPrioritiesPanel priorities={priorityRows} onError={(msg) => setError(msg)} />
        ))}

      {activeTab === "titleConfig" && (
        configError ? (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            <p className="font-medium">Could not load title catalog</p>
            <p className="mt-1 text-red-700">{formatRtkQueryError(configErrorDetail)}</p>
            <button
              type="button"
              onClick={() => void refetchTitleConfig()}
              className="mt-3 rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700"
            >
              Retry
            </button>
          </div>
        ) : configLoading ? (
          <p className="text-gray-500">Loading title catalog...</p>
        ) : (
          <div className="w-full min-w-0">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-800">Title catalog ({titleConfigs.length})</h2>
              <p className="text-xs text-gray-500 max-w-2xl">
                Rows from <code className="bg-gray-100 px-1 rounded">ticket_title_config</code> (unified title defaults). Array columns are shown as compact JSON.
              </p>
            </div>
            <div className="rounded-lg border border-gray-200 overflow-x-auto">
              <table className="w-full text-sm min-w-[1200px]">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left py-2 px-3 font-medium text-gray-700">Title key</th>
                    <th className="text-left py-2 px-3 font-medium text-gray-700">Display name</th>
                    <th className="text-left py-2 px-3 font-medium text-gray-700">Ticket types</th>
                    <th className="text-left py-2 px-3 font-medium text-gray-700">Service types</th>
                    <th className="text-left py-2 px-3 font-medium text-gray-700">Sources</th>
                    <th className="text-left py-2 px-3 font-medium text-gray-700">Priority / category</th>
                    <th className="text-left py-2 px-3 font-medium text-gray-700">Sort</th>
                    <th className="text-left py-2 px-3 font-medium text-gray-700">Active</th>
                  </tr>
                </thead>
                <tbody>
                  {titleConfigs.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-gray-500">
                        No rows in ticket_title_config.
                      </td>
                    </tr>
                  ) : (
                    titleConfigs.map((row) => (
                      <tr key={row.id} className="border-b border-gray-100 hover:bg-gray-50/50">
                        <td className="py-2 px-3 font-mono text-xs text-gray-800">{row.ticketTitle}</td>
                        <td className="py-2 px-3 text-gray-800">{row.displayName}</td>
                        <td className="py-2 px-3 text-xs text-gray-600 font-mono" title={formatJsonPreview(row.applicableToTicketType, 500)}>
                          {formatJsonPreview(row.applicableToTicketType)}
                        </td>
                        <td className="py-2 px-3 text-xs text-gray-600 font-mono" title={formatJsonPreview(row.applicableToServiceType, 500)}>
                          {formatJsonPreview(row.applicableToServiceType)}
                        </td>
                        <td className="py-2 px-3 text-xs text-gray-600 font-mono" title={formatJsonPreview(row.applicableToSource, 500)}>
                          {formatJsonPreview(row.applicableToSource)}
                        </td>
                        <td className="py-2 px-3 text-xs text-gray-600">
                          {row.defaultPriority ?? "—"} / {row.defaultCategory ?? "—"}
                        </td>
                        <td className="py-2 px-3 text-gray-500">{row.displayOrder ?? "—"}</td>
                        <td className="py-2 px-3">
                          <ActiveSwitch
                            active={row.isActive}
                            busy={togglingConfigId === row.id}
                            onToggle={() => void toggleTitleConfigActive(row)}
                            ariaLabel={row.isActive ? "Config active" : "Config inactive"}
                          />
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )
      )}
    </div>
  );
}

export default function TicketSettingsPage() {
  return (
    <Suspense
      fallback={
        <div className={PAGE_SHELL_CLASS}>
          <p className="text-gray-600">Loading...</p>
        </div>
      }
    >
      <TicketSettingsPageContent />
    </Suspense>
  );
}
