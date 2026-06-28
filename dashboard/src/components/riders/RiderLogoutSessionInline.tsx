"use client";

import type { RiderLogoutSessionSnapshot } from "@/lib/rider-logout-types";

type RiderLogoutSessionInlineProps = {
  session: RiderLogoutSessionSnapshot | null | undefined;
  onOpenHistory: () => void;
  onOpenDevices?: () => void;
};

export function RiderLogoutSessionInline({
  session,
  onOpenHistory,
  onOpenDevices,
}: RiderLogoutSessionInlineProps) {
  if (!session) {
    return <span className="text-sm font-semibold text-emerald-700">Logged in</span>;
  }

  const activeDeviceCount = Number(session.activeDeviceCount ?? 0);

  if (session.status === "logged_in") {
    const deviceLabel =
      activeDeviceCount > 1
        ? `Logged in · ${activeDeviceCount} devices`
        : activeDeviceCount === 1
          ? "Logged in · 1 device"
          : "Logged in";

    const content =
      session.totalLogoutCount > 0 ? (
        <button
          type="button"
          onClick={onOpenHistory}
          className="text-sm font-semibold text-emerald-700 hover:text-emerald-800 underline decoration-emerald-200 underline-offset-2 cursor-pointer"
          title={`View ${session.totalLogoutCount} logout events`}
        >
          {deviceLabel}
        </button>
      ) : (
        <span className="text-sm font-semibold text-emerald-700">{deviceLabel}</span>
      );

    if (activeDeviceCount > 0 && onOpenDevices) {
      return (
        <span className="inline-flex flex-wrap items-center gap-2">
          {content}
          <button
            type="button"
            onClick={onOpenDevices}
            className="text-xs font-semibold text-indigo-700 hover:text-indigo-800 underline underline-offset-2"
          >
            Manage devices
          </button>
        </span>
      );
    }

    return content;
  }

  const latest = session.latest;
  if (!latest) {
    return (
      <span className="text-sm font-semibold text-amber-700">Logged out</span>
    );
  }

  return (
    <button
      type="button"
      onClick={onOpenHistory}
      className="text-left text-sm font-semibold text-amber-800 hover:text-amber-900 underline decoration-amber-300 underline-offset-2 cursor-pointer max-w-[220px] truncate"
      title={`${latest.reasonLabel} — view all ${session.totalLogoutCount} logouts`}
    >
      {latest.reasonLabel}
    </button>
  );
}
