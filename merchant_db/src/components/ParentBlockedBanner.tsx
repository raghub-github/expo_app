"use client";

import { useMerchantSession } from "@/context/MerchantSessionContext";
import { AlertTriangle } from "lucide-react";

/**
 * Shows a full-width banner when the logged-in parent is blocked/suspended
 * so they cannot register new child stores. Renders nothing when allowed or not loaded.
 */
export function ParentBlockedBanner() {
  const merchantSession = useMerchantSession();
  const parent = merchantSession?.parent;

  if (!parent || parent.can_register_child) return null;

  const message = parent.block_message ?? "Your merchant account has been restricted. You cannot register new stores. Please contact support.";

  return (
    <div className="w-full bg-amber-50 border-b border-amber-200 px-4 py-3 flex items-center gap-3 text-amber-900">
      <AlertTriangle className="w-5 h-5 flex-shrink-0 text-amber-600" />
      <p className="text-sm font-medium flex-1">{message}</p>
    </div>
  );
}
