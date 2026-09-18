/**
 * Merchant partner auth: token + parent + child stores.
 *
 * The only source of truth is a validated backend session (JWT + active device row).
 * Cached partner JSON, selected-store snapshots, and navigation history are never
 * treated as proof of login.
 *
 * Auth epoch: every login/logout bumps a generation so stale bootstrap / validate /
 * 401 callbacks cannot wipe a newer session (fixes OTP → open → logout after seconds).
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
  clearMerchantSessionToken,
  readMerchantAccessToken,
  readMerchantTokenExpiresAt,
  writeMerchantSessionToken,
} from "@/lib/merchantSessionStorage";
import { merchantQueryClient } from "@/lib/merchantQueryClient";
import {
  hasValidMerchantIdentity,
  parsePartnerData,
  validateMerchantSessionFromStore,
} from "@/lib/validateMerchantSession";
import { decideInitialAuth } from "@/lib/merchantSessionBootstrap";
import {
  onMerchantTokenRefreshed,
  refreshMerchantSessionIfNeeded,
} from "@/services/merchantSessionRefresh";
import { authTokenFingerprint, logMerchantAuth } from "@/lib/merchantAuthLog";

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

/**
 * BOOTING → loading
 * AUTHENTICATED → authenticated
 * UNAUTHENTICATED → unauthenticated
 * LOGGING_OUT → logging_out (protected screens blocked)
 */
export type AuthState =
  | { status: "loading" }
  | { status: "authenticated"; session: MerchantAuthSession }
  | { status: "unauthenticated" }
  | { status: "logging_out" };

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

const NO_MERCHANT_MESSAGE =
  "Merchant account not found. Please use a registered merchant number or contact support.";

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

