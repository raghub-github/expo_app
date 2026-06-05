const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

/** Monorepo root (…/expo_app) so workspace packages like @gatimitra/expo-push-kit resolve. */
const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];
config.resolver.disableHierarchicalLookup = true;

const { withExpoPlatformFallback } = require("./metro.expo-platform-fallback");
withExpoPlatformFallback(config);

module.exports = config;
