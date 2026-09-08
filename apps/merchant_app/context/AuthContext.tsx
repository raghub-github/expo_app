/**
 * Merchant partner auth: token + parent + child stores.
 *
 * The only source of truth is a validated backend session (JWT + active device row).
 * Cached partner JSON, selected-store snapshots, and navigation history are never
 * treated as proof of login.
 */

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { AppState, type AppStateStatus } from "react-native";
import * as SecureStore from "expo-secure-store";
import { getConfig } from "@/config/env";
import { resetSessionRevokedFlag } from "@/services/sessionEvents";
import {
  MERCHANT_PARTNER_KEY,
  MERCHANT_SUPABASE_USER_ID_KEY,
  MERCHANT_TOKEN_KEY,
  clearAllMerchantAuthArtifacts,
  readMerchantAccessToken,
  writeMerchantSessionToken,
} from "@/lib/merchantSessionStorage";
import { merchantQueryClient } from "@/lib/merchantQueryClient";
import { parsePartnerData, validateMerchantSessionFromStore } from "@/lib/validateMerchantSession";
import {
  onMerchantTokenRefreshed,
  refreshMerchantSessionIfNeeded,
} from "@/services/merchantSessionRefresh";

export type PartnerParent = {
  id: number;
  parent_merchant_id: string;
  parent_name: string;
  owner_name: string;
  owner_email?: string;
  brand_name?: string;
  registered_phone: string;
  /** Parent brand logo (merchant_parents.store_logo) — shared across child stores. */
  store_logo?: string | null;
};

export type ChildStore = {
  id: number;
  store_id: string;
  store_name: string;
  full_address: string;
  /** From merchant_stores.city — shown in header after store ID. */
  city?: string | null;
  approval_status: string;
  banner_url?: string | null;
  /** Same as parent store_logo — preferred for header logo. */
  parent_logo_url?: string | null;
  current_step: number;
  total_steps: number;
  payment_status: string;
  registration_status?: string;
};

export type PartnerData = {
  parent: PartnerParent;
  childStores: ChildStore[];
  activeDevices?: number;
};

export type MerchantAuthSession = {
  token: string;
  partner: PartnerData | null;
  supabaseUserId: string | null;
};

export type AuthState =
  | { status: "loading" }
  | { status: "authenticated"; session: MerchantAuthSession }
  | { status: "unauthenticated" };

