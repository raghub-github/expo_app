import { createClient } from "@/lib/supabase/client";
import { getOrCreateDeviceId } from "@/lib/auth/device-id-client";

function idsMatch(
  requested: number | string | null | undefined,
  boundId: number | string | null | undefined,
  boundPublicId: string | null | undefined
): boolean {
  if (requested == null || String(requested).trim() === "") return true;
  const want = String(requested).trim();
  if (boundId != null && String(boundId) === want) return true;
  if (boundPublicId && String(boundPublicId).trim() === want) return true;
  return false;
}

/**
 * Mirror login: write httpOnly Supabase + device cookies so resolve-session
 * can authenticate after a hard navigation (register currently skipped this).
 */
export async function persistPartnerSession(opts?: {
  parentId?: number | string | null;
  loginMethod?: string;
  accessToken?: string | null;
  refreshToken?: string | null;
}): Promise<boolean> {
  const supabase = createClient();
  const {
    data: { session: live },
  } = await supabase.auth.getSession();
  let access = String(live?.access_token || "").trim();
  let refresh = String(live?.refresh_token || "").trim();
  if (!access || !refresh) {
    access = String(opts?.accessToken || "").trim();
    refresh = String(opts?.refreshToken || "").trim();
  }
  if (!access || !refresh) return false;

  const device_id = getOrCreateDeviceId();
  const body: Record<string, unknown> = {
    access_token: access,
    refresh_token: refresh,
    device_id,
    login_method: opts?.loginMethod?.trim() || "register",
  };
  const parentId = opts?.parentId;
  if (parentId != null && String(parentId).trim()) {
    body.parent_id = parentId;
  }

  const doSetCookie = () =>
    fetch("/api/merchant-auth/set-cookie", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

  let res = await doSetCookie();
  if (!res.ok && (res.status === 502 || res.status === 503)) {
    res = await doSetCookie();
  }
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    console.warn("[persistPartnerSession] set-cookie failed", res.status, errBody);
    return false;
  }
  const okBody = (await res.json().catch(() => ({}))) as {
    parentId?: number;
    parentMerchantId?: string | null;
  };
  if (!idsMatch(parentId, okBody.parentId, okBody.parentMerchantId ?? undefined)) {
    console.warn("[persistPartnerSession] refused to bind a different parent", {
      requested: parentId,
      bound: okBody.parentId,
    });
    return false;
  }
  return true;
}
