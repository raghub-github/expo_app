import { useRiderToastStore } from "@/src/stores/riderToastStore";

/** Show onboarding feedback as a bottom toast instead of inline banners. */
export function notifyOnboardingToast(message: string) {
  const text = message.trim();
  if (!text) return;
  useRiderToastStore.getState().showToast(text);
}
