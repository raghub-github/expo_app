/**
 * Extends app.json with expo-notifications and EAS project id for push tokens.
 * Set EAS_PROJECT_ID or EXPO_PUBLIC_EAS_PROJECT_ID for dev builds / production.
 */
const appJson = require("./app.json");

module.exports = {
  ...appJson,
  expo: {
    ...appJson.expo,
    plugins: [
      ...(appJson.expo.plugins || []),
      [
        "expo-notifications",
        {
          icon: "./public/img/fav.png",
          color: "#14b8a6",
          defaultChannel: "customer_default",
        },
      ],
    ],
    extra: {
      ...(appJson.expo.extra || {}),
      eas: {
        projectId:
          process.env.EAS_PROJECT_ID || process.env.EXPO_PUBLIC_EAS_PROJECT_ID || undefined,
      },
    },
  },
};