type AuthContextValue = {
  authState: AuthState;
  token: string | null;
  partner: PartnerData | null;
  supabaseUserId: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  setTokenAndPartner: (
    token: string,
    partner: PartnerData,
    supabaseUserId?: string | null,
    expiresAt?: number | null
  ) => Promise<void>;
  signOut: () => Promise<void>;
  refreshPartner: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

async function getStoredSupabaseUserId(): Promise<string | null> {
  try {
    const raw = await SecureStore.getItemAsync(MERCHANT_SUPABASE_USER_ID_KEY);
    return raw && raw.trim() ? raw.trim() : null;
  } catch {
    return null;
  }
}

async function persistPartner(partner: PartnerData): Promise<void> {
  await SecureStore.setItemAsync(MERCHANT_PARTNER_KEY, JSON.stringify(partner));
}

async function persistSupabaseUserId(id: string | null): Promise<void> {
  if (id?.trim()) {
    await SecureStore.setItemAsync(MERCHANT_SUPABASE_USER_ID_KEY, id.trim());
    return;
  }
  try {
    await SecureStore.deleteItemAsync(MERCHANT_SUPABASE_USER_ID_KEY);
  } catch {
    /* ignore */
  }
}

function bestEffortBackgroundCleanup(accessToken: string | null): void {
  void (async () => {
    try {
      const { runMerchantPushUnregister } = await import("@/lib/merchantPushUnregister");
      await runMerchantPushUnregister(accessToken);
    } catch {
      /* best-effort */
    }
    if (!accessToken) return;
    try {
      const { unregisterPushTokenOnBackend } = await import("@gatimitra/expo-push-kit");
      const { apiBaseUrl } = getConfig();
      await unregisterPushTokenOnBackend(apiBaseUrl, accessToken, {
        expo_push_token: null,
        native_push_token: null,
      });
    } catch {
      /* best-effort */
    }
    try {
      const { unregisterAllStorePushTokens } = await import("@/services/pushTokenApi");
      const cached = await SecureStore.getItemAsync("merchant_cached_expo_push_token_v1");
      if (cached?.trim()) {
        await unregisterAllStorePushTokens(cached.trim(), accessToken);
      }
    } catch {
      /* best-effort */
    }
    try {
      const { getSupabaseAuth } = await import("@/lib/supabaseClient");
      await getSupabaseAuth()?.auth.signOut();
    } catch {
      /* best-effort */
    }
  })();
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [authState, setAuthState] = useState<AuthState>({ status: "loading" });
  const tokenRef = useRef<string | null>(null);

  const token = authState.status === "authenticated" ? authState.session.token : null;
  const partner = authState.status === "authenticated" ? authState.session.partner : null;
  const supabaseUserId =
    authState.status === "authenticated" ? authState.session.supabaseUserId : null;
  tokenRef.current = token;

  const applyAuthenticated = useCallback((session: MerchantAuthSession) => {
    tokenRef.current = session.token;
    setAuthState({ status: "authenticated", session });
  }, []);

  const applyUnauthenticated = useCallback(() => {
    tokenRef.current = null;
    setAuthState({ status: "unauthenticated" });
  }, []);

  const setTokenAndPartner = useCallback(
    async (
      newToken: string,
      newPartner: PartnerData,
      newSupabaseUserId?: string | null,
      expiresAt?: number | null
    ) => {
      resetSessionRevokedFlag();
      const exp =
        expiresAt != null && Number.isFinite(expiresAt) && expiresAt > 0
          ? Math.floor(expiresAt)
          : Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 365;
      await writeMerchantSessionToken(newToken, exp);

      let sb: string | null = null;
      if (newSupabaseUserId !== undefined) {
        sb =
          typeof newSupabaseUserId === "string" && newSupabaseUserId.trim()
            ? newSupabaseUserId.trim()
            : null;
        await persistSupabaseUserId(sb);
      } else {
        sb = await getStoredSupabaseUserId();
      }

      // Login just minted this session on the server — it is the source of truth.
      applyAuthenticated({ token: newToken, partner: newPartner, supabaseUserId: sb });
      await persistPartner(newPartner);

      try {
        const { apiBaseUrl } = getConfig();
        const res = await fetch(`${apiBaseUrl}/v1/merchant-partner/me`, {
          headers: { Authorization: `Bearer ${newToken}` },
        });
        if (res.ok) {
          const data = await res.json();
          const partnerData = parsePartnerData(data);
          if (partnerData) {
            await persistPartner(partnerData);
            applyAuthenticated({ token: newToken, partner: partnerData, supabaseUserId: sb });
          }
        }
      } catch {
        // Keep partner from the login exchange.
      }
    },
    [applyAuthenticated]
  );

  const signOut = useCallback(async () => {
    const accessToken = tokenRef.current ?? (await readMerchantAccessToken());

    // Unmount the authenticated tree immediately, then persist the wipe so a
    // force-kill cannot restore Home from a leftover token.
    applyUnauthenticated();
    resetSessionRevokedFlag();
    merchantQueryClient.clear();
    await clearAllMerchantAuthArtifacts();
    bestEffortBackgroundCleanup(accessToken);
  }, [applyUnauthenticated]);

  const refreshPartner = useCallback(async () => {
    const t = tokenRef.current ?? (await readMerchantAccessToken());
    if (!t) return;
    const { apiBaseUrl } = getConfig();
    try {
      const res = await fetch(`${apiBaseUrl}/v1/merchant-partner/me`, {
        headers: { Authorization: `Bearer ${t}` },
      });
      if (!res.ok) return;
      const data = await res.json();
      const partnerData = parsePartnerData(data);
      if (!partnerData) return;
      await persistPartner(partnerData);
      const sb = await getStoredSupabaseUserId();
      applyAuthenticated({ token: t, partner: partnerData, supabaseUserId: sb });
    } catch {
      // keep existing partner
    }
  }, [applyAuthenticated]);

  useEffect(() => {
    const unsub = onMerchantTokenRefreshed((newToken) => {
      setAuthState((prev) => {
        if (prev.status !== "authenticated") return prev;
        tokenRef.current = newToken;
        return { status: "authenticated", session: { ...prev.session, token: newToken } };
      });
    });
    return unsub;
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const result = await validateMerchantSessionFromStore();
      if (cancelled) return;
      if (result.ok) {
        const sbId = await getStoredSupabaseUserId();
        if (cancelled) return;
        await persistPartner(result.session.partner);
        applyAuthenticated({
          token: result.session.token,
          partner: result.session.partner,
          supabaseUserId: sbId,
        });
        return;
      }
      if (result.reason === "invalid") {
        await clearAllMerchantAuthArtifacts();
      }
      if (!cancelled) applyUnauthenticated();
    })();
    return () => {
      cancelled = true;
    };
  }, [applyAuthenticated, applyUnauthenticated]);

  useEffect(() => {
    if (authState.status !== "authenticated") return undefined;
    const sub = AppState.addEventListener("change", (state: AppStateStatus) => {
      if (state !== "active") return;
      void (async () => {
        const next = await refreshMerchantSessionIfNeeded();
        if (next) {
          setAuthState((prev) => {
            if (prev.status !== "authenticated") return prev;
            tokenRef.current = next;
            return { status: "authenticated", session: { ...prev.session, token: next } };
          });
        }
        const result = await validateMerchantSessionFromStore();
        if (result.ok) return;
        if (result.reason === "invalid") {
          await signOut();
        }
      })();
    });
    return () => sub.remove();
  }, [authState.status, signOut]);

  const value = useMemo<AuthContextValue>(
    () => ({
      authState,
      token,
      partner,
      supabaseUserId,
      isLoading: authState.status === "loading",
      isAuthenticated: authState.status === "authenticated",
      setTokenAndPartner,
      signOut,
      refreshPartner,
    }),
    [authState, token, partner, supabaseUserId, setTokenAndPartner, signOut, refreshPartner]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

// Legacy export for any code still referencing TOKEN_KEY
export { MERCHANT_TOKEN_KEY as TOKEN_KEY };
