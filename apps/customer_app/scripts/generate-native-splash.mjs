/**
 * Native launch splash matching Zomato's centered brand stack, with GatiMitra branding.
 *
 * Layout (Zomato reference):
 *   flat brand colour → bold wordmark → thin hairline → spaced tagline
 *
 * Renders bold Lora from the bundled @expo-google-fonts/lora TTF so native → JS
 * handoff never shows a thin/system fallback face.
 *
 * Android 12+ crops the splash image to a circle — fill that icon with the same
 * teal as the window so the circle edge disappears.
 *
 * Usage: node scripts/generate-native-splash.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const outDir = path.join(projectRoot, "assets/images");
const repoRoot = path.resolve(projectRoot, "../..");

/** Solid mint — Zomato uses flat brand red; we use flat GatiMitra mint. */
const SPLASH_MINT = "#14b8a6";

const BRAND_OUT = path.join(outDir, "splash-brand.png");
const ANDROID12_OUT = path.join(outDir, "splash-android12.png");

const BRAND_W = 1284;
const BRAND_H = 2778;
const ICON = 1024;

/** Resolve Lora Bold TTF — monorepo hoist or app-local install. */
function resolveLoraBoldTtf() {
  const candidates = [
    path.join(repoRoot, "node_modules/@expo-google-fonts/lora/700Bold/Lora_700Bold.ttf"),
    path.join(projectRoot, "node_modules/@expo-google-fonts/lora/700Bold/Lora_700Bold.ttf"),
  ];
  try {
    const pkgDir = path.dirname(
      require.resolve("@expo-google-fonts/lora/package.json")
    );
    candidates.unshift(path.join(pkgDir, "700Bold/Lora_700Bold.ttf"));
  } catch {
    /* ignore */
  }
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

function escapeXml(value) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fontFaceCss(ttfPath) {
  if (!ttfPath) return "";
  const abs = path.resolve(ttfPath).replace(/\\/g, "/");
  const href = abs.startsWith("/") ? `file://${abs}` : `file:///${abs}`;
  return `
  <defs>
    <style type="text/css"><![CDATA[
      @font-face {
        font-family: "LoraBold";
        src: url("${href}");
        font-weight: 700;
        font-style: normal;
      }
    ]]></style>
  </defs>`;
}

/**
 * Zomato stack proportions (relative to canvas width):
 * - Wordmark ~11–12% of width, optically centered
 * - Hairline ~78% of wordmark width, tight under title
 * - Tagline ~2.8–3.2% of width, wide tracking via textLength ≈ wordmark
 */
function brandStack(width, height, ttfPath, opts = {}) {
  const {
    titleSize = Math.round(width * 0.112),
    tagSize = Math.round(width * 0.028),
    titleY = height * 0.485,
    maxTagWidthRatio = 0.92,
  } = opts;
  const cx = width / 2;
  const family = ttfPath ? "LoraBold" : "Georgia, 'Times New Roman', Times, serif";
  // Approximate wordmark width for line + tagline stretch (GatiMitra ~9 glyphs).
  // Zomato: hairline ≈ logo width; tagline tracking spans nearly the same.
  const wordmarkW = Math.round(titleSize * 5.2);
  const lineW = Math.round(wordmarkW * 0.94);
  const lineY = titleY + Math.round(titleSize * 0.38);
  const tagY = lineY + Math.round(tagSize * 1.7);
  const tagWidth = Math.round(wordmarkW * maxTagWidthRatio);

  return `
  <text x="${cx}" y="${titleY}" text-anchor="middle" fill="#ffffff" font-size="${titleSize}" font-family="${escapeXml(family)}" font-weight="700">GatiMitra</text>
  <rect x="${cx - lineW / 2}" y="${lineY}" width="${lineW}" height="2.5" rx="1.25" fill="#ffffff" fill-opacity="0.92"/>
  <text x="${cx}" y="${tagY}" text-anchor="middle" fill="#ffffff" stroke="#ffffff" stroke-width="0.9" paint-order="stroke fill" font-size="${tagSize}" font-family="${escapeXml(family)}" font-weight="700" letter-spacing="3" textLength="${tagWidth}" lengthAdjust="spacingAndGlyphs">CRAFTED FOR CONVENIENCE</text>`;
}

function brandSvg(width, height, ttfPath) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  ${fontFaceCss(ttfPath)}
  <rect width="${width}" height="${height}" fill="${SPLASH_MINT}"/>
  ${brandStack(width, height, ttfPath)}
</svg>`;
}

/**
 * Android 12+ SplashScreen API always draws this as a small centered icon.
 * Putting the wordmark here made a tiny unprofessional "first splash".
 * Solid mint only — MainActivity releases this overlay immediately so the
 * full-bleed AppTheme windowBackground (`plugins/withBrandedNativeSplash.js`
 * → splash-brand.png) is the first meaningful frame, continued by JS.
 */
function android12Svg(_ttfPath) {
  void _ttfPath;
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${ICON}" height="${ICON}" viewBox="0 0 ${ICON} ${ICON}">
  <rect width="${ICON}" height="${ICON}" fill="${SPLASH_MINT}"/>
</svg>`;
}

async function renderSvg(svg, outPath, width, height) {
  await sharp(Buffer.from(svg), { density: 144 })
    .resize(width, height, { fit: "fill" })
    .png()
    .toFile(outPath);
}

async function main() {
  fs.mkdirSync(outDir, { recursive: true });
  const loraBold = resolveLoraBoldTtf();
  if (!loraBold) {
    console.warn(
      "[generate-native-splash] Lora_700Bold.ttf not found — using Georgia fallback. Install @expo-google-fonts/lora."
    );
  } else {
    console.log(`[generate-native-splash] Using bold Lora: ${loraBold}`);
  }
  await renderSvg(brandSvg(BRAND_W, BRAND_H, loraBold), BRAND_OUT, BRAND_W, BRAND_H);
  // Native A12 icon = solid mint (no text). Full brand = windowBackground + JS cover.
  await renderSvg(android12Svg(loraBold), ANDROID12_OUT, ICON, ICON);
  console.log(
    JSON.stringify(
      {
        splashMint: SPLASH_MINT,
        layout: "windowBackground-brand + mint-A12-icon + js-cover",
        font: loraBold ? "Lora_700Bold" : "Georgia-fallback",
        outputs: [
          path.relative(projectRoot, BRAND_OUT),
          path.relative(projectRoot, ANDROID12_OUT),
        ],
        note: "A12 icon stays mint-only; withBrandedNativeSplash shows splash-brand immediately.",
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
