/**
 * Force-disable React Native's native FPS / performance overlay on every launch.
 *
 * The overlay is DevSupport FpsView (Android) / RCTPerfMonitor (iOS) — a WindowManager
 * HUD, not a React component. Hiding it with opacity/CSS does nothing.
 * This runs before expo-router so the monitor never paints.
 *
 * Does not touch LogBox, crash reporting, or unrelated debug tools.
 */
(function disableFpsOverlay() {
  function apply() {
    try {
      const { NativeModules } = require("react-native");
      const DevSettings = NativeModules && NativeModules.DevSettings;
      if (!DevSettings) return;
      if (typeof DevSettings.setFpsDebugEnabled === "function") {
        DevSettings.setFpsDebugEnabled(false);
      }
      if (typeof DevSettings.setIsPerfMonitorShown === "function") {
        DevSettings.setIsPerfMonitorShown(false);
      }
    } catch {
      // Native module missing in some environments (tests, web).
    }
  }

  apply();
  try {
    setTimeout(apply, 0);
    setTimeout(apply, 250);
    setTimeout(apply, 1000);
    const { AppState } = require("react-native");
    if (AppState && typeof AppState.addEventListener === "function") {
      AppState.addEventListener("change", (state) => {
        if (state === "active") apply();
      });
    }
  } catch {
    // ignore
  }
})();
