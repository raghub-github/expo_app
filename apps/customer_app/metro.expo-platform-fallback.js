/**
 * Expo's /_expo/loading and /_expo/link routes require a platform query param or header.
 * Desktop browsers (and reload tooling) often omit it — inject a sensible default.
 */
function platformFromUserAgent(userAgent) {
  const ua = String(userAgent || "");
  if (/Android|OculusBrowser|Quest/i.test(ua)) return "android";
  if (/iPhone|iPad/i.test(ua)) return "ios";
  return null;
}

function requestNeedsPlatformFallback(req) {
  const url = req.url || "";
  if (!url.startsWith("/_expo/loading") && !url.startsWith("/_expo/link")) {
    return false;
  }
  if (url.includes("platform=")) return false;
  if (req.headers["expo-platform"] || req.headers["exponent-platform"]) return false;
  return true;
}

function withExpoPlatformFallback(config) {
  const previous = config.server?.enhanceMiddleware;
  config.server = {
    ...config.server,
    enhanceMiddleware: (middleware, server) => {
      const chain = previous ? previous(middleware, server) : middleware;
      return (req, res, next) => {
        if (requestNeedsPlatformFallback(req)) {
          const platform =
            platformFromUserAgent(req.headers["user-agent"]) ||
            process.env.EXPO_DEV_PLATFORM ||
            "android";
          const url = req.url || "";
          const sep = url.includes("?") ? "&" : "?";
          req.url = `${url}${sep}platform=${encodeURIComponent(platform)}`;
        }
        return chain(req, res, next);
      };
    },
  };
  return config;
}

module.exports = { withExpoPlatformFallback };
