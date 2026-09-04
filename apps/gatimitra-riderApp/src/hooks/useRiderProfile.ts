import { useQuery } from "@tanstack/react-query";
import type { RiderProfile } from "@gatimitra/contracts";
import { useSessionStore } from "@/src/stores/sessionStore";
import { getRiderAppConfig } from "@/src/config/env";
import { getJson } from "@/src/services/http";

const API_BASE = () => getRiderAppConfig().apiBaseUrl;

export function useRiderProfile() {
  const session = useSessionStore((s) => s.session);

  return useQuery({
    queryKey: ["rider", "me", session?.userId],
    queryFn: async (): Promise<RiderProfile> => {
      if (!session?.accessToken) {
        throw new Error("Not authenticated");
      }
      const data = await getJson<RiderProfile>(`${API_BASE()}/v1/rider/me`, {
        headers: { authorization: `Bearer ${session.accessToken}` },
      });
      return {
        ...data,
        mobile: data.mobile?.trim() || "",
        referralCode: data.referralCode?.trim() || null,
      };
    },
    enabled: !!session?.accessToken,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    refetchOnMount: true,
  });
}
