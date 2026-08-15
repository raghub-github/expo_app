/**
 * Per-store onboarding benefits progress.
 * Local SecureStore is a cache; backend merchant_store_settings.settings_metadata
 * is the source of truth so completion survives reinstall / new device / logout.
 */

import * as SecureStore from "expo-secure-store";
import { getConfig } from "@/config/env";

export const ONBOARDING_BENEFITS_WINDOW_DAYS = 15;
export const ONBOARDING_IMAGE_TARGET = 10;

export type OnboardingBenefitsState = {
  /** ISO date when benefits unlocked (first time store had menu items). */
  startedAt: string;
  packagingTipsCompletedAt?: string | null;
  /** Once hidden (completed or expired), stay hidden. */
  dismissedAt?: string | null;
  /** Server-confirmed completion — never revive after this. */
  completedAt?: string | null;
};

function storageKey(storeId: string) {
  return `gm_onboarding_benefits_v2_${storeId}`;
}

export async function loadOnboardingBenefitsState(
  storeId: string
): Promise<OnboardingBenefitsState | null> {
  try {
    const raw = await SecureStore.getItemAsync(storageKey(storeId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as OnboardingBenefitsState;
    if (!parsed?.startedAt) return null;
    return parsed;
  } catch {
    return null;
  }
}

async function saveState(storeId: string, next: OnboardingBenefitsState) {
  try {
    await SecureStore.setItemAsync(storageKey(storeId), JSON.stringify(next));
  } catch {
    // ignore
  }
}

function mergeRemote(
  local: OnboardingBenefitsState | null,
  remote: Partial<OnboardingBenefitsState> | null
): OnboardingBenefitsState | null {
  if (!local && !remote?.startedAt) return null;
  const base: OnboardingBenefitsState = {
    startedAt: remote?.startedAt ?? local!.startedAt,
    packagingTipsCompletedAt:
      remote?.packagingTipsCompletedAt ?? local?.packagingTipsCompletedAt ?? null,
    dismissedAt: remote?.dismissedAt ?? local?.dismissedAt ?? null,
    completedAt: remote?.completedAt ?? local?.completedAt ?? null,
  };
  // Prefer whichever timestamp is set (server or local).
  if (remote?.completedAt && !local?.completedAt) base.completedAt = remote.completedAt;
  if (local?.completedAt && !remote?.completedAt) base.completedAt = local.completedAt;
  if (remote?.packagingTipsCompletedAt || local?.packagingTipsCompletedAt) {
    base.packagingTipsCompletedAt =
      remote?.packagingTipsCompletedAt ?? local?.packagingTipsCompletedAt ?? null;
  }
  if (base.completedAt) {
    base.dismissedAt = base.dismissedAt ?? base.completedAt;
  }
  return base;
}

async function fetchRemoteState(
  storeDbId: number,
  token: string
): Promise<Partial<OnboardingBenefitsState> | null> {
  try {
    const base = getConfig().apiBaseUrl.replace(/\/+$/, "");
    const res = await fetch(
      `${base}/v1/merchant-partner/stores/${storeDbId}/onboarding-benefits`,
      { headers: { Authorization: `Bearer ${token}`, "X-Silent-Error": "1" } }
    );
    if (!res.ok) return null;
    const data = (await res.json()) as {
      started_at?: string | null;
      packaging_tips_completed_at?: string | null;
      dismissed_at?: string | null;
      completed_at?: string | null;
    };
    if (!data?.started_at && !data?.completed_at) return null;
    return {
      startedAt: data.started_at ?? new Date().toISOString(),
      packagingTipsCompletedAt: data.packaging_tips_completed_at ?? null,
      dismissedAt: data.dismissed_at ?? null,
      completedAt: data.completed_at ?? null,
    };
  } catch {
    return null;
  }
}

async function patchRemoteState(
  storeDbId: number,
  token: string,
  patch: Record<string, unknown>
): Promise<void> {
  try {
    const base = getConfig().apiBaseUrl.replace(/\/+$/, "");
    await fetch(`${base}/v1/merchant-partner/stores/${storeDbId}/onboarding-benefits`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "X-Silent-Error": "1",
      },
      body: JSON.stringify(patch),
    });
  } catch {
    // local cache still updated
  }
}

export async function syncOnboardingBenefitsFromServer(
  storePublicId: string,
  storeDbId: number | null,
  token: string | null
): Promise<OnboardingBenefitsState | null> {
  const local = await loadOnboardingBenefitsState(storePublicId);
  if (!storeDbId || !token) return local;
  const remote = await fetchRemoteState(storeDbId, token);
  const merged = mergeRemote(local, remote);
  if (merged) await saveState(storePublicId, merged);
  return merged;
}

export async function ensureOnboardingBenefitsStarted(
  storeId: string,
  opts?: { storeDbId?: number | null; token?: string | null }
): Promise<OnboardingBenefitsState> {
  const existing = await loadOnboardingBenefitsState(storeId);
  if (existing) return existing;
  const next: OnboardingBenefitsState = {
    startedAt: new Date().toISOString(),
    packagingTipsCompletedAt: null,
    dismissedAt: null,
    completedAt: null,
  };
  await saveState(storeId, next);
  if (opts?.storeDbId && opts?.token) {
    void patchRemoteState(opts.storeDbId, opts.token, {
      started_at: next.startedAt,
    });
  }
  return next;
}

