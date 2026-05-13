const { withAndroidManifest } = require("@expo/config-plugins");

/**
 * Adds Android <queries> entries required for UPI Intent on Android 11+.
 *
 * Without these, the Razorpay native SDK cannot discover installed UPI apps
 * (GPay, PhonePe, Paytm, BHIM) due to Android package visibility restrictions.
 * react-native-razorpay calls PackageManager.queryIntentActivities() at checkout
 * time; if the queries are absent the list comes back empty and only the
 * "UPI Collect" (enter VPA manually) fallback renders — GPay/PhonePe tiles
 * never appear.
 *
 * References:
 *  - Android package visibility: https://developer.android.com/training/package-visibility
 *  - Razorpay UPI Intent docs:   https://razorpay.com/docs/payments/payment-methods/upi/
 */
module.exports = function withAndroidUpiQueries(config) {
  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults.manifest;

    if (!manifest.queries) {
      manifest.queries = [];
    }

    // Guard: skip if we already injected the UPI queries block.
    const alreadyAdded = manifest.queries.some((q) =>
      Array.isArray(q.intent) &&
      q.intent.some((i) =>
        Array.isArray(i.data) &&
        i.data.some((d) => d.$?.["android:scheme"] === "upi")
      )
    );
    if (alreadyAdded) return config;

    manifest.queries.push({
      // Intent filter: any app that handles upi://pay URIs
      intent: [
        {
          action: [{ $: { "android:name": "android.intent.action.VIEW" } }],
          data: [{ $: { "android:scheme": "upi", "android:host": "pay" } }],
        },
      ],
      // Explicit package declarations for the major Indian UPI apps
      package: [
        { $: { "android:name": "com.google.android.apps.nbu.paisa.user" } }, // Google Pay
        { $: { "android:name": "net.one97.paytm" } },                        // Paytm
        { $: { "android:name": "com.phonepe.app" } },                        // PhonePe
        { $: { "android:name": "in.org.npci.upiapp" } },                     // BHIM
        { $: { "android:name": "com.freecharge.android" } },                 // Freecharge
        { $: { "android:name": "com.amazon.mShop.android.shopping" } },      // Amazon Pay
        { $: { "android:name": "com.myairtelapp" } },                        // Airtel Money
      ],
    });

    return config;
  });
};
