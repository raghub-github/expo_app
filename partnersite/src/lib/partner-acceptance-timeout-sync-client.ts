/**
 * Shared client for POST /api/merchant/sync-acceptance-timeout.
 * Dedupes per store per tab, stops on permanent 403, and serializes in-flight calls.
 */

const SYNC_OK_PREFIX = 'partner-acceptance-sync-v3:ok:';
const SYNC_DENY_PREFIX = 'partner-acceptance-sync-v3:deny:';
const MAX_AUTH_RETRIES = 3;
const AUTH_RETRY_MS = 900;

type SyncResult = {
  ok: boolean;
  status: number;
  cancelled: number;
  error?: string;
};

const inflight = new Map<string, Promise<SyncResult>>();

function okKey(storeId: string): string {
  return `${SYNC_OK_PREFIX}${storeId.trim()}`;
}

function denyKey(storeId: string): string {
  return `${SYNC_DENY_PREFIX}${storeId.trim()}`;
}

export function clearPartnerAcceptanceTimeoutSyncCache(storeId: string): void {
  if (typeof window === 'undefined') return;
  const sid = storeId.trim();
  sessionStorage.removeItem(okKey(sid));
  sessionStorage.removeItem(denyKey(sid));
}

export function isPartnerAcceptanceTimeoutSyncDenied(storeId: string): boolean {
  if (typeof window === 'undefined') return false;
  return Boolean(sessionStorage.getItem(denyKey(storeId.trim())));
}

export function isPartnerAcceptanceTimeoutSyncDone(storeId: string): boolean {
  if (typeof window === 'undefined') return false;
  const sid = storeId.trim();
  return Boolean(sessionStorage.getItem(okKey(sid)) || sessionStorage.getItem(denyKey(sid)));
}

async function runSync(storeId: string, force: boolean): Promise<SyncResult> {
  const sid = storeId.trim();
  if (!sid) return { ok: false, status: 400, cancelled: 0, error: 'store_id_required' };

  if (typeof window !== 'undefined' && !force) {
    if (sessionStorage.getItem(denyKey(sid))) {
      return { ok: false, status: 403, cancelled: 0, error: 'cached_forbidden' };
    }
    if (sessionStorage.getItem(okKey(sid))) {
      return { ok: true, status: 200, cancelled: 0 };
    }
  }

  let lastStatus = 0;
  let data: { cancelled?: number; error?: string } = {};

  for (let attempt = 0; attempt < MAX_AUTH_RETRIES; attempt += 1) {
    if (attempt > 0) {
      await new Promise((r) => window.setTimeout(r, AUTH_RETRY_MS * attempt));
    }

    const res = await fetch(
      `/api/merchant/sync-acceptance-timeout?store_id=${encodeURIComponent(sid)}`,
      { method: 'POST', credentials: 'include', cache: 'no-store' },
    );
    data = (await res.json().catch(() => ({}))) as { cancelled?: number; error?: string };
    lastStatus = res.status;

    if (res.ok) {
      if (typeof window !== 'undefined') {
        sessionStorage.setItem(okKey(sid), String(Date.now()));
        sessionStorage.removeItem(denyKey(sid));
      }
      return {
        ok: true,
        status: res.status,
        cancelled: Number(data.cancelled ?? 0),
      };
    }

    if (res.status === 403) {
      if (typeof window !== 'undefined') {
        sessionStorage.setItem(denyKey(sid), String(Date.now()));
      }
      return {
        ok: false,
        status: 403,
        cancelled: 0,
        error: data.error ?? 'forbidden',
      };
    }

    if (res.status !== 401) {
      if (typeof window !== 'undefined' && res.status >= 500) {
        /* allow retry on next explicit call */
      } else if (typeof window !== 'undefined') {
        sessionStorage.setItem(okKey(sid), String(Date.now()));
      }
      return {
        ok: false,
        status: lastStatus,
        cancelled: 0,
        error: data.error ?? 'sync_failed',
      };
    }
  }

  if (typeof window !== 'undefined') {
    sessionStorage.setItem(okKey(sid), String(Date.now()));
  }
  return {
    ok: false,
    status: lastStatus || 401,
    cancelled: 0,
    error: data.error ?? 'unauthenticated',
  };
}

/**
 * Sync acceptance timeout for one store. Safe to call from multiple components —
 * only one network request runs per store at a time.
 */
export function requestPartnerAcceptanceTimeoutSync(
  storeId: string,
  options?: { force?: boolean },
): Promise<SyncResult> {
  const sid = storeId.trim();
  if (!sid) return Promise.resolve({ ok: false, status: 400, cancelled: 0 });

  const force = options?.force === true;
  if (!force && typeof window !== 'undefined') {
    if (sessionStorage.getItem(denyKey(sid))) {
      return Promise.resolve({ ok: false, status: 403, cancelled: 0, error: 'cached_forbidden' });
    }
    if (sessionStorage.getItem(okKey(sid))) {
      return Promise.resolve({ ok: true, status: 200, cancelled: 0 });
    }
  }

  const existing = inflight.get(sid);
  if (existing) return existing;

  const promise = runSync(sid, force).finally(() => {
    inflight.delete(sid);
  });
  inflight.set(sid, promise);
  return promise;
}
