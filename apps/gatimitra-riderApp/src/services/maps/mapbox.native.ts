/**
 * Mapbox integration for GatiMitra Rider App (Native platforms only)
 * This file is only loaded on iOS/Android, not on web
 */

import { getRiderAppConfig } from "../../config/env";

let initialized = false;
let isAvailable = false;

export function initializeMapbox() {
  if (initialized) return isAvailable;

  const cfg = getRiderAppConfig();
  const token = cfg.mapboxToken;

  // Debug: Log token status
  console.log("[Mapbox] Initialization check:", {
    hasToken: !!token,
    tokenLength: token?.length || 0,
    tokenPrefix: token?.substring(0, 15) || "N/A",
    envVar: process.env.EXPO_PUBLIC_MAPBOX_PUBLIC_TOKEN ? "SET" : "NOT SET",
  });

  if (!token) {
    console.error("[Mapbox] ❌ Token not configured!");
    console.error("[Mapbox] Please set EXPO_PUBLIC_MAPBOX_PUBLIC_TOKEN in apps/gatimitra-riderApp/.env file");
    console.error("[Mapbox] Example: EXPO_PUBLIC_MAPBOX_PUBLIC_TOKEN=pk.eyJ1Ijo...");
    initialized = true;
    return false;
  }

  // Validate token format (should start with pk. for public tokens)
  if (!token.startsWith("pk.")) {
    console.warn("[Mapbox] ⚠️ Token format appears invalid. Public tokens should start with 'pk.'");
  }

  try {
    // Try to require the Mapbox module - handle different export patterns
    let MapboxModule;
    let Mapbox;
    
    try {
      // The require might throw immediately if native code is not available
      MapboxModule = require("@rnmapbox/maps");
    } catch (requireError: any) {
      // The error might be thrown during require() if native code is missing
      const errorMsg = requireError?.message || "";
      const errorString = String(requireError);
      const errorStack = requireError?.stack || "";
      
      // Check if this is the "native code not available" error (Expo Go)
      const isNativeCodeError = 
        errorMsg.includes("native code not available") || 
        errorString.includes("native code not available") ||
        errorStack.includes("native code not available") ||
        errorMsg.includes("RNMBXModule") ||
        errorString.includes("RNMBXModule") ||
        errorStack.includes("RNMBXModule");
      
      if (isNativeCodeError) {
        // This is expected in Expo Go - don't throw, just return false silently
        // The error message is already logged by the module itself
        initialized = true;
        isAvailable = false;
        return false;
      }
      
      // For other errors, re-throw
      throw requireError;
    }
    
    // If we got here, the module loaded - now check its structure
    if (!MapboxModule) {
      initialized = true;
      isAvailable = false;
      return false;
    }
    
    // Try different ways to access the module
    if (MapboxModule.default && typeof MapboxModule.default.setAccessToken === "function") {
      Mapbox = MapboxModule.default;
    } else if (typeof MapboxModule.setAccessToken === "function") {
      // Module exports setAccessToken directly
      Mapbox = MapboxModule;
    } else if (MapboxModule.Mapbox && typeof MapboxModule.Mapbox.setAccessToken === "function") {
      // Nested export
      Mapbox = MapboxModule.Mapbox;
    } else {
      // Log what we got for debugging
      console.error("[Mapbox] Module structure:", {
        hasDefault: !!MapboxModule.default,
        hasSetAccessToken: typeof MapboxModule.setAccessToken,
        hasMapbox: !!MapboxModule.Mapbox,
        keys: Object.keys(MapboxModule).slice(0, 10),
      });
      initialized = true;
      isAvailable = false;
      return false;
    }

    if (!Mapbox || typeof Mapbox.setAccessToken !== "function") {
      console.error("[Mapbox] Mapbox module is invalid. setAccessToken not found.");
      console.error("[Mapbox] Module structure:", Object.keys(MapboxModule || {}));
      throw new Error("Invalid Mapbox module - setAccessToken function not found");
    }

    // Set the access token
    Mapbox.setAccessToken(token);
    initialized = true;
    isAvailable = true;
    console.log("[Mapbox] ✅ Successfully initialized with token (length:", token.length, ")");
    return true;
  } catch (error: any) {
    const errorMsg = error?.message || String(error);
    console.error("[Mapbox] ❌ Initialization failed:", errorMsg);
    
    // Don't spam warnings if we already logged the error
    if (!errorMsg.includes("development build")) {
      console.warn("[Mapbox] Native code not available. Using fallback UI.");
      console.warn("[Mapbox] Build a development build for full map support.");
    }
    
    initialized = true;
    isAvailable = false;
    return false;
  }
}

export function isMapboxAvailable(): boolean {
  if (!initialized) {
    initializeMapbox();
  }
  return isAvailable;
}

export function getMapboxModule() {
  if (!isMapboxAvailable()) {
    // Don't spam warnings - only log once
    return null;
  }
  try {
    const mapboxModule = require("@rnmapbox/maps");
    
    // Handle different export patterns
    let mapbox = mapboxModule;
    if (mapboxModule.default) {
      mapbox = mapboxModule.default;
    } else if (mapboxModule.Mapbox) {
      mapbox = mapboxModule.Mapbox;
    }
    
    if (!mapbox || !mapbox.MapView) {
      console.error("[Mapbox] Mapbox module loaded but MapView is missing");
      console.error("[Mapbox] Available exports:", Object.keys(mapboxModule || {}));
      return null;
    }
    return mapbox;
  } catch (error: any) {
    const errorMsg = error?.message || String(error);
    // Only log if it's a new error (not the native code error we already logged)
    if (!errorMsg.includes("native code not available")) {
      console.error("[Mapbox] Failed to get Mapbox module:", errorMsg);
    }
    return null;
  }
}

