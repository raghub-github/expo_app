/**
 * The label formatter. Pure function — no I/O, no DB. Pass it the four
 * columns the backend tick wrote plus the timezone, get a label back.
 *
 * Edge-cases the engine cares about:
 *   - Tick has never run for this row (phase == null) → UNKNOWN
 *   - Schedule says WITHIN_SLOT but merchant manually closed
 *     (manualOverrideActive=true, isOpenNow=false) → render that
 *     specifically so merchants and customers see the truth
 *   - PRE_BREAK is "open right now, break starts soon" — still OPEN
 *   - BREAK is "in between two slots" — render as BREAK chip, not CLOSED
 *   - OFF_DAY needs a day name in the secondary line if the next-open is
 *     more than 24 h away ("opens Mon 11:30")
 */
import type { LiveStoreStatusInput, LiveStoreStatusLabel } from "./types.js";
/**
 * The format function. Pure. Deterministic given inputs + `now` (default
 * `new Date()`). Accepts an optional `now` so tests can pin the clock.
 */
export declare function formatStoreStatusLabel(input: LiveStoreStatusInput, now?: Date): LiveStoreStatusLabel;
//# sourceMappingURL=format.d.ts.map