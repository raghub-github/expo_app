import { getConfig } from "@/config/env";
import { authFetch } from "@/services/authFetch";

const getBase = () => getConfig().apiBaseUrl;

export type RushStatus = {
  store_id: number;
  is_active: boolean;
  duration_minutes: number | null;
  started_at: string | null;
  ends_at: string | null;
  remaining_minutes: number;
  marked_from?: string | null;
};

export async function getRushStatus(
  storeId: number,
  token: string
): Promise<RushStatus> {
  const res = await authFetch(
    `${getBase()}/v1/merchant-partner/stores/${storeId}/rush`,
    token
  );
  if (res.status === 404) {
    // Backend not yet deployed or no rush rows yet: treat as "off" instead of error.
    return {
      store_id: storeId,
      is_active: false,
      duration_minutes: null,
      started_at: null,
      ends_at: null,
      remaining_minutes: 0,
    };
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(
      (err as any).error || res.statusText || "Failed to load rush status"
    );
  }
  return res.json();
}

export async function startRushWindow(
  storeId: number,
  durationMinutes: number,
  token: string
): Promise<RushStatus> {
  const res = await authFetch(
    `${getBase()}/v1/merchant-partner/stores/${storeId}/rush`,
    token,
    {
      method: "POST",
      body: JSON.stringify({ duration_minutes: durationMinutes }),
    }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(
      (err as any).error || res.statusText || "Failed to start rush window"
    );
  }
  return res.json();
}

export async function stopRushWindow(
  storeId: number,
  token: string
): Promise<RushStatus> {
  const res = await authFetch(
    `${getBase()}/v1/merchant-partner/stores/${storeId}/rush`,
    token,
    {
      method: "PATCH",
      body: JSON.stringify({ is_active: false }),
    }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(
      (err as any).error || res.statusText || "Failed to stop rush window"
    );
  }
  return res.json();
}

