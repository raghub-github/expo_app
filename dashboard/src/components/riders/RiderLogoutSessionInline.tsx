"use client";

import type { RiderLogoutSessionSnapshot } from "@/lib/rider-logout-types";

type RiderLogoutSessionInlineProps = {
  session: RiderLogoutSessionSnapshot | null | undefined;
  onOpenHistory: () => void;
};

export function RiderLogoutSessionInline({
  session,
  onOpenHistory,
}: RiderLogoutSessionInlineProps) {
  if (!session) {
    return <span className="text-sm font-semibold text-gray-900">—</span>;
  }

  if (session.status === "logged_in") {
    if (session.totalLogoutCount > 0) {
      return (
        <button
          type="button"
          onClick={onOpenHistory}
          className="text-sm font-semibold text-emerald-700 hover:text-emerald-800 underline decoration-emerald-200 underline-offset-2 cursor-pointer"
          title={`View ${session.totalLogoutCount} logout events`}
        >
          Logged in
        </button>
      );
    }
    return (
      <span className="text-sm font-semibold text-emerald-700">Logged in</span>
    );
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
