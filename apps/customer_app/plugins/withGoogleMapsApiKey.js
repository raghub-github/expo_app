const { withAndroidManifest } = require("@expo/config-plugins");

/**
 * Injects the Google Maps API key into AndroidManifest.xml.
 *
 * react-native-maps 1.20.x ships no app.plugin.js, so we manage the
 * <meta-data android:name="com.google.android.geo.API_KEY"> entry here.
 *
 * Usage in app.json:
 *   "./plugins/withGoogleMapsApiKey"
 *
 * Set the real key as an EAS secret:
 *   eas secret:create --scope project --name GOOGLE_MAPS_API_KEY --value "AIza..."
 *
 * Without a key the meta-data value is empty (""). Maps tiles will show
 * the "For development purposes only" watermark but the app will NOT crash.
 */
module.exports = function withGoogleMapsApiKey(config) {
  return withAndroidManifest(config, (config) => {
    const application = config.modResults.manifest.application?.[0];
    if (!application) return config;

    if (!application["meta-data"]) {
      application["meta-data"] = [];
    }

    const KEY_NAME = "com.google.android.geo.API_KEY";

    // Idempotent: remove existing entry then re-add with current value.
    application["meta-data"] = application["meta-data"].filter(
      (m) => m.$?.["android:name"] !== KEY_NAME
    );

    application["meta-data"].push({
      $: {
        "android:name": KEY_NAME,
        "android:value": process.env.GOOGLE_MAPS_API_KEY || "",
      },
    });

    return config;
  });
};
