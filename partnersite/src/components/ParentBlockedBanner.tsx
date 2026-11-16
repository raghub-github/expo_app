"use client";

import { useMerchantSession } from "@/context/MerchantSessionContext";
import { AlertTriangle } from "lucide-react";

/**
 * Owner: show restricted banner when parent cannot register child stores.
 * Manager/Staff: scrolling marquee for staff access notice.
 */
export function ParentBlockedBanner() {
  const merchantSession = useMerchantSession();
  const parent = merchantSession?.parent;
  if (!parent) return null;

  const role = String(parent.accessRole ?? "OWNER").trim().toUpperCase();
  const isStaffLogin = role === "MANAGER" || role === "STAFF";

  if (isStaffLogin) {
    const roleLabel = role === "MANAGER" ? "Manager" : "Staff";
    const text = `You do not have full access of the dashboard as you are logged in as ${roleLabel}.`;
    return (
      <div
        className="shrink-0 overflow-hidden whitespace-nowrap border-b border-sky-200 bg-sky-50 py-2"
        role="status"
        aria-live="polite"
      >
        <div className="flex w-max animate-store-closed-marquee whitespace-nowrap will-change-transform">
          {[0, 1].map((copy) => (
            <span
              key={copy}
              className="shrink-0 px-6 text-xs font-semibold text-sky-950 whitespace-nowrap sm:text-sm"
              aria-hidden={copy === 1}
            >
              {text} · {text} ·{" "}
            </span>
          ))}
        </div>
        <span className="sr-only">{text}</span>
      </div>
    );
  }

  if (parent.can_register_child) return null;

  const message =
    parent.block_message ??
    "Your merchant account has been restricted. You cannot register new stores. Please contact support.";

  return (
    <div className="flex w-full items-center gap-3 border-b border-amber-200 bg-amber-50 px-4 py-3 text-amber-900">
      <AlertTriangle className="h-5 w-5 flex-shrink-0 text-amber-600" aria-hidden />
      <p className="flex-1 text-sm font-medium">{message}</p>
    </div>
  );
}
