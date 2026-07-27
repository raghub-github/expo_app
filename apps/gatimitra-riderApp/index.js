/**
 * Rider app entry — register background GPS task before Expo Router loads.
 */
require("./lib/installGlobalTypography").installGlobalTypography();
require("./src/services/location/riderBackgroundLocationTask");
require("expo-router/entry");
