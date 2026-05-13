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
        // EAS project: https://expo.dev/accounts/raghubhunia/projects/gatimitra-customer
        // Hardcoded fallback so EAS CLI can find the project without an env var,
        // but env override still wins so CI / different environments can swap.
        projectId:
          process.env.EAS_PROJECT_ID ||
          process.env.EXPO_PUBLIC_EAS_PROJECT_ID ||
          "53fb1df5-d522-4e6a-bc73-04b7ad260992",
      },
    },
    // Required for development builds — links the runtime to your EAS project.
    owner: "raghubhunia",
  },
};
