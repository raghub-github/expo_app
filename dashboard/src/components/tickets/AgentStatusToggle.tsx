"use client";

import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Power, Settings } from "lucide-react";
import { useRouter } from "next/navigation";

interface AgentStatus {
  isOnline: boolean;
  currentStatus: "online" | "offline" | "break" | "busy";
  breakStartedAt: string | null;
  lastOnlineAt: string | null;
}

export function AgentStatusToggle() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 });
  const buttonRef = useRef<HTMLButtonElement>(null);
  const router = useRouter();
  const queryClient = useQueryClient();

  // Fetch current status
  const { data: statusData, isLoading } = useQuery<{ success: boolean; data: AgentStatus }>({
    queryKey: ["agentStatus"],
    queryFn: async () => {
      const res = await fetch("/api/agents/status");
      if (!res.ok) throw new Error("Failed to fetch status");
      return res.json();
    },
    refetchInterval: 30000, // Refetch every 30 seconds
  });

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
    },
  });

  const currentStatus = statusData?.data?.currentStatus || "offline";
  const isOnline = statusData?.data?.isOnline || false;

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
    updateStatusMutation.mutate(newStatus);
  };

  const handleSettingsClick = () => {
    router.push("/dashboard/tickets/agent-activity");
    setIsMenuOpen(false);
  };

  if (isLoading) {
    return (
      <div className="flex items-center gap-2">
        <div className="h-5 w-5 rounded-full bg-gray-600 animate-pulse" />
      </div>
    );
  }

  const menuContent = isMenuOpen && typeof document !== "undefined" && (
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

  return (
    <div className="flex items-center gap-2 relative">
      {/* Online/Offline Toggle with Menu */}
      <div className="relative">
        <button
          ref={buttonRef}
          type="button"
          onClick={() => setIsMenuOpen(!isMenuOpen)}
          className={`flex items-center gap-1.5 px-2 py-1 rounded-md transition-all ${
            isOnline
              ? "bg-green-600/30 text-green-700 hover:bg-green-600/40"
              : "bg-gray-300/50 text-gray-600 hover:bg-gray-300/70"
          }`}
          title={isOnline ? "Change status" : "Go online"}
          aria-haspopup="menu"
          aria-expanded={isMenuOpen}
        >
          <Power className={`h-3.5 w-3.5 ${isOnline ? "text-green-700" : "text-gray-600"}`} />
          <span className="text-xs font-medium">
            {currentStatus === "break" ? "Break" : isOnline ? "Online" : "Offline"}
          </span>
        </button>

        {/* Status Menu - rendered in portal so it's always on top and clickable */}
        {isMenuOpen && typeof document !== "undefined" && createPortal(menuContent, document.body)}
      </div>

      {/* Settings Gear Icon */}
      <button
        onClick={handleSettingsClick}
        className="p-1.5 rounded-md text-gray-600 hover:text-gray-900 hover:bg-gray-300/70 transition-colors"
        title="Agent Activity & Settings"
      >
        <Settings className="h-4 w-4" />
      </button>
    </div>
  );
}
