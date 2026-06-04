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

function rewriteLegacyMapbikeAssetRequest(req) {
  const url = req.url || "";
  if (!url.includes("/assets")) return;
  try {
    const decoded = decodeURIComponent(url);
    if (!decoded.includes("assets/images/mapbike.png")) return;
    req.url = url
      .replace(/assets%2Fimages%2Fmapbike\.png/gi, "public%2Fimg%2Fmapbike.png")
      .replace(/assets\/images\/mapbike\.png/gi, "public/img/mapbike.png");
  } catch {
    /* ignore malformed URLs */
  }
}

/** @param {import('expo/metro-config').MetroConfig} config */
function withExpoPlatformFallback(config) {
  const previous = config.server?.enhanceMiddleware;
  config.server = {
    ...config.server,
    enhanceMiddleware: (middleware, server) => {
      const chain = previous ? previous(middleware, server) : middleware;
      return (req, res, next) => {
        rewriteLegacyMapbikeAssetRequest(req);
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
