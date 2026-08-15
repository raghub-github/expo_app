'use client';

import { useSyncExternalStore } from 'react';

type FreezeOverlay = {
  isFrozen: boolean;
  freezeReason: string | null;
  at: number;
};

const overlayByStore = new Map<string, FreezeOverlay>();
const snapshotByStore = new Map<string, FreezeOverlay | null>();
const listeners = new Set<() => void>();

function emit(): void {
  listeners.forEach((cb) => {
    try {
      cb();
    } catch {
      /* ignore */
    }
  });
}

export function setPartnerWalletFreezeOverlay(
  publicStoreId: string,
  isFrozen: boolean,
  freezeReason: string | null,
): void {
  const id = publicStoreId.trim();
  if (!id) return;
  const nextReason = isFrozen ? freezeReason : null;
  const prev = overlayByStore.get(id);
  if (prev && prev.isFrozen === isFrozen && (prev.freezeReason ?? null) === (nextReason ?? null)) {
    return;
  }
  overlayByStore.set(id, {
    isFrozen,
    freezeReason: nextReason,
    at: Date.now(),
  });
  snapshotByStore.delete(id);
  emit();
}

export function getPartnerWalletFreezeOverlay(
  publicStoreId: string | null | undefined,
): FreezeOverlay | null {
  const id = String(publicStoreId ?? '').trim();
  if (!id) return null;
  return overlayByStore.get(id) ?? null;
}

export function subscribePartnerWalletFreezeOverlay(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function getOverlaySnapshot(publicStoreId: string | null | undefined): FreezeOverlay | null {
  const id = String(publicStoreId ?? '').trim();
  if (!id) return null;
  const next = overlayByStore.get(id) ?? null;
  const prev = snapshotByStore.get(id);
  if (
    prev &&
    next &&
    prev.isFrozen === next.isFrozen &&
    (prev.freezeReason ?? null) === (next.freezeReason ?? null)
  ) {
    return prev;
  }
  if (prev == null && next == null) return null;
  snapshotByStore.set(id, next);
  return next;
}

/** Instant freeze flag for Withdraw UI. Overlay wins over a stale wallet GET. */
export function usePartnerWalletFreezeState(storeId: string | null | undefined): FreezeOverlay | null {
  return useSyncExternalStore(
    subscribePartnerWalletFreezeOverlay,
    () => getOverlaySnapshot(storeId),
    () => null,
  );
}

export function applyPartnerWalletFreezeOverlay<T extends {
  isFrozen?: boolean;
  status?: string;
  freezeReason?: string | null;
  withdrawal_allowed?: boolean;
}>(publicStoreId: string, data: T): T {
  const overlay = overlayByStore.get(publicStoreId.trim());
  if (!overlay) return data;
  return {
    ...data,
    isFrozen: overlay.isFrozen,
    status: overlay.isFrozen ? 'FROZEN' : 'ACTIVE',
    freezeReason: overlay.isFrozen ? overlay.freezeReason : null,
    withdrawal_allowed: !overlay.isFrozen && data.withdrawal_allowed !== false,
  };
}
