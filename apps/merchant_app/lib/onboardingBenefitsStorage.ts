/**
 * Per-store onboarding benefits progress (client-side).
 * Window starts when the merchant first becomes eligible (has approved menu items).
 */

import * as SecureStore from "expo-secure-store";

export const ONBOARDING_BENEFITS_WINDOW_DAYS = 15;
export const ONBOARDING_IMAGE_TARGET = 10;

type OnboardingBenefitsState = {
  /** ISO date when benefits unlocked (first time store had approved items). */
  startedAt: string;
  packagingTipsCompletedAt?: string | null;
  /** Once hidden (completed or expired), stay hidden. */
  dismissedAt?: string | null;
};

function storageKey(storeId: string) {
  return `gm_onboarding_benefits_v1_${storeId}`;
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

export async function ensureOnboardingBenefitsStarted(
  storeId: string
): Promise<OnboardingBenefitsState> {
  const existing = await loadOnboardingBenefitsState(storeId);
  if (existing) return existing;
  const next: OnboardingBenefitsState = {
    startedAt: new Date().toISOString(),
    packagingTipsCompletedAt: null,
    dismissedAt: null,
  };
  await saveState(storeId, next);
  return next;
}

export async function markPackagingTipsCompleted(storeId: string): Promise<void> {
  const current = (await loadOnboardingBenefitsState(storeId)) ?? {
    startedAt: new Date().toISOString(),
  };
  if (current.packagingTipsCompletedAt) return;
  await saveState(storeId, {
    ...current,
    packagingTipsCompletedAt: new Date().toISOString(),
  });
}

export async function dismissOnboardingBenefits(storeId: string): Promise<void> {
  const current = (await loadOnboardingBenefitsState(storeId)) ?? {
    startedAt: new Date().toISOString(),
  };
  if (current.dismissedAt) return;
  await saveState(storeId, {
    ...current,
    dismissedAt: new Date().toISOString(),
  });
}

/** Card must stay visible while packaging tips (or images) are still pending. */
export async function reviveOnboardingBenefitsIfPending(
  storeId: string,
  opts: { itemsWithImages: number; approvedItemCount: number }
): Promise<OnboardingBenefitsState | null> {
  const current = await loadOnboardingBenefitsState(storeId);
  if (!current) return null;
  if (!current.dismissedAt) return current;
  if (isOnboardingExpired(current.startedAt)) return current;
  const imagesDone = isImageUploadComplete(opts.itemsWithImages, opts.approvedItemCount);
  const tipsDone = Boolean(current.packagingTipsCompletedAt);
  if (imagesDone && tipsDone) return current;
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

/** Image task target: up to 10, or all approved items if fewer than 10. */
export function resolveImageUploadTarget(approvedItemCount: number): number {
  if (approvedItemCount <= 0) return ONBOARDING_IMAGE_TARGET;
  return Math.min(ONBOARDING_IMAGE_TARGET, approvedItemCount);
}

export function isImageUploadComplete(
  itemsWithImages: number,
  approvedItemCount: number
): boolean {
  return itemsWithImages >= resolveImageUploadTarget(approvedItemCount);
}

/**
 * Hide card when:
 * - manually/automatically dismissed, OR
 * - both tasks done within window, OR
 * - 15-day window expired
 */
export function shouldShowOnboardingBenefitsCard(opts: {
  hasApprovedItems: boolean;
  startedAt: string | null;
  packagingTipsDone: boolean;
  itemsWithImages: number;
  approvedItemCount: number;
  dismissed: boolean;
}): boolean {
  void opts.dismissed;
  if (!opts.hasApprovedItems && !opts.startedAt) return false;
  if (opts.startedAt && isOnboardingExpired(opts.startedAt)) return false;
  if (!opts.startedAt) return opts.hasApprovedItems;
  const bothDone =
    isImageUploadComplete(opts.itemsWithImages, opts.approvedItemCount) &&
    opts.packagingTipsDone;
  if (bothDone) return false;
  return true;
}
