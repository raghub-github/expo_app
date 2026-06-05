import { useCallback, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useSessionStore } from "@/src/stores/sessionStore";
import { getRiderAppConfig } from "@/src/config/env";
import { putJson } from "@/src/services/http";
import { captureRiderLocationWithPermission } from "@/src/services/location/captureRiderLocation";
import { useRiderStatus } from "@/src/hooks/useOnboarding";

const API_BASE = () => getRiderAppConfig().apiBaseUrl;

export function useRiderHomeLocation(riderId: string | undefined) {
  const session = useSessionStore((s) => s.session);
  const queryClient = useQueryClient();
  const { data: riderStatus, isLoading: statusLoading } = useRiderStatus(riderId);
  const [localError, setLocalError] = useState<string | null>(null);

  const needsHomeLocation =
    !!riderId &&
    !statusLoading &&
    riderStatus != null &&
    riderStatus.hasHomeLocation !== true;

  // Treat missing flag from older API responses as "needs location" only when lat/lon absent in payload.
  const needsLocationSave =
    needsHomeLocation ||
    (!!riderId &&
      !statusLoading &&
      riderStatus != null &&
      riderStatus.hasHomeLocation == null &&
      !riderStatus.homeAddress?.lat);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!session?.accessToken) {
        throw new Error("Not authenticated");
      }

      const captured = await captureRiderLocationWithPermission();
      if (!captured.ok) {
        throw new Error(captured.message);
      }

      const { data } = captured;
      return putJson<{ success: boolean }>(
        `${API_BASE()}/v1/rider/home-location`,
        {
          lat: data.lat,
          lon: data.lon,
          city: data.city,
          state: data.state,
          pincode: data.pincode || undefined,
          address: data.address,
        },
        { headers: { authorization: `Bearer ${session.accessToken}` } }
      );
    },
    onSuccess: async () => {
      setLocalError(null);
      await queryClient.invalidateQueries({ queryKey: ["rider", riderId] });
    },
    onError: (err) => {
      setLocalError(err instanceof Error ? err.message : "Failed to save location");
    },
  });

  const requestAndSave = useCallback(async () => {
    setLocalError(null);
    await saveMutation.mutateAsync();
  }, [saveMutation]);

  return {
    needsHomeLocation: needsLocationSave,
    statusLoading,
    saving: saveMutation.isPending,
    error: localError,
    savedAddress: riderStatus?.homeAddress ?? null,
    requestAndSave,
  };
}
