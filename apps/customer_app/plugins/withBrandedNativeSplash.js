/**
 * Show the approved full-bleed GatiMitra splash (Lora wordmark + tagline) during cold start.
 *
 * Root cause this fixes:
 *  - Android 12+ SplashScreen API only allows a color + circular icon.
 *  - expo-splash-screen holds that splash (keepSplashScreenOnScreen=true) until JS
 *    calls hideAsync — previously a solid-mint frame for ~10s while the bundle booted.
 *  - Branding must stay native-only until Home — do not remount splash-brand in JS.
 *
 * This plugin:
 *  1. Installs splash-brand.png as a drawable + layer-list windowBackground.
 *  2. Sets AppTheme (and SplashScreen theme) windowBackground to that brand art.
 *  3. Forces SplashScreenManager.hide() immediately after register so the mint A12
 *     icon splash does not sit while JS boots — the brand drawable is visible
 *     underneath until React paints the same asset.
 *
 * Keeps expo-splash-screen's solid-mint animated icon (no tiny circular wordmark).
 */
const fs = require("fs");
const path = require("path");
const {
  withDangerousMod,
  withAndroidStyles,
  withMainActivity,
  AndroidConfig,
} = require("@expo/config-plugins");

const BRAND_DRAWABLE = "splash_brand_full";
const BRAND_LAYER = "splash_brand_background";
const BRAND_SRC_REL = "assets/images/splash-brand.png";
const HIDE_MARKER = "GmBrandedSplashHide";

function copyBrandDrawable(androidProjectRoot, projectRoot) {
  const src = path.join(projectRoot, BRAND_SRC_REL);
  if (!fs.existsSync(src)) {
    console.warn(`[withBrandedNativeSplash] missing ${BRAND_SRC_REL}`);
    return false;
  }

  const nodpiDir = path.join(
    androidProjectRoot,
    "app",
    "src",
    "main",
    "res",
    "drawable-nodpi"
  );
  fs.mkdirSync(nodpiDir, { recursive: true });
  fs.copyFileSync(src, path.join(nodpiDir, `${BRAND_DRAWABLE}.png`));

  const drawableDir = path.join(
    androidProjectRoot,
    "app",
    "src",
    "main",
    "res",
    "drawable"
  );
  fs.mkdirSync(drawableDir, { recursive: true });
  // Mint base + full-bleed brand bitmap so letterboxing never flashes a non-brand color.
  const layerList = `<?xml version="1.0" encoding="utf-8"?>
<layer-list xmlns:android="http://schemas.android.com/apk/res/android">
    <item android:drawable="@color/splashscreen_background"/>
    <item>
        <bitmap
            android:gravity="fill"
            android:src="@drawable/${BRAND_DRAWABLE}"/>
    </item>
</layer-list>
`;
  fs.writeFileSync(path.join(drawableDir, `${BRAND_LAYER}.xml`), layerList);
  return true;
}

function assignStyleItem(styles, parentName, itemName, value) {
  return AndroidConfig.Styles.assignStylesValue(styles, {
    add: true,
    parent: { name: parentName },
    name: itemName,
    value,
  });
}

function withBrandedNativeSplash(config) {
  config = withDangerousMod(config, [
    "android",
    async (mod) => {
      copyBrandDrawable(
        mod.modRequest.platformProjectRoot,
        mod.modRequest.projectRoot
      );
      return mod;
    },
  ]);

  config = withAndroidStyles(config, (mod) => {
    let styles = mod.modResults;
    const brandBg = `@drawable/${BRAND_LAYER}`;

    // Full-bleed brand behind React until JS splash mounts (and after A12 splash exits).
    styles = assignStyleItem(
      styles,
      "AppTheme",
      "android:windowBackground",
      brandBg
    );

    // Pre-Android 12 / compat paths that still honor the splash theme windowBackground.
    styles = assignStyleItem(
      styles,
      "Theme.App.SplashScreen",
      "android:windowBackground",
      brandBg
    );

    // Instant exit feel — brand is already the windowBackground underneath.
    styles = assignStyleItem(
      styles,
      "Theme.App.SplashScreen",
      "windowSplashScreenAnimationDuration",
      "0"
    );

    mod.modResults = styles;
    return mod;
  });

  config = withMainActivity(config, (mod) => {
    let src = mod.modResults.contents;
    let changed = false;

    const kotlinMarker = "SplashScreenManager.registerOnActivity(this)";
    const javaMarker = "SplashScreenManager.registerOnActivity(this);";

    if (!src.includes(HIDE_MARKER)) {
      const kotlinInject = `${kotlinMarker}
    // ${HIDE_MARKER}: reveal full-bleed brand windowBackground while JS boots
    SplashScreenManager.hide()`;
      const javaInject = `${javaMarker}
    // ${HIDE_MARKER}: reveal full-bleed brand windowBackground while JS boots
    SplashScreenManager.hide();`;

      if (src.includes(javaMarker)) {
        src = src.replace(javaMarker, javaInject);
        changed = true;
      } else if (src.includes(kotlinMarker)) {
        src = src.replace(kotlinMarker, kotlinInject);
        changed = true;
      } else {
        console.warn(
          "[withBrandedNativeSplash] SplashScreenManager.registerOnActivity not found — skip hide inject"
        );
      }
    }

    // Ensure View import + post-super brand background so ReactRootView never
    // covers the launch window with a blank mint fill during JS boot.
    if (src.includes("super.onCreate(null)") && !src.includes("splash_brand_background")) {
      if (!src.includes("import android.view.View")) {
        src = src.replace(
          "import android.os.Bundle",
          "import android.os.Bundle\nimport android.view.View"
        );
      }
      src = src.replace(
        "super.onCreate(null)",
        `super.onCreate(null)
    // ${HIDE_MARKER}Bg: keep splash-brand under React until JS paints the same asset
    window?.setBackgroundDrawableResource(R.drawable.splash_brand_background)
    findViewById<View>(android.R.id.content)?.setBackgroundResource(R.drawable.splash_brand_background)`
      );
      changed = true;
    }

    if (changed) {
      mod.modResults.contents = src;
    }
    return mod;
  });

  return config;
}

module.exports = withBrandedNativeSplash;
