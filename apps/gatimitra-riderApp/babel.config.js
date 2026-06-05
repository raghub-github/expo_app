module.exports = function (api) {
  // Persistent Babel cache in dev breaks Fast Refresh after refactors (e.g. removed imports).
  api.cache(() => process.env.NODE_ENV === "production");

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


