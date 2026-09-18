/**
 * Stale-while-revalidate URI pick for CMS images.
 * Keep showing `lastGood` until the new URI is confirmed loaded — never blank
 * the tile when Super Admin rotates a signed URL or swaps artwork.
 */

export type AppAssetDisplayPick = {
  /** URI painted on screen right now. */
  displayUri: string | null;
  /** URI we are loading in the background (may equal displayUri). */
  pendingUri: string | null;
  /** True when a new URI is loading and we still show lastGood underneath. */
  isRevalidating: boolean;
};

export function pickAppAssetDisplayUri(opts: {
  preferredUri: string | null;
  lastGoodUri: string | null;
  /** When true (admin live preview), always show preferred immediately. */
  fresh?: boolean;
}): AppAssetDisplayPick {
  const preferred = opts.preferredUri?.trim() || null;
  const lastGood = opts.lastGoodUri?.trim() || null;
  if (opts.fresh) {
    return {
      displayUri: preferred,
      pendingUri: preferred,
      isRevalidating: false,
    };
  }
  if (!preferred) {
    return {
      displayUri: lastGood,
      pendingUri: null,
      isRevalidating: false,
    };
  }
  if (lastGood && lastGood !== preferred) {
    return {
      displayUri: lastGood,
      pendingUri: preferred,
      isRevalidating: true,
    };
  }
  return {
    displayUri: preferred,
    pendingUri: preferred,
    isRevalidating: false,
  };
}
