"use client";

import { useEffect } from "react";
import {
  isUnauthenticatedErrorMessage,
  redirectIfUnauthenticatedError,
} from "@/lib/auth/redirect-to-login";

/**
 * Dashboard inline error surface. Auth/session failures never render —
 * they logout and send the user to /login instead.
 */
export function DashboardErrorBanner({
  error,
  className = "bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg",
}: {
  error: string | null | undefined;
  className?: string;
}) {
  const auth = isUnauthenticatedErrorMessage(error);

  useEffect(() => {
    if (auth) redirectIfUnauthenticatedError(error);
  }, [auth, error]);

  if (!error || auth) return null;

  return <div className={className}>{error}</div>;
}
