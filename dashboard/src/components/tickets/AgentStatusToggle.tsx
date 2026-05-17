"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { createPortal } from "react-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Power, AlertTriangle } from "lucide-react";
import { loadClientSnapshot, saveClientSnapshot } from "@/lib/client-route-snapshot";
import { queryKeys } from "@/lib/queryKeys";

interface AgentStatus {
  isOnline: boolean;
  currentStatus: "online" | "offline" | "break" | "busy";
  breakStartedAt: string | null;
  lastOnlineAt: string | null;
  totalOnlineTimeMinutes?: number;
  totalBreakTimeMinutes?: number;
  totalBusyTimeMinutes?: number;
  busyStartedAt?: string | null;
}

const AGENT_STATUS_SNAPSHOT_KEY = "dashboard_snapshot:agentStatus";
/** Keep last server shape so a full page refresh does not flash Offline / loading before /api responds */
const AGENT_STATUS_SNAPSHOT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

type AgentStatusResponse = { success: boolean; data: AgentStatus };

const OFFLINE_REASON_PRESETS: { value: string; label: string }[] = [
  { value: "tea_break", label: "Tea break" },
  { value: "end_of_shift", label: "End of shift" },
  { value: "meal_break", label: "Meal break" },
  { value: "personal", label: "Personal" },
  { value: "other", label: "Other (type below)" },
];

