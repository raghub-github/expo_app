"use client";

import { useEffect, useState } from "react";
import { STANDARD_REMARKS } from "@/lib/remarks/standardRemarks";
import { useUserEmail } from "@/hooks/queries/useAuthQuery";
import { ClipboardCheck, MessageCircle, Pencil, UserCircle2, X } from "lucide-react";
import ItemsRefundModal from "./ItemsRefundModal";

interface OrderRightSidebarProps {
  order: {
    id: number;
    formattedOrderId: string | null;
    orderId: string | null;
    orderSource?: string | null;
    status: string;
    currentStatus: string | null;
    paymentStatus: string | null;
    createdAt: string;
    updatedAt: string;
    customerName: string | null;
    customerMobile: string | null;
    dropAddressRaw: string | null;
    merchantStoreId: number | null;
    merchantParentId: number | null;
    riderId?: number | null;
    riderName?: string | null;
    riderMobile?: string | null;
    distanceKm?: number | null;
    routedToEmail?: string | null;
    /** Delivery instructions from orders_food (food orders only). */
    deliveryInstructions?: string | null;
    /** First ETA (expected delivery) when order accepted. */
    firstEtaAt?: string | null;
  };
  /** Counts from order API so "See all (N)" shows instantly without waiting for list fetch. */
  initialRemarksCount?: number;
  initialReconsCount?: number;
  /** Notify parent when latest remark agent email changes so "Routed To" updates instantly. */
  onRoutedToChange?: (email: string | null) => void;
  /** Refunds for this order (from GET /api/orders/[id]/refunds). Shown in Rejection Info. */
  orderRefunds?: Array<{
    id: number;
    refundReason: string;
    refundDescription: string | null;
    refundAmount: string;
    refundStatus: string | null;
    initiatedByEmail: string | null;
    createdAt: string;
  }>;
  /** Called after a refund is successfully created so parent can refetch refunds. */
  onRefundCreated?: () => void;
}

interface Remark {
  id: string;
  type: string;
  content: string;
  time: string;
  actorType?: string | null;
  actorName?: string | null;
  actorEmail?: string | null;
  canEdit?: boolean;
  editedAtIso?: string | null;
  editedTimeLabel?: string | null;
  createdAtIso?: string;
}

interface RemarkEditHistoryEntry {
  id: number;
  editedAt: string;
  editedTimeLabel: string;
  editedByActorType: string;
  editedByActorName: string | null;
  oldRemark: string;
  newRemark: string;
  oldRemarkCategory: string | null;
  newRemarkCategory: string | null;
}

/** One option in the "Select rider" dropdown (current order rider + any from recons) */
interface AssignedRiderOption {
  id: string;
  riderId: number | null;
  riderName: string | null;
  riderMobile: string | null;
  providerName: string | null;
}

interface Recon {
  id: string;
  rider: string;
  reason: string;
  time: string;
  actorEmail?: string | null;
  actorName?: string | null;
}

interface Notification {
  id: string;
  message: string;
  time: string;
}

