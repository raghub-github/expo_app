/**
 * Public address-share landing.
 *
 * Installed app: Android App Links / iOS Universal Links open the Customer App
 * before this page loads.
 *
 * Not installed: 302 to the official Play Store listing (no website interstitial).
 * Social crawlers get Open Graph HTML so WhatsApp/SMS previews still work.
 */

import {
  buildAddressShareOgImageUrl,
  buildAddressShareUrl,
  getAddressShareForLandingByToken,
  getAddressShareForLandingPage,
} from "../../lib/address-share.js";

export const CUSTOMER_PLAY_STORE_URL =
  "https://play.google.com/store/apps/details?id=com.gatimitra.customer";

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

export function isLinkPreviewCrawler(userAgent: string | undefined): boolean {
  const ua = userAgent ?? "";
  return /whatsapp|facebookexternalhit|facebot|twitterbot|telegrambot|slackbot|discordbot|linkedinbot|pinterest|googlebot|bingbot|applebot|embedly|quora|outbrain|vkshare|skypeuripreview|nuzzel|qwantify|bitrix|xing-contenttabreceiver/i.test(
    ua
  );
}

export function buildAddressSharePlayStoreUrl(token: string): string {
  return (
    `${CUSTOMER_PLAY_STORE_URL}` +
    `&referrer=${encodeURIComponent(`addr_${token}`)}`
  );
}

export function buildAddressShareOgHtml(args: {
  token: string;
  shortCode?: string;
  fullAddress?: string;
}): string {
  const { token } = args;
  const pageUrl = buildAddressShareUrl(args.shortCode ?? "", token);
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
</head>
<body>
  <p>${escapeHtml(bodyAddress)}</p>
</body>
</html>`;
}

export async function renderAddressShareLandingPage(shortCode: string, token: string): Promise<string | null> {
  const row = await getAddressShareForLandingPage(shortCode, token);
  if (!row) return null;
  if (row.expiresAt.getTime() <= Date.now()) return null;
  if (row.claimedAt) return null;
  return buildAddressShareOgHtml({ shortCode, token, fullAddress: row.fullAddress });
}

export async function renderAddressShareLandingByToken(token: string): Promise<string | null> {
  const row = await getAddressShareForLandingByToken(token);
  if (!row) return null;
  if (row.expiresAt.getTime() <= Date.now()) return null;
  if (row.claimedAt) return null;
  return buildAddressShareOgHtml({
    shortCode: row.shortCode,
    token,
    fullAddress: row.fullAddress,
  });
}
