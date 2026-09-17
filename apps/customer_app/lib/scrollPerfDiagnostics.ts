/**
 * Dev-only scroll/render diagnostics. Silent in production.
 * Enable: globalThis.__GM_SCROLL_PERF__ = true
 */

type Sample = { t: number; tag: string };

let enabled = false;
let lastFrameAt = 0;
let dropCount = 0;
const recent: Sample[] = [];

export function setScrollPerfDiagnosticsEnabled(on: boolean): void {
  enabled = on;
  dropCount = 0;
  recent.length = 0;
}

export function isScrollPerfDiagnosticsEnabled(): boolean {
  return typeof __DEV__ !== "undefined" && !!__DEV__ && enabled;
}

/** Call from onScroll / list render hot paths when diagnostics are on. */
export function noteScrollPerfSample(tag: string): void {
  if (!isScrollPerfDiagnosticsEnabled()) return;
  const t = Date.now();
  if (lastFrameAt > 0) {
    const dt = t - lastFrameAt;
    // ~16.7ms = 60fps; gaps > 32ms ≈ dropped frame under load.
    if (dt > 32) dropCount += 1;
  }
  lastFrameAt = t;
  recent.push({ t, tag });
  if (recent.length > 40) recent.shift();
}

export function getScrollPerfSnapshot(): { dropCount: number; recent: Sample[] } {
  return { dropCount, recent: recent.slice() };
}

export function logScrollPerfSummary(label: string): void {
  if (!isScrollPerfDiagnosticsEnabled()) return;
  // eslint-disable-next-line no-console
  console.log(`[SCROLL_PERF] ${label}`, getScrollPerfSnapshot());
}

declare global {
  // eslint-disable-next-line no-var
  var __GM_SCROLL_PERF__: boolean | undefined;
}

if (typeof __DEV__ !== "undefined" && __DEV__) {
  try {
    if (globalThis.__GM_SCROLL_PERF__ === true) {
      setScrollPerfDiagnosticsEnabled(true);
    }
  } catch {
    /* ignore */
  }
}