/** Last known partner snapshot — never proof of auth on its own. */
async function readCachedPartner(): Promise<PartnerData | null> {
  try {
    const raw = await SecureStore.getItemAsync(MERCHANT_PARTNER_KEY);
    if (!raw?.trim()) return null;
    return parsePartnerData(JSON.parse(raw));
  } catch {
    return null;
  }
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
      const { logoutAllUserSessions } = await import("@/services/userSessionsApi");
      await logoutAllUserSessions(accessToken, true);
    } catch {
      /* best-effort server revoke */
    }
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
  /** Bumped on every login / logout so stale async auth work cannot clobber the live session. */
  const authEpochRef = useRef(0);

  const token = authState.status === "authenticated" ? authState.session.token : null;
  const partner = authState.status === "authenticated" ? authState.session.partner : null;
  const supabaseUserId =
    authState.status === "authenticated" ? authState.session.supabaseUserId : null;
  tokenRef.current = token;

  const applyAuthenticated = useCallback((session: MerchantAuthSession, epoch: number) => {
    if (epoch !== authEpochRef.current) {
      logMerchantAuth("AUTH_BOOT_IGNORED_STALE", {
        reason: "applyAuthenticated_epoch_mismatch",
        epoch,
        liveEpoch: authEpochRef.current,
      });
      return;
    }
    tokenRef.current = session.token;
    setAuthState({ status: "authenticated", session });
  }, []);

  const applyUnauthenticated = useCallback((epoch: number, reason?: string) => {
    if (epoch !== authEpochRef.current) {
      logMerchantAuth("AUTH_BOOT_IGNORED_STALE", {
        reason: reason ?? "applyUnauthenticated_epoch_mismatch",
        epoch,
        liveEpoch: authEpochRef.current,
      });
      return;
    }
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
      logMerchantAuth("AUTH_LOGIN_START", {
        tokenFp: authTokenFingerprint(newToken),
      });

      if (!hasValidMerchantIdentity(newPartner)) {
        logMerchantAuth("AUTH_LOGIN_REJECTED_NO_MERCHANT", {});
        throw new Error(NO_MERCHANT_MESSAGE);
      }

      // Invalidate any in-flight bootstrap / background validate from the prior epoch.
      authEpochRef.current += 1;
      const epoch = authEpochRef.current;
      resetSessionRevokedFlag();

      const exp =
        expiresAt != null && Number.isFinite(expiresAt) && expiresAt > 1_000_000_000
          ? Math.floor(expiresAt)
          : expiresAt != null && Number.isFinite(expiresAt) && expiresAt > 0 && expiresAt < 1_000_000_000
            ? // Guard: relative TTLs must never be persisted as absolute unix seconds.
              Math.floor(Date.now() / 1000) + Math.floor(expiresAt)
            : Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 365;

      // Persist BEFORE marking authenticated so force-kill mid-login cannot leave a
      // half-state that bootstrap misreads.
      await writeMerchantSessionToken(newToken, exp);
      logMerchantAuth("AUTH_SESSION_PERSISTED", {
        tokenFp: authTokenFingerprint(newToken),
        expiresAt: exp,
      });

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

      await persistPartner(newPartner);
      logMerchantAuth("AUTH_MERCHANT_RESOLVED", {
        parentId: newPartner.parent.id,
        merchantId: newPartner.parent.parent_merchant_id,
      });

      applyAuthenticated({ token: newToken, partner: newPartner, supabaseUserId: sb }, epoch);
      logMerchantAuth("AUTH_LOGIN_SUCCESS", {
        tokenFp: authTokenFingerprint(newToken),
        epoch,
      });

      try {
        const { apiBaseUrl } = getConfig();
        const res = await fetch(`${apiBaseUrl}/v1/merchant-partner/me`, {
          headers: { Authorization: `Bearer ${newToken}` },
        });
        if (epoch !== authEpochRef.current) return;
        if (res.ok) {
          const data = await res.json();
          const partnerData = parsePartnerData(data);
          if (partnerData) {
            await persistPartner(partnerData);
            applyAuthenticated({ token: newToken, partner: partnerData, supabaseUserId: sb }, epoch);
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
    logMerchantAuth("AUTH_LOGOUT_START", {
      tokenFp: authTokenFingerprint(accessToken),
    });

    // Invalidate stale async work first.
    authEpochRef.current += 1;
    const epoch = authEpochRef.current;

    setAuthState({ status: "logging_out" });
    tokenRef.current = null;
    resetSessionRevokedFlag();
    merchantQueryClient.clear();

    // Token must be gone from disk before UI settles — force-kill after Logout
    // must not restore Home from a leftover SecureStore JWT.
    await clearMerchantSessionToken();
    await clearAllMerchantAuthArtifacts();

    applyUnauthenticated(epoch, "signOut");
    logMerchantAuth("AUTH_LOGOUT_COMPLETE", { epoch });
    bestEffortBackgroundCleanup(accessToken);
  }, [applyUnauthenticated]);

  const refreshPartner = useCallback(async () => {
    const epoch = authEpochRef.current;
    const t = tokenRef.current ?? (await readMerchantAccessToken());
    if (!t) return;
    const { apiBaseUrl } = getConfig();
    try {
      const res = await fetch(`${apiBaseUrl}/v1/merchant-partner/me`, {
        headers: { Authorization: `Bearer ${t}` },
      });
      if (epoch !== authEpochRef.current) return;
      if (!res.ok) return;
      const data = await res.json();
      const partnerData = parsePartnerData(data);
      if (!partnerData) return;
      await persistPartner(partnerData);
      const sb = await getStoredSupabaseUserId();
      applyAuthenticated({ token: t, partner: partnerData, supabaseUserId: sb }, epoch);
    } catch {
      // keep existing partner
    }
  }, [applyAuthenticated]);

  useEffect(() => {
    const unsub = onMerchantTokenRefreshed((newToken) => {
      const epoch = authEpochRef.current;
      setAuthState((prev) => {
        if (prev.status !== "authenticated") return prev;
        if (epoch !== authEpochRef.current) return prev;
        tokenRef.current = newToken;
        return { status: "authenticated", session: { ...prev.session, token: newToken } };
      });
    });
    return unsub;
  }, []);

  const invalidateIfStillCurrent = useCallback(
    async (tokenAttempted: string | null, epoch: number, reason: string) => {
      if (epoch !== authEpochRef.current) {
        logMerchantAuth("AUTH_VALIDATE_IGNORED_STALE", { reason, epoch });
        return;
      }
      const live = await readMerchantAccessToken();
      if (live?.trim() && tokenAttempted && live.trim() !== tokenAttempted) {
        logMerchantAuth("AUTH_VALIDATE_IGNORED_STALE", {
          reason: "token_replaced",
          attemptedFp: authTokenFingerprint(tokenAttempted),
          liveFp: authTokenFingerprint(live),
        });
        return;
      }
      if (tokenRef.current && tokenAttempted && tokenRef.current !== tokenAttempted) {
        logMerchantAuth("AUTH_VALIDATE_IGNORED_STALE", {
          reason: "memory_token_replaced",
        });
        return;
      }
      logMerchantAuth("AUTH_SESSION_INVALID", { reason });
      authEpochRef.current += 1;
      const nextEpoch = authEpochRef.current;
      await clearAllMerchantAuthArtifacts();
      applyUnauthenticated(nextEpoch, reason);
    },
    [applyUnauthenticated]
  );

  // Background re-validation. Only a server-CONFIRMED revocation signs out.
  const validateInBackground = useCallback(
    async (sbId: string | null, epoch: number, tokenAtStart: string) => {
      const result = await validateMerchantSessionFromStore();
      if (epoch !== authEpochRef.current) {
        logMerchantAuth("AUTH_VALIDATE_IGNORED_STALE", { reason: "bg_validate" });
        return;
      }
      if (result.ok) {
        await persistPartner(result.session.partner);
        if (epoch !== authEpochRef.current) return;
        applyAuthenticated(
          {
            token: result.session.token,
            partner: result.session.partner,
            supabaseUserId: sbId,
          },
          epoch
        );
        logMerchantAuth("AUTH_SESSION_VALID", {
          tokenFp: authTokenFingerprint(result.session.token),
        });
        return;
      }
      if (result.reason === "invalid") {
        await invalidateIfStillCurrent(
          result.tokenAttempted ?? tokenAtStart,
          epoch,
          "bg_validate_invalid"
        );
      }
      // network: keep session
    },
    [applyAuthenticated, invalidateIfStillCurrent]
  );

  useEffect(() => {
    const bootEpoch = authEpochRef.current;
    logMerchantAuth("AUTH_BOOT_START", { epoch: bootEpoch });
    let cancelled = false;
    (async () => {
      const [token, expiresAtSec, cachedPartner, sbId] = await Promise.all([
        readMerchantAccessToken(),
        readMerchantTokenExpiresAt(),
        readCachedPartner(),
        getStoredSupabaseUserId(),
      ]);
      if (cancelled || bootEpoch !== authEpochRef.current) {
        logMerchantAuth("AUTH_BOOT_IGNORED_STALE", { reason: "after_local_read" });
        return;
      }

      const decision = decideInitialAuth({
        token,
        expiresAtSec,
        hasCachedPartner: cachedPartner != null,
        nowSec: Math.floor(Date.now() / 1000),
      });

      if (decision.kind === "authenticated" && cachedPartner) {
        logMerchantAuth("AUTH_SESSION_FOUND", {
          tokenFp: authTokenFingerprint(decision.token),
          mode: "optimistic",
        });
        applyAuthenticated(
          {
            token: decision.token,
            partner: cachedPartner,
            supabaseUserId: sbId,
          },
          bootEpoch
        );
        void validateInBackground(sbId, bootEpoch, decision.token);
        return;
      }

      if (decision.kind === "unauthenticated") {
        applyUnauthenticated(bootEpoch, "boot_no_token");
        return;
      }

      const result = await validateMerchantSessionFromStore();
      if (cancelled || bootEpoch !== authEpochRef.current) {
        logMerchantAuth("AUTH_BOOT_IGNORED_STALE", { reason: "after_network_validate" });
        return;
      }
      if (result.ok) {
        await persistPartner(result.session.partner);
        if (bootEpoch !== authEpochRef.current) return;
        applyAuthenticated(
          {
            token: result.session.token,
            partner: result.session.partner,
            supabaseUserId: sbId,
          },
          bootEpoch
        );
        logMerchantAuth("AUTH_SESSION_VALID", {
          tokenFp: authTokenFingerprint(result.session.token),
        });
        return;
      }
      if (result.reason === "invalid") {
        await invalidateIfStillCurrent(
          result.tokenAttempted ?? token?.trim() ?? null,
          bootEpoch,
          "boot_invalid"
        );
        return;
      }
      // network: keep persisted token + cached partner if present
      if (token?.trim() && cachedPartner) {
        applyAuthenticated(
          { token: token.trim(), partner: cachedPartner, supabaseUserId: sbId },
          bootEpoch
        );
        return;
      }
      applyUnauthenticated(bootEpoch, "boot_network_no_cache");
    })();
    return () => {
      cancelled = true;
    };
    // Mount-once bootstrap. Epoch guards protect against login races.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (authState.status !== "authenticated") return undefined;
    const epochAtSubscribe = authEpochRef.current;
    const tokenAtSubscribe = tokenRef.current;
    const sub = AppState.addEventListener("change", (state: AppStateStatus) => {
      if (state !== "active") return;
      void (async () => {
        const liveEpoch = authEpochRef.current;
        if (liveEpoch !== epochAtSubscribe) return;
        if (tokenRef.current && tokenAtSubscribe && tokenRef.current !== tokenAtSubscribe) return;

        const next = await refreshMerchantSessionIfNeeded();
        if (liveEpoch !== authEpochRef.current) return;
        if (next) {
          setAuthState((prev) => {
            if (prev.status !== "authenticated") return prev;
            if (liveEpoch !== authEpochRef.current) return prev;
            tokenRef.current = next;
            return { status: "authenticated", session: { ...prev.session, token: next } };
          });
        }
        const result = await validateMerchantSessionFromStore();
        if (liveEpoch !== authEpochRef.current) return;
        if (result.ok) return;
        if (result.reason === "invalid") {
          logMerchantAuth("AUTH_SESSION_EXPIRED", { source: "appstate" });
          await invalidateIfStillCurrent(
            result.tokenAttempted ?? tokenRef.current,
            liveEpoch,
            "appstate_invalid"
          );
        }
      })();
    });
    return () => sub.remove();
  }, [authState.status, token, invalidateIfStillCurrent]);

  const value = useMemo<AuthContextValue>(
    () => ({
      authState,
      token,
      partner,
      supabaseUserId,
      isLoading: authState.status === "loading" || authState.status === "logging_out",
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
