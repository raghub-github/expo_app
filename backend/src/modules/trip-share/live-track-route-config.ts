import { getEnv } from "../../config/env.js";

/** Helmet override — global CSP blocks inline scripts and Mapbox CDN on public track pages. */
export function liveTrackPageRouteConfig() {
  const isProd = getEnv().NODE_ENV === "production";
  const apiBase = getEnv().API_BASE_URL?.replace(/\/+$/, "") ?? "";
  const imgSrc = ["'self'", "data:", "blob:", "https://*.mapbox.com", "https://api.mapbox.com"];
  if (apiBase) imgSrc.push(apiBase);
  return {
    helmet: {
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'", "https://api.mapbox.com"],
          styleSrc: ["'self'", "'unsafe-inline'", "https://api.mapbox.com"],
          imgSrc,
          connectSrc: [
            "'self'",
            "https://api.mapbox.com",
            "https://*.mapbox.com",
            "https://*.tiles.mapbox.com",
            "https://events.mapbox.com",
          ],
          fontSrc: ["'self'", "data:", "https://api.mapbox.com", "https://*.mapbox.com"],
          workerSrc: ["'self'", "blob:"],
          childSrc: ["blob:"],
          // Allow http:// LAN URLs during local dev (global helmet enables upgrade-insecure-requests).
          upgradeInsecureRequests: isProd ? [] : null,
        },
      },
    },
  };
}
