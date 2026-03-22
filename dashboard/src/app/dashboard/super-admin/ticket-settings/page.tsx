"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, FolderGit2, Tag, Plus, Pencil, Trash2, X } from "lucide-react";
import { usePermissions } from "@/hooks/usePermissions";
import { useRouter } from "next/navigation";
import {
  useGetTicketReferenceDataQuery,
  useCreateTicketGroupMutation,
  useUpdateTicketGroupMutation,
  useDeleteTicketGroupMutation,
  useCreateTicketTagMutation,
  useUpdateTicketTagMutation,
  useDeleteTicketTagMutation,
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

type TagRecord = {
  id: number;
  tagCode: string;
  tagName: string;
  tagDescription: string | null;
  tagColor: string | null;
  isActive: boolean;
};

export default function TicketSettingsPage() {
  const router = useRouter();
  const { isSuperAdmin, loading } = usePermissions();
  const [groups, setGroups] = useState<Group[]>([]);
  const [tags, setTags] = useState<TagRecord[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [activeTab, setActiveTab] = useState<"groups" | "tags">("groups");
  const [groupForm, setGroupForm] = useState<
    (Omit<Partial<Group>, "titles"> & { groupCode: string; groupName: string; titles?: TitleRow[] }) | null
  >(null);
  const [tagForm, setTagForm] = useState<Partial<TagRecord> & { tagCode: string; tagName: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const {
    data: referenceData,
    isLoading: referenceLoading,
    isFetching: referenceFetching,
    error: referenceError,
  } = useGetTicketReferenceDataQuery(undefined, {
    skip: !isSuperAdmin,
  } as any);

  const [createGroupMutation] = useCreateTicketGroupMutation();
  const [updateGroupMutation] = useUpdateTicketGroupMutation();
  const [deleteGroupMutation] = useDeleteTicketGroupMutation();
  const [createTagMutation] = useCreateTicketTagMutation();
  const [updateTagMutation] = useUpdateTicketTagMutation();
  const [deleteTagMutation] = useDeleteTicketTagMutation();

  useEffect(() => {
    if (!loading && !isSuperAdmin) {
      router.push("/dashboard");
      return;
    }
  }, [loading, isSuperAdmin, router]);

  useEffect(() => {
    if (!isSuperAdmin) return;
    setLoadingData(referenceLoading || referenceFetching);
    if (referenceData) {
      setGroups(referenceData.groups as Group[]);
      setTags(referenceData.tags as TagRecord[]);
    }
  }, [isSuperAdmin, referenceData, referenceLoading, referenceFetching]);

  const createGroup = async () => {
    if (!groupForm?.groupCode?.trim() || !groupForm?.groupName?.trim()) {
      setError("Group code and name required");
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

  if (loading || !isSuperAdmin) {
    return (
      <div className="p-6">
        <p className="text-gray-600">Loading...</p>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl">
      <div className="flex items-center gap-4 mb-6">
        <Link
          href="/dashboard/super-admin"
          className="rounded-lg border border-gray-200 p-2 hover:bg-gray-50"
        >
          <ArrowLeft className="h-5 w-5 text-gray-600" />
        </Link>
        <h1 className="text-2xl font-semibold text-gray-900">Ticket reference data</h1>
      </div>
      <p className="text-gray-600 mb-6">
        Manage groups and tags used in the ticket dashboard. Status, service, priority, and source are fixed lists; groups and tags are stored in the database.
      </p>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-50 text-red-700 text-sm">
          {error}
        </div>
      )}

      <div className="flex gap-2 border-b border-gray-200 mb-6">
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
      </div>

      {loadingData ? (
        <p className="text-gray-500">Loading...</p>
      ) : activeTab === "groups" ? (
        <div>
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold text-gray-800">Ticket groups</h2>
            <button
              type="button"
              onClick={() => setGroupForm({ groupCode: "", groupName: "", titles: [] })}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              <Plus className="h-4 w-4" /> Add group
            </button>
          </div>
          {groupForm && !groupForm.id && (
            <div className="mb-6 p-4 rounded-lg border border-gray-200 bg-gray-50 space-y-4">
              <h3 className="font-medium text-gray-800">New group</h3>
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
                  <input
                    type="text"
                    value={groupForm.groupCode}
                    onChange={(e) => setGroupForm((f) => f && { ...f, groupCode: e.target.value })}
                    placeholder="e.g. gatmitra_non_order_rider_food"
                    className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Name</label>
                  <input
                    type="text"
                    value={groupForm.groupName}
                    onChange={(e) => setGroupForm((f) => f && { ...f, groupName: e.target.value })}
                    placeholder="e.g. Rider non-order (Food)"
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
                  <th className="text-left py-2 px-3 font-medium text-gray-700">Order</th>
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
                      <td className="py-2 px-3 font-mono text-gray-700">{g.groupCode}</td>
                      <td className="py-2 px-3 text-gray-800">{g.groupName}</td>
                      <td className="py-2 px-3 text-gray-600">{g.serviceType ?? "—"}</td>
                      <td className="py-2 px-3 text-gray-600">{g.ticketCategory ?? "—"}</td>
                      <td className="py-2 px-3 text-gray-600">{g.sourceRole ?? "—"}</td>
                      <td className="py-2 px-3 text-gray-600">{g.ticketSection ?? "—"}</td>
                      <td className="py-2 px-3 text-gray-600">{(g.titles?.length ?? 0)}</td>
                      <td className="py-2 px-3">{g.isActive ? "Yes" : "No"}</td>
                      <td className="py-2 px-3">
                        <div className="flex gap-1">
                          <button
                            type="button"
                            onClick={() => setGroupForm({
                              ...g,
                              titles: (g.titles ?? []).map((t) => ({
                                id: t.id,
                                titleCode: t.titleCode,
                                titleText: t.titleText,
                                displayOrder: t.displayOrder,
                              })),
                            })}
                            className="p-1.5 rounded text-gray-500 hover:bg-gray-200 hover:text-gray-700"
                            title="Edit"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteGroup(g.id)}
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
                  <input
                    type="text"
                    value={groupForm.groupCode}
                    onChange={(e) => setGroupForm((f) => f && { ...f, groupCode: e.target.value })}
                    className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Name</label>
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
                    groupCode: groupForm.groupCode,
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
      ) : (
        <div>
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
          <div className="rounded-lg border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left py-2 px-3 font-medium text-gray-700">Code</th>
                  <th className="text-left py-2 px-3 font-medium text-gray-700">Name</th>
                  <th className="text-left py-2 px-3 font-medium text-gray-700">Color</th>
                  <th className="text-left py-2 px-3 font-medium text-gray-700">Active</th>
                  <th className="w-24" />
                </tr>
              </thead>
              <tbody>
                {tags.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-6 text-center text-gray-500">
                      No tags yet. Add one above.
                    </td>
                  </tr>
                ) : (
                  tags.map((t) => (
                    <tr key={t.id} className="border-b border-gray-100 hover:bg-gray-50/50">
                      <td className="py-2 px-3 font-mono text-gray-700">{t.tagCode}</td>
                      <td className="py-2 px-3 text-gray-800">{t.tagName}</td>
                      <td className="py-2 px-3">
                        {t.tagColor ? (
                          <span className="inline-flex items-center gap-1">
                            <span className="w-4 h-4 rounded border border-gray-300 inline-block" style={{ backgroundColor: t.tagColor }} />
                            {t.tagColor}
                          </span>
                        ) : "—"}
                      </td>
                      <td className="py-2 px-3">{t.isActive ? "Yes" : "No"}</td>
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
      )}
    </div>
  );
}
