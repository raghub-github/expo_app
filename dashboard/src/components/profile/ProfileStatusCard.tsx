"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, Copy } from "lucide-react";
import {
  ticketsNumFont as profileNumFont,
  ticketsTextFont as profileTextFont,
} from "@/lib/fonts/tickets-fonts";
import { getUserInitials } from "@/lib/user-avatar";
import { useAuthOptional } from "@/providers/AuthProvider";

type LiveStatus = "online" | "offline" | "break" | "emergency";

interface ProfileStatusData {
  userId: number;
  systemUserId: string;
  fullName: string;
  email?: string | null;
  primaryRole?: string | null;
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

function formatRole(role: string | null | undefined) {
  if (!role) return "User";
  return role
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
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
          primaryRole: d.primaryRole ?? null,
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
          primaryRole: d.primaryRole ?? null,
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
            className={`${profileTextFont.className} fixed inset-0 z-[10050] flex items-center justify-center bg-black/60 p-4`}
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
    <div className="pointer-events-none fixed inset-0 z-40 bg-slate-900/15 backdrop-blur-[2px]">
      <div className="flex justify-end px-4 pt-[4.5rem] sm:pr-6">
        <div className={`${profileTextFont.className} pointer-events-auto relative w-full max-w-[430px] overflow-visible rounded-xl border border-slate-200 bg-white shadow-[0_18px_50px_rgba(15,23,42,0.22)]`}>
          <div className="absolute -top-2 right-8 h-4 w-4 rotate-45 border-l border-t border-slate-200 bg-white" />

          <div className="relative flex items-start gap-4 px-5 py-5 sm:px-6">
            {(() => {
              const initials = getUserInitials(displayName, displayEmail);
              const resolvedAvatar = !avatarError ? data?.avatarUrl ?? null : null;

              if (resolvedAvatar) {
                return (
                  <img
                    src={resolvedAvatar}
                    alt={displayName || displayEmail || "User"}
                    className="h-16 w-16 shrink-0 rounded-full border-[3px] border-white object-cover shadow-md"
                    onError={() => setAvatarError(true)}
                  />
                );
              }

              return (
                <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 text-lg font-semibold text-white shadow-md">
                  {displayName || displayEmail || data ? initials : "U"}
                </div>
              );
            })()}

            <div className="min-w-0 flex-1 pt-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="truncate text-lg font-medium text-slate-800">
                  {displayName ?? "—"}
                </h2>
                <span className="rounded border border-indigo-200 bg-indigo-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-indigo-600">
                  {formatRole(data?.primaryRole)}
                </span>
              </div>
              <p className="mt-1 truncate text-sm text-slate-500">{displayEmail ?? "—"}</p>
              <div className="mt-2 flex min-w-0 items-center gap-2 text-xs text-slate-500">
                <span className="font-medium text-slate-400">ID</span>
                <span className={`${profileNumFont.className} truncate text-slate-700`}>
                  {displaySystemUserId ?? "—"}
                </span>
                {displaySystemUserId && (
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        await navigator.clipboard?.writeText(displaySystemUserId);
                        setCopied(true);
                        setTimeout(() => setCopied(false), 2000);
                      } catch {
                        // Ignore clipboard errors.
                      }
                    }}
                    className="rounded p-1 text-slate-400 transition hover:bg-slate-100 hover:text-indigo-600"
                    aria-label="Copy system user ID"
                  >
                    {copied ? <span className="text-[10px] text-emerald-600">Copied</span> : <Copy className="h-3.5 w-3.5" />}
                  </button>
                )}
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="rounded-full p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
              aria-label="Close profile card"
            >
              ✕
            </button>
          </div>

          <div className="border-t border-slate-200">
            <div className="grid grid-cols-2 divide-x divide-slate-200 border-b border-slate-200 sm:grid-cols-4">
              {[
                { label: "Login time", value: formatTime(data?.loginTime ?? null) },
                { label: "Logout time", value: formatTime(data?.logoutTime ?? null) },
                { label: "Offline at", value: formatTime(data?.offlineAt ?? null) },
                { label: "Login duration", value: workingTimer },
              ].map((item) => (
                <div key={item.label} className="min-w-0 px-3 py-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                    {item.label}
                  </p>
                  <p className={`${profileNumFont.className} mt-1 break-words text-xs font-medium text-slate-700`}>
                    {item.value}
                  </p>
                </div>
              ))}
            </div>

            <div className="grid gap-5 px-5 py-4 sm:grid-cols-2 sm:px-6">
              <div>
                <p className={`${profileNumFont.className} text-xl font-light text-slate-800`}>
                  {formatSeconds(data?.todayWorkSeconds ?? 0)}
                </p>
                <p className="mt-1 text-xs text-slate-500">Total login time today</p>
                <div className="mt-3 h-1 overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full w-2/3 rounded-full bg-blue-500" />
                </div>
              </div>
              <div>
                <p className={`${profileNumFont.className} text-xl font-light text-slate-800`}>
                  {data?.todayOrderCount ?? 0}
                </p>
                <p className="mt-1 text-xs text-slate-500">Orders completed today</p>
                <div className="mt-3 h-1 overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full w-1/2 rounded-full bg-emerald-500" />
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-3 border-t border-slate-200 bg-slate-50 px-5 py-3 sm:flex-row sm:items-end sm:justify-between sm:px-6">
            <div className="relative w-full sm:max-w-[230px]">
              <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                Availability status
              </label>
              <button
                type="button"
                disabled={statusSaving}
                onClick={() => setStatusOpen((value) => !value)}
                className="flex w-full items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2 text-left text-xs font-medium text-slate-700 shadow-sm transition hover:border-indigo-300 disabled:opacity-60"
              >
                <StatusBadge status={localStatus} />
                <span className="text-[10px] text-slate-400">▼</span>
              </button>
              {statusOpen && (
                <div className="absolute bottom-full z-50 mb-1 w-full overflow-hidden rounded-lg border border-slate-200 bg-white py-1 text-xs text-slate-700 shadow-xl">
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
                      className={`flex w-full px-3 py-2 text-left transition hover:bg-slate-50 ${
                        localStatus === opt.value ? "bg-indigo-50 text-indigo-700" : ""
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {onSignOut && (
              <button
                type="button"
                onClick={onSignOut}
                className="inline-flex w-full items-center justify-center rounded-lg border border-red-600 bg-red-600 px-5 py-2 text-xs font-semibold text-white shadow-sm transition hover:border-red-700 hover:bg-red-700 sm:w-auto"
              >
                Log out
              </button>
            )}
          </div>

          {(loading || error) && (
            <div className="border-t border-slate-200 px-6 py-2.5 text-xs sm:px-8">
              {loading && (
                <p className="text-slate-400">{seed ? "Syncing session…" : "Loading profile…"}</p>
              )}
              {error && <p className="text-red-500">Failed to load: {error}</p>}
            </div>
          )}
        </div>
      </div>
      {offlineModal}
    </div>
  );
}

