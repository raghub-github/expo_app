/**
 * Native continuous-buzzer stack for Merchant + Rider critical alerts.
 *
 * Injects (survives expo prebuild / EAS):
 *   - CriticalAlertMessagingService (subclasses ExpoFirebaseMessagingService)
 *   - OrderAlertForegroundService (mediaPlayback FGS + looping MediaPlayer)
 *   - JS bridge GatimitraOrderAlert
 *   - permissions + silent ongoing channel
 *
 * Props: { role: "merchant" | "rider" }
 */
const fs = require("fs");
const path = require("path");
const {
  withAndroidManifest,
  withDangerousMod,
  withMainApplication,
  withAppBuildGradle,
  AndroidConfig,
} = require("@expo/config-plugins");

// Must match expo-notifications' own firebase-messaging version to avoid version drift.
// expo-notifications pulls firebase-messaging in as a TRANSITIVE `implementation`, so our
// app-module Java (CriticalAlertMessagingService extends ExpoFirebaseMessagingService,
// OrderAlertController uses RemoteMessage) cannot resolve com.google.firebase.messaging.*
// at compile time. Declaring it directly on the app module puts those classes on the
// compile classpath. Same version => Gradle dedupes, no conflict with expo-notifications.
const FIREBASE_MESSAGING_DEP = "com.google.firebase:firebase-messaging:24.0.1";

const EXPO_FCM_SERVICE =
  "expo.modules.notifications.service.ExpoFirebaseMessagingService";
const ONGOING_CHANNEL_ID = "order_alert_fgs_ongoing_v1";

const PERMISSIONS = [
  "android.permission.POST_NOTIFICATIONS",
  "android.permission.FOREGROUND_SERVICE",
  "android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK",
  "android.permission.WAKE_LOCK",
  "android.permission.VIBRATE",
  // Required for the call-style full-screen order/dispatch popup to launch over the
  // lock screen / while the app is killed (setFullScreenIntent). Without this the
  // alert can only appear as a heads-up notification, never the full acceptance page.
  "android.permission.USE_FULL_SCREEN_INTENT",
];

function ensureUsesPermission(androidManifest, name) {
  const manifest = androidManifest.manifest;
  if (!manifest["uses-permission"]) manifest["uses-permission"] = [];
  const list = manifest["uses-permission"];
  if (!list.some((p) => p?.$?.["android:name"] === name)) {
    list.push({ $: { "android:name": name } });
  }
}

