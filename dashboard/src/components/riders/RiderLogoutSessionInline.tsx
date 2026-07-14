"use client";

import type { RiderLogoutSessionSnapshot } from "@/lib/rider-logout-types";

type RiderLogoutSessionInlineProps = {
  session: RiderLogoutSessionSnapshot | null | undefined;
  onOpenHistory: (tab?: "login" | "logout") => void;
};

export function RiderLogoutSessionInline({
  session,
  onOpenHistory,
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
          onClick={() => onOpenHistory("login")}
          className="text-sm font-semibold text-emerald-700 hover:text-emerald-800 underline decoration-emerald-200 underline-offset-2 cursor-pointer"
          title={`View login on ${activeDeviceCount} device(s) and ${session.totalLogoutCount} logout events`}
        >
          {deviceLabel}
        </button>
      ) : (
        <button
          type="button"
          onClick={() => onOpenHistory("login")}
          className="text-sm font-semibold text-emerald-700 hover:text-emerald-800 underline decoration-emerald-200 underline-offset-2 cursor-pointer"
          title={`View login on ${activeDeviceCount} device(s)`}
        >
          {deviceLabel}
        </button>
      );

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
      onClick={() => onOpenHistory("logout")}
      className="text-left text-sm font-semibold text-amber-800 hover:text-amber-900 underline decoration-amber-300 underline-offset-2 cursor-pointer max-w-[220px] truncate"
      title={`${latest.reasonLabel} — view all ${session.totalLogoutCount} logouts`}
    >
      {latest.reasonLabel}
    </button>
  );
}
