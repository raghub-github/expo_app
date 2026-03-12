/**
 * Merchant partner auth: token + parent + child stores.
 * Token persisted in SecureStore; partner data from login response or GET /v1/merchant-partner/me.
 */

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import * as SecureStore from "expo-secure-store";
import { getConfig } from "@/config/env";
import { resetSessionRevokedFlag } from "@/services/sessionEvents";

const TOKEN_KEY = "gatimitra_merchant_access_token";
const PARTNER_KEY = "gatimitra_merchant_partner";

export type PartnerParent = {
  id: number;
  parent_merchant_id: string;
  parent_name: string;
  owner_name: string;
  owner_email?: string;
  brand_name?: string;
  registered_phone: string;
};

export type ChildStore = {
  id: number;
  store_id: string;
  store_name: string;
  full_address: string;
  approval_status: string;
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

type AuthContextValue = {
  token: string | null;
  partner: PartnerData | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  setTokenAndPartner: (token: string, partner: PartnerData) => Promise<void>;
  signOut: () => Promise<void>;
  refreshPartner: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

async function getStoredToken(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(TOKEN_KEY);
  } catch {
    return null;
  }
}

async function getStoredPartner(): Promise<PartnerData | null> {
  try {
    const raw = await SecureStore.getItemAsync(PARTNER_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as PartnerData;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setTokenState] = useState<string | null>(null);
  const [partner, setPartnerState] = useState<PartnerData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const setTokenAndPartner = useCallback(async (newToken: string, newPartner: PartnerData) => {
    // New login/session – allow future session_revoked events to fire again.
    resetSessionRevokedFlag();
    await SecureStore.setItemAsync(TOKEN_KEY, newToken);
    setTokenState(newToken);

    // Prefer fresh data from /me (ensures activeDevices and latest child stores).
    try {
      const { apiBaseUrl } = getConfig();
      const res = await fetch(`${apiBaseUrl}/v1/merchant-partner/me`, {
        headers: { Authorization: `Bearer ${newToken}` },
      });
      if (res.ok) {
        const data = await res.json();
        const partnerData: PartnerData = {
          parent: data.parent,
          childStores: data.childStores ?? [],
          activeDevices: data.activeDevices ?? 0,
        };
        await SecureStore.setItemAsync(PARTNER_KEY, JSON.stringify(partnerData));
        setPartnerState(partnerData);
        return;
      }
    } catch {
      // fall back to partner from login response
    }

    await SecureStore.setItemAsync(PARTNER_KEY, JSON.stringify(newPartner));
    setPartnerState(newPartner);
  }, []);

  const signOut = useCallback(async () => {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
    await SecureStore.deleteItemAsync(PARTNER_KEY);
    setTokenState(null);
    setPartnerState(null);
  }, []);

  const refreshPartner = useCallback(async () => {
    const t = token ?? (await getStoredToken());
    if (!t) return;
    const { apiBaseUrl } = getConfig();
    try {
      const res = await fetch(`${apiBaseUrl}/v1/merchant-partner/me`, {
        headers: { Authorization: `Bearer ${t}` },
      });
      if (res.ok) {
        const data = await res.json();
        const partnerData: PartnerData = {
          parent: data.parent,
          childStores: data.childStores ?? [],
          activeDevices: data.activeDevices ?? 0,
        };
        await SecureStore.setItemAsync(PARTNER_KEY, JSON.stringify(partnerData));
        setPartnerState(partnerData);
      }
    } catch {
      // keep existing partner
    }
  }, [token]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const t = await getStoredToken();
      if (cancelled) return;
      if (t) {
        setTokenState(t);
        const p = await getStoredPartner();
        if (cancelled) return;
        setPartnerState(p);
        // Refresh partner from API in the background so the app can render
        // immediately using cached data instead of blocking on the network.
        const { apiBaseUrl } = getConfig();
        (async () => {
          try {
            const res = await fetch(`${apiBaseUrl}/v1/merchant-partner/me`, {
              headers: { Authorization: `Bearer ${t}` },
            });
            if (cancelled || !res.ok) return;
            const data = await res.json();
            const partnerData: PartnerData = {
              parent: data.parent,
              childStores: data.childStores ?? [],
              activeDevices: data.activeDevices ?? 0,
            };
            await SecureStore.setItemAsync(PARTNER_KEY, JSON.stringify(partnerData));
            setPartnerState(partnerData);
          } catch {
            // keep stored partner
          }
        })();
      }
      if (!cancelled) setIsLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      token,
      partner,
      isLoading,
      isAuthenticated: !!token,
      setTokenAndPartner,
      signOut,
      refreshPartner,
    }),
    [token, partner, isLoading, setTokenAndPartner, signOut, refreshPartner]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
