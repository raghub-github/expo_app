/**
 * Android-first Zomato-style CUSTOMER_ANNOUNCEMENT tray layouts.
 *
 * Injects (survives expo prebuild / EAS):
 *   - CustomerMarketingMessagingService (subclasses ExpoFirebaseMessagingService)
 *   - MarketingNotificationRenderer (RemoteViews: banner / category_row / countdown)
 *   - layout XML resources
 *   - customer_marketing notification channel (via PushChannelBootstrap props preferred)
 *
 * Props: none required. Customer app only.
 */
const fs = require("fs");
const path = require("path");
const {
  withAndroidManifest,
  withDangerousMod,
  withAppBuildGradle,
  withMainApplication,
  AndroidConfig,
} = require("@expo/config-plugins");

const FIREBASE_MESSAGING_DEP = "com.google.firebase:firebase-messaging:24.0.1";
const EXPO_FCM_SERVICE =
  "expo.modules.notifications.service.ExpoFirebaseMessagingService";

function ensureUsesPermission(androidManifest, name) {
  const manifest = androidManifest.manifest;
  if (!manifest["uses-permission"]) manifest["uses-permission"] = [];
  const list = manifest["uses-permission"];
  if (!list.some((p) => p?.$?.["android:name"] === name)) {
    list.push({ $: { "android:name": name } });
  }
}

function ensureService(app, attrs, extra) {
  if (!app.service) app.service = [];
  const name = attrs["android:name"];
  const existing = app.service.find((s) => s?.$?.["android:name"] === name);
  if (existing) {
    existing.$ = { ...existing.$, ...attrs };
    if (extra) Object.assign(existing, extra);
    return;
  }
  app.service.push({ $: attrs, ...(extra || {}) });
}

function copyMarketingJava(androidProjectRoot, packageName) {
  const srcDir = path.join(__dirname, "android-src", "marketing");
  const destDir = path.join(
    androidProjectRoot,
    "app",
    "src",
    "main",
    "java",
    ...packageName.split(".")
  );
  fs.mkdirSync(destDir, { recursive: true });
  if (!fs.existsSync(srcDir)) return;
  for (const file of fs.readdirSync(srcDir).filter((f) => f.endsWith(".java"))) {
    let text = fs.readFileSync(path.join(srcDir, file), "utf8");
    text = text.replace(/\{\{PACKAGE\}\}/g, packageName);
    fs.writeFileSync(path.join(destDir, file), text, "utf8");
  }
}

function copyMarketingLayouts(androidProjectRoot) {
  const srcDir = path.join(__dirname, "android-res", "layout");
  const destDir = path.join(
    androidProjectRoot,
    "app",
    "src",
    "main",
    "res",
    "layout"
  );
  fs.mkdirSync(destDir, { recursive: true });
  if (!fs.existsSync(srcDir)) return;
  for (const file of fs.readdirSync(srcDir).filter((f) => f.endsWith(".xml"))) {
    fs.copyFileSync(path.join(srcDir, file), path.join(destDir, file));
  }
}

function patchMessagingService(androidManifest, packageName) {
  const app = AndroidConfig.Manifest.getMainApplicationOrThrow(androidManifest);
  const ours = `${packageName}.CustomerMarketingMessagingService`;
  if (!app.service) app.service = [];
  let replaced = false;
  for (const svc of app.service) {
    const name = svc?.$?.["android:name"];
    // Do not steal merchant/rider CriticalAlertMessagingService.
    if (
      name === EXPO_FCM_SERVICE ||
      name === ours ||
      (typeof name === "string" && name.endsWith(".ExpoFirebaseMessagingService"))
    ) {
      svc.$["android:name"] = ours;
      svc.$["android:exported"] = "false";
      replaced = true;
    }
  }
  if (!replaced) {
    ensureService(
      app,
      {
        "android:name": ours,
        "android:exported": "false",
      },
      {
        "intent-filter": [
          {
            $: { "android:priority": "100" },
            action: [{ $: { "android:name": "com.google.firebase.MESSAGING_EVENT" } }],
          },
        ],
      }
    );
  }
}

function patchAppBuildGradle(contents) {
  if (contents.includes("com.google.firebase:firebase-messaging")) return contents;
  const dep = `    implementation("${FIREBASE_MESSAGING_DEP}")`;
  const m = contents.match(/\ndependencies\s*\{/);
  if (!m || m.index == null) return contents;
  const at = m.index + m[0].length;
  return `${contents.slice(0, at)}\n${dep}${contents.slice(at)}`;
}

function patchMainApplication(src, packageName) {
  if (src.includes("MarketingNotificationPackage")) return src;
  const javaAdd = `packages.add(new ${packageName}.MarketingNotificationPackage());`;
  if (src.includes("PackageList(this).packages.apply {")) {
    return src.replace(
      "PackageList(this).packages.apply {",
      `PackageList(this).packages.apply {\n              add(${packageName}.MarketingNotificationPackage())`
    );
  }
  if (src.includes("val packages = PackageList(this).packages")) {
    return src.replace(
      "val packages = PackageList(this).packages",
      `val packages = PackageList(this).packages\n            packages.add(${packageName}.MarketingNotificationPackage())`
    );
  }
  if (src.includes("List<ReactPackage> packages = new PackageList(this).getPackages();")) {
    return src.replace(
      "List<ReactPackage> packages = new PackageList(this).getPackages();",
      `List<ReactPackage> packages = new PackageList(this).getPackages();\n      ${javaAdd}`
    );
  }
  if (src.includes("return packages;")) {
    return src.replace("return packages;", `${javaAdd}\n            return packages;`);
  }
  return src;
}

function withCustomerMarketingNotifications(config) {
  const packageFromConfig = config.android?.package;

  config = withAppBuildGradle(config, (mod) => {
    if (mod.modResults.language === "groovy") {
      mod.modResults.contents = patchAppBuildGradle(mod.modResults.contents);
    }
    return mod;
  });

  config = withDangerousMod(config, [
    "android",
    async (mod) => {
      const packageName =
        mod.android?.package || config.android?.package || packageFromConfig;
      if (!packageName) return mod;
      copyMarketingJava(mod.modRequest.platformProjectRoot, packageName);
      copyMarketingLayouts(mod.modRequest.platformProjectRoot);
      return mod;
    },
  ]);

  config = withAndroidManifest(config, (cfg) => {
    const packageName =
      cfg.android?.package || config.android?.package || packageFromConfig;
    if (!packageName) return cfg;
    ensureUsesPermission(cfg.modResults, "android.permission.POST_NOTIFICATIONS");
    ensureUsesPermission(cfg.modResults, "android.permission.INTERNET");
    patchMessagingService(cfg.modResults, packageName);
    return cfg;
  });

  config = withMainApplication(config, (mod) => {
    const packageName = config.android?.package || packageFromConfig;
    if (!packageName) return mod;
    mod.modResults.contents = patchMainApplication(mod.modResults.contents, packageName);
    return mod;
  });

  return config;
}

module.exports = withCustomerMarketingNotifications;