export function AgentStatusToggle() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [showOfflineWarning, setShowOfflineWarning] = useState(false);
  const [offlineReasonPreset, setOfflineReasonPreset] = useState("tea_break");
  const [offlineReasonCustom, setOfflineReasonCustom] = useState("");
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 });
  const buttonRef = useRef<HTMLButtonElement>(null);
  const queryClient = useQueryClient();

  /** Client-only (see Header dynamic ssr:false) — safe to read snapshot on first paint so refresh does not flash loading. */
  const initialSnapshot = useMemo(
    () => loadClientSnapshot<AgentStatusResponse>(AGENT_STATUS_SNAPSHOT_KEY, AGENT_STATUS_SNAPSHOT_TTL_MS) ?? undefined,
    []
  );

  const { data: statusData, isPending } = useQuery<AgentStatusResponse>({
    queryKey: ["agentStatus"],
    queryFn: async () => {
      const res = await fetch("/api/agents/status");
      if (!res.ok) throw new Error("Failed to fetch status");
      return res.json();
    },
    refetchInterval: 30000,
    retry: 2,
    staleTime: 10_000,
    ...(initialSnapshot != null ? { initialData: initialSnapshot } : {}),
    placeholderData: (prev) => prev,
  });

  useEffect(() => {
    if (statusData && typeof statusData.data !== "undefined") {
      saveClientSnapshot(AGENT_STATUS_SNAPSHOT_KEY, statusData);
    }
  }, [statusData]);

  // Update status mutation
  const updateStatusMutation = useMutation({
    mutationFn: async (payload: {
      status: "online" | "offline" | "break" | "busy";
      reason?: string;
    }) => {
      const { status, reason } = payload;
      const res = await fetch("/api/agents/status", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          status === "offline" && reason != null && reason.trim() !== ""
            ? { status, reason: reason.trim() }
            : { status }
        ),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to update status");
      }
      return res.json();
    },
    onSuccess: (_json, variables) => {
      const next = variables.status;
      queryClient.setQueryData<AgentStatusResponse>(["agentStatus"], (prev) => {
        const d = prev?.data;
        const isOnline = next === "online" ? true : next === "offline" ? false : Boolean(d?.isOnline);
        return {
          success: true,
          data: {
            isOnline,
            currentStatus: next,
            breakStartedAt: d?.breakStartedAt ?? null,
            lastOnlineAt: d?.lastOnlineAt ?? null,
            totalOnlineTimeMinutes: d?.totalOnlineTimeMinutes ?? 0,
            totalBreakTimeMinutes: d?.totalBreakTimeMinutes ?? 0,
            totalBusyTimeMinutes: d?.totalBusyTimeMinutes ?? 0,
            busyStartedAt: d?.busyStartedAt ?? null,
          },
        };
      });
      queryClient.invalidateQueries({ queryKey: ["agentStatus"] });
      void queryClient.invalidateQueries({ queryKey: ["tickets", "agents"] });
      void queryClient.invalidateQueries({ queryKey: queryKeys.tickets.lists() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.tickets.helpdeskDashboard() });
      setIsMenuOpen(false);
      setShowOfflineWarning(false);
    },
  });

  const currentStatus = statusData?.data?.currentStatus || "offline";
  const isOnline = statusData?.data?.isOnline ?? false;

  /** Pulse only on first-ever load with no snapshot (initialData already covers refresh). */
  const statusUnknown = isPending && statusData == null;

  // Position menu below button when opening
  useEffect(() => {
    if (isMenuOpen && buttonRef.current && typeof document !== "undefined") {
      const rect = buttonRef.current.getBoundingClientRect();
      setMenuPosition({
        top: rect.bottom + 4,
        left: rect.right - 160,
      });
    }
  }, [isMenuOpen]);

  const handleMainButtonClick = () => {
    if (statusUnknown || updateStatusMutation.isPending) return;
    if (currentStatus === "offline") {
      setIsMenuOpen(false);
      updateStatusMutation.mutate({ status: "online" });
      return;
    }
    setIsMenuOpen((open) => !open);
  };

  const handleStatusChange = (newStatus: "online" | "offline" | "break" | "busy") => (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (newStatus === "offline") {
      setIsMenuOpen(false);
      setShowOfflineWarning(true);
      return;
    }
    updateStatusMutation.mutate({ status: newStatus });
  };

  const confirmGoOffline = () => {
    const reason =
      offlineReasonPreset === "other"
        ? offlineReasonCustom.trim()
        : OFFLINE_REASON_PRESETS.find((p) => p.value === offlineReasonPreset)?.label ?? "Offline";
    if (!reason) return;
    updateStatusMutation.mutate({ status: "offline", reason });
  };

  const menuContent = (
    <>
      <div
        role="button"
        tabIndex={-1}
        className="fixed inset-0 z-[9998]"
        onClick={() => setIsMenuOpen(false)}
        onMouseDown={(e) => e.preventDefault()}
        aria-hidden
      />
      <div
        className="fixed bg-white border border-gray-300 rounded-md shadow-lg min-w-[160px] z-[9999]"
        style={{ top: menuPosition.top, left: menuPosition.left }}
        role="menu"
      >
        <button
          type="button"
          onClick={handleStatusChange("online")}
          className="w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-gray-100 transition-colors flex items-center gap-2"
          role="menuitem"
        >
          <div className="h-2 w-2 rounded-full bg-green-500 shrink-0" />
          <span>Go Online</span>
        </button>
        <button
          type="button"
          onClick={handleStatusChange("break")}
          className="w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-gray-100 transition-colors flex items-center gap-2"
          role="menuitem"
        >
          <div className="h-2 w-2 rounded-full bg-yellow-500 shrink-0" />
          <span>Take Break</span>
        </button>
        <button
          type="button"
          onClick={handleStatusChange("busy")}
          className="w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-gray-100 transition-colors flex items-center gap-2"
          role="menuitem"
        >
          <div className="h-2 w-2 rounded-full bg-orange-500 shrink-0" />
          <span>Busy</span>
        </button>
        <button
          type="button"
          onClick={handleStatusChange("offline")}
          className="w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-gray-100 transition-colors flex items-center gap-2"
          role="menuitem"
        >
          <div className="h-2 w-2 rounded-full bg-gray-500 shrink-0" />
          <span>Go Offline</span>
        </button>
      </div>
    </>
  );

  const statusLabel =
    currentStatus === "break"
      ? "Break"
      : currentStatus === "busy"
        ? "Busy"
        : isOnline
          ? "Online"
          : "Offline";
  const statusStyles =
    currentStatus === "break"
      ? "bg-amber-500/20 text-amber-800 hover:bg-amber-500/30"
      : currentStatus === "busy"
        ? "bg-orange-500/20 text-orange-800 hover:bg-orange-500/30"
        : isOnline
          ? "bg-green-600/30 text-green-700 hover:bg-green-600/40"
          : "bg-gray-300/50 text-gray-600 hover:bg-gray-300/70";

  const showLiveRadar = !statusUnknown && isOnline && currentStatus === "online";

  return (
    <div className="flex items-center gap-2 relative flex-shrink-0">
      {/* Live radar (queue header — replaces former notification slot when online) */}
      {showLiveRadar ? (
        <span
          className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-emerald-600/90"
          aria-hidden
          title="Live — queue active"
        >
          <span className="absolute inline-flex h-6 w-6 rounded-full bg-emerald-500/18 animate-ping" />
          <span className="absolute inline-flex h-4 w-4 rounded-full bg-emerald-500/12 animate-ping [animation-delay:0.45s]" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-600/85 shadow-sm ring-1 ring-white/90" />
        </span>
      ) : null}
      <div className="relative">
        <button
          ref={buttonRef}
          type="button"
          onClick={handleMainButtonClick}
          disabled={statusUnknown || updateStatusMutation.isPending}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg min-w-[72px] justify-center cursor-pointer select-none transition-all duration-200 ease-out outline-none focus-visible:ring-2 focus-visible:ring-green-500/50 focus-visible:ring-offset-1 hover:brightness-[1.03] active:scale-[0.97] disabled:pointer-events-none disabled:opacity-60 disabled:cursor-not-allowed ${
            statusUnknown ? "bg-gray-200/80 text-gray-500 animate-pulse" : statusStyles
          }`}
          title={
            statusUnknown
              ? "Loading…"
              : updateStatusMutation.isPending
                ? "Updating…"
                : currentStatus === "offline"
                  ? "Go online"
                  : "Change status"
          }
          aria-haspopup={currentStatus === "offline" ? undefined : "menu"}
          aria-expanded={currentStatus === "offline" ? undefined : isMenuOpen}
        >
          {statusUnknown ? (
            <div className="h-3.5 w-3.5 rounded-full bg-gray-400 animate-pulse" />
          ) : (
            <Power
              className={`h-3.5 w-3.5 transition-transform duration-200 ${
                isOnline ? "text-green-700" : currentStatus === "break" ? "text-amber-700" : currentStatus === "busy" ? "text-orange-700" : "text-gray-600"
              }`}
            />
          )}
          <span className="text-xs font-medium">{statusUnknown ? "…" : updateStatusMutation.isPending ? "…" : statusLabel}</span>
        </button>

        {/* Status Menu - rendered in portal so it's always on top and clickable */}
        {isMenuOpen && typeof document !== "undefined" && createPortal(menuContent, document.body)}
      </div>

      {/* Centered warning modal when going offline */}
      {showOfflineWarning && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-black/50">
          <div
            className="bg-white rounded-xl shadow-xl max-w-sm w-full p-6 border border-gray-200"
            role="alertdialog"
            aria-labelledby="offline-modal-title"
            aria-describedby="offline-modal-desc"
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-100">
                <AlertTriangle className="h-5 w-5 text-amber-600" />
              </div>
              <h2 id="offline-modal-title" className="text-lg font-semibold text-gray-900">
                Go offline?
              </h2>
            </div>
            <p id="offline-modal-desc" className="text-sm text-gray-600 mb-3">
              You will stop receiving new ticket assignments and your status will show as offline. Pick a reason for the
              activity log.
            </p>
            <label className="mb-1 block text-xs font-medium text-gray-700" htmlFor="agent-offline-reason-preset">
              Reason
            </label>
            <select
              id="agent-offline-reason-preset"
              value={offlineReasonPreset}
              onChange={(e) => setOfflineReasonPreset(e.target.value)}
              className="mb-3 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
            >
              {OFFLINE_REASON_PRESETS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
            {offlineReasonPreset === "other" ? (
              <>
                <label className="mb-1 block text-xs font-medium text-gray-700" htmlFor="agent-offline-reason-custom">
                  Describe
                </label>
                <input
                  id="agent-offline-reason-custom"
                  type="text"
                  value={offlineReasonCustom}
                  onChange={(e) => setOfflineReasonCustom(e.target.value)}
                  placeholder="Required when Other is selected"
                  className="mb-4 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  maxLength={500}
                />
              </>
            ) : (
              <div className="mb-4" />
            )}
            <div className="flex gap-3 justify-end">
              <button
                type="button"
                onClick={() => setShowOfflineWarning(false)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmGoOffline}
                disabled={
                  updateStatusMutation.isPending ||
                  (offlineReasonPreset === "other" && !offlineReasonCustom.trim())
                }
                className="px-4 py-2 text-sm font-medium text-white bg-gray-600 hover:bg-gray-700 rounded-lg transition-colors disabled:opacity-50"
              >
                {updateStatusMutation.isPending ? "Updating…" : "Go Offline"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
