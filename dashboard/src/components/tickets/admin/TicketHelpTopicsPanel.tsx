"use client";

import { useMemo, useState, useCallback, useEffect, useId, useRef } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, Plus, Pencil, Trash2 } from "lucide-react";
import { useToast } from "@/context/ToastContext";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import type { TicketGroup, TicketPriorityDefinition, TicketTag, TicketTitleRow } from "@/store/api/superAdminApi";
import {
  useCreateTicketTitleAdminMutation,
  useUpdateTicketTitleAdminMutation,
  useUpdateTicketGroupMutation,
  useDeleteTicketTitleAdminMutation,
} from "@/store/api/superAdminApi";

/** Matches merchant ContactUsScreen section ids (help hub). */
const MERCHANT_SECTION_OPTIONS: { value: string; label: string }[] = [
  { value: "outlet_status", label: "Outlet online / offline status" },
  { value: "orders", label: "Order related issues" },
  { value: "order_timing", label: "Order delayed / not picked" },
  { value: "restaurant", label: "Restaurant profile" },
  { value: "address", label: "Address & location" },
  { value: "menu", label: "Menu & pricing" },
  { value: "payments", label: "Payments & payouts" },
  { value: "payout_delayed", label: "Payout delayed" },
  { value: "taxes", label: "Taxes & compliance" },
  { value: "ads", label: "Promotions & visibility" },
  { value: "branding", label: "Branding & materials" },
  { value: "reports", label: "Analytics & reports" },
  { value: "hygiene_audit", label: "Kitchen hygiene audit report" },
  { value: "other", label: "Other" },
];

/** Matches customer_app /support help-sections grouping (see backend customer-support routes). */
const CUSTOMER_SECTION_OPTIONS: { value: string; label: string }[] = [
  { value: "orders", label: "Order issues" },
  { value: "payments", label: "Payments & refunds" },
  { value: "account", label: "Account & profile" },
  { value: "app", label: "App problems" },
  { value: "general", label: "Something else" },
];

/**
 * Order status codes the title is shown for in the customer raise-ticket wizard.
 * Matches Postgres enum `order_status_type` plus the 'NO_ORDER' sentinel for
 * titles that should appear when the customer picks "not about an order".
 * Leave the list EMPTY in the form (= NULL in DB) to make a title always show
 * as a fallback.
 */
const ORDER_STATUS_OPTIONS: { value: string; label: string; group: string }[] = [
  { value: "assigned", label: "Placed (not accepted yet)", group: "Before pickup" },
  { value: "accepted", label: "Accepted by merchant", group: "Before pickup" },
  { value: "reached_store", label: "Rider at store", group: "Before pickup" },
  { value: "picked_up", label: "Picked up by rider", group: "In transit" },
  { value: "in_transit", label: "On the way", group: "In transit" },
  { value: "delivered", label: "Delivered", group: "After delivery" },
  { value: "cancelled", label: "Cancelled", group: "Terminal" },
  { value: "failed", label: "Failed", group: "Terminal" },
  { value: "NO_ORDER", label: "Not about an order (general)", group: "Non-order" },
];

const INTAKE_TICKET_TYPES = [
  { value: "order_related", label: "Order related" },
  { value: "non_order", label: "Non-order related" },
  { value: "other", label: "Other" },
];

/** Presets for `intake_unified_category` (text); matches `unified_ticket_category` enum + common custom values. */
const INTAKE_UNIFIED_CATEGORY_SUGGESTIONS: { value: string; label: string }[] = [
  { value: "ORDER", label: "ORDER — Order-related" },
  { value: "PAYMENT", label: "PAYMENT — Payment" },
  { value: "DELIVERY", label: "DELIVERY — Delivery" },
  { value: "REFUND", label: "REFUND — Refund" },
  { value: "ACCOUNT", label: "ACCOUNT — Account" },
  { value: "TECHNICAL", label: "TECHNICAL — App / technical" },
  { value: "EARNINGS", label: "EARNINGS — Payout / earnings" },
  { value: "VERIFICATION", label: "VERIFICATION — KYC / verification" },
  { value: "COMPLAINT", label: "COMPLAINT — Complaints" },
  { value: "FEEDBACK", label: "FEEDBACK — Feedback" },
  { value: "OTHER", label: "OTHER — Other" },
  { value: "PROFILE_ISSUE", label: "PROFILE_ISSUE — Profile (custom)" },
];

const UNIFIED_PRIORITY_CODES = new Set(["LOW", "MEDIUM", "HIGH", "URGENT", "CRITICAL"]);
const UNIFIED_SERVICE_TYPE_CODES = new Set(["FOOD", "PARCEL", "RIDE", "GENERAL"]);

function unifiedIntakePriorityFromDefinition(p: TicketPriorityDefinition | undefined): string {
  if (!p) return "MEDIUM";
  const raw = String(p.priorityCode ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "_")
    .replace(/_+/g, "_");
  if (UNIFIED_PRIORITY_CODES.has(raw)) return raw;
  return "MEDIUM";
}

function unifiedIntakeServiceTypeFromService(serviceType: string): string {
  const raw = serviceType.trim().toLowerCase();
  if (raw === "all") return "GENERAL";
  const u = serviceType.trim().toUpperCase();
  if (UNIFIED_SERVICE_TYPE_CODES.has(u)) return u;
  return "GENERAL";
}

