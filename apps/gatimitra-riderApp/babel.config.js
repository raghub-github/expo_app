module.exports = function (api) {
  api.cache(true);

  const reanimated = require("react-native-reanimated/plugin");

  return {
    // IMPORTANT:
    // `nativewind/babel` is a *preset* (it returns `{ plugins: [...] }`), not a plugin.
    presets: ["babel-preset-expo", "nativewind/babel"],
    plugins: [
      // Must be last.
      reanimated,
    ],
  };
};


