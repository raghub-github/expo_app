import { getConfig } from "@/config/env";
import { authFetch } from "@/services/authFetch";
import { normalizeAlertSoundSlots, resolveAlertSoundUrl } from "@/lib/resolveAlertSoundUrl";

const getBase = () => getConfig().apiBaseUrl.replace(/\/+$/, "");

export type OrderAcceptanceSettings = {
  store_type: string;
  acceptance_window_minutes: number;
  alert_sound_enabled: boolean;
  alert_sound_url: string | null;
  alert_sound_repeat_count: number;
  alert_sound_urls_by_slot: [string | null, string | null, string | null];
  alert_sound_slot_choice: number;
};

export async function fetchOrderAcceptanceSettings(
  storeId: number,
  token: string
): Promise<OrderAcceptanceSettings> {
  const res = await authFetch(
    `${getBase()}/v1/merchant-partner/stores/${storeId}/order-acceptance-settings`,
    token
  );
  const data = (await res.json().catch(() => ({}))) as {
    settings?: OrderAcceptanceSettings;
    error?: string;
  };
  if (!res.ok || !data.settings) {
    throw new Error(data.error || "Failed to load alert settings");
  }
  return normalizeOrderAcceptanceSettings(data.settings);
}

function normalizeOrderAcceptanceSettings(settings: OrderAcceptanceSettings): OrderAcceptanceSettings {
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

export async function patchOrderAcceptanceSoundSlot(
  storeId: number,
  token: string,
  slot: number
): Promise<{ ok: boolean; alert_sound_slot_choice: number }> {
  const res = await authFetch(
    `${getBase()}/v1/merchant-partner/stores/${storeId}/order-acceptance-settings`,
    token,
    {
      method: "PATCH",
      body: JSON.stringify({ platform_food_alert_sound_slot: slot }),
    }
  );
  const data = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    alert_sound_slot_choice?: number;
    error?: string;
  };
  if (!res.ok || data.ok !== true) {
    throw new Error(data.error || "Failed to update notification sound");
  }
  return { ok: true, alert_sound_slot_choice: data.alert_sound_slot_choice ?? slot };
}
