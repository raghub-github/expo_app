import { useQuery } from "@tanstack/react-query";
import {
  fetchRiderOrderAcceptanceSettings,
  type RiderOrderAcceptanceSettings,
} from "@/src/services/orderAcceptanceApi";
import { useSessionStore } from "@/src/stores/sessionStore";

const DEFAULTS: RiderOrderAcceptanceSettings = {
  store_type: "RIDER",
  acceptance_window_minutes: 7,
  alert_sound_enabled: true,
  alert_sound_url: null,
  alert_sound_repeat_count: 1,
  alert_sound_urls_by_slot: [null, null, null],
  alert_sound_slot_choice: 0,
};

export function useRiderOrderAcceptanceSettings() {
  const hasSession = useSessionStore((s) => !!s.session?.accessToken);

  return useQuery({
    queryKey: ["rider", "orderAcceptanceSettings"],
    queryFn: fetchRiderOrderAcceptanceSettings,
    enabled: hasSession,
    staleTime: 5 * 60_000,
    retry: 1,
    placeholderData: DEFAULTS,
  });
}
