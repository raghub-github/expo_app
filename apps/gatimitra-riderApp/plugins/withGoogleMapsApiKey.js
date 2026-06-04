const { withAndroidManifest } = require("@expo/config-plugins");

module.exports = function withGoogleMapsApiKey(config) {
  return withAndroidManifest(config, (config) => {
    const application = config.modResults.manifest.application?.[0];
    if (!application) return config;

    if (!application["meta-data"]) {
      application["meta-data"] = [];
    }

    const KEY_NAME = "com.google.android.geo.API_KEY";
    application["meta-data"] = application["meta-data"].filter(
      (m) => m.$?.["android:name"] !== KEY_NAME
    );

    application["meta-data"].push({
      $: {
        "android:name": KEY_NAME,
        "android:value": process.env.GOOGLE_MAPS_API_KEY || process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || "",
      },
    });

    return config;
  });
};
