"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Bell, ClipboardCheck, MessageCircle, Pencil, Star, UserCircle2, X } from "lucide-react";
import { useToast } from "@/context/ToastContext";
import { OrderPageOverlay } from "@/components/orders/OrderPageOverlay";
import { OrderMixedText, OrderNum } from "@/components/orders/orders-typography";
import {
  buildReconRiderLabel,
  mapNotificationsFromApi,
  mapReconsFromApi,
  mapRemarksFromApi,
  type SidebarCxNotification,
  type SidebarRecon,
  type SidebarRemark,
} from "@/lib/orders/order-sidebar-activity";
import { buildRejectionInfoEntries } from "@/lib/orders/build-rejection-info-entries";
import {
  RejectionInfoEntryCard,
  RejectionInfoSideSheet,
} from "../RejectionInfoSideSheet";
import { useAuthOptional } from "@/providers/AuthProvider";
import { titleCaseStatusWords } from "@/lib/riders/rider-order-status-display";
import { STANDARD_REMARKS } from "@/lib/remarks/standardRemarks";
import type { ParcelDetailOrder } from "./parcel-detail-types";

type RemarkCategory = "CUSTOMER" | "RIDER" | "OTHER";

type CxTemplate = { code: string; label: string };

type RiderSummaryInfo = {
  riderId: number;
  riderName: string | null;
  vehicleLabel: string | null;
  plate: string | null;
  vehicleType: string | null;
  seatingCapacity: number | null;
  city: string | null;
  state: string | null;
  dutyOnline: boolean | null;
  dutyLabel: string | null;
  approvedServices: string[];
  gmitraMaxActive: boolean | null;
};

const ORDER_CARD_SUMMARY_TTL_MS = 60_000;
const orderCardSummaryCache = new Map<
  number,
  { at: number; data: RiderSummaryInfo }
>();

function peekOrderCardSummary(riderId: number): RiderSummaryInfo | null {
  const hit = orderCardSummaryCache.get(riderId);
  if (!hit) return null;
  if (Date.now() - hit.at > ORDER_CARD_SUMMARY_TTL_MS) {
    orderCardSummaryCache.delete(riderId);
    return null;
  }
  return hit.data;
}

function rememberOrderCardSummary(riderId: number, data: RiderSummaryInfo) {
  orderCardSummaryCache.set(riderId, { at: Date.now(), data });
}

/** Instant seed from parcel order row while /order-card loads in the background. */
function seedSummaryFromOrder(order: ParcelDetailOrder): RiderSummaryInfo | null {
  const riderId = order.riderId;
  if (riderId == null || !Number.isFinite(riderId) || riderId <= 0) return null;
  const vehicleType =
    order.parcelDetail?.vehicleCategory?.trim() ||
    order.parcelDetail?.vehicleTypeRequired?.trim() ||
    null;
  return {
    riderId,
    riderName: order.riderName?.trim() || null,
    vehicleLabel: vehicleType,
    plate: null,
    vehicleType,
    seatingCapacity: null,
    city: null,
    state: null,
    dutyOnline: null,
    dutyLabel: null,
    approvedServices: vehicleType ? ["parcel"] : [],
    gmitraMaxActive: null,
  };
}

type RemarkEditHistoryEntry = {
  id: number;
  editedAt: string;
  editedTimeLabel: string;
  editedByActorType: string;
  editedByActorName: string | null;
  oldRemark: string;
  newRemark: string;
  oldRemarkCategory: string | null;
  newRemarkCategory: string | null;
};

const RECON_REASON_OPTIONS = [
  "Customer denying order",
  "Customer non-responsive",
  "Wrong user address",
  "Unsafe area",
  "Out of subzone / area",
  "FE - No answer",
  "FE - Device / App issue",
  "FE - Accident / Rain / Strike / Vehicle issue",
  "FE - Long distance order",
  "Denial - Pickup timeout",
  "Denial - Rider abusive",
  "Rider fled with the order",
  "Rider charging extra",
  "Instructions not followed",
  "Duplicate Order",
  "Auto cancelled",
  "Other",
] as const;