export default function OrderRightSidebar({
  order,
  initialRemarksCount = 0,
  initialReconsCount = 0,
  onRoutedToChange,
  orderRefunds = [],
  onRefundCreated,
}: OrderRightSidebarProps) {
  const userEmail = useUserEmail();
  const [remarks, setRemarks] = useState<Remark[]>([]);
  const [remarkType, setRemarkType] = useState<string>("CUSTOMER");
  const [remarkPreset, setRemarkPreset] = useState<string>("");
  const [remarkText, setRemarkText] = useState("");
  const [isLoadingRemarks, setIsLoadingRemarks] = useState(false);
  const [isSavingRemark, setIsSavingRemark] = useState(false);
  const [showRemarksModal, setShowRemarksModal] = useState(false);

  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [notificationText, setNotificationText] = useState("");

  const [recons, setRecons] = useState<Recon[]>([]);
  const [assignedRiders, setAssignedRiders] = useState<AssignedRiderOption[]>([]);
  const [reconRider, setReconRider] = useState<string>("");
  const [reconReason, setReconReason] = useState<string>("");
  const [reconText, setReconText] = useState("");
  const [isLoadingRecons, setIsLoadingRecons] = useState(false);
  const [isSavingRecon, setIsSavingRecon] = useState(false);
  const [reconError, setReconError] = useState<string | null>(null);
  const [showReconsModal, setShowReconsModal] = useState(false);
  const [editingRemarkId, setEditingRemarkId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState<string>("");
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [editingType, setEditingType] = useState<string>("CUSTOMER");
  const [openHistoryId, setOpenHistoryId] = useState<string | null>(null);
  const [remarkHistory, setRemarkHistory] = useState<Record<string, RemarkEditHistoryEntry[]>>(
    {}
  );
  const [historyLoadingId, setHistoryLoadingId] = useState<string | null>(null);
  const [showItemsRefundModal, setShowItemsRefundModal] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [showCxInstructions, setShowCxInstructions] = useState(false);
  const [cxInstructions, setCxInstructions] = useState<string | null>(null);
  const [cxError, setCxError] = useState<string | null>(null);

  // Auto-hide recon warning after 2 seconds
  useEffect(() => {
    if (!reconError) return;
    const t = setTimeout(() => setReconError(null), 2000);
    return () => clearTimeout(t);
  }, [reconError]);

  const nowLabel = () =>
    new Date().toLocaleString("en-IN", {
      day: "2-digit",
      month: "2-digit",
      year: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });

  /** Show GatiMitra instead of internal for provider name */
  const normalizeProviderName = (name: string | null | undefined): string | null => {
    if (!name || !String(name).trim()) return null;
    const t = String(name).trim().toLowerCase();
    if (t === "internal") return "GatiMitra";
    return name.trim();
  };

  const buildReconRiderLabel = (params: {
    providerName?: string | null;
    riderName?: string | null;
    riderMobile?: string | null;
  }): string => {
    const provider = normalizeProviderName(params.providerName) ?? params.providerName?.trim();
    const name = params.riderName?.trim();
    const mobile = params.riderMobile?.trim();
    if (provider || name || mobile) {
      const parts: string[] = [];
      if (provider) parts.push(provider);
      const riderBits: string[] = [];
      if (name) riderBits.push(name);
      if (mobile) riderBits.push(mobile);
      if (riderBits.length > 0) {
        parts.push(`(${riderBits.join(" / ")})`);
      }
      return parts.join(" ");
    }
    return "Unknown rider";
  };

  const loadRemarks = async () => {
    try {
      setIsLoadingRemarks(true);
      const res = await fetch(`/api/orders/${order.id}/remarks`);
      if (!res.ok) {
        // eslint-disable-next-line no-console
        console.error("Failed to load remarks", await res.text());
        return;
      }
      const json = await res.json();
      const items =
        (json?.data as Array<{
          id: number;
          remark: string;
          remarkCategory: string | null;
          actorType?: string | null;
          actorName?: string | null;
          remarkMetadata?: { actorEmail?: string | null } | null;
          createdAt?: string;
          lastEditedAt?: string | null;
        }> | null) ?? [];

      const nowMs = Date.now();
      const FIFTEEN_MIN_MS = 15 * 60 * 1000;

      const mapped: Remark[] = items.map((r) => {
        const created = r.createdAt ? new Date(r.createdAt) : new Date();
        const edited = r.lastEditedAt ? new Date(r.lastEditedAt) : null;
        const actorEmail =
          typeof r.remarkMetadata?.actorEmail === "string"
            ? r.remarkMetadata.actorEmail
            : null;

        const withinWindow = nowMs - created.getTime() <= FIFTEEN_MIN_MS;

        const canEdit =
          !!actorEmail &&
          !!userEmail &&
          actorEmail.toLowerCase() === userEmail.toLowerCase() &&
          !edited &&
          withinWindow;

        return {
          id: String(r.id),
          type: r.remarkCategory ?? "OTHER",
          content: r.remark,
          actorType: r.actorType ?? null,
          actorName: r.actorName ?? null,
          actorEmail,
          canEdit,
          createdAtIso: r.createdAt ?? created.toISOString(),
          editedAtIso: edited ? edited.toISOString() : null,
          editedTimeLabel: edited
            ? edited.toLocaleString("en-IN", {
                day: "2-digit",
                month: "2-digit",
                year: "2-digit",
                hour: "2-digit",
                minute: "2-digit",
                hour12: true,
              })
            : null,
          time: created.toLocaleString("en-IN", {
            day: "2-digit",
            month: "2-digit",
            year: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
            hour12: true,
          }),
        };
      });

      setRemarks(mapped);

      // Prefetch edit history for all edited remarks so "See history" shows instant (no loading).
      const editedRemarks = mapped.filter((r) => r.editedTimeLabel);
      editedRemarks.forEach((r) => {
        const numericId = Number(r.id);
        if (!Number.isFinite(numericId)) return;
        fetch(`/api/orders/${order.id}/remarks/${numericId}`)
          .then((res) => (res.ok ? res.json() : null))
          .then((json) => {
            if (!json?.data) return;
            const items = (json.data as Array<{
              id: number;
              editedAt: string;
              editedByActorType: string;
              editedByActorName: string | null;
              oldRemark: string;
              newRemark: string;
              oldRemarkCategory: string | null;
              newRemarkCategory: string | null;
            }>) ?? [];
            const historyMapped: RemarkEditHistoryEntry[] = items.map((h) => {
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
            setRemarkHistory((prev) => ({ ...prev, [r.id]: historyMapped }));
          })
          .catch(() => {});
      });
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error("Error loading remarks", error);
    } finally {
      setIsLoadingRemarks(false);
    }
  };

  useEffect(() => {
    void loadRemarks();
    // Seed dropdown with current order rider immediately so "Select rider" has at least one option
    setAssignedRiders(
      order.riderId != null || order.riderName || order.riderMobile
        ? [
            {
              id: "current",
              riderId: order.riderId ?? null,
              riderName: order.riderName ?? null,
              riderMobile: order.riderMobile ?? null,
              providerName: normalizeProviderName(order.orderSource) ?? order.orderSource ?? null,
            },
          ]
        : []
    );

    const loadAssignments = async () => {
      try {
        const res = await fetch(`/api/orders/${order.id}/rider-assignments`);
        if (!res.ok) return;
        const json = await res.json();
        const items =
          (json?.data as Array<{
            id: number;
            riderId: number | null;
            riderName: string | null;
            riderMobile: string | null;
            deliveryProvider: string | null;
            assignmentStatus: string;
            assignedAt: string | Date | null;
          }> | null) ?? [];

        const ridersList: AssignedRiderOption[] = [];
        const seen = new Set<string>();

        for (const a of items) {
          const key =
            a.riderId != null
              ? `rider_${a.riderId}`
              : `n_${a.riderName ?? ""}_m_${a.riderMobile ?? ""}`;
          if (seen.has(key)) continue;
          seen.add(key);
          ridersList.push({
            id: a.riderId != null ? String(a.riderId) : `assign_${a.id}`,
            riderId: a.riderId,
            riderName: a.riderName,
            riderMobile: a.riderMobile,
            providerName: normalizeProviderName(a.deliveryProvider) ?? a.deliveryProvider,
          });
        }

        // Fallback: if API returns nothing but order has current rider, keep seeded current
        if (ridersList.length > 0) {
          setAssignedRiders(ridersList);
        }
      } catch {
        // ignore, we still have seeded current rider
      }
    };

    void loadAssignments();

    const loadRecons = async () => {
      try {
        setIsLoadingRecons(true);
        const res = await fetch(`/api/orders/${order.id}/recons`);
        if (!res.ok) {
          // eslint-disable-next-line no-console
          console.error("Failed to load recons", await res.text());
          return;
        }
        const json = await res.json();
        const items =
          (json?.data as Array<{
            id: number;
            riderId?: number | null;
            providerName: string | null;
            trackingId: string | null;
            riderName: string | null;
            riderMobile: string | null;
            actorEmail?: string | null;
            reconReason: string;
            reconAt: string | Date;
          }> | null) ?? [];

        const mapped: Recon[] = items.map((r) => {
          const created =
            r.reconAt instanceof Date ? r.reconAt : new Date(r.reconAt);
          return {
            id: String(r.id),
            rider: buildReconRiderLabel({
              providerName: normalizeProviderName(r.providerName) ?? r.providerName,
              riderName: r.riderName,
              riderMobile: r.riderMobile,
            }),
            reason: r.reconReason,
            time: created.toLocaleString("en-IN", {
              day: "2-digit",
              month: "2-digit",
              year: "2-digit",
              hour: "2-digit",
              minute: "2-digit",
              hour12: true,
            }),
            actorEmail: r.actorEmail ?? null,
          };
        });

        setRecons(mapped);

        // Build assigned riders: current order rider + distinct riders from recons
        const ridersList: AssignedRiderOption[] = [];
        const seen = new Set<string>();

        const currentKey =
          order.riderId != null
            ? `rider_${order.riderId}`
            : `n_${order.riderName ?? ""}_m_${order.riderMobile ?? ""}`;
        if (!seen.has(currentKey)) {
          seen.add(currentKey);
          ridersList.push({
            id: "current",
            riderId: order.riderId ?? null,
            riderName: order.riderName ?? null,
            riderMobile: order.riderMobile ?? null,
            providerName: normalizeProviderName(order.orderSource) ?? order.orderSource ?? null,
          });
        }
        for (const r of items) {
          const key =
            r.riderId != null
              ? `rider_${r.riderId}`
              : `n_${r.riderName ?? ""}_m_${r.riderMobile ?? ""}`;
          if (!seen.has(key)) {
            seen.add(key);
          ridersList.push({
            id: r.riderId != null ? String(r.riderId) : `recon_${r.id}`,
            riderId: r.riderId ?? null,
            riderName: r.riderName ?? null,
            riderMobile: r.riderMobile ?? null,
            providerName: normalizeProviderName(r.providerName) ?? r.providerName ?? null,
          });
          }
        }
        setAssignedRiders(ridersList);
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error("Error loading recons", error);
      } finally {
        setIsLoadingRecons(false);
      }
    };

    void loadRecons();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order.id]);

  const addRemark = async () => {
    const preset = remarkPreset.trim();
    const typed = remarkText.trim();

    // Build combined remark according to rules
    let text = "";
    if (preset && typed) {
      text = `${preset} !!!!!! ${typed}`;
    } else if (preset) {
      text = preset;
    } else if (typed) {
      text = typed;
    }

    if (!text || isSavingRemark) return;

    const createdTime = new Date();
    const tempId = `temp-${createdTime.getTime()}`;

    const optimisticRemark: Remark = {
      id: tempId,
      type: remarkType,
      content: text,
      actorType: "AGENT",
      actorName: "You",
      actorEmail: userEmail,
      canEdit: !!userEmail,
      createdAtIso: createdTime.toISOString(),
      editedAtIso: null,
      editedTimeLabel: null,
      time: createdTime.toLocaleString("en-IN", {
        day: "2-digit",
        month: "2-digit",
        year: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      }),
    };

    setRemarks((prev) => [optimisticRemark, ...prev]);
    setIsSavingRemark(true);

    try {
      const res = await fetch(`/api/orders/${order.id}/remarks`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          remark: text,
          remarkCategory: remarkType,
        }),
      });

      if (!res.ok) {
        // eslint-disable-next-line no-console
        console.error("Failed to save remark", await res.text());
      } else {
        const json = await res.json();
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

        const createdFromServer =
          saved && saved.createdAt ? new Date(saved.createdAt as string | Date) : createdTime;

        const edited =
          saved && saved.lastEditedAt ? new Date(saved.lastEditedAt as string | Date) : null;

        const actorEmail =
          typeof saved?.remarkMetadata?.actorEmail === "string"
            ? saved.remarkMetadata.actorEmail
            : optimisticRemark.actorEmail ?? null;

        const canEdit =
          !!actorEmail &&
          !!userEmail &&
          actorEmail.toLowerCase() === userEmail.toLowerCase() &&
          !edited;

        const finalRemark: Remark = {
          id: saved ? String(saved.id) : tempId,
          type: saved?.remarkCategory ?? remarkType,
          content: saved?.remark ?? text,
          actorType: saved?.actorType ?? optimisticRemark.actorType,
          actorName: saved?.actorName ?? optimisticRemark.actorName,
          actorEmail,
          canEdit,
          editedAtIso: edited ? edited.toISOString() : null,
          editedTimeLabel: edited
            ? edited.toLocaleString("en-IN", {
                day: "2-digit",
                month: "2-digit",
                year: "2-digit",
                hour: "2-digit",
                minute: "2-digit",
                hour12: true,
              })
            : null,
          createdAtIso: saved?.createdAt
            ? (saved.createdAt as string)
            : createdFromServer.toISOString(),
          time: createdFromServer.toLocaleString("en-IN", {
            day: "2-digit",
            month: "2-digit",
            year: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
            hour12: true,
          }),
        };

        setRemarks((prev) =>
          prev.map((r) => (r.id === tempId ? finalRemark : r))
        );

        if (actorEmail) {
          onRoutedToChange?.(actorEmail);
        }
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error("Error saving remark", error);
      // Roll back optimistic update on error
      setRemarks((prev) => prev.filter((r) => r.id !== tempId));
    } finally {
      setRemarkText("");
      setRemarkPreset("");
      setIsSavingRemark(false);
    }
  };

  const addNotification = () => {
    if (!notificationText.trim()) return;
    setNotifications((prev) => [
      {
        id: Date.now().toString(),
        message: notificationText.trim(),
        time: nowLabel(),
      },
      ...prev,
    ]);
    setNotificationText("");
  };

  const addRecon = async () => {
    const preset = reconReason.trim();
    const typed = reconText.trim();

    let combined = "";
    if (preset && typed) {
      combined = `${preset} !!!!!! ${typed}`;
    } else if (preset) {
      combined = preset;
    } else if (typed) {
      combined = typed;
    }

    if (!reconRider || !combined || isSavingRecon) return;

    const selected = assignedRiders.find((r) => r.id === reconRider);
    if (!selected) return;

    setIsSavingRecon(true);
    setReconError(null);

    try {
      const trackingId =
        order.formattedOrderId ??
        order.orderId ??
        `GMF${order.id.toString().padStart(6, "0")}`;

      const res = await fetch(`/api/orders/${order.id}/recons`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          merchantStoreId: order.merchantStoreId ?? null,
          providerName: normalizeProviderName(selected.providerName ?? order.orderSource) ?? selected.providerName ?? order.orderSource ?? null,
          trackingId,
          riderId: selected.riderId ?? null,
          riderName: selected.riderName ?? null,
          riderMobile: selected.riderMobile ?? null,
          reasonPreset: preset || null,
          reasonText: typed || null,
        }),
      });

      const responseText = await res.text();
      if (!res.ok) {
        try {
          const body = JSON.parse(responseText);
          if (body.code === "RECON_ALREADY_EXISTS") {
            setReconError(
              "You can't add recon for the same rider twice. Try with a different rider if needed."
            );
            return;
          }
        } catch {
          // not JSON or other error
        }
        // eslint-disable-next-line no-console
        console.error("Failed to save recon", responseText);
        setReconError("Failed to save recon. Please try again.");
        return;
      }

      const json = JSON.parse(responseText);
      const saved = json?.data as
        | {
            id: number;
            riderId?: number | null;
            providerName: string | null;
            trackingId: string | null;
            riderName: string | null;
            riderMobile: string | null;
            actorEmail?: string | null;
            reconReason: string;
            reconAt: string | Date;
          }
        | undefined;

      if (!saved) return;

      const created =
        saved.reconAt instanceof Date
          ? saved.reconAt
          : new Date(saved.reconAt);

      const mapped: Recon = {
        id: String(saved.id),
        rider: buildReconRiderLabel({
          providerName: normalizeProviderName(saved.providerName) ?? saved.providerName,
          riderName: saved.riderName,
          riderMobile: saved.riderMobile,
        }),
        reason: saved.reconReason,
        time: created.toLocaleString("en-IN", {
          day: "2-digit",
          month: "2-digit",
          year: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
          hour12: true,
        }),
        actorEmail: saved.actorEmail ?? null,
      };

      setRecons((prev) => [mapped, ...prev.filter((r) => r.id !== mapped.id)]);
      // Add new rider to dropdown if not already present
      const newAssignedRiderId = saved.riderId;
      if (
        newAssignedRiderId != null &&
        !assignedRiders.some(
          (a) => a.riderId === newAssignedRiderId || a.id === String(newAssignedRiderId)
        )
      ) {
        setAssignedRiders((prev) => [
          ...prev,
          {
            id: String(newAssignedRiderId),
            riderId: newAssignedRiderId,            riderName: saved.riderName ?? null,
            riderMobile: saved.riderMobile ?? null,
            providerName: normalizeProviderName(saved.providerName) ?? saved.providerName ?? null,
          },
        ]);
      }
      setReconText("");
      setReconReason("");
      setReconRider("");
      setReconError(null);
    } finally {
      setIsSavingRecon(false);
    }
  };

  const lastRecon = recons[0];

  const openCxInstructions = () => {
    setShowCxInstructions(true);
    // Use delivery_instructions from orders_food (passed on order); no fetch needed.
    if (order.deliveryInstructions != null && order.deliveryInstructions !== "") {
      setCxInstructions(order.deliveryInstructions);
      setCxError(null);
    } else {
      setCxInstructions(null);
      setCxError(null);
    }
  };

  const startEditRemark = (remark: Remark) => {
    if (!remark.canEdit || remark.id.startsWith("temp-")) return;

    // Extra safety: enforce 15-minute window on client as well
    if (remark.createdAtIso) {
      const created = new Date(remark.createdAtIso);
      const diff = Date.now() - created.getTime();
      const FIFTEEN_MIN_MS = 15 * 60 * 1000;
      if (diff > FIFTEEN_MIN_MS) {
        return;
      }
    }

    setEditingRemarkId(remark.id);
    setEditingText(remark.content);
    setEditingType(remark.type);
  };

  const saveEditRemark = async (remark: Remark) => {
    const text = editingText.trim();
    if (!editingRemarkId || !text || isSavingEdit) return;

    const numericId = Number(remark.id);
    if (!Number.isFinite(numericId)) return;

    setIsSavingEdit(true);
    try {
      const res = await fetch(`/api/orders/${order.id}/remarks/${numericId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          remark: text,
          remarkCategory: editingType,
        }),
      });

      if (!res.ok) {
        // eslint-disable-next-line no-console
        console.error("Failed to edit remark", await res.text());
        return;
      }

      const json = await res.json();
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

      const created = saved.createdAt ? new Date(saved.createdAt as string | Date) : new Date();
      const edited = saved.lastEditedAt ? new Date(saved.lastEditedAt as string | Date) : null;

      const actorEmail =
        typeof saved.remarkMetadata?.actorEmail === "string"
          ? saved.remarkMetadata.actorEmail
          : remark.actorEmail ?? null;

      const canEditRemark = false;

      const updatedRemark: Remark = {
        id: String(saved.id),
        type: saved.remarkCategory ?? editingType,
        content: saved.remark,
        actorType: saved.actorType ?? remark.actorType ?? null,
        actorName: saved.actorName ?? remark.actorName ?? null,
        actorEmail,
        canEdit: canEditRemark,
        createdAtIso: created.toISOString(),
        time: created.toLocaleString("en-IN", {
          day: "2-digit",
          month: "2-digit",
          year: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
          hour12: true,
        }),
        editedAtIso: edited ? edited.toISOString() : remark.editedAtIso ?? null,
        editedTimeLabel: edited
          ? edited.toLocaleString("en-IN", {
              day: "2-digit",
              month: "2-digit",
              year: "2-digit",
              hour: "2-digit",
              minute: "2-digit",
              hour12: true,
            })
          : remark.editedTimeLabel ?? null,
      };

      setRemarks((prev) => prev.map((r) => (r.id === remark.id ? updatedRemark : r)));
      setEditingRemarkId(null);
      setEditingText("");
      setEditingType("CUSTOMER");
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error("Error editing remark", error);
    } finally {
      setIsSavingEdit(false);
    }
  };

  const toggleHistoryForRemark = async (remark: Remark) => {
    if (!remark.editedAtIso) return;
    if (openHistoryId === remark.id) {
      setOpenHistoryId(null);
      return;
    }

    // If we already have history loaded, just toggle open
    if (remarkHistory[remark.id]) {
      setOpenHistoryId(remark.id);
      return;
    }

    const numericId = Number(remark.id);
    if (!Number.isFinite(numericId)) return;

    setHistoryLoadingId(remark.id);
    try {
      const res = await fetch(`/api/orders/${order.id}/remarks/${numericId}`);
      if (!res.ok) {
        // eslint-disable-next-line no-console
        console.error("Failed to load remark history", await res.text());
        return;
      }
      const json = await res.json();
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
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error("Error loading remark history", error);
    } finally {
      setHistoryLoadingId(null);
    }
  };

  useEffect(() => {
    if (!toastMessage) return;
    const t = setTimeout(() => setToastMessage(null), 4000);
    return () => clearTimeout(t);
  }, [toastMessage]);

  return (
    <>
    <aside className="w-full space-y-3 text-[12px] text-slate-600">
      {/* Order details card — compact labels & spacing */}
      <section className="rounded-xl border border-slate-200 bg-white p-3 shadow-[0_1px_3px_rgba(15,23,42,0.06)]">
        <div className="mb-2 flex items-center justify-between border-b border-slate-100 pb-1.5">
          <h3 className="flex items-center gap-1 text-[12px] font-semibold text-slate-800">
            <i className="bi bi-info-circle text-[11px] text-emerald-500" />
            Order details
          </h3>
        </div>
        <dl className="space-y-1 text-[11px] text-slate-600">
          <div className="flex items-center justify-between gap-2">
            <dt className="shrink-0">Items:</dt>
            <dd className="flex min-w-0 items-center justify-end gap-1.5 font-medium text-slate-700">
              <span>(1)</span>
              <span
                role="button"
                tabIndex={0}
                className="cursor-pointer text-emerald-600 hover:text-emerald-700"
                onClick={() => setShowItemsRefundModal(true)}
                onKeyDown={(e) => e.key === "Enter" && setShowItemsRefundModal(true)}
              >
                <i className="bi bi-eye" /> View
              </span>
            </dd>
          </div>
          <div className="flex items-center justify-between gap-2">
            <dt className="shrink-0">Assign before accept:</dt>
            <dd>
              <span className="inline-block rounded-full bg-red-500 px-2 py-0.5 text-[10px] font-semibold text-white">
                False
              </span>
            </dd>
          </div>
          <div className="flex items-center justify-between gap-2">
            <dt className="shrink-0">Distance:</dt>
            <dd className="font-medium text-slate-700">
              {order.distanceKm != null ? `${Number(order.distanceKm).toFixed(2)} km` : "—"}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-2">
            <dt className="shrink-0">Delivery type:</dt>
            <dd>
              <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700 ring-1 ring-emerald-100">
                DELIVERY
              </span>
            </dd>
          </div>
          <div className="flex items-center justify-between gap-2">
            <dt className="shrink-0">Initiated by:</dt>
            <dd className="font-medium text-slate-700">Merchant</dd>
          </div>
          <div className="flex items-center justify-between gap-2">
            <dt className="shrink-0">Locality:</dt>
            <dd>
              <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700 ring-1 ring-emerald-100">
                GREEN
              </span>
            </dd>
          </div>
          <div className="flex items-center justify-between gap-2">
            <dt className="shrink-0">Delivered by:</dt>
            <dd>
              <span className="inline-flex items-center rounded-full bg-cyan-50 px-2 py-0.5 text-[10px] font-medium text-cyan-700 ring-1 ring-cyan-100">
                GATIMITRA_DIRECT
              </span>
            </dd>
          </div>
          <div className="flex items-center justify-between gap-2">
            <dt className="shrink-0">System KPT:</dt>
            <dd className="font-medium text-slate-700">18 mins</dd>
          </div>
          <div className="flex items-center justify-between gap-2">
            <dt className="shrink-0">Contactless:</dt>
            <dd>
              <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700 ring-1 ring-emerald-100">
                TRUE
              </span>
            </dd>
          </div>
          <div className="flex items-center justify-between gap-2">
            <dt className="shrink-0">Order ID:</dt>
            <dd className="flex min-w-0 items-center justify-end gap-1 font-medium text-slate-700">
              <i className="bi bi-clipboard text-slate-500 cursor-pointer shrink-0" />
              <span className="truncate">{order.orderId ?? `#${order.id}`}</span>
            </dd>
          </div>
          <div className="flex items-center justify-between gap-2">
            <dt className="shrink-0">First ETA:</dt>
            <dd className="min-w-0 font-medium text-slate-700 text-right">
              {order.firstEtaAt
                ? new Date(order.firstEtaAt).toLocaleString("en-IN", {
                    day: "2-digit",
                    month: "2-digit",
                    year: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                    hour12: true,
                  })
                : "—"}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-2">
            <dt className="shrink-0">CX Instructions:</dt>
            <dd>
              <span
                className="cursor-pointer font-medium text-emerald-600 hover:text-emerald-700"
                onClick={openCxInstructions}
                onKeyDown={(e) => e.key === "Enter" && openCxInstructions()}
                role="button"
                tabIndex={0}
              >
                <i className="bi bi-chat-left-text" /> View
              </span>
            </dd>
          </div>
        </dl>
      </section>

      {/* Create refund CTA - opens Items / Refund modal */}
      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-[0_1px_3px_rgba(15,23,42,0.06)]">
        <button
          type="button"
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-500 px-4 py-2 text-[13px] font-medium text-white shadow-sm transition hover:bg-emerald-600 cursor-pointer"
          onClick={() => setShowItemsRefundModal(true)}
        >
          <i className="bi bi-arrow-counterclockwise" />
          Create refund
        </button>
      </section>

      {/* Add remarks */}
      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-[0_1px_3px_rgba(15,23,42,0.06)]">
        <div className="mb-3 flex items-center justify-between border-b border-slate-100 pb-2">
          <h3 className="flex items-center gap-1.5 text-[13px] font-semibold text-slate-800">
            <i className="bi bi-chat-left-dots text-emerald-500" />
            Add remarks
          </h3>
          <button
            className="flex items-center gap-1 text-xs font-medium text-emerald-600 hover:text-emerald-700 cursor-pointer"
            onClick={() => {
              setShowRemarksModal(true);
            }}
          >
            <i className="bi bi-list-check" />
            See all ({remarks.length > 0 || !isLoadingRemarks ? remarks.length : initialRemarksCount})
          </button>
        </div>
        <div className="space-y-2">
          <select
            value={remarkType}
            onChange={(e) => {
              setRemarkType(e.target.value);
              setRemarkPreset("");
            }}
            className="h-8 w-full rounded border border-slate-200 bg-white px-2 text-[12px] text-slate-700 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          >
            <option value="CUSTOMER">CUSTOMER</option>
            <option value="MERCHANT">MERCHANT</option>
            <option value="RIDER">RIDER</option>
            <option value="OTHER">OTHER</option>
          </select>
          <select
            value={remarkPreset}
            onChange={(e) => {
              setRemarkPreset(e.target.value);
            }}
            className="h-8 w-full rounded border border-slate-200 bg-white px-2 text-[12px] text-slate-700 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          >
            <option value="">Select Option</option>
            {(STANDARD_REMARKS[remarkType as keyof typeof STANDARD_REMARKS] || []).map((remark) => (
              <option key={remark} value={remark}>
                {remark}
              </option>
            ))}
          </select>
          <textarea
            value={remarkText}
            onChange={(e) => setRemarkText(e.target.value)}
            placeholder="Add your comment here..."
            className="min-h-[60px] w-full rounded border border-slate-200 bg-white p-2 text-[12px] text-slate-700 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          />
          <button
            onClick={addRemark}
            disabled={isSavingRemark}
            className={`mt-1 flex w-full items-center justify-center gap-1.5 rounded-lg bg-emerald-500 px-4 py-2 text-[12px] font-medium text-white shadow-sm transition ${
              isSavingRemark ? "cursor-not-allowed opacity-80" : "cursor-pointer hover:bg-emerald-600"
            }`}
          >
            {isSavingRemark ? (
              <>
                <span className="inline-block h-4 w-4 animate-spin rounded-full border-[1.5px] border-white border-r-transparent" />
                Saving...
              </>
            ) : (
              <>
                <i className="bi bi-send" />
                Submit
              </>
            )}
          </button>
        </div>
      </section>

      {/* Send customer notification */}
      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-[0_1px_3px_rgba(15,23,42,0.06)]">
        <div className="mb-3 flex items-center justify-between border-b border-slate-100 pb-2">
          <h3 className="flex items-center gap-1.5 text-[13px] font-semibold text-slate-800">
            <i className="bi bi-bell text-emerald-500" />
            Send Cx notification
          </h3>
          <span className="text-xs text-slate-500">
            Total: {notifications.length}
          </span>
        </div>
        <div className="space-y-2">
          <textarea
            value={notificationText}
            onChange={(e) => setNotificationText(e.target.value)}
            placeholder="Enter notification message..."
            className="min-h-[60px] w-full rounded border border-slate-200 bg-white p-2 text-[12px] text-slate-700 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          />
          <button
            onClick={addNotification}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-emerald-500 px-4 py-2 text-[12px] font-medium text-white shadow-sm transition hover:bg-emerald-600 cursor-pointer"
          >
            <i className="bi bi-send" />
            Send notification
          </button>
        </div>
      </section>

      {/* Rider recon + rejection info */}
      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-[0_1px_3px_rgba(15,23,42,0.06)]">
        <div className="mb-3 flex items-center justify-between border-b border-slate-100 pb-2">
          <h3 className="flex items-center gap-1.5 text-[13px] font-semibold text-slate-800">
            <ClipboardCheck className="h-4 w-4 text-emerald-500" />
            Rider Recon
          </h3>
          <button
            type="button"
            className="text-xs text-emerald-700 hover:text-emerald-800 cursor-pointer underline-offset-2 hover:underline"
            onClick={() => setShowReconsModal(true)}
          >
            See all ({recons.length > 0 || !isLoadingRecons ? recons.length : initialReconsCount})
          </button>
        </div>
        <div className="space-y-2">
          <select
            value={reconRider}
            onChange={(e) => {
              setReconRider(e.target.value);
              setReconError(null);
            }}
            className="h-8 w-full rounded border border-slate-200 bg-white px-2 text-[12px] text-slate-700 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          >
            <option value="">Select rider</option>
            {assignedRiders.map((r) => {
              const label = buildReconRiderLabel({
                providerName: r.providerName,
                riderName: r.riderName,
                riderMobile: r.riderMobile,
              });
              return (
                <option key={r.id} value={r.id}>
                  {label || (r.id === "current" ? "Current rider" : `Rider ${r.id}`)}
                </option>
              );
            })}
          </select>
          <select
            value={reconReason}
            onChange={(e) => setReconReason(e.target.value)}
            className="h-8 w-full rounded border border-slate-200 bg-white px-2 text-[12px] text-slate-700 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          >
            <option value="">Select Rejection Option (Optional)</option>
            <option value="Customer denying order">Customer denying order</option>
            <option value="LP Assignment Timeout">LP Assignment Timeout</option>
            <option value="Merchant non-responsive">Merchant non-responsive</option>
            <option value="Merchant denying order">Merchant denying order</option>
            <option value="Items out of stock">Items out of stock</option>
            <option value="Not operational today">Not operational today</option>
            <option value="Customer non-responsive">Customer non-responsive</option>
            <option value="Nearing closing time">Nearing closing time</option>
            <option value="Duplicate Order">Duplicate Order</option>
            <option value="Delay in order acceptance">Delay in order acceptance</option>
            <option value="Poor quality of packaging">Poor quality of packaging</option>
            <option value="Poor quality">Poor quality</option>
            <option value="Wrong order">Wrong order</option>
            <option value="Foreign object in food / FSSAI issue">
              Foreign object in food / FSSAI issue
            </option>
            <option value="Missing item">Missing item</option>
            <option value="Customer reject due to delay">
              Customer reject due to delay
            </option>
            <option value="FE - No answer">FE - No answer</option>
            <option value="Denial - Pickup timeout">Denial - Pickup timeout</option>
            <option value="Food not delivered">Food not delivered</option>
            <option value="Instructions not followed">Instructions not followed</option>
            <option value="PG failure">PG failure</option>
            <option value="Denial - Rider abusive">Denial - Rider abusive</option>
            <option value="Merchant charging extra amount">
              Merchant charging extra amount
            </option>
            <option value="Merchant device issue">Merchant device issue</option>
            <option value="Nearing opening time">Nearing opening time</option>
            <option value="Kitchen is full">Kitchen is full</option>
            <option value="Out of subzone / area">Out of subzone / area</option>
            <option value="Unsafe area">Unsafe area</option>
            <option value="FE - Accident / Rain / Strike / Vehicle issue">
              FE - Accident / Rain / Strike / Vehicle issue
            </option>
            <option value="Wrong user address">Wrong user address</option>
            <option value="FE - Device / App issue">FE - Device / App issue</option>
            <option value="FE - Long distance order">FE - Long distance order</option>
            <option value="Auto cancelled">Auto cancelled</option>
            <option value="Product outside deals-in">Product outside deals-in</option>
            <option value="Auto cancellation - Bill not generated">
              Auto cancellation - Bill not generated
            </option>
            <option value="Incorrect merchant address">Incorrect merchant address</option>
            <option value="Customer placed order by mistake">
              Customer placed order by mistake
            </option>
            <option value="Someone else picked the order">
              Someone else picked the order
            </option>
            <option value="Rider fled with the order">
              Rider fled with the order
            </option>
            <option value="Customer ordering in bulk">Customer ordering in bulk</option>
            <option value="Invalid prescription">Invalid prescription</option>
            <option value="Prescription missing">Prescription missing</option>
            <option value="Issue with pricing">Issue with pricing</option>
            <option value="Rider charging extra">Rider charging extra</option>
            <option value="Expired items">Expired items</option>
            <option value="Order damaged during delivery">
              Order damaged during delivery
            </option>
            <option value="Merchant delaying the order (High wait time)">
              Merchant delaying the order (High wait time)
            </option>
            <option value="Someone else picked the order (Same 3PL)">
              Someone else picked the order (Same 3PL)
            </option>
            <option value="Someone else picked the order (Different 3PL)">
              Someone else picked the order (Different 3PL)
            </option>
            <option value="Merchant handed over the order to someone else">
              Merchant handed over the order to someone else
            </option>
            <option value="Rider denying to pickup food">
              Rider denying to pickup food
            </option>
          </select>
          <textarea
            value={reconText}
            onChange={(e) => setReconText(e.target.value)}
            placeholder="Add your recon comment here... (Required if rejection option not selected)"
            className="min-h-[60px] w-full rounded border border-slate-200 bg-white p-2 text-[12px] text-slate-700 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          />
          {reconError && (
            <p className="mt-1 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[11px] font-medium text-amber-800">
              {reconError}
            </p>
          )}
          <button
            type="button"
            onClick={addRecon}
            disabled={isSavingRecon}
            className={`mt-1 flex w-full items-center justify-center gap-1.5 rounded-lg bg-emerald-500 px-4 py-2 text-[12px] font-medium text-white shadow-sm transition ${
              isSavingRecon ? "cursor-not-allowed opacity-80" : "cursor-pointer hover:bg-emerald-600"
            }`}
          >
            {isSavingRecon ? (
              <>
                <span className="inline-block h-4 w-4 animate-spin rounded-full border-[1.5px] border-white border-r-transparent" />
                Saving...
              </>
            ) : (
              <>
                <i className="bi bi-check-circle" />
                Submit Recon
              </>
            )}
          </button>
        </div>

        {/* Rejection Info – show when order has refund(s) */}
        <div className="mt-3 rounded-xl border border-slate-200/90 bg-white shadow-sm overflow-hidden">
          <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-100">
            <h3 className="text-[13px] font-semibold text-slate-800 tracking-tight">
              Rejection Info
            </h3>
          </div>
          <div className="p-3">
            {orderRefunds.length > 0 ? (
              <div className="space-y-3">
                {orderRefunds.map((r) => (
                  <div
                    key={r.id}
                    className="rounded-lg border border-slate-100 bg-slate-50/60 p-3 space-y-2.5"
                  >
                    <p className="text-slate-800 text-[12px] leading-snug">
                      <span className="font-medium text-slate-700">Reason:</span>{" "}
                      {r.refundReason}
                    </p>
                    {r.refundDescription && (
                      <p className="text-slate-600 text-[11px] leading-relaxed pl-0">
                        {r.refundDescription}
                      </p>
                    )}
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-600">
                      <span>
                        <span className="font-medium text-slate-600">Rejected at:</span>{" "}
                        {new Date(r.createdAt).toLocaleString("en-IN", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                          hour12: true,
                        })}
                      </span>
                      <span>
                        <span className="font-medium text-slate-600">By:</span>{" "}
                        {r.initiatedByEmail ?? "—"}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 pt-0.5">
                      Refund amount: ₹{Number(r.refundAmount).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-slate-500 text-[12px]">
                No refund / rejection recorded for this order. Rider recon entries are in{" "}
                <span className="font-medium text-emerald-700">See all</span> above.
              </p>
            )}
          </div>
        </div>
      </section>

      {/* All remarks modal */}
      {showRemarksModal && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 px-2">
          <div className="w-full max-w-3xl rounded-xl bg-[#f1faf5] shadow-xl border border-emerald-100">
            {/* Modal header */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-emerald-100">
              <div className="flex items-center gap-2">
                <MessageCircle className="h-4 w-4 text-emerald-500" />
                <h2 className="text-[14px] font-semibold text-slate-800">
                  All Remarks
                </h2>
              </div>
              <button
                type="button"
                className="inline-flex h-7 w-7 items-center justify-center rounded-full text-slate-500 hover:text-slate-700 hover:bg-emerald-50 cursor-pointer"
                onClick={() => setShowRemarksModal(false)}
              >
                <X className="h-3 w-3" />
              </button>
            </div>

            {/* Modal body */}
            <div className="max-h-[440px] overflow-y-auto px-5 py-3 bg-white rounded-b-xl">
              {isLoadingRemarks ? (
                <div className="py-6 text-center text-xs text-slate-500">
                  Loading remarks...
                </div>
              ) : remarks.length === 0 ? (
                <div className="py-6 text-center text-xs text-slate-500">
                  No remarks added yet.
                </div>
              ) : (
                <div className="space-y-3">
                  {remarks.map((r) => (
                    <div
                      key={r.id}
                      className="border-b border-slate-100 pb-3 last:border-b-0 last:pb-0"
                    >
                      {/* Top row: avatar + name + badges + timestamp */}
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
                              {r.actorEmail && (
                                <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-[2px] text-[9px] font-medium text-slate-600">
                                  {r.actorEmail}
                                </span>
                              )}
                              {/* Customer / Merchant / Rider / Other tag in same row */}
                              <span
                                className={`inline-flex items-center rounded-full px-2 py-[2px] text-[9px] font-semibold ${
                                  r.type === "CUSTOMER"
                                    ? "bg-emerald-600 text-white"
                                    : r.type === "RIDER"
                                      ? "bg-sky-600 text-white"
                                      : r.type === "MERCHANT"
                                        ? "bg-amber-600 text-white"
                                        : "bg-slate-200 text-slate-700"
                                }`}
                              >
                                {r.type}
                              </span>
                            </div>
                            {/* Remark text aligned with name (right of avatar) */}
                            {editingRemarkId === r.id ? (
                              <div className="mt-1 w-full max-w-[620px] space-y-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="text-[10px] text-slate-500">Category:</span>
                                  <select
                                    value={editingType}
                                    onChange={(e) => setEditingType(e.target.value)}
                                    className="h-7 rounded border border-emerald-200 bg-white px-2 text-[10px] text-slate-700 focus:outline-none focus:ring-1 focus:ring-emerald-500 cursor-pointer"
                                  >
                                    <option value="CUSTOMER">CUSTOMER</option>
                                    <option value="MERCHANT">MERCHANT</option>
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
                              <div className="mt-1 text-[12px] leading-relaxed text-slate-700 whitespace-pre-line">
                                {r.content}
                              </div>
                            )}
                            {r.editedTimeLabel && (
                              <div className="mt-0.5 text-[10px] text-slate-400">
                                Edited {r.editedTimeLabel}
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="text-[11px] text-slate-500 whitespace-nowrap">
                          {r.time}
                        </div>
                      </div>

                      {/* Edit / history actions */}
                      <div className="mt-1 flex items-center justify-end gap-3 text-[10px]">
                        {r.editedTimeLabel && (
                          <button
                            type="button"
                            onClick={() => toggleHistoryForRemark(r)}
                            className={`inline-flex items-center gap-1 rounded-full px-2 py-[2px] text-[10px] font-medium cursor-pointer ${
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
                                <span>See history</span>
                                <span className="text-[9px]">▾</span>
                              </>
                            )}
                          </button>
                        )}

                        {r.canEdit && (
                          <>
                            {editingRemarkId === r.id ? (
                              <>
                                <button
                                  type="button"
                                  disabled={isSavingEdit}
                                  onClick={() => saveEditRemark(r)}
                                  className="inline-flex items-center gap-1 rounded-full px-2 py-[2px] font-medium text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-70 cursor-pointer"
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
                                  className="inline-flex items-center gap-1 rounded-full px-2 py-[2px] font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-70 cursor-pointer"
                                >
                                  Cancel
                                </button>
                              </>
                            ) : (
                              <button
                                type="button"
                                onClick={() => startEditRemark(r)}
                                className="inline-flex items-center gap-1 rounded-full px-2 py-[2px] text-[10px] font-medium text-emerald-700 hover:bg-emerald-50 cursor-pointer"
                              >
                                <Pencil className="h-3 w-3" />
                                <span>Edit</span>
                              </button>
                            )}
                          </>
                        )}
                      </div>

                      {/* History panel (only when edited and toggled) */}
                      {r.editedTimeLabel && openHistoryId === r.id && remarkHistory[r.id] && (
                        <div className="mt-2 rounded border border-slate-100 bg-slate-50 px-3 py-2 text-[11px] text-slate-700">
                          {remarkHistory[r.id].length === 0 ? (
                            <div className="text-[10px] text-slate-500">
                              No history entries found.
                            </div>
                          ) : (
                            <div className="space-y-2">
                              {remarkHistory[r.id].map((h) => (
                                <div key={h.id} className="border-b border-slate-100 pb-2 last:border-b-0 last:pb-0">
                                  <div className="flex items-center justify-between text-[10px] text-slate-500 mb-1">
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
                                      <div className="flex items-center justify-between mb-0.5">
                                        <span className="text-[10px] font-semibold text-slate-500">
                                          Old remark
                                        </span>
                                        {h.oldRemarkCategory && (
                                          <span className="inline-flex items-center rounded-full px-2 py-[2px] text-[9px] font-semibold bg-slate-100 text-slate-700">
                                            {h.oldRemarkCategory}
                                          </span>
                                        )}
                                      </div>
                                      <div className="rounded bg-white px-2 py-1 text-[11px] text-slate-700 whitespace-pre-line border border-slate-100">
                                        {h.oldRemark}
                                      </div>
                                    </div>
                                    <div>
                                      <div className="flex items-center justify-between mb-0.5">
                                        <span className="text-[10px] font-semibold text-slate-500">
                                          New remark
                                        </span>
                                        {h.newRemarkCategory && (
                                          <span className="inline-flex items-center rounded-full px-2 py-[2px] text-[9px] font-semibold bg-slate-100 text-slate-700">
                                            {h.newRemarkCategory}
                                          </span>
                                        )}
                                      </div>
                                      <div className="rounded bg-white px-2 py-1 text-[11px] text-slate-700 whitespace-pre-line border border-slate-100">
                                        {h.newRemark}
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* All recons modal */}
      {showReconsModal && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 px-2">
          <div className="w-full max-w-3xl rounded-xl bg-[#f1faf5] shadow-xl border border-emerald-100">
            {/* Modal header */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-emerald-100">
              <div className="flex items-center gap-2">
                <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                  <ClipboardCheck className="h-3.5 w-3.5" />
                </span>
                <h2 className="text-[14px] font-semibold text-slate-800">
                  All Recons
                </h2>
              </div>
              <button
                type="button"
                className="inline-flex h-7 w-7 items-center justify-center rounded-full text-slate-500 hover:text-slate-700 hover:bg-emerald-50 cursor-pointer"
                onClick={() => setShowReconsModal(false)}
              >
                <X className="h-3 w-3" />
              </button>
            </div>

            {/* Modal body */}
            <div className="max-h-[440px] overflow-y-auto px-5 py-4 bg-white rounded-b-xl text-[12px] text-slate-800">
              {isLoadingRecons ? (
                <div className="py-6 text-center text-xs text-slate-500">
                  Loading recons...
                </div>
              ) : recons.length === 0 ? (
                <div className="py-6 text-center text-xs text-slate-500">
                  No recons available.
                </div>
              ) : (
                <div className="space-y-3">
                  {recons.map((r) => (
                    <div
                      key={r.id}
                      className="rounded-lg border border-slate-100 bg-slate-50/70 px-3 py-2.5"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-0.5 min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-[11px] font-semibold text-slate-800">
                              {r.rider}
                            </span>
                            {r.actorEmail && (
                              <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-[2px] text-[9px] font-medium text-slate-600 truncate max-w-[180px]" title={r.actorEmail}>
                                {r.actorEmail}
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-slate-700 whitespace-pre-line mt-1">
                            {r.reason}
                          </p>
                        </div>
                        <div className="text-right text-[10px] text-slate-500 whitespace-nowrap shrink-0">
                          <div>{r.time}</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </aside>

    {/* Items / Refund modal - opened by View Items or Create refund */}
    <ItemsRefundModal
      isOpen={showItemsRefundModal}
      onClose={() => setShowItemsRefundModal(false)}
      onToast={(msg) => setToastMessage(msg)}
      orderId={order.id}
      onRefundCreated={onRefundCreated}
    />

    {showCxInstructions && (
      <div
        className="fixed inset-0 z-[10002] bg-black/50 flex items-center justify-center p-4"
        onClick={(e) => {
          if (e.target === e.currentTarget) setShowCxInstructions(false);
        }}
      >
        <div
          className="bg-white rounded-lg shadow-lg max-w-lg w-full p-5 text-[12px] text-slate-800"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
                <i className="bi bi-chat-left-text text-[14px]" />
              </span>
              <div>
                <h2 className="text-sm font-semibold text-slate-900">CX Instructions</h2>
              </div>
            </div>
            <button
              type="button"
              className="text-xs text-slate-500 hover:text-slate-700 cursor-pointer"
              onClick={() => setShowCxInstructions(false)}
            >
              ✕
            </button>
          </div>

          <div className="mt-1 max-h-[60vh] overflow-y-auto rounded-md border border-slate-200 bg-slate-50/60 p-3">
            {cxError ? (
              <p className="text-[12px] text-red-600">{cxError}</p>
            ) : cxInstructions ? (
              <pre className="whitespace-pre-wrap text-[12px] text-slate-700">
                {cxInstructions}
              </pre>
            ) : (
              <p className="text-[12px] text-slate-500">
                No delivery instructions for this order.
              </p>
            )}
          </div>
        </div>
      </div>
    )}

    {toastMessage && (
      <div className="fixed bottom-4 right-4 z-[10003] max-w-sm rounded-lg bg-slate-800 px-4 py-3 text-sm text-white shadow-lg">
        {toastMessage}
      </div>
    )}
    </>
  );
}

