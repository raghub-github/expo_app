module.exports = function (api) {
  // Bust transform cache when typography plugin changes.
  api.cache.using(() => "rider-app-text-v1");

  const reanimated = require("react-native-reanimated/plugin");

  return {
    // IMPORTANT:
    // `nativewind/babel` is a *preset* (it returns `{ plugins: [...] }`), not a plugin.
    presets: ["babel-preset-expo", "nativewind/babel"],
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
