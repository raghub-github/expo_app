import { requireDashboardAccess } from "@/lib/permissions/page-protection";
import {
  isNetworkOrTransientError,
  isTimeoutOrAbortError,
} from "@/lib/auth/session-errors";
import FoodOrdersClient from "./FoodOrdersClient";

function rethrowIfNextControlFlow(err: unknown): void {
  if (err == null || typeof err !== "object" || !("digest" in err)) return;
  const digest = String((err as { digest?: unknown }).digest ?? "");
  if (
    digest.startsWith("NEXT_REDIRECT") ||
    digest.startsWith("NEXT_NOT_FOUND") ||
    digest.startsWith("NEXT_HTTP_ERROR_FALLBACK")
  ) {
    throw err;
  }
}

export default async function FoodOrdersPage() {
  try {
    await requireDashboardAccess("ORDER_FOOD");
  } catch (err) {
    rethrowIfNextControlFlow(err);
    if (isTimeoutOrAbortError(err) || isNetworkOrTransientError(err)) {
      // Cookie session is still valid — do not crash the list into the overlay.
    } else {
      throw err;
    }
  }

  return <FoodOrdersClient />;
}