function errorMessageFromMutation(e: unknown): string {
  if (typeof e === "object" && e !== null && "data" in e) {
    const data = (e as { data?: unknown }).data;
    if (data && typeof data === "object" && "error" in data && typeof (data as { error?: string }).error === "string") {
      return (data as { error: string }).error;
    }
  }
  if (e instanceof Error) return e.message;
  return "Something went wrong";
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

function formatQuickComma(opts: string[] | null | undefined): string {
  if (!opts?.length) return "";
  return opts.join(", ");
}

type FormState = {
  id?: number;
  titleText: string;
  titleCode: string;
  description: string;
  subtext: string;
  defaultMessagesComma: string;
  groupId: string;
  tagIds: number[];
  priorityId: string;
  merchantSectionId: string;
  customerSectionId: string;
  /** Empty list = NULL in DB = always show. */
  applicableOrderStatuses: string[];
  intakeTicketType: string;
  intakeUnifiedTitle: string;
  intakeUnifiedCategory: string;
  displayOrder: string;
  serviceType: string;
  ticketSection: string;
  sourceRole: string;
  isActive: boolean;
};

const emptyForm = (): FormState => ({
  titleText: "",
  titleCode: "",
  description: "",
  subtext: "",
  defaultMessagesComma: "",
  groupId: "",
  tagIds: [],
  priorityId: "",
  merchantSectionId: "",
  customerSectionId: "",
  applicableOrderStatuses: [],
  intakeTicketType: "",
  intakeUnifiedTitle: "",
  intakeUnifiedCategory: "",
  displayOrder: "",
  serviceType: "",
  ticketSection: "",
  sourceRole: "",
  isActive: true,
});

function buildTitlesChildMap(list: TicketTitleRow[]): Map<number | null, TicketTitleRow[]> {
  const m = new Map<number | null, TicketTitleRow[]>();
  for (const t of list) {
    const p = t.parentTitleId ?? null;
    const arr = m.get(p) ?? [];
    arr.push(t);
    m.set(p, arr);
  }
  for (const arr of m.values()) {
    arr.sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0) || a.titleText.localeCompare(b.titleText));
  }
  return m;
}

type TitleTreeRowsProps = {
  nodes: TicketTitleRow[];
  childMap: Map<number | null, TicketTitleRow[]>;
  depth: number;
  titleOpen: Record<number, boolean>;
  onToggleTitle: (id: number) => void;
  togglingId: number | null;
  deletingId: number | null;
  onToggleRowActive: (row: TicketTitleRow) => void;
  onEdit: (row: TicketTitleRow) => void;
  onDelete: (row: TicketTitleRow) => void;
};

