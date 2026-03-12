import { getConfig } from "@/config/env";
import { authFetch } from "@/services/authFetch";

const getBase = () => getConfig().apiBaseUrl;

export type ScheduleOffPayload = {
  reason: string;
  close_until?: string | null;
  starts_at?: string | null;
  ends_at?: string | null;
  permanent?: boolean;
};

export type ScheduleOffResponse = {
  store_id: number;
  manual_close_until: string | null;
  restriction_type: string | null;
  reason: string;
  permanent?: boolean;
  starts_at?: string;
  ends_at?: string;
};

export async function scheduleStoreOff(
  storeId: number,
  token: string,
  payload: ScheduleOffPayload
): Promise<ScheduleOffResponse> {
  const res = await authFetch(`${getBase()}/v1/merchant-partner/stores/${storeId}/schedule-off`, token, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as any).message || (err as any).error || "Failed to schedule time off");
  }
  return (await res.json()) as ScheduleOffResponse;
}

export async function cancelScheduledOff(
  storeId: number,
  token: string
): Promise<void> {
  const res = await authFetch(`${getBase()}/v1/merchant-partner/stores/${storeId}/schedule-off`, token, {
    method: "DELETE",
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as any).message || (err as any).error || "Failed to cancel scheduled off");
  }
}

