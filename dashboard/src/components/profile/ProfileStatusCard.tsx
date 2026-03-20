"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, Copy } from "lucide-react";
import { getUserInitials } from "@/lib/user-avatar";
import { useAuthOptional } from "@/providers/AuthProvider";

type LiveStatus = "online" | "offline" | "break" | "emergency";

interface ProfileStatusData {
  userId: number;
  systemUserId: string;
  fullName: string;
  email?: string | null;
  avatarUrl?: string | null;
  status: LiveStatus;
  loginTime: string | null;
  logoutTime: string | null;
  offlineAt: string | null;
  todayWorkSeconds: number;
  todayOrderCount: number;
}

interface ProfileStatusCardProps {
  open: boolean;
  onClose: () => void;
  onSignOut?: () => void;
}

function formatTime(dateIso: string | null) {
  if (!dateIso) return "-";
  const d = new Date(dateIso);
  return d.toLocaleString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatSeconds(sec: number) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(
    s
  ).padStart(2, "0")}`;
}

function useLiveWorkingTimer(loginTime: string | null, status: LiveStatus) {
  const [now, setNow] = useState<Date>(() => new Date());

  useEffect(() => {
    if (!loginTime || status === "offline") return;
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, [loginTime, status]);

  if (!loginTime || status === "offline") return "00:00:00";

  const base = new Date(loginTime).getTime();
  const diff = Math.max(0, Math.floor((now.getTime() - base) / 1000));
  return formatSeconds(diff);
}

function StatusBadge({ status }: { status: LiveStatus }) {
  const map: Record<LiveStatus, { label: string; color: string }> = {
    online: { label: "Online", color: "bg-green-500" },
    offline: { label: "Offline", color: "bg-gray-400" },
    break: { label: "On Break", color: "bg-yellow-400" },
    emergency: { label: "Emergency", color: "bg-red-500" },
  };

  const { label, color } = map[status];

  return (
    <span className="inline-flex items-center rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700">
      <span className={`mr-2 h-2 w-2 rounded-full ${color}`} />
      {label}
    </span>
  );
}

export function ProfileStatusCard({ open, onClose, onSignOut }: ProfileStatusCardProps) {
  const auth = useAuthOptional();
  const authUserId = auth?.user?.id ?? null;
  const seed = auth?.systemUser ?? null;
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<ProfileStatusData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [localStatus, setLocalStatus] = useState<LiveStatus>("offline");
  const [statusSaving, setStatusSaving] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [showOfflineWarning, setShowOfflineWarning] = useState(false);
  const [avatarError, setAvatarError] = useState(false);
  const [copied, setCopied] = useState(false);

  const displayName = data?.fullName ?? seed?.fullName ?? null;
  const displayEmail = data?.email ?? seed?.email ?? null;
  const displaySystemUserId = data?.systemUserId ?? seed?.systemUserId ?? null;

  const workingTimer = useLiveWorkingTimer(data?.loginTime ?? null, localStatus);

  useEffect(() => {
    if (!open) return;

    const authReady = auth?.authReady ?? false;
    if (!authReady || !authUserId) return;

    const ac = new AbortController();

    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/profile/status", {
          credentials: "include",
          signal: ac.signal,
        });
        const json = (await res.json().catch(() => ({}))) as {
          success?: boolean;
          error?: string;
          data?: ProfileStatusData;
        };

        if (!res.ok || !json.success || !json.data) {
          throw new Error(json.error || `Failed to load profile (${res.status})`);
        }

        const d = json.data;
        setData({
          userId: d.userId,
          systemUserId: String(d.systemUserId ?? ""),
          fullName: d.fullName,
          email: d.email ?? null,
          avatarUrl: d.avatarUrl ?? null,
          status: d.status,
          loginTime: d.loginTime ?? null,
          logoutTime: d.logoutTime ?? null,
          offlineAt: d.offlineAt ?? null,
          todayWorkSeconds: d.todayWorkSeconds ?? 0,
          todayOrderCount: d.todayOrderCount ?? 0,
        });
        setLocalStatus(d.status);
      } catch (e) {
        if (e instanceof Error && e.name === "AbortError") return;
        setError(e instanceof Error ? e.message : "Unknown error");
        setData(null);
      } finally {
        if (!ac.signal.aborted) setLoading(false);
      }
    })();

    return () => ac.abort();
  }, [open, auth?.authReady, authUserId]);

  useEffect(() => {
    if (!open) {
      setShowOfflineWarning(false);
      setStatusOpen(false);
    }
  }, [open]);

  const applyRemoteStatus = async (next: LiveStatus) => {
    const previous = localStatus;
    const prevData = data;
    setLocalStatus(next);
    setStatusOpen(false);
    setStatusSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/profile/status", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      const json = (await res.json().catch(() => ({}))) as { success?: boolean; error?: string };
      if (!res.ok || !json.success) {
        throw new Error(json.error || `Could not update status (${res.status})`);
      }
      const r2 = await fetch("/api/profile/status", { credentials: "include" });
      const j2 = (await r2.json().catch(() => ({}))) as {
        success?: boolean;
        data?: ProfileStatusData;
      };
      if (r2.ok && j2.success && j2.data) {
        const d = j2.data;
        setData({
          userId: d.userId,
          systemUserId: String(d.systemUserId ?? ""),
          fullName: d.fullName,
          email: d.email ?? null,
          avatarUrl: d.avatarUrl ?? null,
          status: d.status,
          loginTime: d.loginTime ?? null,
          logoutTime: d.logoutTime ?? null,
          offlineAt: d.offlineAt ?? null,
          todayWorkSeconds: d.todayWorkSeconds ?? 0,
          todayOrderCount: d.todayOrderCount ?? 0,
        });
        setLocalStatus(d.status);
      }
    } catch (e) {
      setLocalStatus(previous);
      if (prevData) setData(prevData);
      setError(e instanceof Error ? e.message : "Status update failed");
    } finally {
      setStatusSaving(false);
    }
  };

  const requestStatusChange = (next: LiveStatus) => {
    if (next === "offline") {
      setStatusOpen(false);
      setShowOfflineWarning(true);
      return;
    }
    void applyRemoteStatus(next);
  };

  const confirmGoOffline = () => {
    setShowOfflineWarning(false);
    void applyRemoteStatus("offline");
  };

  if (!open) return null;

  const offlineModal =
    showOfflineWarning && typeof document !== "undefined"
      ? createPortal(
          <div
            className="fixed inset-0 z-[10050] flex items-center justify-center bg-black/60 p-4"
            role="alertdialog"
            aria-labelledby="profile-offline-title"
            aria-describedby="profile-offline-desc"
          >
            <div className="w-full max-w-sm rounded-xl border border-slate-600 bg-slate-900 p-5 shadow-2xl">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-500/20">
                  <AlertTriangle className="h-5 w-5 text-amber-400" aria-hidden />
                </div>
                <div className="min-w-0 flex-1">
                  <h2 id="profile-offline-title" className="text-sm font-semibold text-slate-50">
                    Mark offline?
                  </h2>
                  <p id="profile-offline-desc" className="mt-1.5 text-xs leading-relaxed text-slate-400">
                    Your current dashboard session will end: logout and offline times are saved. Use{" "}
                    <span className="font-medium text-slate-200">Online</span> later to start a new session.
                  </p>
                </div>
              </div>
              <div className="mt-5 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowOfflineWarning(false)}
                  className="rounded-lg border border-slate-600 bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={statusSaving}
                  onClick={confirmGoOffline}
                  className="rounded-lg bg-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-900 hover:bg-white disabled:opacity-50"
                >
                  {statusSaving ? "Saving…" : "Go offline"}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )
      : null;

  return (
    <div className="fixed inset-0 z-40 pointer-events-none bg-white/20 backdrop-blur-sm">
      <div className="flex justify-end pr-6 pt-18">
        {/* Card */}
        <div className="relative pointer-events-auto w-full max-w-xs rounded-2xl border border-slate-800/60 bg-slate-900/95 p-4 shadow-xl shadow-black/60 cursor-pointer">
          {/* Pointer linking card to header avatar */}
          <div className="absolute -top-2 right-8 h-3 w-3 rotate-45 border-l border-t border-slate-800/60 bg-slate-900/95" />

          {/* Header: avatar + email + name + id */}
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              {(() => {
                if (!displayName && !displayEmail && !data) {
                  return (
                    <div className="flex h-10 w-10 items-center justify-center rounded-md bg-indigo-500 text-xs font-semibold text-white">
                      U
                    </div>
                  );
                }

                const initials = getUserInitials(displayName, displayEmail);
                const resolvedAvatar = !avatarError ? data?.avatarUrl ?? null : null;

                if (resolvedAvatar) {
                  return (
                    <img
                      src={resolvedAvatar}
                      alt={displayName || displayEmail || "User"}
                      className="h-10 w-10 rounded-md object-cover border border-slate-700 bg-slate-800"
                      onError={() => setAvatarError(true)}
                    />
                  );
                }

                return (
                  <div className="flex h-10 w-10 items-center justify-center rounded-md bg-indigo-500 text-xs font-semibold text-white">
                    {initials}
                  </div>
                );
              })()}
              <div className="min-w-0">
                <h2 className="text-sm font-semibold text-slate-50 truncate max-w-[180px]">
                  Agent: {displayName ?? "—"}
                </h2>
                <div className="mt-0.5 flex items-center gap-2 text-[11px] text-slate-300">
                  <span className="uppercase tracking-wide text-slate-400">
                    ID
                  </span>
                  <span className="rounded-md bg-slate-800 px-1.5 py-0.5 font-mono text-[11px] text-slate-100 truncate max-w-[120px]">
                    {displaySystemUserId ?? "—"}
                  </span>
                  {displaySystemUserId && (
                    <button
                      type="button"
                      onClick={async () => {
                        if (!displaySystemUserId) return;
                        try {
                          await navigator.clipboard?.writeText(displaySystemUserId);
                          setCopied(true);
                          setTimeout(() => setCopied(false), 2000);
                        } catch {
                          // ignore clipboard errors
                        }
                      }}
                      className="inline-flex h-5 items-center justify-center rounded px-1 hover:bg-slate-800 text-slate-400 hover:text-slate-100"
                      aria-label="Copy system_user_id"
                    >
                      {copied ? (
                        <span className="text-[10px] text-emerald-300">Copied</span>
                      ) : (
                        <Copy className="h-3 w-3" />
                      )}
                    </button>
                  )}
                </div>
                <p className="mt-0.5 text-[11px] text-slate-400 truncate max-w-[220px]">
                  {displayEmail ?? "—"}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="rounded-full p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-100"
              aria-label="Close profile card"
            >
              ✕
            </button>
          </div>

        {/* Status row: custom dropdown + badge (50/50) */}
        <div className="mb-2 flex items-center gap-2">
          <div className="relative w-1/2">
            <label className="mb-1 block text-[11px] font-medium text-slate-300">
              Status
            </label>
            <button
              type="button"
              disabled={statusSaving}
              onClick={() => setStatusOpen((o) => !o)}
              className="flex w-full items-center justify-between rounded-md border border-slate-600 bg-slate-800 px-2 py-1.5 text-left text-xs font-medium text-white hover:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400 disabled:opacity-60"
            >
              <span className="truncate">
                {localStatus === "online"
                  ? "Online"
                  : localStatus === "break"
                  ? "Break"
                  : localStatus === "offline"
                  ? "Offline"
                  : "Emergency"}
              </span>
              <span className="ml-2 text-[10px] text-slate-400">▼</span>
            </button>
            {statusOpen && (
              <div className="absolute z-50 mt-1 w-full rounded-md border border-slate-700 bg-slate-900 py-1 text-xs text-white shadow-lg">
                {[
                  { value: "online", label: "Online" },
                  { value: "break", label: "Break" },
                  { value: "offline", label: "Offline" },
                  { value: "emergency", label: "Emergency" },
                ].map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    disabled={statusSaving}
                    onClick={() => requestStatusChange(opt.value as LiveStatus)}
                    className={`flex w-full items-center justify-between px-3 py-1.5 text-left hover:bg-slate-800 ${
                      localStatus === opt.value ? "bg-slate-800" : ""
                    }`}
                  >
                    <span>{opt.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="flex w-1/2 justify-end mt-6">
            <StatusBadge status={localStatus} />
          </div>
        </div>

        {/* Session Info (compact) */}
        <div className="mb-2 rounded-xl border border-slate-700 bg-slate-900/80 p-2">
          <p className="mb-1 text-[11px] font-semibold text-slate-300 uppercase">
            Session Info
          </p>
          <div className="grid grid-cols-2 gap-1.5 text-[11px]">
            <div>
              <p className="text-slate-400">Login Time</p>
              <p className="font-medium text-slate-50">
                {formatTime(data?.loginTime ?? null)}
              </p>
            </div>
            <div>
              <p className="text-slate-400">Logout Time</p>
              <p className="font-medium text-slate-50">
                {formatTime(data?.logoutTime ?? null)}
              </p>
            </div>
            <div className="col-span-2">
              <p className="text-slate-400">Offline at</p>
              <p className="font-medium text-slate-50">
                {formatTime(data?.offlineAt ?? null)}
              </p>
            </div>
            <div className="col-span-2">
              <p className="text-slate-400">Current Working Time</p>
              <p className="font-mono text-xs font-semibold text-slate-50">
                {workingTimer}
              </p>
            </div>
          </div>
        </div>

        {/* Today Stats */}
        <div className="mb-3 rounded-xl border border-slate-700 bg-slate-900/80 p-2.5">
          <p className="mb-2 text-xs font-semibold text-slate-300 uppercase">
            Today Stats
          </p>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <p className="text-slate-400">Total Working Hours</p>
              <p className="font-mono text-xs font-semibold text-slate-50">
                {formatSeconds(data?.todayWorkSeconds ?? 0)}
              </p>
            </div>
            <div>
              <p className="text-slate-400">Order Count (today)</p>
              <p className="text-xs font-semibold text-slate-50">
                {data?.todayOrderCount ?? 0}
              </p>
            </div>
          </div>
        </div>

        {/* Status Controls - compact helper text */}
        <p className="mt-1 text-[10px] text-slate-400">
          Login opens a new online session. After you mark offline, start a new session with Online. Work time for
          that visit is saved on the row (see user_sessions.offline_at).
        </p>

        {/* Sign out inside profile card */}
        {onSignOut && (
          <div className="mt-3 border-t border-slate-700 pt-2">
            <button
              type="button"
              onClick={onSignOut}
              className="w-full inline-flex items-center justify-center rounded-xl bg-red-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-red-500"
            >
              Sign out
            </button>
          </div>
        )}

        {loading && (
          <p className="mt-3 text-xs text-slate-400">
            {seed ? "Syncing session…" : "Loading profile…"}
          </p>
        )}
        {error && (
          <p className="mt-3 text-xs text-red-400">
            Failed to load: {error}
          </p>
        )}
        </div>
      </div>
      {offlineModal}
    </div>
  );
}

