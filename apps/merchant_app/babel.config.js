module.exports = function (api) {
  // Bust transform cache when typography plugin changes.
  api.cache.using(() => "merchant-app-text-v3");
  return {
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
      "react-native-reanimated/plugin",
    ],
  };
};
