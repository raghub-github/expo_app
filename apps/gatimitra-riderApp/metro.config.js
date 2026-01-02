// Learn more https://docs.expo.io/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// Configure resolver to handle mapbox-gl imports on web
const defaultResolver = config.resolver.resolveRequest;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  // Ignore mapbox-gl imports on web (they're not needed for React Native web)
  if (platform === 'web') {
    if (moduleName && (
      moduleName.includes('mapbox-gl') ||
      moduleName.includes('@rnmapbox/maps/lib/module/web')
    )) {
      return {
        type: 'empty',
      };
    }
  }
  
  // Ignore mapbox-gl CSS imports (they're not needed for React Native)
  if (moduleName && moduleName.includes('mapbox-gl/dist/mapbox-gl.css')) {
    return {
      type: 'empty',
    };
  }
  
  // Use default resolver for everything else
  if (defaultResolver) {
    return defaultResolver(context, moduleName, platform);
  }
  
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
