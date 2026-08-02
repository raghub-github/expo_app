/**
 * Ensure the session pin matches backend active-location before quotes / deep links.
 * Safe to call on merchant open, notification entry, or GPS becoming available.
 */

import type { QueryClient } from "@tanstack/react-query";
import { getDeviceLocationReadiness } from "@gatimitra/expo-location-kit";
import { useAuthStore } from "@/store/authStore";
import { useLocationStore } from "@/store/locationStore";
import { applyActiveLocationFromBackend } from "@/lib/applyActiveLocationFromBackend";
import { reconcileActiveLocationFromGps } from "@/lib/reconcileActiveLocationFromGps";
import { runExclusiveActiveLocationReconcile } from "@/lib/activeLocationReconcileGate";

export async function ensureActiveLocationValidated(
  queryClient: QueryClient,
  options?: { allowRemoteSessionPreserve?: boolean }
): Promise<void> {
  if (!useAuthStore.getState().session) return;

  const { coords, locationSource } = useLocationStore.getState();
  if (coords && locationSource) {
    // Already have a session pin — still refresh SoT from backend (multi-device).
    await applyActiveLocationFromBackend(queryClient);
    return;
  }

  await runExclusiveActiveLocationReconcile(async () => {
    const readiness = await getDeviceLocationReadiness();
    if (readiness.isReady) {
      await reconcileActiveLocationFromGps(queryClient, {
        allowRemoteSessionPreserve: options?.allowRemoteSessionPreserve ?? true,
      });
    } else {
      await applyActiveLocationFromBackend(queryClient);
    }
    return "done";
  });
}
