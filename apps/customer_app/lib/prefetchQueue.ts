/**
 * Bounded, concurrency-limited image prefetch.
 *
 * The prefetch helpers used to fan out one `Image.prefetch` per URI with no cap:
 * a 50-merchant home response with 3-5 banners each issued 150-250 simultaneous
 * downloads, and a large menu issued one per item. Two consequences, both of
 * which the app was hitting:
 *
 *   - every completed download is decoded into the memory cache at once, which
 *     is a plausible native OOM kill on a 2-3 GB device, and
 *   - the burst saturates the connection, so the images actually on screen queue
 *     behind hundreds the user may never scroll to.
 *
 * Prefetching is a latency optimisation, not a correctness requirement, so this
 * caps both how many URIs are ever queued and how many are in flight at once.
 */

import { Image } from "expo-image";

const MAX_IN_FLIGHT = 4;

/**
 * Cap on the dedupe set. Without this, a long browsing session accumulates every
 * URI the user has ever passed near — small per entry, but unbounded.
 */
const MAX_TRACKED_URIS = 600;

const requested = new Set<string>();
const queue: string[] = [];
let inFlight = 0;

function trackRequested(uri: string): boolean {
  if (requested.has(uri)) return false;
  if (requested.size >= MAX_TRACKED_URIS) {
    // Drop the oldest third rather than clearing outright, so the working set
    // for the current screen survives the trim.
    const drop = Math.floor(MAX_TRACKED_URIS / 3);
    let n = 0;
    for (const old of requested) {
      requested.delete(old);
      if (++n >= drop) break;
    }
  }
  requested.add(uri);
  return true;
}

function pump(): void {
  while (inFlight < MAX_IN_FLIGHT && queue.length > 0) {
    const uri = queue.shift()!;
    inFlight += 1;
    Image.prefetch(uri, { cachePolicy: "memory-disk" })
      .catch(() => undefined)
      .finally(() => {
        inFlight -= 1;
        pump();
      });
  }
}

/**
 * Queues up to `limit` not-yet-requested URIs. Returns how many were enqueued.
 * Never throws and never blocks the caller.
 */
export function enqueueImagePrefetch(uris: readonly string[], limit: number): number {
  let added = 0;
  for (const raw of uris) {
    if (added >= limit) break;
    const uri = raw?.trim();
    if (!uri) continue;
    if (!trackRequested(uri)) continue;
    queue.push(uri);
    added += 1;
  }
  if (added > 0) pump();
  return added;
}

/** True when this URI has already been queued or fetched this session. */
export function isImagePrefetchRequested(uri: string | null | undefined): boolean {
  const trimmed = uri?.trim();
  return trimmed ? requested.has(trimmed) : false;
}

/** Awaits a small, explicitly-sized batch — for genuinely above-the-fold media. */
export async function prefetchImagesNow(uris: readonly string[], limit: number): Promise<void> {
  const batch: string[] = [];
  for (const raw of uris) {
    if (batch.length >= limit) break;
    const uri = raw?.trim();
    if (!uri || !trackRequested(uri)) continue;
    batch.push(uri);
  }
  if (batch.length === 0) return;
  await Promise.all(
    batch.map((uri) => Image.prefetch(uri, { cachePolicy: "memory-disk" }).catch(() => undefined))
  );
}

/** Drops queued work — call when leaving a surface whose prefetches no longer matter. */
export function cancelPendingImagePrefetch(): void {
  queue.length = 0;
}
