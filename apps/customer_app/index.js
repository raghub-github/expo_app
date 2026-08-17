/**
 * Customer app entry — register the background notification task before Router.
 */
require("./installDevLogFilter");
require("./pushBackgroundTask");
require("expo-router/entry");