function TitleTreeRows({
  nodes,
  childMap,
  depth,
  titleOpen,
  onToggleTitle,
  togglingId,
  deletingId,
  onToggleRowActive,
  onEdit,
  onDelete,
}: TitleTreeRowsProps) {
  return (
    <ul className={`space-y-1 ${depth > 0 ? "mt-1 border-l border-gray-200 ml-2 pl-2" : ""}`}>
      {nodes.map((t) => {
        const kids = childMap.get(t.id) ?? [];
        const hasKids = kids.length > 0;
        const open = titleOpen[t.id] === true;
        return (
          <li key={t.id}>
            <div
              className="flex flex-wrap items-center gap-2 rounded-md border border-gray-100 bg-white px-2 py-1.5 text-sm"
              style={{ paddingLeft: depth > 0 ? 4 : undefined }}
            >
              {hasKids ? (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleTitle(t.id);
                  }}
                  className="shrink-0 p-0.5 rounded text-gray-500 hover:bg-gray-100"
                  aria-expanded={open}
                  aria-label={open ? "Collapse" : "Expand"}
                >
                  {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                </button>
              ) : (
                <span className="w-5 shrink-0" aria-hidden />
              )}
              <button
                type="button"
                onClick={() => onEdit(t)}
                className="font-medium text-gray-800 flex-1 min-w-[120px] text-left hover:text-blue-700 hover:underline"
              >
                {t.titleText}
              </button>
              {t.subtext ? <span className="text-xs text-gray-500 max-w-[200px] truncate">{t.subtext}</span> : null}
              <span className="text-[10px] text-gray-400 font-mono" title="Merchant section">
                M: {t.merchantSectionId || "—"}
              </span>
              <span className="text-[10px] text-gray-400 font-mono" title="Customer section">
                C: {t.customerSectionId || "—"}
              </span>
              {t.applicableOrderStatuses && t.applicableOrderStatuses.length > 0 ? (
                <span
                  className="text-[10px] text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-1.5 py-0.5 font-mono"
                  title={`Shows for: ${t.applicableOrderStatuses.join(", ")}`}
                >
                  {t.applicableOrderStatuses.length}× status
                </span>
              ) : null}
              <ActiveSwitch
                active={t.isActive}
                busy={togglingId === t.id}
                onToggle={() => void onToggleRowActive(t)}
                ariaLabel={t.isActive ? "Visible in apps when group is on" : "Hidden from help hub"}
              />
              <button
                type="button"
                onClick={() => onEdit(t)}
                className="p-1 rounded text-gray-500 hover:bg-gray-100"
                title="Edit"
              >
                <Pencil className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => void onDelete(t)}
                disabled={deletingId === t.id}
                className="p-1 rounded text-gray-500 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                title="Permanently delete this topic"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
            {hasKids && open ? (
              <TitleTreeRows
                nodes={kids}
                childMap={childMap}
                depth={depth + 1}
                titleOpen={titleOpen}
                onToggleTitle={onToggleTitle}
                togglingId={togglingId}
                deletingId={deletingId}
                onToggleRowActive={onToggleRowActive}
                onEdit={onEdit}
                onDelete={onDelete}
              />
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

export function TicketHelpTopicsPanel({
  groups,
  allGroups,
  titles,
  tags,
  priorities,
  serviceTypeOptions,
  userTypeOptions,
  sourceRoleOptions,
  helpAudience,
  helpService,
  helpAudienceOptions,
  onHelpAudienceChange,
  onHelpServiceChange,
  onError,
}: {
  groups: TicketGroup[];
  /** Full group list for edit form dropdown (tree may be filtered). */
  allGroups: TicketGroup[];
  titles: TicketTitleRow[];
  tags: TicketTag[];
  priorities: TicketPriorityDefinition[];
  serviceTypeOptions: { value: string; label: string }[];
  userTypeOptions: { value: string; label: string }[];
  sourceRoleOptions: { value: string; label: string }[];
  helpAudience: string;
  helpService: string;
  helpAudienceOptions: readonly { value: string; label: string }[];
  onHelpAudienceChange: (value: string) => void;
  onHelpServiceChange: (value: string) => void;
  onError: (msg: string) => void;
}) {
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});
  const [titleExpanded, setTitleExpanded] = useState<Record<number, boolean>>({});
  const [ungroupedOpen, setUngroupedOpen] = useState(false);
  const [form, setForm] = useState<FormState | null>(null);
  const [saving, setSaving] = useState(false);
  const [togglingId, setTogglingId] = useState<number | null>(null);
  const [togglingGroupId, setTogglingGroupId] = useState<number | null>(null);
  const [deletingTitleId, setDeletingTitleId] = useState<number | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<TicketTitleRow | null>(null);
  const [tagPickerOpen, setTagPickerOpen] = useState(false);
  const tagPickerRef = useRef<HTMLDivElement>(null);
  const intakeCategoryDatalistId = useId();

  const { toast } = useToast();
  const [createTitle] = useCreateTicketTitleAdminMutation();
  const [updateTitle] = useUpdateTicketTitleAdminMutation();
  const [updateGroup] = useUpdateTicketGroupMutation();
  const [deleteTitle] = useDeleteTicketTitleAdminMutation();

  const sortedGroups = useMemo(
    () => [...groups].sort((a, b) => (a.groupName || "").localeCompare(b.groupName || "")),
    [groups]
  );

  const sortedAllGroups = useMemo(
    () => [...allGroups].sort((a, b) => (a.groupName || "").localeCompare(b.groupName || "")),
    [allGroups]
  );

  const tagsFromApi = useMemo(
    () => [...tags].sort((a, b) => (a.tagName || "").localeCompare(b.tagName || "", undefined, { sensitivity: "base" })),
    [tags]
  );

  const tagTriggerLabel = useMemo(() => {
    if (!form?.tagIds?.length) return "— Select tags —";
    const names = form.tagIds
      .map((id) => tagsFromApi.find((t) => t.id === id)?.tagName)
      .filter(Boolean) as string[];
    if (names.length === 0) return `${form.tagIds.length} tag(s) selected`;
    if (names.length <= 2) return names.join(", ");
    return `${names.length} tags selected`;
  }, [form, tagsFromApi]);

  useEffect(() => {
    setTagPickerOpen(false);
  }, [form?.id]);

  useEffect(() => {
    if (!tagPickerOpen) return;
    const close = (e: MouseEvent) => {
      const el = tagPickerRef.current;
      if (el && !el.contains(e.target as Node)) setTagPickerOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [tagPickerOpen]);

  const { byGroup, ungrouped } = useMemo(() => {
    const m = new Map<number, TicketTitleRow[]>();
    const u: TicketTitleRow[] = [];
    for (const t of titles) {
      if (t.groupId == null) u.push(t);
      else {
        const arr = m.get(t.groupId) ?? [];
        arr.push(t);
        m.set(t.groupId, arr);
      }
    }
    for (const arr of m.values()) {
      arr.sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0) || a.titleText.localeCompare(b.titleText));
    }
    u.sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0) || a.titleText.localeCompare(b.titleText));
    return { byGroup: m, ungrouped: u };
  }, [titles]);

  const toggleExpand = useCallback((id: number) => {
    setExpanded((p) => ({ ...p, [id]: !p[id] }));
  }, []);

  const toggleTitleExpand = useCallback((id: number) => {
    setTitleExpanded((p) => ({ ...p, [id]: !p[id] }));
  }, []);

  const openNew = useCallback(() => {
    setForm(emptyForm());
  }, []);

  const openEdit = useCallback((row: TicketTitleRow) => {
    setForm({
      id: row.id,
      titleText: row.titleText,
      titleCode: row.titleCode,
      description: row.description ?? "",
      subtext: row.subtext ?? "",
      defaultMessagesComma: formatQuickComma(row.defaultQuickOptions),
      groupId: row.groupId != null ? String(row.groupId) : "",
      tagIds:
        row.tagIds && row.tagIds.length > 0
          ? [...row.tagIds].sort((a, b) => a - b)
          : row.tagId != null
            ? [row.tagId]
            : [],
      priorityId: row.priorityId != null ? String(row.priorityId) : "",
      merchantSectionId: row.merchantSectionId ?? "",
      customerSectionId: row.customerSectionId ?? "",
      applicableOrderStatuses: Array.isArray(row.applicableOrderStatuses) ? [...row.applicableOrderStatuses] : [],
      intakeTicketType: row.intakeTicketType ?? "",
      intakeUnifiedTitle: row.intakeUnifiedTitle ?? "",
      intakeUnifiedCategory: row.intakeUnifiedCategory ?? "",
      displayOrder: row.displayOrder != null ? String(row.displayOrder) : "",
      serviceType: row.serviceType ?? "",
      ticketSection: row.ticketSection ?? "",
      sourceRole: row.sourceRole ?? "",
      isActive: row.isActive,
    });
  }, []);

  const selectedGroup = useMemo(() => {
    if (!form?.groupId) return null;
    const id = parseInt(form.groupId, 10);
    if (Number.isNaN(id)) return null;
    return allGroups.find((g) => g.id === id) ?? null;
  }, [form?.groupId, allGroups]);

  useEffect(() => {
    if (!form || form.id != null) return;
    if (!selectedGroup) return;
    setForm((f) => {
      if (!f || f.id != null) return f;
      return {
        ...f,
        serviceType: f.serviceType || selectedGroup.serviceType || "",
        ticketSection: f.ticketSection || selectedGroup.ticketSection || "",
        sourceRole: f.sourceRole || selectedGroup.sourceRole || "",
      };
    });
  }, [selectedGroup, form?.id]);

  const toggleRowActive = async (row: TicketTitleRow) => {
    const next = !row.isActive;
    setTogglingId(row.id);
    try {
      await updateTitle({ id: row.id, updates: { isActive: next } }).unwrap();
      toast(next ? `"${row.titleText}" is now visible in apps` : `"${row.titleText}" hidden from apps`, "success");
    } catch (e) {
      const msg = errorMessageFromMutation(e);
      onError(msg);
      toast(msg, "error");
    } finally {
      setTogglingId(null);
    }
  };

  const toggleGroupMerchantVisibility = async (g: TicketGroup) => {
    const next = !g.isActive;
    setTogglingGroupId(g.id);
    try {
      await updateGroup({ id: g.id, updates: { isActive: next } }).unwrap();
      toast(
        next ? `Section "${g.groupName}" is visible in merchant help` : `Section "${g.groupName}" hidden from merchant help`,
        "success"
      );
    } catch (e) {
      const msg = errorMessageFromMutation(e);
      onError(msg);
      toast(msg, "error");
    } finally {
      setTogglingGroupId(null);
    }
  };

  const openDeleteConfirm = useCallback((row: TicketTitleRow) => {
    setDeleteTarget(row);
  }, []);

  const closeDeleteConfirm = useCallback(() => {
    if (deletingTitleId != null) return;
    setDeleteTarget(null);
  }, [deletingTitleId]);

  const confirmDeleteTitle = useCallback(async () => {
    const row = deleteTarget;
    if (!row) return;
    setDeletingTitleId(row.id);
    try {
      await deleteTitle(row.id).unwrap();
      setDeleteTarget(null);
      setForm((f) => (f?.id === row.id ? null : f));
      toast(`Deleted "${row.titleText}"`, "success");
    } catch (e) {
      const msg = errorMessageFromMutation(e);
      onError(msg);
      toast(msg, "error");
    } finally {
      setDeletingTitleId(null);
    }
  }, [deleteTarget, deleteTitle, toast, onError]);

  useEffect(() => {
    if (!form) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setForm(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [form]);

  const save = async () => {
    if (!form) return;
    if (!form.titleText.trim()) {
      const msg = "Title text is required";
      onError(msg);
      toast(msg, "error");
      return;
    }
    const groupId = form.groupId ? parseInt(form.groupId, 10) : null;
    const priorityId = form.priorityId ? parseInt(form.priorityId, 10) : null;
    const displayOrder = form.displayOrder.trim() === "" ? null : Number(form.displayOrder);
    const defaultQuickOptions =
      form.defaultMessagesComma.trim() === ""
        ? null
        : form.defaultMessagesComma
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean);

    const priorityRowForIntake =
      priorityId != null && Number.isFinite(priorityId) ? priorities.find((p) => p.id === priorityId) : undefined;
    const intakeUnifiedPriority = unifiedIntakePriorityFromDefinition(priorityRowForIntake);
    const intakeUnifiedServiceType = unifiedIntakeServiceTypeFromService(form.serviceType);

    setSaving(true);
    try {
      if (form.id != null) {
        await updateTitle({
          id: form.id,
          updates: {
            titleText: form.titleText.trim(),
            titleCode: form.titleCode.trim() || undefined,
            description: form.description.trim() || null,
            subtext: form.subtext.trim() || null,
            defaultQuickOptions: defaultQuickOptions ?? undefined,
            groupId: groupId ?? null,
            tagIds: form.tagIds,
            priorityId: Number.isFinite(priorityId!) ? priorityId : null,
            merchantSectionId: form.merchantSectionId.trim() || null,
            customerSectionId: form.customerSectionId.trim() || null,
            applicableOrderStatuses: form.applicableOrderStatuses.length > 0 ? form.applicableOrderStatuses : null,
            intakeTicketType: form.intakeTicketType.trim() || null,
            intakeUnifiedTitle: form.intakeUnifiedTitle.trim() || null,
            intakeUnifiedCategory: form.intakeUnifiedCategory.trim() || null,
            intakeUnifiedPriority,
            intakeUnifiedServiceType,
            displayOrder: displayOrder != null && Number.isFinite(displayOrder) ? displayOrder : null,
            serviceType: form.serviceType.trim() || undefined,
            ticketSection: form.ticketSection.trim() || undefined,
            sourceRole: form.sourceRole.trim() || undefined,
            isActive: form.isActive,
          },
        }).unwrap();
        toast(`Updated "${form.titleText.trim()}"`, "success");
      } else {
        if (!groupId && (!form.serviceType.trim() || !form.ticketSection.trim() || !form.sourceRole.trim())) {
          const msg = "Select a group or fill Service, User type, and Source of ticket.";
          onError(msg);
          toast(msg, "error");
          setSaving(false);
          return;
        }
        await createTitle({
          titleText: form.titleText.trim(),
          titleCode: form.titleCode.trim() || undefined,
          groupId: groupId ?? undefined,
          description: form.description.trim() || null,
          displayOrder: displayOrder != null && Number.isFinite(displayOrder) ? displayOrder : null,
          serviceType: form.serviceType.trim() || undefined,
          ticketSection: form.ticketSection.trim() || undefined,
          sourceRole: form.sourceRole.trim() || undefined,
          subtext: form.subtext.trim() || null,
          defaultQuickOptions: defaultQuickOptions ?? undefined,
          tagIds: form.tagIds,
          priorityId: Number.isFinite(priorityId!) ? priorityId : null,
          merchantSectionId: form.merchantSectionId.trim() || null,
          customerSectionId: form.customerSectionId.trim() || null,
          applicableOrderStatuses: form.applicableOrderStatuses.length > 0 ? form.applicableOrderStatuses : null,
          intakeTicketType: form.intakeTicketType.trim() || null,
          intakeUnifiedTitle: form.intakeUnifiedTitle.trim() || null,
          intakeUnifiedCategory: form.intakeUnifiedCategory.trim() || null,
          intakeUnifiedPriority,
          intakeUnifiedServiceType,
          isActive: form.isActive,
        }).unwrap();
        toast(`Added help topic "${form.titleText.trim()}"`, "success");
      }
      setForm(null);
    } catch (e) {
      const msg = errorMessageFromMutation(e);
      onError(msg);
      toast(msg, "error");
    } finally {
      setSaving(false);
    }
  };

  const activePriorities = useMemo(() => [...priorities].sort((a, b) => a.sortOrder - b.sortOrder), [priorities]);

  const derivedIntakeUnifiedPriority = useMemo(() => {
    const pid = form?.priorityId ? parseInt(form.priorityId, 10) : NaN;
    const row = Number.isFinite(pid) ? activePriorities.find((p) => p.id === pid) : undefined;
    return unifiedIntakePriorityFromDefinition(row);
  }, [form?.priorityId, activePriorities]);

  const derivedIntakeUnifiedServiceType = useMemo(
    () => unifiedIntakeServiceTypeFromService(form?.serviceType ?? ""),
    [form?.serviceType]
  );

  const serviceFilterOptions = useMemo(
    () => [{ value: "all", label: "All services" }, ...serviceTypeOptions],
    [serviceTypeOptions]
  );

  const serviceTypeFormOptions = useMemo(
    () => [{ value: "all", label: "All" }, ...serviceTypeOptions],
    [serviceTypeOptions]
  );

  return (
    <div className="w-full min-w-0 space-y-3">
      {form == null ? (
        <>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <h2 className="text-lg font-semibold text-gray-800">Help topics (tree)</h2>
        <button
          type="button"
          onClick={openNew}
          className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          <Plus className="h-4 w-4" /> Add topic
        </button>
      </div>

      <div className="rounded-lg border border-gray-200 bg-gray-50/80 p-3 space-y-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:gap-4">
            <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Audience">
              {helpAudienceOptions.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  role="tab"
                  aria-selected={helpAudience === opt.value}
                  onClick={() => onHelpAudienceChange(opt.value)}
                  className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                    helpAudience === opt.value ? "bg-blue-600 text-white shadow-sm" : "bg-white text-gray-700 border border-gray-200 hover:bg-gray-100"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <label htmlFor="help-topics-service-filter" className="text-xs text-gray-600 shrink-0">
                Service
              </label>
              <select
                id="help-topics-service-filter"
                value={helpService}
                onChange={(e) => onHelpServiceChange(e.target.value)}
                className="rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-800 min-w-[140px]"
              >
                {serviceFilterOptions.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white overflow-x-auto">
        <div
          className="grid min-w-[640px] grid-cols-[2rem_10.5rem_minmax(12rem,1fr)_3rem_5rem] gap-x-4 items-center px-3 py-2.5 bg-gray-50 border-b border-gray-200 text-[11px] font-semibold text-gray-600"
        >
          <span className="sr-only">Expand</span>
          <span className="whitespace-nowrap shrink-0">Section code</span>
          <span className="whitespace-nowrap shrink-0 min-w-0">Titles</span>
          <span className="text-right tabular-nums whitespace-nowrap shrink-0">Child</span>
          <span className="text-right whitespace-nowrap shrink-0 pr-0.5">Visible app</span>
        </div>
        <div className="divide-y divide-gray-100">
        {sortedGroups.map((g) => {
          const list = byGroup.get(g.id) ?? [];
          const open = expanded[g.id] === true;
          const childMap = buildTitlesChildMap(list);
          const roots = childMap.get(null) ?? [];
          return (
            <div key={g.id}>
              <div className="grid min-w-[640px] grid-cols-[2rem_10.5rem_minmax(12rem,1fr)_3rem_5rem] gap-x-4 items-center px-3 py-2.5 hover:bg-gray-50/80">
                <button
                  type="button"
                  onClick={() => toggleExpand(g.id)}
                  className="shrink-0 p-0.5 rounded text-gray-500 hover:bg-gray-100 justify-self-start"
                  aria-expanded={open}
                  aria-label={open ? "Collapse group" : "Expand group"}
                >
                  {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                </button>
                <span className="text-xs text-gray-500 font-mono truncate min-w-0" title={g.groupCode}>
                  {g.groupCode}
                </span>
                <span className="font-medium text-gray-800 truncate min-w-0">{g.groupName}</span>
                <span className="text-xs text-gray-500 text-right tabular-nums">{list.length}</span>
                <div className="flex justify-end">
                  <ActiveSwitch
                    active={g.isActive}
                    busy={togglingGroupId === g.id}
                    onToggle={() => void toggleGroupMerchantVisibility(g)}
                    ariaLabel={
                      g.isActive
                        ? "Section visible — turn off to hide this whole group from merchant help (and nested titles)"
                        : "Section hidden from merchant help"
                    }
                  />
                </div>
              </div>
              {open && (
                <div className="pl-2 pr-2 pb-2 border-t border-gray-50 bg-gray-50/40">
                  {list.length === 0 ? (
                    <p className="text-xs text-gray-500 py-2 px-2">No titles in this group.</p>
                  ) : (
                    <TitleTreeRows
                      nodes={roots}
                      childMap={childMap}
                      depth={0}
                      titleOpen={titleExpanded}
                      onToggleTitle={toggleTitleExpand}
                      togglingId={togglingId}
                      deletingId={deletingTitleId}
                      onToggleRowActive={toggleRowActive}
                      onEdit={openEdit}
                      onDelete={openDeleteConfirm}
                    />
                  )}
                </div>
              )}
            </div>
          );
        })}
        {ungrouped.length > 0 && (
          <div>
            <div className="grid min-w-[640px] grid-cols-[2rem_10.5rem_minmax(12rem,1fr)_3rem_5rem] gap-x-4 items-center px-3 py-2.5 hover:bg-amber-50/90 bg-amber-50/80">
              <button
                type="button"
                onClick={() => setUngroupedOpen((v) => !v)}
                className="shrink-0 p-0.5 rounded text-gray-500 hover:bg-amber-100/80 justify-self-start"
                aria-expanded={ungroupedOpen}
                aria-label={ungroupedOpen ? "Collapse ungrouped" : "Expand ungrouped"}
              >
                {ungroupedOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </button>
              <span className="text-xs text-gray-400 font-mono truncate min-w-0">—</span>
              <span className="text-sm font-medium text-gray-700 truncate min-w-0">Ungrouped titles</span>
              <span className="text-xs text-gray-500 text-right tabular-nums">{ungrouped.length}</span>
              <div className="flex justify-end" aria-hidden />
            </div>
            {ungroupedOpen && (
              <div className="pl-2 pr-2 pb-2 bg-amber-50/30">
                {(() => {
                  const childMap = buildTitlesChildMap(ungrouped);
                  const roots = childMap.get(null) ?? [];
                  return (
                    <TitleTreeRows
                      nodes={roots}
                      childMap={childMap}
                      depth={0}
                      titleOpen={titleExpanded}
                      onToggleTitle={toggleTitleExpand}
                      togglingId={togglingId}
                      deletingId={deletingTitleId}
                      onToggleRowActive={toggleRowActive}
                      onEdit={openEdit}
                      onDelete={openDeleteConfirm}
                    />
                  );
                })()}
              </div>
            )}
          </div>
        )}
        </div>
      </div>
        </>
      ) : null}

      <ConfirmModal
        open={deleteTarget != null}
        title="Delete help topic?"
        description={
          deleteTarget ? (
            <>
              <p>
                Permanently delete <strong className="text-gray-900">{deleteTarget.titleText}</strong>? This removes the
                row from the database.
              </p>
              <p className="mt-2 text-amber-800 bg-amber-50 border border-amber-100 rounded-md px-3 py-2 text-xs">
                Child topics under this title will become top-level (their parent link is cleared). This cannot be undone.
              </p>
            </>
          ) : null
        }
        confirmLabel="Delete permanently"
        cancelLabel="Cancel"
        variant="danger"
        confirmBusy={deleteTarget != null && deletingTitleId === deleteTarget.id}
        onClose={closeDeleteConfirm}
        onConfirm={confirmDeleteTitle}
      />

      {form != null ? (
        <div
          className="rounded-xl border border-gray-200 bg-gray-50 shadow-sm overflow-hidden"
          role="region"
          aria-labelledby="help-topic-editor-title"
        >
          <header className="border-b border-gray-200 bg-white px-4 py-3">
            <div className="flex max-w-3xl flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => setForm(null)}
                className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-100"
              >
                <ChevronLeft className="h-4 w-4" />
                Back to help topics
              </button>
              <h3 id="help-topic-editor-title" className="text-base font-semibold text-gray-900">
                {form.id != null ? "Edit help topic" : "New help topic"}
              </h3>
            </div>
          </header>
          <div className="bg-white">
            <div className="mx-auto w-full max-w-3xl space-y-5 px-4 py-6">
              <div>
                <h4 className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 mb-2">Identifiers & copy</h4>
                <div className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Title code</label>
                      <input
                        value={form.titleCode}
                        onChange={(e) => setForm((f) => f && { ...f, titleCode: e.target.value })}
                        placeholder={form.id != null ? undefined : "Auto-generated if empty"}
                        className="w-full rounded border border-gray-300 px-3 py-2 text-sm font-mono"
                      />
                      <p className="mt-0.5 text-[10px] text-gray-500">Unique (DB). Uppercase recommended. Changing it may affect integrations.</p>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Title text (merchant-visible)</label>
                      <input
                        value={form.titleText}
                        onChange={(e) => setForm((f) => f && { ...f, titleText: e.target.value })}
                        className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
                    <textarea
                      value={form.description}
                      onChange={(e) => setForm((f) => f && { ...f, description: e.target.value })}
                      rows={2}
                      placeholder="Internal / catalog description (optional)"
                      className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Subtext</label>
                    <input
                      value={form.subtext}
                      onChange={(e) => setForm((f) => f && { ...f, subtext: e.target.value })}
                      placeholder="e.g. Current status, visibility and restrictions"
                      className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Default quick messages (comma-separated)</label>
                    <textarea
                      value={form.defaultMessagesComma}
                      onChange={(e) => setForm((f) => f && { ...f, defaultMessagesComma: e.target.value })}
                      placeholder="Option A, Option B, Option C"
                      rows={3}
                      className="w-full rounded border border-gray-300 px-3 py-2 text-sm font-mono"
                    />
                  </div>
                </div>
              </div>

              <div>
                <h4 className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 mb-2">Group</h4>
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Group</label>
                    <select
                      value={form.groupId}
                      onChange={(e) => setForm((f) => f && { ...f, groupId: e.target.value })}
                      className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
                    >
                      <option value="">— Ungrouped (set routing below) —</option>
                      {sortedAllGroups.map((g) => (
                        <option key={g.id} value={g.id}>
                          {g.groupName} ({g.groupCode})
                        </option>
                      ))}
                    </select>
                    {selectedGroup ? (
                      <p className="mt-1 text-[11px] text-gray-500">
                        Inherits routing from group: service {selectedGroup.serviceType ?? "—"}, section {selectedGroup.ticketSection ?? "—"}, source{" "}
                        {selectedGroup.sourceRole ?? "—"}.
                      </p>
                    ) : null}
                  </div>
                </div>
              </div>

              <div>
                <h4 className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 mb-2">Routing (enums)</h4>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Service type</label>
                    <select
                      value={form.serviceType}
                      onChange={(e) => setForm((f) => f && { ...f, serviceType: e.target.value })}
                      className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
                    >
                      <option value="">—</option>
                      {serviceTypeFormOptions.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">User type (ticket_section)</label>
                    <select
                      value={form.ticketSection}
                      onChange={(e) => setForm((f) => f && { ...f, ticketSection: e.target.value })}
                      className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
                    >
                      <option value="">—</option>
                      {userTypeOptions.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Source of ticket (source_role)</label>
                    <select
                      value={form.sourceRole}
                      onChange={(e) => setForm((f) => f && { ...f, sourceRole: e.target.value })}
                      className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
                    >
                      <option value="">—</option>
                      {sourceRoleOptions.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              <div>
                <h4 className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 mb-2">Tag, priority, order, active</h4>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2 md:items-end lg:grid-cols-4">
                  <div ref={tagPickerRef} className="relative min-w-0">
                    <label className="block text-xs font-medium text-gray-600 mb-1">Tags</label>
                    <button
                      type="button"
                      aria-expanded={tagPickerOpen}
                      aria-haspopup="listbox"
                      onClick={() => setTagPickerOpen((o) => !o)}
                      className="flex w-full min-h-[38px] items-center justify-between gap-2 rounded border border-gray-300 bg-white px-3 py-2 text-left text-sm text-gray-800 shadow-sm hover:bg-gray-50"
                    >
                      <span className="min-w-0 truncate">{tagTriggerLabel}</span>
                      <ChevronDown
                        className={`h-4 w-4 shrink-0 text-gray-500 transition-transform ${tagPickerOpen ? "rotate-180" : ""}`}
                        aria-hidden
                      />
                    </button>
                    {tagPickerOpen ? (
                      <div
                        className="absolute left-0 right-0 z-30 mt-1 max-h-56 overflow-y-auto rounded-lg border border-gray-200 bg-white py-2 shadow-lg"
                        role="listbox"
                        aria-multiselectable="true"
                      >
                        {tagsFromApi.length === 0 ? (
                          <p className="px-3 py-2 text-xs text-gray-500">No tags in catalog.</p>
                        ) : (
                          tagsFromApi.map((t) => {
                            const checked = form.tagIds.includes(t.id);
                            return (
                              <label
                                key={t.id}
                                className={`flex cursor-pointer items-start gap-2 px-3 py-1.5 text-sm hover:bg-gray-50 ${
                                  t.isActive ? "text-gray-800" : "text-gray-500"
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  className="mt-0.5 h-4 w-4 shrink-0 rounded border-gray-300"
                                  checked={checked}
                                  onChange={() => {
                                    setForm((f) => {
                                      if (!f) return f;
                                      const next = new Set(f.tagIds);
                                      if (next.has(t.id)) next.delete(t.id);
                                      else next.add(t.id);
                                      return { ...f, tagIds: [...next].sort((a, b) => a - b) };
                                    });
                                  }}
                                />
                                <span className="min-w-0">
                                  {t.tagName}{" "}
                                  <span className="font-mono text-[11px] text-gray-500">({t.tagCode})</span>
                                  {!t.isActive ? <span className="text-amber-600 text-[11px]"> — inactive</span> : null}
                                </span>
                              </label>
                            );
                          })
                        )}
                      </div>
                    ) : null}
                  </div>
                  <div className="min-w-0">
                    <label className="block text-xs font-medium text-gray-600 mb-1">Priority</label>
                    <select
                      value={form.priorityId}
                      onChange={(e) => setForm((f) => f && { ...f, priorityId: e.target.value })}
                      className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
                    >
                      <option value="">— None —</option>
                      {activePriorities.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.displayName} ({p.priorityCode})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="min-w-0">
                    <label className="block text-xs font-medium text-gray-600 mb-1">Display order</label>
                    <input
                      type="number"
                      value={form.displayOrder}
                      onChange={(e) => setForm((f) => f && { ...f, displayOrder: e.target.value })}
                      className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
                    />
                  </div>
                  <div className="flex min-h-[38px] items-center pb-0.5 md:pb-[2px] lg:items-end lg:pb-1">
                    <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-700">
                      <input
                        type="checkbox"
                        checked={form.isActive}
                        onChange={(e) => setForm((f) => f && { ...f, isActive: e.target.checked })}
                        className="h-4 w-4 rounded border-gray-300"
                      />
                      Active (is_active)
                    </label>
                  </div>
                </div>
                <p className="mt-2 text-[10px] text-gray-500">
                  Tags: click the field to open the list (like Priority). Multiple selections are saved on the topic and copied to tickets from the merchant app.
                </p>
              </div>

              <div>
                <h4 className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 mb-2">Merchant app</h4>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Merchant help section id</label>
                  <select
                    value={form.merchantSectionId}
                    onChange={(e) => setForm((f) => f && { ...f, merchantSectionId: e.target.value })}
                    className="w-full max-w-md rounded border border-gray-300 px-3 py-2 text-sm"
                  >
                    <option value="">—</option>
                    {MERCHANT_SECTION_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Customer app — drives /support help-sections grouping + status-aware concerns.
                  Set `customerSectionId` to make a title appear under that section in the
                  customer raise-ticket wizard. `applicableOrderStatuses` filters the title
                  to specific order statuses (e.g. "Damaged item" only shows after delivery).
                  Leave the status list empty for "always show" (fallback). Include
                  'NO_ORDER' for titles that should appear in the not-about-an-order flow. */}
              <div>
                <h4 className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 mb-2">Customer app</h4>
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Customer help section id</label>
                    <select
                      value={form.customerSectionId}
                      onChange={(e) => setForm((f) => f && { ...f, customerSectionId: e.target.value })}
                      className="w-full max-w-md rounded border border-gray-300 px-3 py-2 text-sm"
                    >
                      <option value="">—</option>
                      {CUSTOMER_SECTION_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                    <p className="mt-1 text-[10px] text-gray-500">
                      Required to make this title visible in the customer support help hub. Leave blank to hide from customer app.
                    </p>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      Applicable order statuses
                    </label>
                    <div className="rounded border border-gray-200 bg-gray-50 p-2">
                      {(() => {
                        const groups = new Map<string, typeof ORDER_STATUS_OPTIONS>();
                        for (const opt of ORDER_STATUS_OPTIONS) {
                          if (!groups.has(opt.group)) groups.set(opt.group, []);
                          groups.get(opt.group)!.push(opt);
                        }
                        const selected = new Set(form.applicableOrderStatuses);
                        const toggle = (val: string) => {
                          setForm((f) => {
                            if (!f) return f;
                            const next = new Set(f.applicableOrderStatuses);
                            if (next.has(val)) next.delete(val);
                            else next.add(val);
                            return { ...f, applicableOrderStatuses: Array.from(next) };
                          });
                        };
                        return Array.from(groups.entries()).map(([groupLabel, opts]) => (
                          <div key={groupLabel} className="mb-2 last:mb-0">
                            <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-500 mb-1">
                              {groupLabel}
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                              {opts.map((o) => {
                                const on = selected.has(o.value);
                                return (
                                  <button
                                    key={o.value}
                                    type="button"
                                    onClick={() => toggle(o.value)}
                                    className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                                      on
                                        ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                                        : "border-gray-300 bg-white text-gray-600 hover:border-gray-400"
                                    }`}
                                  >
                                    {on ? "✓ " : ""}
                                    {o.label}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        ));
                      })()}
                    </div>
                    <p className="mt-1 text-[10px] text-gray-500">
                      Empty = always show (fallback). Pick statuses to limit when this concern appears in the customer wizard. <strong>NO_ORDER</strong> = show in the "not about an order" flow.
                    </p>
                  </div>
                </div>
              </div>

              <div>
                <h4 className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 mb-2">Intake (unified)</h4>
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Intake ticket type</label>
                    <select
                      value={form.intakeTicketType}
                      onChange={(e) => setForm((f) => f && { ...f, intakeTicketType: e.target.value })}
                      className="w-full max-w-md rounded border border-gray-300 px-3 py-2 text-sm"
                    >
                      <option value="">—</option>
                      {INTAKE_TICKET_TYPES.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Intake unified title</label>
                      <input
                        value={form.intakeUnifiedTitle}
                        onChange={(e) => setForm((f) => f && { ...f, intakeUnifiedTitle: e.target.value })}
                        className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1" htmlFor={`intake-cat-${intakeCategoryDatalistId}`}>
                        Intake unified category
                      </label>
                      <input
                        id={`intake-cat-${intakeCategoryDatalistId}`}
                        list={intakeCategoryDatalistId}
                        value={form.intakeUnifiedCategory}
                        onChange={(e) => setForm((f) => f && { ...f, intakeUnifiedCategory: e.target.value })}
                        placeholder="Choose a preset or type a custom value"
                        autoComplete="off"
                        className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
                      />
                      <datalist id={intakeCategoryDatalistId}>
                        {INTAKE_UNIFIED_CATEGORY_SUGGESTIONS.map((o) => (
                          <option key={o.value} value={o.value} label={o.label} />
                        ))}
                      </datalist>
                      <p className="mt-0.5 text-[10px] text-gray-500">
                        Dropdown suggestions; any custom text is allowed (stored as text).
                      </p>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Intake unified priority</label>
                      <input
                        readOnly
                        value={derivedIntakeUnifiedPriority}
                        className="w-full cursor-not-allowed rounded border border-gray-200 bg-gray-50 px-3 py-2 text-sm font-mono text-gray-800"
                        aria-readonly="true"
                      />
                      <p className="mt-0.5 text-[10px] text-gray-500">
                        Follows the <strong>Priority</strong> field above (maps from priority code to unified_ticket_priority).
                      </p>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Intake unified service type</label>
                      <input
                        readOnly
                        value={derivedIntakeUnifiedServiceType}
                        className="w-full cursor-not-allowed rounded border border-gray-200 bg-gray-50 px-3 py-2 text-sm font-mono text-gray-800"
                        aria-readonly="true"
                      />
                      <p className="mt-0.5 text-[10px] text-gray-500">
                        Follows <strong>Service type</strong> in Routing (unified_ticket_service_type).
                      </p>
                    </div>
                  </div>
                </div>
              </div>

            </div>
          </div>
          <footer className="border-t border-gray-200 bg-gray-50 px-4 py-3">
            <div className="mx-auto flex max-w-3xl flex-wrap gap-2">
              <button
                type="button"
                disabled={saving}
                onClick={() => void save()}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {saving ? "Saving..." : form.id != null ? "Save changes" : "Create topic"}
              </button>
              <button
                type="button"
                onClick={() => setForm(null)}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </footer>
        </div>
      ) : null}
    </div>
  );
}
