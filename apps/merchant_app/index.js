/**
 * Merchant app entry — soft Lora defaults before Expo Router loads screens.
 * Does NOT replace RN.Text (getter-only on New Architecture).
 */
require("./lib/installGlobalTypography").installGlobalTypography();
require("expo-router/entry");
