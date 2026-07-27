/**
 * Android wake helpers for new-order accept when the merchant app is backgrounded/killed:
 * - USE_FULL_SCREEN_INTENT + SYSTEM_ALERT_WINDOW + battery-ignore request
 * - MainActivity can show over lock screen / turn screen on (with FSI notification)
 */
const {
  withAndroidManifest,
  AndroidConfig,
} = require("@expo/config-plugins");

const EXTRA_PERMISSIONS = [
  "android.permission.USE_FULL_SCREEN_INTENT",
  "android.permission.SYSTEM_ALERT_WINDOW",
  "android.permission.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS",
  "android.permission.WAKE_LOCK",
  "android.permission.RECEIVE_BOOT_COMPLETED",
  "android.permission.VIBRATE",
  "android.permission.POST_NOTIFICATIONS",
];

function ensureUsesPermission(androidManifest, name) {
  const manifest = androidManifest.manifest;
  if (!manifest["uses-permission"]) manifest["uses-permission"] = [];
  const list = manifest["uses-permission"];
  const exists = list.some((p) => p?.$?.["android:name"] === name);
  if (!exists) {
    list.push({ $: { "android:name": name } });
  }
}

function withMerchantOrderWake(config) {
  return withAndroidManifest(config, (cfg) => {
    for (const perm of EXTRA_PERMISSIONS) {
      ensureUsesPermission(cfg.modResults, perm);
    }

    const mainActivity = AndroidConfig.Manifest.getMainActivityOrThrow(cfg.modResults);
    if (!mainActivity.$) mainActivity.$ = {};
    mainActivity.$["android:showWhenLocked"] = "true";
    mainActivity.$["android:turnScreenOn"] = "true";
    // Prefer bringing an existing task forward when woken by a deep link / FSI.
    const existingLaunch = mainActivity.$["android:launchMode"];
    if (!existingLaunch) {
      mainActivity.$["android:launchMode"] = "singleTask";
    }

    return cfg;
  });
}

module.exports = withMerchantOrderWake;
