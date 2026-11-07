/**
 * Earliest possible splash wall-clock — runs before expo-router.
 * Must stay plain JS (no TS) so Metro executes it at entry.
 * Shape must match lib/splashLifecycle.ts globalThis store.
 */
(function bootSplashDeadline() {
  var HARD_MS = 5000;
  var g = globalThis;
  if (!g.__gatimitraSplashLifecycle) {
    g.__gatimitraSplashLifecycle = {
      processStartMs: Date.now(),
      exited: false,
      deadlineHit: false,
      armed: false,
      listeners: new Set(),
      deadlineTimer: null,
    };
  }
  var s = g.__gatimitraSplashLifecycle;
  if (s.deadlineTimer != null || s.deadlineHit || s.exited) return;
  var remaining = Math.max(0, HARD_MS - (Date.now() - s.processStartMs));
  s.deadlineTimer = setTimeout(function () {
    s.deadlineTimer = null;
    if (s.exited || s.deadlineHit) return;
    s.deadlineHit = true;
    s.listeners.forEach(function (l) {
      try {
        l();
      } catch (_) {}
    });
  }, remaining);
})();
