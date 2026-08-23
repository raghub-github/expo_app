/**
 * Strips broad / sensitive Android permissions that Google Play flags for a
 * justification declaration (or Data-safety disclosure) but which NO Rider
 * feature actually needs. They are pulled in transitively by libraries:
 *
 *   - RECORD_AUDIO            → expo-camera / expo-audio (we never record A/V)
 *   - READ/WRITE_EXTERNAL_STORAGE → expo-image-picker / expo-file-system / expo-image
 *                               (gallery uses the system Photo Picker and files are
 *                                app-scoped, so no storage permission is required)
 *   - READ_MEDIA_IMAGES/VIDEO/AUDIO → belt-and-suspenders in case a lib re-adds them
 *
 * We remove them at the manifest-merger level with `tools:node="remove"`, so they
 * never reach the final AAB, while the features that use those libraries (Photo
 * Picker selection, image preview/upload, photo capture, barcode scan) keep
 * working. Location / foreground-service / battery-optimization permissions are
 * intentionally left untouched — they are core to rider background tracking.
 */
const { withAndroidManifest } = require("@expo/config-plugins");

const PERMISSIONS_TO_REMOVE = [
  "android.permission.RECORD_AUDIO",
  "android.permission.READ_EXTERNAL_STORAGE",
  "android.permission.WRITE_EXTERNAL_STORAGE",
  "android.permission.READ_MEDIA_IMAGES",
  "android.permission.READ_MEDIA_VIDEO",
  "android.permission.READ_MEDIA_AUDIO",
];

const TOOLS_NS = "http://schemas.android.com/tools";

const withTrimmedAndroidPermissions = (config) =>
  withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults.manifest;

    // Ensure the `tools:` namespace is declared on <manifest> so tools:node works.
    manifest.$ = manifest.$ || {};
    if (!manifest.$["xmlns:tools"]) {
      manifest.$["xmlns:tools"] = TOOLS_NS;
    }

    const list =
      manifest["uses-permission"] || (manifest["uses-permission"] = []);

    for (const name of PERMISSIONS_TO_REMOVE) {
      // Drop any plain (granting) declaration of this permission.
      for (let i = list.length - 1; i >= 0; i -= 1) {
        const entry = list[i];
        if (
          entry?.$?.["android:name"] === name &&
          entry.$?.["tools:node"] !== "remove"
        ) {
          list.splice(i, 1);
        }
      }
      // Ensure exactly one merger "remove" directive for it.
      const hasRemove = list.some(
        (e) =>
          e?.$?.["android:name"] === name && e.$?.["tools:node"] === "remove",
      );
      if (!hasRemove) {
        list.push({ $: { "android:name": name, "tools:node": "remove" } });
      }
    }

    return cfg;
  });

module.exports = withTrimmedAndroidPermissions;
