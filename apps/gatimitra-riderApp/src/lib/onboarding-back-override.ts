/**
 * Optional per-screen back handler for onboarding sub-wizards (e.g. selfie → PAN).
 * Return true if the screen handled back; false to use the default previous route.
 */
type BackOverride = () => boolean;

let override: BackOverride | null = null;

export function setOnboardingBackOverride(fn: BackOverride | null): void {
  override = fn;
}

export function runOnboardingBackOverride(): boolean {
  if (!override) return false;
  try {
    return override() === true;
  } catch {
    return false;
  }
}
