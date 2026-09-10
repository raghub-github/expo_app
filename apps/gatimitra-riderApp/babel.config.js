module.exports = function (api) {
  // Bust transform cache when NativeWind wrap-jsx is removed (fixes Display-size zoom width).
  api.cache.using(() => "rider-app-text-v2-no-nativewind");

  const reanimated = require("react-native-reanimated/plugin");

  return {
    // Do NOT enable nativewind/babel — it rewrites every JSX node through css-interop and
    // breaks full-bleed layout when Android Display size / font zoom changes.
    // Rider UI is StyleSheet-first; legacy className screens were converted.
    presets: ["babel-preset-expo"],
    plugins: [
      [
        "module-resolver",
        {
          root: ["."],
          alias: {
            "react-native-device-info": "./react-native-device-info.js",
            "@": ".",
          },
        },
      ],
      // Lora letters + Poppins digits on every `Text` import from react-native
      require("./babel-plugin-app-text"),
      // Must be last.
      reanimated,
    ],
  };
};
