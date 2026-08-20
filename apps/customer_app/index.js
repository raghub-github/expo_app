/**
 * Customer app entry — disable FPS overlay, then register background tasks before Router.
 */
require("./disableFpsOverlay");
require("./installDevLogFilter");
require("./pushBackgroundTask");
require("expo-router/entry");
