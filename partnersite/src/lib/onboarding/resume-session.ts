/** Client-side onboarding resume (survives hard reload when URL still has ?new=1). */

export type OnboardingResumeState = {
  parentKey: string;
  step: number;
  storePublicId: string | null;
  updatedAt: number;
};

function storageKey(parentKey: string): string {
  return `mx_register_store_resume:v1:${parentKey}`;
}

export function readOnboardingResume(parentKey: string): OnboardingResumeState | null {
  if (typeof window === "undefined" || !parentKey.trim()) return null;
  try {
    const raw = sessionStorage.getItem(storageKey(parentKey.trim()));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<OnboardingResumeState>;
    const step = Number(parsed.step);
    if (!Number.isFinite(step) || step < 1 || step > 9) return null;
    return {
      parentKey: parentKey.trim(),
      step: Math.floor(step),
      storePublicId:
        typeof parsed.storePublicId === "string" && parsed.storePublicId.trim()
          ? parsed.storePublicId.trim()
          : null,
      updatedAt: typeof parsed.updatedAt === "number" ? parsed.updatedAt : 0,
    };
  } catch {
    return null;
  }
}

export function writeOnboardingResume(state: OnboardingResumeState): void {
  if (typeof window === "undefined" || !state.parentKey.trim()) return;
  try {
    sessionStorage.setItem(storageKey(state.parentKey.trim()), JSON.stringify(state));
  } catch {
    /* quota / private mode */
  }
}

export function clearOnboardingResume(parentKey: string): void {
  if (typeof window === "undefined" || !parentKey.trim()) return;
  try {
    sessionStorage.removeItem(storageKey(parentKey.trim()));
  } catch {
    /* ignore */
  }
}

/** Add store_id to URL so reload can target the correct draft. */
export function syncOnboardingUrl(storePublicId: string): void {
  if (typeof window === "undefined" || !storePublicId.trim()) return;
  const id = storePublicId.trim();
  const u = new URL(window.location.href);
  if (u.searchParams.get("store_id") === id) return;
  u.searchParams.set("store_id", id);
  window.history.replaceState({}, "", `${u.pathname}${u.search}${u.hash}`);
}