function copyJavaSources(androidProjectRoot, packageName, role) {
  const srcDir = path.join(__dirname, "android-src");
  const destDir = path.join(
    androidProjectRoot,
    "app",
    "src",
    "main",
    "java",
    ...packageName.split(".")
  );
  fs.mkdirSync(destDir, { recursive: true });
  const files = fs.readdirSync(srcDir).filter((f) => f.endsWith(".java"));
  for (const file of files) {
    let text = fs.readFileSync(path.join(srcDir, file), "utf8");
    text = text
      .replace(/\{\{PACKAGE\}\}/g, packageName)
      .replace(/\{\{ROLE\}\}/g, role)
      .replace(/\{\{ONGOING_CHANNEL_ID\}\}/g, ONGOING_CHANNEL_ID);
    fs.writeFileSync(path.join(destDir, file), text, "utf8");
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

function ensureReceiver(app, attrs, extra) {
  if (!app.receiver) app.receiver = [];
  const name = attrs["android:name"];
  if (app.receiver.some((r) => r?.$?.["android:name"] === name)) return;
  app.receiver.push({ $: attrs, ...(extra || {}) });
}

function patchMessagingService(androidManifest, packageName) {
  const app = AndroidConfig.Manifest.getMainApplicationOrThrow(androidManifest);
  const ours = `${packageName}.CriticalAlertMessagingService`;
  if (!app.service) app.service = [];
  let replaced = false;
  for (const svc of app.service) {
    const name = svc?.$?.["android:name"];
    if (name === EXPO_FCM_SERVICE || name === ours) {
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

function patchManifest(androidManifest, packageName) {
  for (const perm of PERMISSIONS) ensureUsesPermission(androidManifest, perm);
  const app = AndroidConfig.Manifest.getMainApplicationOrThrow(androidManifest);

  ensureService(app, {
    "android:name": `${packageName}.OrderAlertForegroundService`,
    "android:exported": "false",
    "android:foregroundServiceType": "mediaPlayback",
    "android:stopWithTask": "false",
  });

  ensureReceiver(app, {
    "android:name": `${packageName}.OrderAlertStopReceiver`,
    "android:exported": "false",
  });

  patchMessagingService(androidManifest, packageName);
  return androidManifest;
}

function patchMainApplication(src, packageName) {
  if (src.includes("OrderAlertPackage")) return src;

  const kotlinAdd = `packages.add(${packageName}.OrderAlertPackage())`;
  const javaAdd = `packages.add(new ${packageName}.OrderAlertPackage());`;

  if (src.includes("PackageList(this).packages.apply {")) {
    // Inside Kotlin `apply { }`, `this` is the package list — use add(), not packages.add().
    return src.replace(
      "PackageList(this).packages.apply {",
      `PackageList(this).packages.apply {\n              add(${packageName}.OrderAlertPackage())`
    );
  }
  if (src.includes("PackageList(this).packages")) {
    if (src.includes("val packages = PackageList(this).packages")) {
      return src.replace(
        "val packages = PackageList(this).packages",
        `val packages = PackageList(this).packages\n            packages.add(${packageName}.OrderAlertPackage())`
      );
    }
    if (src.includes("List<ReactPackage> packages = new PackageList(this).getPackages();")) {
      return src.replace(
        "List<ReactPackage> packages = new PackageList(this).getPackages();",
        `List<ReactPackage> packages = new PackageList(this).getPackages();\n      ${javaAdd}`
      );
    }
  }
  if (src.includes("return packages;")) {
    return src.replace(
      "return packages;",
      `${src.includes("getPackages()") && src.includes("public") ? javaAdd : kotlinAdd}\n            return packages;`
    );
  }
  return src;
}

function patchAppBuildGradle(contents) {
  if (contents.includes("com.google.firebase:firebase-messaging")) return contents;
  const dep = `    implementation("${FIREBASE_MESSAGING_DEP}")`;
  // Insert into the app module's first (and only) top-level dependencies { } block.
  const m = contents.match(/\ndependencies\s*\{/);
  if (!m || m.index == null) return contents;
  const at = m.index + m[0].length;
  return `${contents.slice(0, at)}\n${dep}${contents.slice(at)}`;
}

function withCriticalOrderAlertFgs(config, props = {}) {
  const role = props.role === "rider" ? "rider" : "merchant";
  const packageFromConfig = config.android?.package;

  // Ensure firebase-messaging is on the app compile classpath so the injected native
  // FCM service/controller can extend ExpoFirebaseMessagingService + use RemoteMessage.
  config = withAppBuildGradle(config, (mod) => {
    if (mod.modResults.language === "groovy") {
      mod.modResults.contents = patchAppBuildGradle(mod.modResults.contents);
    }
    return mod;
  });

  config = withDangerousMod(config, [
    "android",
    async (mod) => {
      const packageName = mod.android?.package || config.android?.package || packageFromConfig;
      if (!packageName) return mod;
      copyJavaSources(mod.modRequest.platformProjectRoot, packageName, role);
      return mod;
    },
  ]);

  config = withAndroidManifest(config, (cfg) => {
    const packageName =
      cfg.android?.package ||
      config.android?.package ||
      packageFromConfig;
    if (!packageName) return cfg;
    cfg.modResults = patchManifest(cfg.modResults, packageName);
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

module.exports = withCriticalOrderAlertFgs;
