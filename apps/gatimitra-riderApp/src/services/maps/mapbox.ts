/**
 * Mapbox integration for GatiMitra Rider App
 * 
 * React Native Metro bundler automatically resolves platform-specific files:
 * - On native (iOS/Android): imports from mapbox.native.ts
 * - On web: imports from mapbox.web.ts
 * 
 * This file provides a fallback for TypeScript imports.
 * The actual resolution happens at build time by Metro.
 */

import { Platform } from "react-native";

// Conditional exports based on platform
if (Platform.OS === "web") {
  // @ts-ignore - Metro will resolve this correctly
  module.exports = require("./mapbox.web");
} else {
  // @ts-ignore - Metro will resolve this correctly  
  module.exports = require("./mapbox.native");
}
