import { getRiderAppConfig } from "@/src/config/env";
import { normalizeAlertSoundSlots, resolveAlertSoundUrl } from "@/src/lib/resolveAlertSoundUrl";
import { useSessionStore } from "@/src/stores/sessionStore";

export type RiderOrderAcceptanceSettings = {
  store_type: string;
  acceptance_window_minutes: number;
  alert_sound_enabled: boolean;
  alert_sound_url: string | null;
  alert_sound_repeat_count: number;
  alert_sound_urls_by_slot: [string | null, string | null, string | null];
  alert_sound_slot_choice: number;
};

function normalizeSettings(settings: RiderOrderAcceptanceSettings): RiderOrderAcceptanceSettings {
  const slots = normalizeAlertSoundSlots(
    settings.alert_sound_urls_by_slot ?? [settings.alert_sound_url, null, null]
  );
  const choice = Math.max(0, Math.min(2, Math.floor(settings.alert_sound_slot_choice ?? 0)));
  const effective = slots[choice] ?? slots.find((u) => u) ?? resolveAlertSoundUrl(settings.alert_sound_url);
  return {
    ...settings,
    alert_sound_urls_by_slot: slots,
    alert_sound_url: effective,
  };
}

export async function fetchRiderOrderAcceptanceSettings(): Promise<RiderOrderAcceptanceSettings> {
  const token = useSessionStore.getState().session?.accessToken;
  if (!token) throw new Error("Not signed in");

  const base = getRiderAppConfig().apiBaseUrl.replace(/\/+$/, "");
  const res = await fetch(`${base}/v1/rider/order-acceptance-settings`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = (await res.json().catch(() => ({}))) as {
    settings?: RiderOrderAcceptanceSettings;
    error?: string;
  };
  if (!res.ok || !data.settings) {
    throw new Error(data.error || "Failed to load alert settings");
  }
  return normalizeSettings(data.settings);
}
