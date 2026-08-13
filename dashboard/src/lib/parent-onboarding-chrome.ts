/** Live subtitle + step for the dashboard header on Parent onboarding. */

const DEFAULT_SUBTITLE = "Choose how to continue your registration";
const DEFAULT_PROGRESS = 1;

type SubtitleListener = (subtitle: string) => void;
type ProgressListener = (step: number) => void;

let currentSubtitle = DEFAULT_SUBTITLE;
let currentProgress = DEFAULT_PROGRESS;
const subtitleListeners = new Set<SubtitleListener>();
const progressListeners = new Set<ProgressListener>();

export function getParentOnboardingSubtitle(): string {
  return currentSubtitle;
}

export function setParentOnboardingSubtitle(subtitle: string): void {
  currentSubtitle = subtitle;
  subtitleListeners.forEach((fn) => fn(currentSubtitle));
}

export function subscribeParentOnboardingSubtitle(fn: SubtitleListener): () => void {
  subtitleListeners.add(fn);
  fn(currentSubtitle);
  return () => {
    subtitleListeners.delete(fn);
  };
}

export function resetParentOnboardingSubtitle(): void {
  setParentOnboardingSubtitle(DEFAULT_SUBTITLE);
}

export function getParentOnboardingProgress(): number {
  return currentProgress;
}

export function setParentOnboardingProgress(step: number): void {
  const next = Math.min(3, Math.max(1, Math.round(step)));
  currentProgress = next;
  progressListeners.forEach((fn) => fn(currentProgress));
}

export function subscribeParentOnboardingProgress(fn: ProgressListener): () => void {
  progressListeners.add(fn);
  fn(currentProgress);
  return () => {
    progressListeners.delete(fn);
  };
}

export function resetParentOnboardingProgress(): void {
  setParentOnboardingProgress(DEFAULT_PROGRESS);
}

export const PARENT_ONBOARDING_DEFAULT_SUBTITLE = DEFAULT_SUBTITLE;
