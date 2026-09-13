/**
 * Pure hiring inheritance (State → Region → District).
 * No DB imports — safe for unit tests and admin batch resolve.
 */

export type HiringSourceLevel = "district" | "region" | "state" | "default" | "none";

/**
 * Walk most-specific → ancestors; first non-null explicit wins.
 * null = inherit upward. All null → default ON.
 */
export function resolveHiringFromChain(
  chain: Array<{ level: string; hiringEnabled: boolean | null }>,
): {
  hiringAllowed: boolean;
  source: HiringSourceLevel;
  explicit: boolean;
} {
  for (const step of chain) {
    if (step.hiringEnabled === null || step.hiringEnabled === undefined) continue;
    const level = String(step.level || "").toLowerCase();
    const source: HiringSourceLevel =
      level === "district" || level === "region" || level === "state" ? level : "default";
    return {
      hiringAllowed: step.hiringEnabled === true,
      source,
      explicit: true,
    };
  }
  return { hiringAllowed: true, source: "default", explicit: false };
}
