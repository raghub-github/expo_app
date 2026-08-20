/**
 * Rider app entry — register background GPS task before Expo Router loads.
 */
require("./installDevLogFilter");
require("./lib/installGlobalTypography").installGlobalTypography();
require("./src/services/location/riderBackgroundLocationTask");
require("./pushBackgroundTask");
require("expo-router/entry");
