const { withMainActivity, withAppDelegate } = require("@expo/config-plugins");

/**
 * Disable React Native's native FPS / performance overlay in debug, preview,
 * and production native builds. Expo Go cannot be patched; JS disableFpsOverlay.js
 * covers that path.
 */
function injectAndroid(src) {
  if (src.includes("gatimitraDisableFpsOverlay")) return src;
  const kotlinSnippet = `
    // gatimitraDisableFpsOverlay — never show RN DevSupport FPS HUD
    try {
      android.preference.PreferenceManager.getDefaultSharedPreferences(this)
        .edit()
        .putBoolean("fps_debug", false)
        .apply()
    } catch (_: Throwable) {}
`;
  const javaSnippet = `
    // gatimitraDisableFpsOverlay — never show RN DevSupport FPS HUD
    try {
      android.preference.PreferenceManager.getDefaultSharedPreferences(this)
        .edit()
        .putBoolean("fps_debug", false)
        .apply();
    } catch (Throwable ignored) {}
`;
  if (/override fun onCreate\(/.test(src)) {
    return src.replace(/override fun onCreate\([^)]*\)\s*\{/, (m) => `${m}\n${kotlinSnippet}`);
  }
  if (/void onCreate\(/.test(src)) {
    return src.replace(/protected void onCreate\([^)]*\)\s*\{/, (m) => `${m}\n${javaSnippet}`);
  }
  return src;
}

function injectIos(src, language) {
  if (src.includes("gatimitraDisableFpsOverlay")) return src;
  const isSwift = language === "swift" || src.includes("func application(");
  if (isSwift) {
    const snippet = `
    // gatimitraDisableFpsOverlay — never show RN PerfMonitor HUD
    UserDefaults.standard.set(false, forKey: "fps_debug")
    UserDefaults.standard.set(false, forKey: "isPerfMonitorShown")
    if let bundleId = Bundle.main.bundleIdentifier {
      UserDefaults(suiteName: "org.reactjs.native.RCTDevSettings.\\(bundleId)")?.set(false, forKey: "isPerfMonitorShown")
      UserDefaults(suiteName: "org.reactjs.native.RCTDevSettings.\\(bundleId)")?.set(false, forKey: "fps_debug")
    }
`;
    if (src.includes("didFinishLaunchingWithOptions")) {
      return src.replace(
        /didFinishLaunchingWithOptions[^{]*\{/,
        (m) => `${m}\n${snippet}`
      );
    }
    return src;
  }
  const objcSnippet = `
  // gatimitraDisableFpsOverlay — never show RN PerfMonitor HUD
  [[NSUserDefaults standardUserDefaults] setBool:NO forKey:@"fps_debug"];
  [[NSUserDefaults standardUserDefaults] setBool:NO forKey:@"isPerfMonitorShown"];
  NSString *bundleId = [[NSBundle mainBundle] bundleIdentifier];
  if (bundleId.length) {
    NSString *suite = [NSString stringWithFormat:@"org.reactjs.native.RCTDevSettings.%@", bundleId];
    [[NSUserDefaults alloc] initWithSuiteName:suite];
    [[[NSUserDefaults alloc] initWithSuiteName:suite] setBool:NO forKey:@"isPerfMonitorShown"];
    [[[NSUserDefaults alloc] initWithSuiteName:suite] setBool:NO forKey:@"fps_debug"];
  }
`;
  return src.replace(
    /didFinishLaunchingWithOptions[^{]*\{/,
    (m) => `${m}\n${objcSnippet}`
  );
}

function withDisableFpsOverlay(config) {
  config = withMainActivity(config, (cfg) => {
    cfg.modResults.contents = injectAndroid(cfg.modResults.contents);
    return cfg;
  });
  config = withAppDelegate(config, (cfg) => {
    const language = cfg.modResults.language;
    cfg.modResults.contents = injectIos(cfg.modResults.contents, language);
    return cfg;
  });
  return config;
}

module.exports = withDisableFpsOverlay;
