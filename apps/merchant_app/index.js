/**
 * Merchant app entry — soft Lora defaults before Expo Router loads screens.
 * Does NOT replace RN.Text (getter-only on New Architecture).
 */
require("./installDevLogFilter");
require("./lib/installGlobalTypography").installGlobalTypography();
require("./lib/installProductionErrorHandlers").installProductionErrorHandlers();
require("./pushBackgroundTask");
require("expo-router/entry");
