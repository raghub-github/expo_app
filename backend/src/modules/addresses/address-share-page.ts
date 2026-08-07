/**
 * WhatsApp-friendly landing page for shared delivery addresses.
 * Open Graph tags power the Zomato-style link preview card (logo + title + description).
 */

import {
  buildAddressShareOgImageUrl,
  buildAddressShareUrl,
} from "../../lib/address-share.js";
import { getAddressShareForLandingPage } from "../../lib/address-share.js";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttr(s: string): string {
  return escapeHtml(s).replace(/'/g, "&#39;");
}

export function buildAddressSharePageHtml(args: {
  shortCode: string;
  token: string;
  fullAddress?: string;
}): string {
  const { shortCode, token } = args;
  const appUrl = `gatimitra://address/save?id=${encodeURIComponent(token)}`;
  const androidPackage = "com.gatimitra.customer";
  const pageUrl = buildAddressShareUrl(shortCode, token);
  const httpsPath = `/addr/${shortCode}?id=${encodeURIComponent(token)}`;
  const androidIntentUrl =
    `intent://gatimitra.com${httpsPath}#Intent;scheme=https;package=${androidPackage};` +
    `S.browser_fallback_url=${encodeURIComponent(
      `https://play.google.com/store/apps/details?id=${androidPackage}&referrer=${encodeURIComponent(`addr_${token}`)}`
    )};end`;
  // Carry the token as the Play install referrer so the app can resume the
  // deep link after a fresh install (deferred deep linking via the Play
  // Install Referrer API — see native follow-up).
  const playStoreUrl =
    `https://play.google.com/store/apps/details?id=${androidPackage}` +
    `&referrer=${encodeURIComponent(`addr_${token}`)}`;
  const ogImage = buildAddressShareOgImageUrl();
  const ogTitle = "GatiMitra";
  const ogDescription = "Share your GatiMitra address";
  const bodyAddress = args.fullAddress?.trim() || ogDescription;

  return `<!DOCTYPE html>
<html lang="en" prefix="og: https://ogp.me/ns#">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(ogTitle)}</title>
  <link rel="canonical" href="${escapeAttr(pageUrl)}" />
  <meta name="description" content="${escapeAttr(ogDescription)}" />
  <meta property="og:type" content="website" />
  <meta property="og:url" content="${escapeAttr(pageUrl)}" />
  <meta property="og:title" content="${escapeAttr(ogTitle)}" />
  <meta property="og:description" content="${escapeAttr(ogDescription)}" />
  <meta property="og:site_name" content="GatiMitra" />
  <meta property="og:image" content="${escapeAttr(ogImage)}" />
  <meta property="og:image:secure_url" content="${escapeAttr(ogImage)}" />
  <meta property="og:image:type" content="image/png" />
  <meta property="og:image:width" content="512" />
  <meta property="og:image:height" content="512" />
  <meta property="og:image:alt" content="GatiMitra" />
  <meta name="twitter:card" content="summary" />
  <meta name="twitter:title" content="${escapeAttr(ogTitle)}" />
  <meta name="twitter:description" content="${escapeAttr(ogDescription)}" />
  <meta name="twitter:image" content="${escapeAttr(ogImage)}" />
  <style>
    body { font-family: system-ui, -apple-system, sans-serif; margin: 0; background: #f8fafc; color: #0f172a; }
    .wrap { max-width: 420px; margin: 0 auto; padding: 32px 20px; }
    .card { background: #fff; border-radius: 16px; padding: 24px; box-shadow: 0 8px 30px rgba(15,23,42,.08); }
    .brand-row { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; }
    .brand-logo { width: 44px; height: 44px; border-radius: 10px; }
    .brand { color: #14b8a6; font-weight: 700; font-size: 20px; }
    .desc { color: #64748b; margin-bottom: 20px; line-height: 1.5; white-space: pre-wrap; }
    .btn { display: block; width: 100%; text-align: center; background: #14b8a6; color: #fff; text-decoration: none;
      padding: 14px 16px; border-radius: 12px; font-weight: 600; border: 0; font-size: 16px; cursor: pointer; }
    .note { margin-top: 16px; font-size: 13px; color: #94a3b8; line-height: 1.45; }
    #status { margin-top: 12px; font-size: 14px; color: #64748b; min-height: 20px; }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="card">
      <div class="brand-row">
        <img class="brand-logo" src="/addr/og-logo.png" alt="GatiMitra" width="44" height="44" />
        <div class="brand">GatiMitra</div>
      </div>
      <div class="desc">${escapeHtml(bodyAddress)}</div>
      <button class="btn" id="openApp" type="button">Open in GatiMitra app</button>
      <div id="status"></div>
      <p class="note">This is a one-time link and is valid for the next 24 hours only.</p>
    </div>
  </div>
  <script>
    (function () {
      var appUrl = ${JSON.stringify(appUrl)};
      var androidIntentUrl = ${JSON.stringify(androidIntentUrl)};
      var playStoreUrl = ${JSON.stringify(playStoreUrl)};
      var isAndroid = /Android/i.test(navigator.userAgent);
      var isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
      function openApp() {
        document.getElementById('status').textContent = 'Opening GatiMitra…';
        if (isAndroid) {
          // Prefer verified App Links; intent:// opens the installed app directly
          // when domain verification is still pending on the device.
          window.location.href = androidIntentUrl;
        } else {
          window.location.href = appUrl;
        }
        // If we're still visible after the scheme attempt, the app isn't
        // installed. On Android, send the user to the Play Store (the token
        // rides along as the install referrer so the deep link resumes after
        // install). This is a fallback only — a verified App Link opens the
        // app directly and this page never loads.
        setTimeout(function () {
          if (document.visibilityState === 'hidden') return;
          if (isAndroid) {
            document.getElementById('status').textContent = 'Install GatiMitra to save this address.';
            window.location.href = playStoreUrl;
          } else {
            document.getElementById('status').textContent =
              'If the app did not open, install GatiMitra and try again.';
          }
        }, 1800);
      }
      document.getElementById('openApp').addEventListener('click', openApp);
      if (isAndroid || isIOS) {
        setTimeout(openApp, 400);
      }
    })();
  </script>
</body>
</html>`;
}

export async function renderAddressShareLandingPage(shortCode: string, token: string): Promise<string | null> {
  const row = await getAddressShareForLandingPage(shortCode, token);
  if (!row) return null;
  if (row.expiresAt.getTime() <= Date.now()) return null;
  if (row.claimedAt) return null;
  return buildAddressSharePageHtml({ shortCode, token, fullAddress: row.fullAddress });
}
