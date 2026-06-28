"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { MonitorSmartphone, X, LogOut, RefreshCw } from "lucide-react";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";

export type RiderDeviceSessionItem = {
  id: number;
  deviceId: string | null;
  deviceType: string | null;
  deviceName: string | null;
  deviceModel: string | null;
  os: string | null;
  osVersion: string | null;
  appVersion: string | null;
  ipAddress: string | null;
  location: string | null;
  loginState: string | null;
  loginDistrict: string | null;
  loginTown: string | null;
  loginVillage: string | null;
  loginTime: string;
  lastActive: string;
  isActive: boolean;
};

type RiderDeviceSessionsSideSheetProps = {
  riderId: number;
  riderName?: string | null;
  open: boolean;
  onClose: () => void;
  onRevoked?: () => void;
};

function formatWhen(iso: string): string {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return iso;
  return new Date(t).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function deviceLabel(session: RiderDeviceSessionItem): string {
  const model = session.deviceModel?.trim();
  const os = [session.os, session.osVersion].filter(Boolean).join(" ");
  if (model && os) return `${model} · ${os}`;
  return model || os || session.deviceName || session.deviceId || "Unknown device";
}

function geoLines(session: RiderDeviceSessionItem): string[] {
  const lines: string[] = [];
  if (session.loginVillage) lines.push(`Village: ${session.loginVillage}`);
  if (session.loginTown) lines.push(`Town: ${session.loginTown}`);
  if (session.loginDistrict) lines.push(`District: ${session.loginDistrict}`);
  if (session.loginState) lines.push(`State: ${session.loginState}`);
  if (lines.length === 0 && session.location) lines.push(session.location);
  return lines;
}

export function RiderDeviceSessionsSideSheet({
  riderId,
  riderName,
  open,
  onClose,
  onRevoked,
}: RiderDeviceSessionsSideSheetProps) {
  const [sessions, setSessions] = useState<RiderDeviceSessionItem[]>([]);
  const [activeCount, setActiveCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [revoking, setRevoking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadSessions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/riders/${riderId}/device-sessions`, { credentials: "include" });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || "Failed to load device sessions");
      }
      setSessions(json.data?.sessions ?? []);
      setActiveCount(json.data?.activeCount ?? 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
      setSessions([]);
      setActiveCount(0);
    } finally {
      setLoading(false);
    }
  }, [riderId]);

  useEffect(() => {
    if (!open) return;
    void loadSessions();
  }, [open, loadSessions]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const revoke = async (opts: { revokeAll?: boolean; sessionIds?: number[] }) => {
    setRevoking(true);
    setError(null);
    try {
      const res = await fetch(`/api/riders/${riderId}/device-sessions/revoke`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          revokeAll: opts.revokeAll === true,
          sessionIds: opts.sessionIds,
          reason: opts.revokeAll ? "admin_logout_all" : "admin_logout_device",
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || "Could not revoke sessions");
      }
      await loadSessions();
      onRevoked?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Revoke failed");
    } finally {
      setRevoking(false);
    }
  };

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[10000] flex justify-end bg-slate-900/50 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-label="Device sessions"
      onClick={onClose}
    >
      <div
        className="flex h-full w-full max-w-lg flex-col border-l border-gray-200 bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-3 border-b border-gray-200 px-5 py-4">
          <div className="flex items-start gap-3 min-w-0">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-700">
              <MonitorSmartphone className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-lg font-bold text-gray-900">Logged-in devices</h2>
              <p className="text-sm text-gray-500 truncate">
                {riderName?.trim() || `Rider #${riderId}`} · {activeCount} active
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => void loadSessions()}
              disabled={loading || revoking}
              className="rounded-lg p-2 text-gray-500 hover:bg-gray-100"
              aria-label="Refresh"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-2 text-gray-500 hover:bg-gray-100"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </header>

        <div className="border-b border-gray-100 px-5 py-3 flex gap-2">
          <button
            type="button"
            disabled={revoking || activeCount === 0}
            onClick={() => {
              if (!window.confirm("Log out this rider from ALL devices?")) return;
              void revoke({ revokeAll: true });
            }}
            className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50"
          >
            <LogOut className="h-3.5 w-3.5" />
            Logout all devices
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {loading ? (
            <div className="flex justify-center py-16">
              <LoadingSpinner text="Loading devices..." />
            </div>
          ) : error ? (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
          ) : sessions.length === 0 ? (
            <p className="text-sm text-gray-500 py-8 text-center">No active device sessions.</p>
          ) : (
            <ul className="space-y-3">
              {sessions.map((session) => (
                <li
                  key={session.id}
                  className="rounded-xl border border-gray-200 bg-gray-50/80 p-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-900 truncate">
                        {deviceLabel(session)}
                      </p>
                      {session.appVersion ? (
                        <p className="text-xs text-gray-500 mt-0.5">App v{session.appVersion}</p>
                      ) : null}
                      {session.ipAddress ? (
                        <p className="text-xs text-gray-600 mt-1">IP: {session.ipAddress}</p>
                      ) : null}
                      {geoLines(session).map((line) => (
                        <p key={line} className="text-xs text-gray-600 mt-0.5">
                          {line}
                        </p>
                      ))}
                      <p className="text-[11px] text-gray-400 mt-1.5">
                        Login: {formatWhen(session.loginTime)} · Last active:{" "}
                        {formatWhen(session.lastActive)}
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={revoking}
                      onClick={() => {
                        if (!window.confirm("Log out this device?")) return;
                        void revoke({ sessionIds: [session.id] });
                      }}
                      className="shrink-0 rounded-md border border-red-200 bg-white px-2 py-1 text-[11px] font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
                    >
                      Logout
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
