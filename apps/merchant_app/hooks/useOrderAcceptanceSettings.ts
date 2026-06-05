import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/context/AuthContext";
import { useSelectedStore } from "@/context/SelectedStoreContext";
import {
  fetchOrderAcceptanceSettings,
  type OrderAcceptanceSettings,
} from "@/services/orderAcceptanceApi";
import { clampAcceptanceWindowMinutes } from "@/lib/orderAcceptanceWindow";

const DEFAULT_SETTINGS: OrderAcceptanceSettings = {
  store_type: "GENERAL",
  acceptance_window_minutes: 5,
  alert_sound_enabled: true,
  alert_sound_url: null,
  alert_sound_repeat_count: 1,
  alert_sound_urls_by_slot: [null, null, null],
  alert_sound_slot_choice: 0,
};

export function useOrderAcceptanceSettings() {
  const { token } = useAuth();
  const { selectedStore } = useSelectedStore();
  const storeId = selectedStore?.id ?? null;

  const query = useQuery({
    queryKey: ["orderAcceptanceSettings", storeId],
    queryFn: () => fetchOrderAcceptanceSettings(storeId!, token!),
    enabled: Boolean(storeId && token),
    staleTime: 5 * 60 * 1000,
    placeholderData: DEFAULT_SETTINGS,
  });

  const settings = query.data ?? DEFAULT_SETTINGS;
  const acceptanceWindowMinutes = clampAcceptanceWindowMinutes(
    settings.acceptance_window_minutes
  );

  return {
    settings,
    acceptanceWindowMinutes,
    isLoading: query.isLoading,
    refetch: query.refetch,
  };
}
