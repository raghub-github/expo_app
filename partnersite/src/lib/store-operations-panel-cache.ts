export type StoreOperationsPanelCache = {
  autoAcceptOrders: boolean;
  autoAcceptTimeSeconds: number;
  avgPreparationTimeMinutes: number;
  preparationBufferMinutes: number;
  manualActivationLock: boolean;
  licenseBlockedForOps: boolean;
  fetchedAt: number;
};

export const DEFAULT_STORE_OPERATIONS_PANEL: Omit<StoreOperationsPanelCache, 'fetchedAt'> = {
  autoAcceptOrders: false,
  autoAcceptTimeSeconds: 30,
  avgPreparationTimeMinutes: 30,
  preparationBufferMinutes: 0,
  manualActivationLock: false,
  licenseBlockedForOps: false,
};

const CACHE_KEY = (storeId: string) => `mx_store_ops_panel_v1_${storeId.trim()}`;

export function readCachedStoreOperationsPanel(storeId: string): StoreOperationsPanelCache | null {
  if (typeof sessionStorage === 'undefined' || !storeId.trim()) return null;
  try {
    const raw = sessionStorage.getItem(CACHE_KEY(storeId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoreOperationsPanelCache;
    if (!parsed || typeof parsed.avgPreparationTimeMinutes !== 'number') return null;
    return { ...DEFAULT_STORE_OPERATIONS_PANEL, ...parsed };
  } catch {
    return null;
  }
}

export function writeCachedStoreOperationsPanel(
  storeId: string,
  patch: Partial<Omit<StoreOperationsPanelCache, 'fetchedAt'>>
): void {
  if (typeof sessionStorage === 'undefined' || !storeId.trim()) return;
  try {
    const prev = readCachedStoreOperationsPanel(storeId);
    const next: StoreOperationsPanelCache = {
      ...DEFAULT_STORE_OPERATIONS_PANEL,
      ...prev,
      ...patch,
      fetchedAt: Date.now(),
    };
    sessionStorage.setItem(CACHE_KEY(storeId), JSON.stringify(next));
  } catch {
    /* ignore quota errors */
  }
}

export function panelFieldsFromStoreSettings(
  data: Record<string, unknown>
): Partial<Omit<StoreOperationsPanelCache, 'fetchedAt'>> {
  const out: Partial<Omit<StoreOperationsPanelCache, 'fetchedAt'>> = {};
  if (typeof data.auto_accept_orders === 'boolean') {
    out.autoAcceptOrders = data.auto_accept_orders;
  }
  if (typeof data.auto_accept_time_seconds === 'number' && !Number.isNaN(data.auto_accept_time_seconds)) {
    out.autoAcceptTimeSeconds = Math.max(0, Math.min(600, Math.floor(data.auto_accept_time_seconds)));
  }
  if (typeof data.avg_preparation_time_minutes === 'number' && !Number.isNaN(data.avg_preparation_time_minutes)) {
    out.avgPreparationTimeMinutes = Math.max(5, Math.min(180, Math.floor(data.avg_preparation_time_minutes)));
  }
  if (typeof data.preparation_buffer_minutes === 'number' && !Number.isNaN(data.preparation_buffer_minutes)) {
    out.preparationBufferMinutes = Math.max(0, Math.min(120, Math.floor(data.preparation_buffer_minutes)));
  }
  return out;
}

export function panelFieldsFromStoreOpsGet(
  data: Record<string, unknown>
): Partial<Omit<StoreOperationsPanelCache, 'fetchedAt'>> {
  return {
    manualActivationLock: data.block_auto_open === true,
    licenseBlockedForOps: data.license_blocked === true,
  };
}

/** Warm session cache before opening Store Settings → Operations. */
export async function prefetchStoreOperationsPanel(storeId: string): Promise<void> {
  if (!storeId.trim()) return;
  try {
    const [settingsRes, opsRes] = await Promise.all([
      fetch(`/api/merchant/store-settings?storeId=${encodeURIComponent(storeId)}`, {
        credentials: 'include',
      }),
      fetch(`/api/store-operations?store_id=${encodeURIComponent(storeId)}`, {
        credentials: 'include',
      }),
    ]);
    const settingsData = settingsRes.ok
      ? ((await settingsRes.json().catch(() => ({}))) as Record<string, unknown>)
      : {};
    const opsData = opsRes.ok
      ? ((await opsRes.json().catch(() => ({}))) as Record<string, unknown>)
      : {};
    writeCachedStoreOperationsPanel(storeId, {
      ...panelFieldsFromStoreSettings(settingsData),
      ...panelFieldsFromStoreOpsGet(opsData),
    });
  } catch {
    /* non-blocking prefetch */
  }
}
