const { withAndroidManifest } = require("@expo/config-plugins");

/**
 * Adds Android <queries> for UPI Intent (GPay / PhonePe / Paytm / BHIM) so
 * react-native-razorpay can discover installed UPI apps on Android 11+.
 */
module.exports = function withAndroidUpiQueries(config) {
  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults.manifest;

    if (!manifest.queries) {
      manifest.queries = [];
    }

    const alreadyAdded = manifest.queries.some(
      (q) =>
        Array.isArray(q.intent) &&
        q.intent.some(
          (i) =>
            Array.isArray(i.data) &&
            i.data.some((d) => d.$?.["android:scheme"] === "upi")
        )
    );
    if (alreadyAdded) return config;

    manifest.queries.push({
      intent: [
        {
          action: [{ $: { "android:name": "android.intent.action.VIEW" } }],
          data: [{ $: { "android:scheme": "upi", "android:host": "pay" } }],
        },
      ],
      package: [
        { $: { "android:name": "com.google.android.apps.nbu.paisa.user" } },
        { $: { "android:name": "net.one97.paytm" } },
        { $: { "android:name": "com.phonepe.app" } },
        { $: { "android:name": "in.org.npci.upiapp" } },
        { $: { "android:name": "com.freecharge.android" } },
        { $: { "android:name": "com.amazon.mShop.android.shopping" } },
        { $: { "android:name": "com.myairtelapp" } },
      ],
    });

    return config;
  });
};
