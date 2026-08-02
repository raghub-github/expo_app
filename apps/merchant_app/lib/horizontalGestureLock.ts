/**
 * Shared claim on horizontal drags.
 *
 * The orders board switches stages when the user swipes sideways, and it has to
 * capture that gesture before the vertical list swallows it. Controls that own
 * their own horizontal drag (slide-to-confirm, the stage pill strip) take this
 * lock while they are being used so the board leaves their gesture alone.
 */

import { makeMutable } from "react-native-reanimated";

/** A claim this old belongs to a gesture that ended without a release event. */
const CLAIM_TTL_MS = 6000;

let activeClaims = 0;
let lastClaimAt = 0;

/** UI-thread mirror of the claim, readable from gesture worklets. */
export const horizontalGestureClaimed = makeMutable(false);

function syncSharedClaim(): void {
  horizontalGestureClaimed.value = activeClaims > 0;
}

export function claimHorizontalGesture(): void {
  activeClaims += 1;
  lastClaimAt = Date.now();
  syncSharedClaim();
}

export function releaseHorizontalGesture(): void {
  activeClaims = Math.max(0, activeClaims - 1);
  syncSharedClaim();
}

export function isHorizontalGestureClaimed(): boolean {
  if (activeClaims === 0) return false;
  // A component unmounting mid-gesture would otherwise leak the claim and
  // silently kill stage swiping for the rest of the session.
  if (Date.now() - lastClaimAt > CLAIM_TTL_MS) {
    activeClaims = 0;
    syncSharedClaim();
    return false;
  }
  return true;
}
