import { getRiderAppConfig } from "@/src/config/env";
import { normalizeAlertSoundSlots, resolveAlertSoundUrl } from "@/src/lib/resolveAlertSoundUrl";
import { HttpError } from "@/src/services/http";
import { notifySessionRevoked } from "@/src/services/sessionEvents";
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
  const raw = await res.text().catch(() => "");
  let data: { settings?: RiderOrderAcceptanceSettings; error?: string } = {};
  try {
    data = raw ? (JSON.parse(raw) as typeof data) : {};
  } catch {
    data = {};
  }
  if (res.status === 401) {
    const err = data.error?.trim();
    notifySessionRevoked({
      reason: err === "invalid_token" ? "invalid_token" : "revoked",
    });
    throw new HttpError(data.error || "Session expired. Please sign in again.", 401, raw);
  }
  if (!res.ok || !data.settings) {
    throw new Error(data.error || "Failed to load alert settings");
  }
  return normalizeSettings(data.settings);
}
