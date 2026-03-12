import { getConfig } from "@/config/env";
import { authFetch } from "@/services/authFetch";

export type UserDeviceSession = {
  id: number;
  user_id: string;
  parent_store_id: number | null;
  child_store_id: number | null;
  device_type: string | null;
  device_name: string | null;
  os: string | null;
  ip_address: string | null;
  location: string | null;
  login_method: string | null;
  login_time: string;
  last_active: string;
  is_active: boolean;
  device_id: string | null;
};

const { apiBaseUrl } = getConfig();

export async function getUserSessions(token: string): Promise<UserDeviceSession[]> {
  const res = await authFetch(`${apiBaseUrl}/v1/merchant-partner/user-sessions`, token);
  if (!res.ok) {
    throw new Error("Failed to load device sessions");
  }
  const data = (await res.json()) as UserDeviceSession[];
  return Array.isArray(data) ? data : [];
}

export async function logoutUserSessions(token: string, sessionIds: number[]): Promise<void> {
  if (!sessionIds.length) return;
  const res = await authFetch(
    `${apiBaseUrl}/v1/merchant-partner/user-sessions/logout`,
    token,
    {
      method: "POST",
      body: JSON.stringify({ session_ids: sessionIds }),
    }
  );
  if (!res.ok) {
    throw new Error("Failed to logout selected devices");
  }
}

export async function logoutAllUserSessions(token: string, includeCurrent = false): Promise<void> {
  const res = await authFetch(
    `${apiBaseUrl}/v1/merchant-partner/user-sessions/logout-all`,
    token,
    {
      method: "POST",
      body: JSON.stringify({ includeCurrent }),
    }
  );
  if (!res.ok) {
    throw new Error("Failed to logout all devices");
  }
}

