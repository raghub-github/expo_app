/**
 * Referral deep-link landing page (Play Store deferred attribution).
 * Includes rich Open Graph / Twitter metadata for WhatsApp & social previews.
 */

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

export function buildReferralLandingHtml(args: {
  code: string;
  clickToken: string;
  playReferrer: string;
  packageName: string;
  publicBase: string;
  appScheme?: string;
  path?: string;
  canonicalPrefix?: string;
  headline?: string;
  rewardLines?: string[];
  /** Compact OG line, e.g. "You Get ₹50 • Friend Gets ₹50". */
  ogSummary?: string | null;
  appStoreUrl?: string | null;
  audience?: "customer" | "rider";
}): string {
  const scheme = args.appScheme ?? "gatimitra";
  const path = args.path ?? "referral";
  const appUrl =
    `${scheme}://${path}?code=${encodeURIComponent(args.code)}` +
    `&click=${encodeURIComponent(args.clickToken)}`;
  const playStoreUrl =
    `https://play.google.com/store/apps/details?id=${encodeURIComponent(args.packageName)}` +
    `&referrer=${encodeURIComponent(args.playReferrer)}`;
  const canonicalPrefix = args.canonicalPrefix ?? "/ref";
  const pageUrl = `${args.publicBase}${canonicalPrefix}/${encodeURIComponent(args.code)}`;
  const isRider = args.audience === "rider";
  const ogTitle = "Invite Friends & Earn Rewards";
  const headline = args.headline?.trim() || ogTitle;
  const rewardLines = (args.rewardLines ?? []).filter((l) => l.trim().length > 0);
  const ogSummary =
    args.ogSummary?.trim() ||
    rewardLines[0] ||
    (isRider
      ? "Join GatiMitra as a delivery partner and earn milestone rewards."
      : "Join GatiMitra and unlock referral rewards on your first order.");
  const ogDescription = `${ogSummary}. Referral applies automatically after install — no code to type.`;
  const storeUrl = args.appStoreUrl?.trim() || null;
  // Reuse the production OG asset already served for address-share (WhatsApp-crawler friendly).
  const ogImage = `${args.publicBase}/addr/og-logo.png`;

  return `<!DOCTYPE html>
<html lang="en" prefix="og: https://ogp.me/ns#">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(ogTitle)} | GatiMitra</title>
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
  <meta property="og:image:alt" content="GatiMitra — Invite Friends & Earn Rewards" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${escapeAttr(ogTitle)}" />
  <meta name="twitter:description" content="${escapeAttr(ogDescription)}" />
  <meta name="twitter:image" content="${escapeAttr(ogImage)}" />
  <meta name="twitter:image:alt" content="GatiMitra referral invite" />
  <style>
    body { font-family: system-ui, -apple-system, sans-serif; margin: 0; background: #f8fafc; color: #0f172a; }
    .wrap { max-width: 420px; margin: 0 auto; padding: 32px 20px; }
    .card { background: #fff; border-radius: 16px; padding: 24px; box-shadow: 0 8px 30px rgba(15,23,42,.08); }
    .brand { color: #14b8a6; font-weight: 700; font-size: 20px; margin-bottom: 12px; }
    .headline { font-size: 19px; font-weight: 700; line-height: 1.35; margin-bottom: 12px; }
    .desc { color: #64748b; margin-bottom: 20px; line-height: 1.5; }
    .rewards { list-style: none; padding: 0; margin: 0 0 20px; }
    .rewards li { position: relative; padding-left: 22px; margin-bottom: 10px; color: #334155;
      font-size: 14px; line-height: 1.5; }
    .rewards li:before { content: ""; position: absolute; left: 4px; top: 7px; width: 8px; height: 8px;
      border-radius: 50%; background: #14b8a6; }
    .code { font-size: 22px; font-weight: 700; letter-spacing: 0.06em; margin-bottom: 16px; }
    .btn { display: block; width: 100%; text-align: center; background: #14b8a6; color: #fff; text-decoration: none;
      padding: 14px 16px; border-radius: 12px; font-weight: 600; border: 0; font-size: 16px; cursor: pointer; }
    .note { margin-top: 16px; font-size: 13px; color: #94a3b8; line-height: 1.45; }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="card">
      <div class="brand">GatiMitra</div>
      <div class="headline">${escapeHtml(headline)}</div>
      ${
        rewardLines.length > 0
          ? `<ul class="rewards">${rewardLines
              .map((line) => `<li>${escapeHtml(line)}</li>`)
              .join("")}</ul>`
          : `<div class="desc">${escapeHtml(ogDescription)}</div>`
      }
      <div class="code">${escapeHtml(args.code)}</div>
      <button class="btn" id="openApp" type="button">Get the app</button>
      <p class="note">Your referral applies automatically after install — you never need to type the code.</p>
    </div>
  </div>
  <script>
    (function () {
      var appUrl = ${JSON.stringify(appUrl)};
      var playStoreUrl = ${JSON.stringify(playStoreUrl)};
      var appStoreUrl = ${JSON.stringify(storeUrl)};
      var ua = navigator.userAgent || "";
      var isAndroid = /Android/i.test(ua);
      var isIos = /iPad|iPhone|iPod/i.test(ua) && !window.MSStream;
      var storeFallback = isIos ? appStoreUrl : isAndroid ? playStoreUrl : null;

      function goToStore() {
        if (storeFallback) window.location.href = storeFallback;
      }

      function openApp() {
        if (!isAndroid && !isIos) {
          goToStore();
          return;
        }
        var startedAt = Date.now();
        var settled = false;
        function fallback() {
          if (settled) return;
          settled = true;
          if (document.hidden || Date.now() - startedAt > 2500) return;
          goToStore();
        }
        document.addEventListener("visibilitychange", function () {
          if (document.hidden) settled = true;
        });
        window.addEventListener("pagehide", function () {
          settled = true;
        });
        setTimeout(fallback, 1200);
        window.location.href = appUrl;
      }

      document.getElementById("openApp").addEventListener("click", openApp);
      openApp();
    })();
  </script>
</body>
</html>`;
}