export async function markPackagingTipsCompleted(
  storeId: string,
  opts?: { storeDbId?: number | null; token?: string | null }
): Promise<void> {
  const current = (await loadOnboardingBenefitsState(storeId)) ?? {
    startedAt: new Date().toISOString(),
  };
  if (current.packagingTipsCompletedAt) return;
  const at = new Date().toISOString();
  await saveState(storeId, {
    ...current,
    packagingTipsCompletedAt: at,
  });
  if (opts?.storeDbId && opts?.token) {
    void patchRemoteState(opts.storeDbId, opts.token, {
      packaging_tips_completed_at: at,
    });
  }
}

/**
 * Soft-dismiss without completing (e.g. early close). Never sets completedAt.
 * Home card can revive while tasks are still open and the window has not expired.
 */
export async function dismissOnboardingBenefits(
  storeId: string,
  opts?: { storeDbId?: number | null; token?: string | null; completed?: boolean }
): Promise<void> {
  const current = (await loadOnboardingBenefitsState(storeId)) ?? {
    startedAt: new Date().toISOString(),
  };
  if (current.completedAt) return;
  if (current.dismissedAt && !opts?.completed) return;
  const at = new Date().toISOString();
  const next: OnboardingBenefitsState = {
    ...current,
    dismissedAt: current.dismissedAt ?? at,
    completedAt: opts?.completed ? current.completedAt ?? at : current.completedAt ?? null,
  };
  await saveState(storeId, next);
  if (opts?.storeDbId && opts?.token) {
    void patchRemoteState(opts.storeDbId, opts.token, {
      dismissed_at: next.dismissedAt,
      ...(next.completedAt ? { completed_at: next.completedAt } : {}),
    });
  }
}

/**
 * Permanent completion — only after BOTH required tasks are done.
 * photoTarget = min(totalItems, 10). Called from the "Got it" button.
 * Sets completedAt so the Home card never revives for this store.
 */
export async function confirmOnboardingBenefitsCompleted(
  storeId: string,
  opts: {
    storeDbId?: number | null;
    token?: string | null;
    itemsWithImages: number;
    itemCount: number;
  }
): Promise<{ ok: boolean; reason?: "tasks_incomplete" | "already_completed" }> {
  const current = (await loadOnboardingBenefitsState(storeId)) ?? {
    startedAt: new Date().toISOString(),
  };
  if (current.completedAt) return { ok: true, reason: "already_completed" };

  const imagesDone = isImageUploadComplete(opts.itemsWithImages, opts.itemCount);
  const tipsDone = Boolean(current.packagingTipsCompletedAt);
  if (!imagesDone || !tipsDone) {
    return { ok: false, reason: "tasks_incomplete" };
  }

  await dismissOnboardingBenefits(storeId, {
    storeDbId: opts.storeDbId,
    token: opts.token,
    completed: true,
  });
  return { ok: true };
}

/**
 * Only revive a soft-dismissed card when not permanently completed and window open.
 * Never auto-set completedAt — that requires the merchant tapping Got it.
 */
export async function reviveOnboardingBenefitsIfPending(
  storeId: string,
  _opts: { itemsWithImages: number; itemCount: number }
): Promise<OnboardingBenefitsState | null> {
  const current = await loadOnboardingBenefitsState(storeId);
  if (!current) return null;
  if (current.completedAt) return current;
  if (!current.dismissedAt) return current;
  if (isOnboardingExpired(current.startedAt)) return current;
  const revived = { ...current, dismissedAt: null };
  await saveState(storeId, revived);
  return revived;
}

export function getOnboardingDeadline(startedAt: string): Date {
  const start = new Date(startedAt);
  const end = new Date(start);
  end.setDate(end.getDate() + ONBOARDING_BENEFITS_WINDOW_DAYS);
  return end;
}

export function isOnboardingExpired(startedAt: string, now = new Date()): boolean {
  return now.getTime() > getOnboardingDeadline(startedAt).getTime();
}

export function formatOnboardingDeadline(startedAt: string): string {
  const d = getOnboardingDeadline(startedAt);
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    timeZone: "Asia/Calcutta",
  }).format(d);
}

/** Image task target: min(total items, 10). */
export function resolveImageUploadTarget(itemCount: number): number {
  if (itemCount <= 0) return ONBOARDING_IMAGE_TARGET;
  return Math.min(ONBOARDING_IMAGE_TARGET, itemCount);
}

export function isImageUploadComplete(itemsWithImages: number, itemCount: number): boolean {
  const target = resolveImageUploadTarget(itemCount);
  return target > 0 && itemsWithImages >= target;
}

export function formatAddPhotosTaskTitle(itemCount: number): string {
  const target = resolveImageUploadTarget(itemCount);
  if (target === 1) return "Add photo on 1 item";
  return `Add photos on ${target} items`;
}

/**
 * Hide Home card when:
 * - merchant tapped Got it (completedAt), OR
 * - 15-day window expired
 *
 * Both tasks done alone does NOT hide the card — Got it must be tapped.
 * State is per storeId (SecureStore key + settings_metadata.onboarding_benefits).
 */
export function shouldShowOnboardingBenefitsCard(opts: {
  hasItems: boolean;
  startedAt: string | null;
  packagingTipsDone: boolean;
  itemsWithImages: number;
  itemCount: number;
  dismissed: boolean;
  completed: boolean;
  catalogReady: boolean;
}): boolean {
  if (opts.completed) return false;
  if (opts.startedAt && isOnboardingExpired(opts.startedAt)) return false;
  if (!opts.hasItems && !opts.startedAt) return false;
  if (!opts.startedAt) return opts.hasItems;
  // Avoid flash of card on cold start before catalog hydrates when already completed locally.
  if (!opts.catalogReady && (opts.dismissed || opts.completed)) return false;
  if (opts.dismissed) return false;
  return true;
}
