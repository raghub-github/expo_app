/**
 * Expo SDK 54 Android templates read `android.enableMinifyInReleaseBuilds`
 * (not only the legacy `android.enableProguardInReleaseBuilds` property).
 * Shrink resources requires minify — without this, release builds fail.
 */
const { withGradleProperties } = require("@expo/config-plugins");

function upsertProp(props, key, value) {
  const i = props.findIndex((p) => p.type === "property" && p.key === key);
  if (i >= 0) {
    props[i] = { type: "property", key, value };
  } else {
    props.push({ type: "property", key, value });
  }
}

module.exports = function withAndroidMinifyRelease(config) {
  return withGradleProperties(config, (cfg) => {
    upsertProp(cfg.modResults, "android.enableMinifyInReleaseBuilds", "true");
    upsertProp(cfg.modResults, "android.enableProguardInReleaseBuilds", "true");
    upsertProp(cfg.modResults, "android.enableShrinkResourcesInReleaseBuilds", "true");
    return cfg;
  });
};
