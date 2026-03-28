"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { createPortal } from "react-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Power, Settings, AlertTriangle } from "lucide-react";
import { useRouter, usePathname } from "next/navigation";
import {
  AGENT_ACTIVITY_PATH,
  isTicketsAppDetailPath,
  TICKETS_HELPDESK_DASHBOARD_PATH,
} from "@/lib/tickets/ticket-path-utils";

const TICKETS_MAIN_LIST_PATH = "/dashboard/tickets";
import { loadClientSnapshot, saveClientSnapshot } from "@/lib/client-route-snapshot";

interface AgentStatus {
  isOnline: boolean;
  currentStatus: "online" | "offline" | "break" | "busy";
  breakStartedAt: string | null;
  lastOnlineAt: string | null;
}

const AGENT_STATUS_SNAPSHOT_KEY = "dashboard_snapshot:agentStatus";
/** Keep last server shape so a full page refresh does not flash Offline / loading before /api responds */
const AGENT_STATUS_SNAPSHOT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

type AgentStatusResponse = { success: boolean; data: AgentStatus };

export function AgentStatusToggle() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [showOfflineWarning, setShowOfflineWarning] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 });
  const buttonRef = useRef<HTMLButtonElement>(null);
  const router = useRouter();
  const pathname = usePathname();
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
    mutationFn: async (status: "online" | "offline" | "break" | "busy") => {
      const res = await fetch("/api/agents/status", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to update status");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agentStatus"] });
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

  const handleStatusChange = (newStatus: "online" | "offline" | "break" | "busy") => (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (newStatus === "offline") {
      setIsMenuOpen(false);
      setShowOfflineWarning(true);
      return;
    }
    updateStatusMutation.mutate(newStatus);
  };

  const confirmGoOffline = () => {
    updateStatusMutation.mutate("offline");
  };

  const cleanPathname = pathname.split("?")[0].split("#")[0] ?? "";

  const handleSettingsClick = () => {
    setIsMenuOpen(false);
    const onHelpdeskDashboard = cleanPathname === TICKETS_HELPDESK_DASHBOARD_PATH;
    const onAgentActivity = cleanPathname === AGENT_ACTIVITY_PATH;
    if (onHelpdeskDashboard || onAgentActivity) {
      router.push(TICKETS_MAIN_LIST_PATH);
      return;
    }
    router.push(TICKETS_HELPDESK_DASHBOARD_PATH);
  };

  const hideSettingsGearOnTicketDetail = isTicketsAppDetailPath(cleanPathname);
  const onTicketsHubPage =
    cleanPathname === TICKETS_HELPDESK_DASHBOARD_PATH || cleanPathname === AGENT_ACTIVITY_PATH;

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
  const statusStyles = isOnline
    ? "bg-green-600/30 text-green-700 hover:bg-green-600/40"
    : currentStatus === "break"
      ? "bg-amber-500/20 text-amber-800 hover:bg-amber-500/30"
      : currentStatus === "busy"
        ? "bg-orange-500/20 text-orange-800 hover:bg-orange-500/30"
        : "bg-gray-300/50 text-gray-600 hover:bg-gray-300/70";

  return (
    <div className="flex items-center gap-2 relative flex-shrink-0">
      {/* Online / Offline / Break / Busy toggle - always visible, same size when loading */}
      <div className="relative">
        <button
          ref={buttonRef}
          type="button"
          onClick={() => !statusUnknown && setIsMenuOpen(!isMenuOpen)}
          disabled={statusUnknown}
          className={`flex items-center gap-1.5 px-2 py-1 rounded-md transition-all min-w-[72px] justify-center ${
            statusUnknown ? "bg-gray-200/80 text-gray-500 animate-pulse" : statusStyles
          }`}
          title={statusUnknown ? "Loading…" : isOnline ? "Change status" : "Go online"}
          aria-haspopup="menu"
          aria-expanded={isMenuOpen}
        >
          {statusUnknown ? (
            <div className="h-3.5 w-3.5 rounded-full bg-gray-400 animate-pulse" />
          ) : (
            <Power
              className={`h-3.5 w-3.5 ${
                isOnline ? "text-green-700" : currentStatus === "break" ? "text-amber-700" : currentStatus === "busy" ? "text-orange-700" : "text-gray-600"
              }`}
            />
          )}
          <span className="text-xs font-medium">{statusUnknown ? "…" : statusLabel}</span>
        </button>

        {/* Status Menu - rendered in portal so it's always on top and clickable */}
        {isMenuOpen && typeof document !== "undefined" && createPortal(menuContent, document.body)}
      </div>

      {!hideSettingsGearOnTicketDetail && (
        <button
          type="button"
          onClick={handleSettingsClick}
          aria-pressed={onTicketsHubPage}
          className={`inline-flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-md border-2 border-transparent transition-[background-color,color] duration-200 ease-out motion-reduce:transition-none ${
            onTicketsHubPage
              ? "bg-blue-600 text-white hover:bg-blue-700"
              : "bg-transparent text-gray-600 hover:bg-gray-200/90 hover:text-gray-900"
          }`}
          title={onTicketsHubPage ? "Back to ticket list" : "Open helpdesk dashboard"}
          aria-label={onTicketsHubPage ? "Back to ticket list" : "Open helpdesk dashboard"}
        >
          <Settings className="h-4 w-4 shrink-0" aria-hidden />
        </button>
      )}

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
            <p id="offline-modal-desc" className="text-sm text-gray-600 mb-6">
              You will stop receiving new ticket assignments and your status will show as offline. You can go back online anytime.
            </p>
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
                disabled={updateStatusMutation.isPending}
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
