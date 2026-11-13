import { getConfig } from "@/config/env";
import { authFetch } from "@/services/authFetch";

const getBase = () => getConfig().apiBaseUrl;

export type StaffMember = {
  id: number;
  store_id: number;
  name: string;
  phone_number: string;
  role: string;
  status: boolean;
  created_at: string;
  updated_at: string;
};

export type StoreSession = {
  id: number;
  store_id: number;
  staff_id: number | null;
  device_type: string | null;
  device_name: string | null;
  ip_address: string | null;
  location: string | null;
  login_time: string;
  last_active: string;
  is_active: boolean;
};

export async function getStaff(storeId: number, token: string): Promise<StaffMember[]> {
  const res = await authFetch(`${getBase()}/v1/merchant-partner/stores/${storeId}/staff`, token);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as any).error || res.statusText || "Failed to load staff");
  }
  return res.json();
}

export async function createStaff(
  storeId: number,
  body: { name: string; phone_number: string; role: string },
  token: string
): Promise<StaffMember> {
  const res = await authFetch(`${getBase()}/v1/merchant-partner/stores/${storeId}/staff`, token, {
    method: "POST",
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as any).error || res.statusText || "Failed to add staff");
  }
  return res.json();
}

export async function updateStaff(
  storeId: number,
  staffId: number,
  body: Partial<{ name: string; phone_number: string; role: string; status: boolean }>,
  token: string
): Promise<StaffMember> {
  const res = await authFetch(`${getBase()}/v1/merchant-partner/stores/${storeId}/staff/${staffId}`, token, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as any).error || res.statusText || "Failed to update staff");
  }
  return res.json();
}

export async function deleteStaff(storeId: number, staffId: number, token: string): Promise<void> {
  const res = await authFetch(`${getBase()}/v1/merchant-partner/stores/${storeId}/staff/${staffId}`, token, {
    method: "DELETE",
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as any).error || res.statusText || "Failed to remove staff");
  }
}

export type MerchantActionOtpPurpose =
  | "invite"
  | "remove_staff"
  | "logout_device"
  | "logout_all"
  | "self_revoke";

export async function sendMerchantActionOtp(
  token: string,
  purpose: MerchantActionOtpPurpose
): Promise<{
  requestId: string;
  sentSms: boolean;
  sentEmail: boolean;
  maskedPhone: string;
  maskedEmail: string | null;
  /** Present only in non-production when SMS gateway false-succeeds. */
  devOtp?: string;
}> {
  const res = await authFetch(`${getBase()}/v1/merchant-partner/action-otp/send`, token, {
    method: "POST",
    body: JSON.stringify({ purpose }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as any).message || (err as any).error || "Could not send OTP");
  }
  return res.json();
}

export async function verifyMerchantActionOtp(
  token: string,
  payload: { requestId: string; otp: string; purpose?: MerchantActionOtpPurpose }
): Promise<void> {
  const res = await authFetch(`${getBase()}/v1/merchant-partner/action-otp/verify`, token, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as any).message || (err as any).error || "Invalid OTP");
  }
}

/** Invited staff/manager permanently removes their own store_staff row after OTP. */
export async function selfRevokeStaffAccess(
  token: string,
  payload: { requestId: string; otp: string }
): Promise<void> {
  const res = await authFetch(`${getBase()}/v1/merchant-partner/me/self-revoke`, token, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as any).message || (err as any).error || "Could not revoke access");
  }
}

export async function updateOwnerContact(
  token: string,
  body: { owner_name?: string; owner_email?: string; registered_phone?: string }
): Promise<{
  parent: {
    id: number;
    parent_merchant_id: string;
    parent_name?: string;
    owner_name?: string;
    owner_email?: string;
    brand_name?: string;
    registered_phone?: string;
    store_logo?: string | null;
  };
}> {
  const res = await authFetch(`${getBase()}/v1/merchant-partner/me/owner-contact`, token, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as any).message || (err as any).error || res.statusText || "Failed to update owner");
  }
  return res.json();
}

export async function getStoreSessions(storeId: number, token: string): Promise<StoreSession[]> {
  const res = await authFetch(`${getBase()}/v1/merchant-partner/stores/${storeId}/sessions`, token);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as any).error || res.statusText || "Failed to load sessions");
  }
  return res.json();
}

export async function logoutSession(storeId: number, sessionId: number, token: string): Promise<void> {
  const res = await authFetch(
    `${getBase()}/v1/merchant-partner/stores/${storeId}/sessions/${sessionId}/logout`,
    token,
    { method: "POST" }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as any).error || res.statusText || "Failed to logout device");
  }
}

export async function logoutAllSessions(storeId: number, token: string): Promise<void> {
  const res = await authFetch(`${getBase()}/v1/merchant-partner/stores/${storeId}/sessions/logout-all`, token, {
    method: "POST",
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as any).error || res.statusText || "Failed to logout all devices");
  }
}

