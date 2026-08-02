/**
 * Active customer scope — the owner stamp for every device-local customer cache.
 *
 * Logout teardown alone is not enough: a force-close, crash, or reinstall-over
 * can leave a previous customer's disk cache in place, and modules that hydrate
 * at import time (my-orders, ride ids) read that cache before any teardown can
 * run. Every customer-scoped cache therefore stamps the owning customer id on
 * write and refuses to hand the payload back when the stamp does not match the
 * signed-in customer.
 *
 * Kept dependency-free so caches that hydrate at module load can import it.
 */

import { fastGetString, fastSetString, hydrateFastKvFromAsyncStorage } from "@/lib/fastKv";

const SCOPE_KEY = "gm_customer_active_scope_v1";

let activeCustomerId: string | null = null;
let hydrated = false;

function hydrateSync(): void {
  if (hydrated) return;
  const raw = fastGetString(SCOPE_KEY);
  activeCustomerId = raw && raw.length > 0 ? raw : null;
  hydrated = true;
}

hydrateSync();

/**
 * Customer id the on-disk caches belong to, or null when signed out.
 * Safe to call at module-eval time.
 */
export function getActiveCustomerScopeId(): string | null {
  hydrateSync();
  return activeCustomerId;
}

/**
 * Bind local caches to `customerId` (null on logout). Persisted synchronously so
 * the very next cold start reads the correct owner before any query runs.
 */
export function setActiveCustomerScopeId(customerId: string | null): void {
  const next = customerId && customerId.length > 0 ? customerId : null;
  activeCustomerId = next;
  hydrated = true;
  try {
    fastSetString(SCOPE_KEY, next ?? "");
  } catch {
    /* non-blocking: in-memory scope still guards this session */
  }
}

/**
 * True when a cache entry stamped `ownerId` may be read by the signed-in
 * customer. Unstamped entries (written by a build before scoping existed) are
 * rejected — an unattributable cache is exactly the cross-account leak risk.
 */
export function isOwnedByActiveCustomer(ownerId: string | null | undefined): boolean {
  const active = getActiveCustomerScopeId();
  if (!active) return false;
  return !!ownerId && ownerId === active;
}

export async function hydrateCustomerScopeFromStorage(): Promise<void> {
  await hydrateFastKvFromAsyncStorage([SCOPE_KEY]);
  hydrated = false;
  hydrateSync();
}

void hydrateCustomerScopeFromStorage();