function formatShortTime(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const created = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(created.getTime())) return "—";
  return created.toLocaleString("en-IN", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

function AgentRoleBadge({ role }: { role: string | null | undefined }) {
  const label = role?.trim();
  if (!label) return null;
  return (
    <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-[2px] text-[9px] font-medium text-slate-700 whitespace-nowrap">
      {label}
    </span>
  );
}

function ReconRiderBlock({
  providerName,
  riderName,
  riderMobile,
  fallbackLabel,
}: {
  providerName?: string | null;
  riderName?: string | null;
  riderMobile?: string | null;
  fallbackLabel?: string;
}) {
  const label = buildReconRiderLabel({ providerName, riderName, riderMobile });
  if (!label || label === "Unknown rider") {
    const fb = fallbackLabel?.trim();
    if (!fb) return <span className="text-[12px] text-slate-500">—</span>;
    return <span className="text-[12px] font-medium text-slate-800">{fb}</span>;
  }
  return (
    <span className="block min-w-0 text-[12px] leading-snug text-slate-800">{label}</span>
  );
}

export default function ParcelRightSidebar({
  order,
  activityRefreshKey = 0,
  onCreateRefund,
  refundDisabled,
  refundDisabledReason,
  refunds,
  onRoutedTo,
  overallRating = null,
}: {
  order: ParcelDetailOrder;
  activityRefreshKey?: number;
  onCreateRefund?: () => void;
  refundDisabled?: boolean;
  refundDisabledReason?: string;
  refunds?: Array<{
    id: number;
    refundAmount: string;
    refundStatus: string | null;
    refundType?: string | null;
    refundReason?: string | null;
    refundDescription?: string | null;
    failureReason?: string | null;
    executionStatus?: string | null;
    customerWalletLedgerId?: number | null;
    razorpayRefundId?: string | null;
    createdAt?: string | Date | null;
    initiatedByEmail?: string | null;
  }>;
  onRoutedTo?: (info: { email: string | null; name: string | null }) => void;
  /** Rider overall rating (avg across orders). */
  overallRating?: number | null;
}) {
  const { toast } = useToast();
  const auth = useAuthOptional();
  const userEmail = auth?.user?.email ?? null;

  const [showRejectionHistory, setShowRejectionHistory] = useState(false);

  const rejectionEntries = useMemo(
    () => buildRejectionInfoEntries(order.cancellationInfo, refunds ?? []),
    [order.cancellationInfo, refunds]
  );
  const showRejectionInfo = rejectionEntries.length > 0;
  const latestRejectionEntry = rejectionEntries[0] ?? null;

  const [remarks, setRemarks] = useState<SidebarRemark[]>([]);
  const [remarkType, setRemarkType] = useState<RemarkCategory | "">("");
  const [remarkPreset, setRemarkPreset] = useState("");
  const [remarkText, setRemarkText] = useState("");
  const [savingRemark, setSavingRemark] = useState(false);
  const [loadingRemarks, setLoadingRemarks] = useState(false);
  const [showRemarksModal, setShowRemarksModal] = useState(false);
  const [editingRemarkId, setEditingRemarkId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");
  const [editingType, setEditingType] = useState("CUSTOMER");
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [openHistoryId, setOpenHistoryId] = useState<string | null>(null);
  const [remarkHistory, setRemarkHistory] = useState<
    Record<string, RemarkEditHistoryEntry[]>
  >({});
  const [historyLoadingId, setHistoryLoadingId] = useState<string | null>(null);

  const [cxTemplates, setCxTemplates] = useState<CxTemplate[]>([]);
  const [selectedTemplateCode, setSelectedTemplateCode] = useState("");
  const [savingNotification, setSavingNotification] = useState(false);
  const [notifications, setNotifications] = useState<SidebarCxNotification[]>([]);
  const [loadingNotifications, setLoadingNotifications] = useState(false);
  const [showNotificationsModal, setShowNotificationsModal] = useState(false);

  const [recons, setRecons] = useState<SidebarRecon[]>([]);
  const [reconRider, setReconRider] = useState("");
  const [reconReason, setReconReason] = useState("");
  const [reconText, setReconText] = useState("");
  const [savingRecon, setSavingRecon] = useState(false);
  const [loadingRecons, setLoadingRecons] = useState(false);
  const [showReconsModal, setShowReconsModal] = useState(false);

  const [riderSummary, setRiderSummary] = useState<RiderSummaryInfo | null>(() => {
    const riderId = order.riderId;
    if (riderId == null || !Number.isFinite(riderId) || riderId <= 0) return null;
    return peekOrderCardSummary(riderId) ?? seedSummaryFromOrder(order);
  });
  const [loadingRiderSummary, setLoadingRiderSummary] = useState(false);
  const orderCardFetchForRef = useRef<number | null>(null);

  const riderOptions = useMemo(() => {
    if (order.riderId == null || order.riderId <= 0) return [];
    const label = [order.riderName?.trim(), order.riderMobile?.trim()]
      .filter(Boolean)
      .join(" · ");
    return [
      {
        id: String(order.riderId),
        label: label || `Rider #${order.riderId}`,
      },
    ];
  }, [order.riderId, order.riderName, order.riderMobile]);

  useEffect(() => {
    const riderId = order.riderId;
    if (riderId == null || !Number.isFinite(riderId) || riderId <= 0) {
      setRiderSummary(null);
      setLoadingRiderSummary(false);
      orderCardFetchForRef.current = null;
      return;
    }

    const cached = peekOrderCardSummary(riderId);
    if (cached) {
      setRiderSummary(cached);
      setLoadingRiderSummary(false);
      return;
    }

    // Instant paint from order / parcel row — never blank the card while enriching.
    const seeded = seedSummaryFromOrder(order);
    setRiderSummary((prev) => {
      if (prev?.riderId === riderId) {
        return {
          ...prev,
          riderName: order.riderName?.trim() || prev.riderName,
          vehicleLabel: prev.vehicleLabel || seeded?.vehicleLabel || null,
          vehicleType: prev.vehicleType || seeded?.vehicleType || null,
          approvedServices:
            prev.approvedServices.length > 0
              ? prev.approvedServices
              : seeded?.approvedServices ?? [],
        };
      }
      return seeded;
    });

    if (orderCardFetchForRef.current === riderId) return;

    let cancelled = false;
    orderCardFetchForRef.current = riderId;
    setLoadingRiderSummary(true);
    void (async () => {
      try {
        const res = await fetch(`/api/riders/${riderId}/order-card`, {
          credentials: "include",
          cache: "no-store",
        });
        const json = (await res.json().catch(() => null)) as {
          success?: boolean;
          data?: {
            gmitraMaxActive?: boolean;
            rider?: {
              id?: number;
              name?: string | null;
              city?: string | null;
              state?: string | null;
              isOnline?: boolean | null;
              lastDutyStatus?: string | null;
              currentDutyServiceTypes?: string[] | null;
            };
            vehicle?: {
              make?: string | null;
              model?: string | null;
              registrationNumber?: string | null;
              vehicleType?: string | null;
              seatingCapacity?: number | null;
              serviceTypes?: unknown;
            } | null;
          };
        } | null;
        if (cancelled) return;
        if (!json?.success || !json.data) {
          setLoadingRiderSummary(false);
          return;
        }
        const r = json.data.rider;
        const v = json.data.vehicle;
        const vehicleName =
          [v?.make, v?.model].filter(Boolean).join(" ").trim() ||
          v?.vehicleType ||
          seeded?.vehicleLabel ||
          null;
        const servicesRaw = Array.isArray(r?.currentDutyServiceTypes)
          ? r!.currentDutyServiceTypes
          : Array.isArray(v?.serviceTypes)
            ? v!.serviceTypes
            : [];
        const approvedServices = servicesRaw
          .map((s) => String(s ?? "").trim())
          .filter(Boolean);
        const online =
          typeof r?.isOnline === "boolean"
            ? r.isOnline
            : String(r?.lastDutyStatus ?? "")
                .trim()
                .toUpperCase() === "ON";
        const next: RiderSummaryInfo = {
          riderId,
          riderName: r?.name?.trim() || order.riderName?.trim() || null,
          vehicleLabel: vehicleName,
          plate: v?.registrationNumber?.trim() || null,
          vehicleType:
            v?.vehicleType?.trim() || seeded?.vehicleType || null,
          seatingCapacity:
            v?.seatingCapacity != null && Number.isFinite(Number(v.seatingCapacity))
              ? Number(v.seatingCapacity)
              : null,
          city: r?.city?.trim() || null,
          state: r?.state?.trim() || null,
          dutyOnline: online,
          dutyLabel: online ? "Online" : "Offline",
          approvedServices:
            approvedServices.length > 0
              ? approvedServices
              : seeded?.approvedServices ?? [],
          gmitraMaxActive:
            typeof json.data.gmitraMaxActive === "boolean"
              ? json.data.gmitraMaxActive
              : null,
        };
        rememberOrderCardSummary(riderId, next);
        setRiderSummary(next);
      } catch {
        /* keep seeded summary */
      } finally {
        if (!cancelled) setLoadingRiderSummary(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [order.riderId, order.riderName, order.parcelDetail?.vehicleCategory, order.parcelDetail?.vehicleTypeRequired]);

  useEffect(() => {
    if (riderOptions.length === 1 && !reconRider) {
      setReconRider(riderOptions[0].id);
    }
  }, [riderOptions, reconRider]);

  const loadRemarks = useCallback(async () => {
    setLoadingRemarks(true);
    try {
      const res = await fetch(`/api/orders/${order.id}/remarks`, { credentials: "include" });
      if (!res.ok) return;
      const json = (await res.json().catch(() => null)) as {
        success?: boolean;
        data?: Array<{
          id: number;
          remark: string;
          remarkCategory?: string | null;
          actorType?: string | null;
          actorName?: string | null;
          remarkMetadata?: { actorEmail?: string | null } | null;
          createdAt?: string | Date;
          lastEditedAt?: string | Date | null;
        }>;
      } | null;
      if (!json?.success || !Array.isArray(json.data)) return;
      setRemarks(
        mapRemarksFromApi(
        json.data.map((r) => ({
            id: r.id,
            remark: r.remark,
            remarkCategory: r.remarkCategory ?? null,
            actorType: r.actorType,
            actorName: r.actorName,
            remarkMetadata: r.remarkMetadata,
            createdAt: r.createdAt,
            lastEditedAt: r.lastEditedAt,
          })),
          userEmail
        )
      );
    } finally {
      setLoadingRemarks(false);
    }
  }, [order.id, userEmail]);

  const loadNotifications = useCallback(async () => {
    setLoadingNotifications(true);
    try {
      const res = await fetch(`/api/orders/${order.id}/notifications`, {
        credentials: "include",
      });
      if (!res.ok) return;
      const json = (await res.json().catch(() => null)) as {
        success?: boolean;
        data?: Array<{
          id: number;
          message: string;
          sentByEmail?: string | null;
          sentByName?: string | null;
          sentByRole?: string | null;
          sentAt?: string | Date;
          notificationMetadata?: unknown;
        }>;
      } | null;
      if (json?.success && Array.isArray(json.data)) {
        setNotifications(mapNotificationsFromApi(json.data));
      }
    } catch {
      /* ignore */
    } finally {
      setLoadingNotifications(false);
    }
  }, [order.id]);

  const loadTemplates = useCallback(async () => {
    try {
      const res = await fetch("/api/orders/cx-notification-templates", {
        credentials: "include",
      });
      if (!res.ok) return;
      const json = (await res.json().catch(() => null)) as {
        success?: boolean;
        data?: CxTemplate[];
        items?: CxTemplate[];
      } | null;
      const rows = Array.isArray(json?.items)
        ? json.items
        : Array.isArray(json?.data)
          ? json.data
          : [];
        setCxTemplates(
        rows
            .map((t) => ({
              code: String(t.code ?? "").trim(),
              label: String(t.label ?? t.code ?? "").trim(),
            }))
          .filter((t) => t.code && t.code !== "ADMIN_CX_CUSTOM")
        );
    } catch {
      /* ignore */
    }
  }, []);

  const loadRecons = useCallback(async () => {
    setLoadingRecons(true);
    try {
      const res = await fetch(`/api/orders/${order.id}/recons`, { credentials: "include" });
      if (!res.ok) return;
      const json = (await res.json().catch(() => null)) as {
        success?: boolean;
        data?: Array<{
          id: number;
          providerName?: string | null;
          riderName?: string | null;
          riderMobile?: string | null;
          reconReason?: string | null;
          reconReasonCategory?: string | null;
          reconAt?: string | Date | null;
          actorEmail?: string | null;
          actorRole?: string | null;
        }>;
      } | null;
      if (!json?.success || !Array.isArray(json.data)) return;
      setRecons(
        mapReconsFromApi(
        json.data.map((r) => ({
            id: r.id,
            providerName: r.providerName ?? null,
            riderName: r.riderName ?? null,
            riderMobile: r.riderMobile ?? null,
            reconReason: String(r.reconReason ?? ""),
            reconReasonCategory: r.reconReasonCategory ?? null,
            reconAt: r.reconAt ?? new Date().toISOString(),
            actorEmail: r.actorEmail,
            actorRole: r.actorRole,
          }))
        )
      );
    } catch {
      /* ignore */
    } finally {
      setLoadingRecons(false);
    }
  }, [order.id]);

  useEffect(() => {
    // Sidebar activity is below the fold — wait for idle so core UI paints first.
    let idleId: number | undefined;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const run = () => {
    void loadRemarks();
    void loadNotifications();
    void loadTemplates();
    void loadRecons();
    };
    if (typeof window !== "undefined" && "requestIdleCallback" in window) {
      idleId = window.requestIdleCallback(run, { timeout: 1500 });
    } else {
      timeoutId = setTimeout(run, 0);
    }
    return () => {
      if (idleId != null && typeof window !== "undefined" && "cancelIdleCallback" in window) {
        window.cancelIdleCallback(idleId);
      }
      if (timeoutId != null) clearTimeout(timeoutId);
    };
  }, [loadRemarks, loadNotifications, loadTemplates, loadRecons, activityRefreshKey]);

  const addRemark = async () => {
    const text = remarkText.trim();
    if (!text || savingRemark) return;
    if (!remarkType) {
      toast("Select a remark category.", "error");
      return;
    }

    setSavingRemark(true);
    try {
      const res = await fetch(`/api/orders/${order.id}/remarks`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          remark: text,
          remarkCategory: remarkType,
        }),
      });
      const json = (await res.json().catch(() => null)) as {
        success?: boolean;
        error?: string;
        routedToEmail?: string | null;
        routedToName?: string | null;
      } | null;
      if (!res.ok || json?.success === false) {
        toast(json?.error ?? "Failed to save remark.", "error");
        return;
      }
      setRemarkText("");
      setRemarkPreset("");
      setRemarkType("");
      toast("Remark added.", "success");
      onRoutedTo?.({
        email: json?.routedToEmail ?? null,
        name: json?.routedToName ?? null,
      });
      void loadRemarks();
    } catch {
      toast("Failed to save remark.", "error");
    } finally {
      setSavingRemark(false);
    }
  };

  const startEditRemark = (remark: SidebarRemark) => {
    if (!remark.canEdit || remark.id.startsWith("temp-")) return;
    if (remark.createdAtIso) {
      const created = new Date(remark.createdAtIso);
      const FIFTEEN_MIN_MS = 15 * 60 * 1000;
      if (Date.now() - created.getTime() > FIFTEEN_MIN_MS) return;
    }
    setEditingRemarkId(remark.id);
    setEditingText(remark.content);
    setEditingType(remark.type);
  };

  const saveEditRemark = async (remark: SidebarRemark) => {
    const text = editingText.trim();
    if (!editingRemarkId || !text || isSavingEdit) return;
    const numericId = Number(remark.id);
    if (!Number.isFinite(numericId)) return;

    setIsSavingEdit(true);
    try {
      const res = await fetch(`/api/orders/${order.id}/remarks/${numericId}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          remark: text,
          remarkCategory: editingType,
        }),
      });
      if (!res.ok) {
        toast("Failed to edit remark.", "error");
        return;
      }
      const json = await res.json().catch(() => null);
      const saved = json?.data as
        | {
            id: number;
            remark: string;
            remarkCategory: string | null;
            actorType?: string | null;
            actorName?: string | null;
            remarkMetadata?: { actorEmail?: string | null } | null;
            createdAt?: string | Date;
            lastEditedAt?: string | Date | null;
          }
        | undefined;
      if (!saved) return;

      const created = saved.createdAt ? new Date(saved.createdAt) : new Date();
      const edited = saved.lastEditedAt ? new Date(saved.lastEditedAt) : null;
      const actorEmail =
        typeof saved.remarkMetadata?.actorEmail === "string"
          ? saved.remarkMetadata.actorEmail
          : remark.actorEmail ?? null;
      const timeLabel = (d: Date) =>
        d.toLocaleString("en-IN", {
          day: "2-digit",
          month: "2-digit",
          year: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
          hour12: true,
        });

      const updated: SidebarRemark = {
        id: String(saved.id),
        type: saved.remarkCategory ?? editingType,
        content: saved.remark,
        actorType: saved.actorType ?? remark.actorType ?? null,
        actorName: saved.actorName ?? remark.actorName ?? null,
        actorEmail,
        canEdit: false,
        createdAtIso: created.toISOString(),
        time: timeLabel(created),
        editedAtIso: edited ? edited.toISOString() : remark.editedAtIso ?? null,
        editedTimeLabel: edited ? timeLabel(edited) : remark.editedTimeLabel ?? null,
      };
      setRemarks((prev) => prev.map((r) => (r.id === remark.id ? updated : r)));
      setEditingRemarkId(null);
      setEditingText("");
      setEditingType("CUSTOMER");
      toast("Remark updated.", "success");
    } catch {
      toast("Failed to edit remark.", "error");
    } finally {
      setIsSavingEdit(false);
    }
  };

  const toggleHistoryForRemark = async (remark: SidebarRemark) => {
    if (!remark.editedAtIso && !remark.editedTimeLabel) return;
    if (openHistoryId === remark.id) {
      setOpenHistoryId(null);
      return;
    }
    if (remarkHistory[remark.id]) {
      setOpenHistoryId(remark.id);
      return;
    }
    const numericId = Number(remark.id);
    if (!Number.isFinite(numericId)) return;

    setHistoryLoadingId(remark.id);
    try {
      const res = await fetch(`/api/orders/${order.id}/remarks/${numericId}`, {
        credentials: "include",
      });
      if (!res.ok) return;
      const json = await res.json().catch(() => null);
      const items =
        (json?.data as Array<{
          id: number;
          editedAt: string;
          editedByActorType: string;
          editedByActorName: string | null;
          oldRemark: string;
          newRemark: string;
          oldRemarkCategory: string | null;
          newRemarkCategory: string | null;
        }> | null) ?? [];

      const mapped: RemarkEditHistoryEntry[] = items.map((h) => {
        const editedAt = new Date(h.editedAt);
        return {
          id: h.id,
          editedAt: editedAt.toISOString(),
          editedTimeLabel: editedAt.toLocaleString("en-IN", {
            day: "2-digit",
            month: "2-digit",
            year: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
            hour12: true,
          }),
          editedByActorType: h.editedByActorType,
          editedByActorName: h.editedByActorName,
          oldRemark: h.oldRemark,
          newRemark: h.newRemark,
          oldRemarkCategory: h.oldRemarkCategory,
          newRemarkCategory: h.newRemarkCategory,
        };
      });
      setRemarkHistory((prev) => ({ ...prev, [remark.id]: mapped }));
      setOpenHistoryId(remark.id);
    } finally {
      setHistoryLoadingId(null);
    }
  };

  const sendNotification = async () => {
    if (!selectedTemplateCode || savingNotification) return;
    setSavingNotification(true);
    try {
      const res = await fetch(`/api/orders/${order.id}/notifications`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templateCode: selectedTemplateCode }),
      });
      const json = (await res.json().catch(() => null)) as {
        success?: boolean;
        error?: string;
        routedToEmail?: string | null;
        routedToName?: string | null;
      } | null;
      if (!res.ok || !json?.success) {
        toast(json?.error ?? "Could not send notification.", "error");
        return;
      }
      setSelectedTemplateCode("");
      toast("Notification sent.", "success");
      onRoutedTo?.({
        email: json.routedToEmail ?? null,
        name: json.routedToName ?? null,
      });
      void loadNotifications();
    } catch {
      toast("Could not send notification.", "error");
    } finally {
      setSavingNotification(false);
    }
  };

  const addRecon = async () => {
    const preset = reconReason.trim();
    const typed = reconText.trim();
    const combined =
      preset && typed ? `${preset} !!!!!! ${typed}` : preset || typed;
    if (!reconRider || !combined || savingRecon) return;

    setSavingRecon(true);
    try {
      const trackingId =
        order.formattedOrderId ??
        order.orderId ??
        `GMC${String(order.id).padStart(6, "0")}`;
      const selected = riderOptions.find((r) => r.id === reconRider);
      const res = await fetch(`/api/orders/${order.id}/recons`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          merchantStoreId: null,
          riderId: Number(reconRider),
          riderName: order.riderName ?? selected?.label ?? null,
          riderMobile: order.riderMobile ?? null,
          reasonPreset: preset || null,
          reasonText: typed || null,
          reconReason: combined,
          trackingId,
        }),
      });
      const json = (await res.json().catch(() => null)) as {
        success?: boolean;
        error?: string;
      } | null;
      if (!res.ok || json?.success === false) {
        toast(json?.error ?? "Failed to save recon.", "error");
        return;
      }
      setReconReason("");
      setReconText("");
      toast("Rider recon saved.", "success");
      void loadRecons();
    } catch {
      toast("Failed to save recon.", "error");
    } finally {
      setSavingRecon(false);
    }
  };

  const summaryLocation = [riderSummary?.city, riderSummary?.state]
    .filter(Boolean)
    .join(", ");
  const summaryVehicleLine = [riderSummary?.vehicleLabel, riderSummary?.plate]
    .filter(Boolean)
    .join(" · ");
  const summaryTypeLabel = riderSummary?.vehicleType
    ? titleCaseStatusWords(
        String(riderSummary.vehicleType).replace(/_/g, " ")
      )
    : null;

  return (
    <div className="space-y-3">
      <section className="rounded-xl border border-slate-200/80 bg-white px-3 py-2.5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
        <div className="mb-2 flex items-center justify-between border-b border-slate-100 pb-1.5">
          <h3 className="text-[12px] font-semibold text-slate-900">Summary Info</h3>
          {riderSummary ? (
            <span className="orders-num text-[9px] font-medium text-slate-500">
              Rider #{riderSummary.riderId}
            </span>
          ) : null}
        </div>
        {!order.riderId || order.riderId <= 0 ? (
          <p className="text-[11px] text-slate-500">No rider assigned yet.</p>
        ) : !riderSummary ? (
          <p className="text-[11px] text-slate-500">
            {loadingRiderSummary
              ? "Loading assigned rider…"
              : `Could not load rider summary for #${order.riderId}.`}
          </p>
        ) : (
          <dl className="space-y-1.5 text-[11px]">
            <div className="flex items-start justify-between gap-2">
              <dt className="shrink-0 text-slate-500">Rider</dt>
              <dd className="min-w-0 text-right font-medium text-slate-900">
                {riderSummary.riderName || `Rider #${riderSummary.riderId}`}
              </dd>
            </div>
            <div className="flex items-start justify-between gap-2">
              <dt className="shrink-0 text-slate-500">Overall rating</dt>
              <dd className="min-w-0 text-right font-medium text-slate-900">
                {overallRating != null &&
                Number.isFinite(Number(overallRating)) &&
                Number(overallRating) > 0 ? (
                  <span className="inline-flex items-center justify-end gap-1 font-semibold text-amber-700">
                    <OrderNum>{Number(overallRating).toFixed(1)}</OrderNum>
                    <Star className="h-3 w-3 fill-amber-400 text-amber-400" aria-hidden />
                  </span>
                ) : (
                  <span className="text-slate-400">—</span>
                )}
              </dd>
            </div>
            <div className="flex items-start justify-between gap-2">
              <dt className="shrink-0 text-slate-500">GMitra Max</dt>
              <dd className="min-w-0 text-right font-medium text-slate-900">
                {riderSummary.gmitraMaxActive == null ? (
                  <span className="text-slate-400">—</span>
                ) : riderSummary.gmitraMaxActive ? (
                  <span className="inline-flex items-center rounded-full border border-violet-200 bg-violet-50 px-1.5 py-0.5 text-[10px] font-semibold text-violet-800">
                    Active
                  </span>
                ) : (
                  <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">
                    Not active
                  </span>
                )}
              </dd>
            </div>
            <div className="flex items-start justify-between gap-2">
              <dt className="shrink-0 text-slate-500">Vehicle</dt>
              <dd className="min-w-0 text-right font-medium leading-snug text-slate-900">
                {summaryVehicleLine || "—"}
              </dd>
            </div>
            <div className="flex items-start justify-between gap-2">
              <dt className="shrink-0 text-slate-500">Type</dt>
              <dd className="min-w-0 text-right font-medium text-slate-900">
                {summaryTypeLabel || "—"}
              </dd>
            </div>
            <div className="flex items-start justify-between gap-2">
              <dt className="shrink-0 text-slate-500">Seating</dt>
              <dd className="min-w-0 text-right font-medium text-slate-900">
                {riderSummary.seatingCapacity != null
                  ? `${riderSummary.seatingCapacity}`
                  : "—"}
              </dd>
            </div>
            <div className="flex items-start justify-between gap-2">
              <dt className="shrink-0 text-slate-500">Location</dt>
              <dd className="min-w-0 text-right font-medium text-slate-900">
                {summaryLocation || "—"}
              </dd>
            </div>
            <div className="flex items-start justify-between gap-2">
              <dt className="shrink-0 text-slate-500">Duty</dt>
              <dd
                className={`min-w-0 text-right font-semibold ${
                  riderSummary.dutyOnline ? "text-emerald-700" : "text-slate-600"
                }`}
              >
                {riderSummary.dutyLabel || "—"}
              </dd>
            </div>
            <div className="flex items-start justify-between gap-2">
              <dt className="shrink-0 text-slate-500">Services</dt>
              <dd className="min-w-0 text-right font-medium leading-snug text-slate-900">
                {riderSummary.approvedServices.length > 0
                  ? riderSummary.approvedServices
                      .map((s) => titleCaseStatusWords(s.replace(/_/g, " ")))
                      .join(", ")
                  : "—"}
              </dd>
            </div>
          </dl>
        )}
      </section>

      <button
        type="button"
        onClick={onCreateRefund}
        disabled={refundDisabled || !onCreateRefund}
        title={refundDisabledReason}
        className="inline-flex w-full items-center justify-center rounded-lg bg-emerald-600 px-3 py-2 text-[12px] font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-600"
      >
        Create refund
      </button>
      {refundDisabled && refundDisabledReason ? (
        <p className="-mt-2 text-center text-[10px] text-slate-500">{refundDisabledReason}</p>
      ) : null}

      {Array.isArray(refunds) && refunds.length > 0 ? (
        <section className="rounded-xl border border-slate-200/80 bg-white px-3 py-2 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
          <div className="mb-2 flex items-center justify-between border-b border-slate-100 pb-1.5">
            <h3 className="text-[12px] font-semibold text-slate-900">Refund log</h3>
            <span className="text-[10px] font-medium text-slate-500">
              {refunds.length} recorded
            </span>
          </div>
          <ul className="max-h-36 space-y-2 overflow-y-auto">
            {refunds.map((r) => (
              <li key={r.id} className="rounded-md bg-slate-50 px-2 py-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="orders-num text-[11px] font-semibold text-emerald-700">
                    ₹{Number(r.refundAmount || 0).toFixed(2)}
                  </span>
                  <span className="text-[9px] text-slate-500">
                    {r.refundStatus ? titleCaseStatusWords(String(r.refundStatus)) : "—"}
                  </span>
                </div>
                <p className="mt-0.5 text-[10px] leading-snug text-slate-600">
                  {r.refundReason?.trim() || r.refundType || "Refund"}
                </p>
                <p className="mt-0.5 text-[9px] text-slate-400">
                  {formatShortTime(r.createdAt)}
                  {r.initiatedByEmail ? ` · ${r.initiatedByEmail}` : ""}
                </p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="rounded-xl border border-slate-200/80 bg-white px-3 py-2.5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
        <div className="mb-2 flex items-center justify-between border-b border-slate-100 pb-1.5">
          <h3 className="flex items-center gap-1.5 text-[12px] font-semibold text-slate-900">
            <i className="bi bi-chat-left-dots text-emerald-500" />
            Add remarks
          </h3>
          <button
            type="button"
            className="flex items-center gap-1 text-xs font-medium text-emerald-600 hover:text-emerald-700 cursor-pointer"
            onClick={() => {
              setShowRemarksModal(true);
              void loadRemarks();
            }}
          >
            <i className="bi bi-list-check" />
            <OrderMixedText>{`See all (${remarks.length})`}</OrderMixedText>
          </button>
        </div>
        <div className="space-y-2">
          <select
            value={remarkType}
            onChange={(e) => {
              setRemarkType(e.target.value as RemarkCategory | "");
              setRemarkPreset("");
            }}
            className="h-8 w-full rounded border border-slate-200 bg-white px-2 text-[12px] text-slate-700 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          >
            <option value="">Select Option</option>
            <option value="CUSTOMER">CUSTOMER</option>
            <option value="RIDER">RIDER</option>
            <option value="OTHER">OTHER</option>
          </select>
          <select
            value={remarkPreset}
            onChange={(e) => setRemarkPreset(e.target.value)}
            className="h-8 w-full rounded border border-slate-200 bg-white px-2 text-[12px] text-slate-700 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          >
            <option value="">Select Option</option>
            {(STANDARD_REMARKS[remarkType as keyof typeof STANDARD_REMARKS] || []).map(
              (remark) => (
                <option key={remark} value={remark}>
                  {remark}
                </option>
              )
            )}
          </select>
          <textarea
            value={remarkText}
            onChange={(e) => setRemarkText(e.target.value)}
            placeholder="Add your comment here…"
            className="min-h-[56px] w-full rounded border border-slate-200 bg-white p-2 text-[12px] text-slate-700 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          />
          <button
            type="button"
            onClick={() => void addRemark()}
            disabled={savingRemark || !remarkText.trim() || !remarkType}
            className="flex w-full items-center justify-center rounded-lg bg-emerald-500 px-4 py-2 text-[12px] font-medium text-white shadow-sm hover:bg-emerald-600 disabled:opacity-70"
          >
            {savingRemark ? "Saving…" : "Submit"}
          </button>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200/80 bg-white px-3 py-2.5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
        <div className="mb-2 flex items-center justify-between border-b border-slate-100 pb-1.5">
          <h3 className="flex items-center gap-1.5 text-[12px] font-semibold text-slate-900">
            <Bell className="h-3.5 w-3.5 text-emerald-500" />
            Send Cx notification
          </h3>
          <button
            type="button"
            className="flex items-center gap-1 text-xs font-medium text-emerald-600 hover:text-emerald-700 cursor-pointer"
            onClick={() => {
              setShowNotificationsModal(true);
              void loadNotifications();
            }}
          >
            <i className="bi bi-list-check" />
            <OrderMixedText>{`See all (${notifications.length})`}</OrderMixedText>
          </button>
        </div>
        <div className="space-y-2">
          <select
            value={selectedTemplateCode}
            onChange={(e) => setSelectedTemplateCode(e.target.value)}
            className="h-8 w-full rounded border border-slate-200 bg-white px-2 text-[12px] text-slate-700 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          >
            <option value="">Select notification</option>
            {cxTemplates.map((t) => (
              <option key={t.code} value={t.code}>
                {t.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => void sendNotification()}
            disabled={savingNotification || !selectedTemplateCode}
            className="flex w-full items-center justify-center rounded-lg bg-emerald-500 px-4 py-2 text-[12px] font-medium text-white shadow-sm hover:bg-emerald-600 disabled:opacity-60"
          >
            {savingNotification ? "Sending…" : "Send notification"}
          </button>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200/80 bg-white px-3 py-2.5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
        <div className="mb-2 flex items-center justify-between border-b border-slate-100 pb-1.5">
          <h3 className="flex items-center gap-1.5 text-[12px] font-semibold text-slate-900">
            <ClipboardCheck className="h-3.5 w-3.5 text-emerald-500" />
            Rider Recon
          </h3>
          <button
            type="button"
            className="text-xs text-emerald-700 hover:text-emerald-800 cursor-pointer underline-offset-2 hover:underline"
            onClick={() => {
              setShowReconsModal(true);
              void loadRecons();
            }}
          >
            <OrderMixedText>{`See all (${recons.length})`}</OrderMixedText>
          </button>
        </div>
        <div className="space-y-2">
          <select
            value={reconRider}
            onChange={(e) => setReconRider(e.target.value)}
            className="h-8 w-full rounded border border-slate-200 bg-white px-2 text-[12px] text-slate-700 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          >
            <option value="">Select Rider</option>
            {riderOptions.map((r) => (
              <option key={r.id} value={r.id}>
                {r.label}
              </option>
            ))}
          </select>
          <select
            value={reconReason}
            onChange={(e) => setReconReason(e.target.value)}
            className="h-8 w-full rounded border border-slate-200 bg-white px-2 text-[12px] text-slate-700 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          >
            <option value="">Select Rejection Option (Optional)</option>
            {RECON_REASON_OPTIONS.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
          <textarea
            value={reconText}
            onChange={(e) => setReconText(e.target.value)}
            placeholder="Add recon comment…"
            className="min-h-[52px] w-full rounded border border-slate-200 bg-white p-2 text-[12px] text-slate-700 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          />
          <button
            type="button"
            onClick={() => void addRecon()}
            disabled={
              savingRecon || !reconRider || (!reconReason.trim() && !reconText.trim())
            }
            className="flex w-full items-center justify-center rounded-lg bg-emerald-500 px-4 py-2 text-[12px] font-medium text-white shadow-sm hover:bg-emerald-600 disabled:opacity-60"
          >
            {savingRecon ? "Saving…" : "Submit recon"}
          </button>
        </div>
      </section>

      {showRejectionInfo && latestRejectionEntry ? (
        <div className="rounded-xl border border-slate-200/90 bg-white shadow-sm overflow-hidden">
          <div className="flex items-center justify-between gap-2 border-b border-slate-100 bg-slate-50 px-4 py-2.5">
            <h3 className="text-[13px] font-semibold tracking-tight text-slate-800">
              Rejection Info
            </h3>
            {rejectionEntries.length > 1 ? (
              <button
                type="button"
                onClick={() => setShowRejectionHistory(true)}
                className="shrink-0 cursor-pointer rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-50"
              >
                view ({rejectionEntries.length})
              </button>
            ) : null}
          </div>
          <div className="p-3">
            <RejectionInfoEntryCard entry={latestRejectionEntry} />
          </div>
        </div>
      ) : null}

      <RejectionInfoSideSheet
        open={showRejectionHistory}
        onClose={() => setShowRejectionHistory(false)}
        orderIdText={
          order.formattedOrderId?.trim() ||
          order.orderId?.trim() ||
          (order.id != null ? `GMC${String(order.id).padStart(6, "0")}` : null)
        }
        entries={rejectionEntries}
      />

      {/* All remarks modal — food parity */}
      {showRemarksModal ? (
        <OrderPageOverlay className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 backdrop-blur-sm px-2">
          <div className="w-full max-w-3xl rounded-xl border border-emerald-100 bg-[#f1faf5] shadow-xl">
            <div className="flex items-center justify-between border-b border-emerald-100 px-5 py-3">
              <div className="flex items-center gap-2">
                <MessageCircle className="h-4 w-4 text-emerald-500" />
                <h2 className="text-[14px] font-semibold text-slate-800">All Remarks</h2>
              </div>
              <button
                type="button"
                className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-full text-slate-500 hover:bg-emerald-50 hover:text-slate-700"
                onClick={() => setShowRemarksModal(false)}
              >
                <X className="h-3 w-3" />
              </button>
            </div>
            <div className="max-h-[440px] overflow-y-auto rounded-b-xl bg-white px-5 py-3">
              {loadingRemarks && remarks.length === 0 ? (
                <div className="py-6 text-center text-xs text-slate-500">Loading remarks...</div>
              ) : remarks.length === 0 ? (
                <div className="py-6 text-center text-xs text-slate-500">No remarks added yet.</div>
              ) : (
                <div className="space-y-3">
                  {remarks.map((r) => (
                    <div
                      key={r.id}
                      className="border-b border-slate-100 pb-3 last:border-b-0 last:pb-0"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-2">
                          <div className="mt-[2px] text-slate-400">
                            <UserCircle2 className="h-4 w-4" />
                          </div>
                          <div className="space-y-0.5">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-[11px] font-semibold text-slate-800">
                                {r.actorName || "Agent"}
                  </span>
                              <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-[2px] text-[9px] font-medium text-slate-700">
                                {r.actorType || "Agent"}
                              </span>
                              {r.actorEmail ? (
                                <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-[2px] text-[9px] font-medium text-slate-600">
                                  {r.actorEmail}
                                </span>
                              ) : null}
                              <span
                                className={`inline-flex items-center rounded-full px-2 py-[2px] text-[9px] font-semibold ${
                                  r.type === "CUSTOMER"
                                    ? "bg-emerald-600 text-white"
                                    : r.type === "RIDER"
                                      ? "bg-sky-600 text-white"
                                      : "bg-slate-200 text-slate-700"
                                }`}
                              >
                                {r.type}
                              </span>
                </div>
                            {editingRemarkId === r.id ? (
                              <div className="mt-1 w-full max-w-[620px] space-y-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="text-[10px] text-slate-500">Category:</span>
                                  <select
                                    value={editingType}
                                    onChange={(e) => setEditingType(e.target.value)}
                                    className="h-7 cursor-pointer rounded border border-emerald-200 bg-white px-2 text-[10px] text-slate-700 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                                  >
                                    <option value="CUSTOMER">CUSTOMER</option>
                                    <option value="RIDER">RIDER</option>
                                    <option value="OTHER">OTHER</option>
                                  </select>
                                </div>
                                <textarea
                                  value={editingText}
                                  onChange={(e) => setEditingText(e.target.value)}
                                  className="w-full rounded border border-emerald-200 bg-emerald-50 px-2 py-1 text-[12px] text-slate-700 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                                  rows={3}
                                />
                              </div>
                            ) : (
                              <div className="mt-1 whitespace-pre-line text-[12px] leading-relaxed text-slate-700">
                                {r.content}
                              </div>
                            )}
                            {r.editedTimeLabel ? (
                              <div className="mt-0.5 text-[10px] text-slate-400">
                                <OrderMixedText>{`Edited ${r.editedTimeLabel}`}</OrderMixedText>
                              </div>
                            ) : null}
                          </div>
                        </div>
                        <div className="whitespace-nowrap text-[11px] text-slate-500">
                          <OrderNum>{r.time}</OrderNum>
                        </div>
                      </div>

                      <div className="mt-1 flex items-center justify-end gap-3 text-[10px]">
                        {r.editedTimeLabel ? (
                          <button
                            type="button"
                            onClick={() => void toggleHistoryForRemark(r)}
                            disabled={historyLoadingId === r.id}
                            className={`inline-flex cursor-pointer items-center gap-1 rounded-full px-2 py-[2px] text-[10px] font-medium ${
                              openHistoryId === r.id
                                ? "text-red-600 hover:bg-red-50"
                                : "text-slate-600 hover:bg-slate-100"
                            }`}
                          >
                            {openHistoryId === r.id ? (
                              <>
                                <span>Hide history</span>
                                <span className="text-[9px]">▴</span>
                              </>
                            ) : (
                              <>
                                <span>
                                  {historyLoadingId === r.id ? "Loading…" : "See history"}
                                </span>
                                <span className="text-[9px]">▾</span>
                              </>
                            )}
                          </button>
                        ) : null}

                        {r.canEdit ? (
                          editingRemarkId === r.id ? (
                            <>
                              <button
                                type="button"
                                disabled={isSavingEdit}
                                onClick={() => void saveEditRemark(r)}
                                className="inline-flex cursor-pointer items-center gap-1 rounded-full bg-emerald-600 px-2 py-[2px] font-medium text-white hover:bg-emerald-700 disabled:opacity-70"
                              >
                                <Pencil className="h-3 w-3" />
                                <span>Save</span>
                              </button>
                              <button
                                type="button"
                                disabled={isSavingEdit}
                                onClick={() => {
                                  setEditingRemarkId(null);
                                  setEditingText("");
                                  setEditingType("CUSTOMER");
                                }}
                                className="inline-flex cursor-pointer items-center gap-1 rounded-full px-2 py-[2px] font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-70"
                              >
                                Cancel
                              </button>
                            </>
                          ) : (
                            <button
                              type="button"
                              onClick={() => startEditRemark(r)}
                              className="inline-flex cursor-pointer items-center gap-1 rounded-full px-2 py-[2px] text-[10px] font-medium text-emerald-700 hover:bg-emerald-50"
                            >
                              <Pencil className="h-3 w-3" />
                              <span>Edit</span>
                            </button>
                          )
                        ) : null}
                      </div>

                      {r.editedTimeLabel &&
                      openHistoryId === r.id &&
                      remarkHistory[r.id] ? (
                        <div className="mt-2 rounded border border-slate-100 bg-slate-50 px-3 py-2 text-[11px] text-slate-700">
                          {remarkHistory[r.id].length === 0 ? (
                            <div className="text-[10px] text-slate-500">
                              No history entries found.
                            </div>
                          ) : (
                            <div className="space-y-2">
                              {remarkHistory[r.id].map((h) => (
                                <div
                                  key={h.id}
                                  className="border-b border-slate-100 pb-2 last:border-b-0 last:pb-0"
                                >
                                  <div className="mb-1 flex items-center justify-between text-[10px] text-slate-500">
                                    <span>
                                      Edited by{" "}
                                      <span className="font-medium text-slate-700">
                                        {h.editedByActorName || h.editedByActorType}
                                      </span>
                                    </span>
                                    <span>{h.editedTimeLabel}</span>
                                  </div>
                                  <div className="grid gap-2 md:grid-cols-2">
                                    <div>
                                      <div className="mb-0.5 flex items-center justify-between">
                                        <span className="text-[10px] font-semibold text-slate-500">
                                          Old remark
                                        </span>
                                        {h.oldRemarkCategory ? (
                                          <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-[2px] text-[9px] font-semibold text-slate-700">
                                            {h.oldRemarkCategory}
                                          </span>
                                        ) : null}
                                      </div>
                                      <div className="whitespace-pre-line rounded border border-slate-100 bg-white px-2 py-1 text-[11px] text-slate-700">
                                        {h.oldRemark}
                                      </div>
                                    </div>
                                    <div>
                                      <div className="mb-0.5 flex items-center justify-between">
                                        <span className="text-[10px] font-semibold text-slate-500">
                                          New remark
                                        </span>
                                        {h.newRemarkCategory ? (
                                          <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-[2px] text-[9px] font-semibold text-slate-700">
                                            {h.newRemarkCategory}
                                          </span>
                                        ) : null}
                                      </div>
                                      <div className="whitespace-pre-line rounded border border-slate-100 bg-white px-2 py-1 text-[11px] text-slate-700">
                                        {h.newRemark}
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
        ) : null}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </OrderPageOverlay>
      ) : null}

      {/* All CX notifications modal — food parity */}
      {showNotificationsModal ? (
        <OrderPageOverlay className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 backdrop-blur-sm px-2">
          <div className="w-full max-w-3xl rounded-xl border border-emerald-100 bg-[#f1faf5] shadow-xl">
            <div className="flex items-center justify-between border-b border-emerald-100 px-5 py-3">
              <div className="flex items-center gap-2">
                <Bell className="h-4 w-4 text-emerald-500" />
                <h2 className="text-[14px] font-semibold text-slate-800">
                  All Cx Notifications
                </h2>
              </div>
              <button
                type="button"
                className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-full text-slate-500 hover:bg-emerald-50 hover:text-slate-700"
                onClick={() => setShowNotificationsModal(false)}
              >
                <X className="h-3 w-3" />
              </button>
            </div>
            <div className="max-h-[440px] overflow-y-auto rounded-b-xl bg-white px-5 py-3">
              {loadingNotifications ? (
                <div className="py-6 text-center text-xs text-slate-500">
                  Loading notifications...
                </div>
              ) : notifications.length === 0 ? (
                <div className="py-6 text-center text-xs text-slate-500">
                  No notifications sent yet.
                </div>
              ) : (
                <div className="space-y-3">
                  {notifications.map((n) => (
                    <div
                      key={n.id}
                      className="border-b border-slate-100 pb-3 last:border-b-0 last:pb-0"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex min-w-0 items-start gap-2">
                          <div className="mt-[2px] text-slate-400">
                            <UserCircle2 className="h-4 w-4" />
                          </div>
                          <div className="min-w-0 space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-[11px] font-semibold text-slate-800">
                                {n.actorName || "Agent"}
                              </span>
                              <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-[2px] text-[9px] font-medium text-slate-700">
                                {n.actorType || "AGENT"}
                              </span>
                              {n.actorEmail ? (
                                <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-[2px] text-[9px] font-medium text-slate-600">
                                  {n.actorEmail}
                                </span>
                              ) : null}
                              <span className="inline-flex items-center rounded-full bg-sky-600 px-2 py-[2px] text-[9px] font-semibold text-white">
                                CUSTOMER
                              </span>
                            </div>
                            <div className="space-y-0.5">
                              {n.title ? (
                                <p className="text-[12px] font-semibold leading-snug text-slate-900">
                                  Title: {n.title}
                                </p>
                              ) : null}
                              <p className="whitespace-pre-line text-[12px] leading-relaxed text-slate-700">
                                {n.body ?? n.message}
                              </p>
                            </div>
                          </div>
                        </div>
                        <div className="shrink-0 whitespace-nowrap text-[11px] text-slate-500">
                          <OrderNum>{n.time}</OrderNum>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </OrderPageOverlay>
      ) : null}

      {/* All recons modal — food parity */}
      {showReconsModal ? (
        <OrderPageOverlay className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 backdrop-blur-sm px-3 py-4">
          <div className="flex max-h-[min(90vh,640px)] w-full max-w-5xl flex-col rounded-xl border border-emerald-100 bg-[#f1faf5] shadow-xl">
            <div className="flex shrink-0 items-center justify-between border-b border-emerald-100 px-5 py-3">
              <div className="flex items-center gap-2">
                <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                  <ClipboardCheck className="h-3.5 w-3.5" />
                </span>
                <h2 className="text-[14px] font-semibold text-slate-800">
                  All Recons
                  {!loadingRecons && recons.length > 0 ? (
                    <span className="ml-1.5 font-normal text-slate-500">
                      ({recons.length})
                    </span>
                  ) : null}
                </h2>
              </div>
              <button
                type="button"
                className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-full text-slate-500 hover:bg-emerald-50 hover:text-slate-700"
                onClick={() => setShowReconsModal(false)}
                aria-label="Close"
              >
                <X className="h-3 w-3" />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto rounded-b-xl bg-white px-4 py-3 sm:px-5 sm:py-4">
              {loadingRecons ? (
                <div className="py-8 text-center text-xs text-slate-500">Loading recons...</div>
              ) : recons.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-500">No recons available.</div>
              ) : (
                (() => {
                  const reconCols = recons.map((r) => {
                    const rejectionOption = r.reasonCategory?.trim() || null;
                    const commentText =
                      r.comment?.trim() ||
                      (!rejectionOption ? r.reason?.trim() : null) ||
                      null;
                    return { rejectionOption, commentText };
                  });
                  const showRejectionCol = reconCols.some((c) => !!c.rejectionOption);
                  const showRemarkCol = reconCols.some((c) => !!c.commentText);

                  return (
                    <div className="overflow-x-auto rounded-lg border border-gray-200">
                      <table className="w-max min-w-full table-auto divide-y divide-gray-200">
                        <thead>
                          <tr className="bg-gray-50">
                            <th className="sticky top-0 z-[15] whitespace-nowrap border-r border-gray-200 bg-gray-50 px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-600">
                              Rider
                            </th>
                            <th className="sticky top-0 z-[15] whitespace-nowrap border-r border-gray-200 bg-gray-50 px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-600">
                              Date &amp; time
                            </th>
                            {showRejectionCol ? (
                              <th className="sticky top-0 z-[15] whitespace-nowrap border-r border-gray-200 bg-gray-50 px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-600">
                                Rejection option
                              </th>
                            ) : null}
                            {showRemarkCol ? (
                              <th className="sticky top-0 z-[15] whitespace-nowrap border-r border-gray-200 bg-gray-50 px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-600">
                                Reason / comment
                              </th>
                            ) : null}
                            <th className="sticky top-0 z-[15] whitespace-nowrap bg-gray-50 px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-600">
                              Submitted by
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200 bg-white">
                          {recons.map((r, idx) => {
                            const { rejectionOption, commentText } = reconCols[idx]!;
                            return (
                              <tr key={r.id} className="transition-colors hover:bg-gray-50">
                                <td className="min-w-[11rem] border-r border-gray-100 px-3 py-2 align-top text-[11px] text-gray-900">
                                  <ReconRiderBlock
                                    providerName={r.providerName}
                                    riderName={r.riderName}
                                    riderMobile={r.riderMobile}
                                    fallbackLabel={r.rider}
                                  />
                                </td>
                                <td className="orders-num whitespace-nowrap border-r border-gray-100 px-3 py-2 align-top text-[11px] text-gray-900">
                                  {r.time}
                                </td>
                                {showRejectionCol ? (
                                  <td className="min-w-[9rem] border-r border-gray-100 px-3 py-2 align-top text-[11px] text-gray-900">
                                    {rejectionOption ?? (
                                      <span className="text-gray-400">—</span>
                                    )}
                                  </td>
                                ) : null}
                                {showRemarkCol ? (
                                  <td className="min-w-[10rem] max-w-[18rem] border-r border-gray-100 px-3 py-2 align-top text-[11px] text-gray-900">
                                    {commentText ? (
                                      <span className="whitespace-pre-line">{commentText}</span>
                                    ) : (
                                      <span className="text-gray-400">—</span>
                                    )}
                                  </td>
                                ) : null}
                                <td className="min-w-[8.5rem] px-3 py-2 align-top text-[11px] text-gray-900">
                                  <div className="flex flex-wrap items-center gap-1.5">
                                    {r.actorEmail ? (
                                      <span className="break-all" title={r.actorEmail}>
                                        {r.actorEmail}
                                      </span>
                                    ) : (
                                      <span className="text-gray-400">—</span>
                                    )}
                                    <AgentRoleBadge role={r.actorRole} />
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  );
                })()
              )}
            </div>
          </div>
        </OrderPageOverlay>
      ) : null}
    </div>
  );
}
