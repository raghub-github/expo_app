/** True only on browser refresh (F5), not on in-app / Next.js client navigation. */
export function isHardPageReload(): boolean {
  if (typeof window === "undefined") return false;
  const entry = performance.getEntriesByType("navigation")[0] as
    | PerformanceNavigationTiming
    | undefined;
  return entry?.type === "reload";
}
