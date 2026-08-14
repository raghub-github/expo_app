/**
 * Native launch splash that matches GatiMitraBootstrapScreen (wordmark + tagline),
 * not the circular logo. Android 12+ crops the splash image to a circle — fill
 * that icon with the same teal as the window so the circle edge disappears.
 *
 * Usage: node scripts/generate-native-splash.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const outDir = path.join(projectRoot, "assets/images");

const GRADIENT_TOP = "#5eead4";
const SPLASH_MINT = "#14b8a6";
const GRADIENT_BOTTOM = "#0d9488";

const BRAND_OUT = path.join(outDir, "splash-brand.png");
const ANDROID12_OUT = path.join(outDir, "splash-android12.png");

const BRAND_W = 1284;
const BRAND_H = 2778;
const ICON = 1024;

function brandSvg(width, height) {
  const cx = width / 2;
  const titleSize = Math.round(width * 0.072);
  const tagSize = Math.round(width * 0.018);
  const titleY = height * 0.48;
  const lineY = titleY + titleSize * 0.55;
  const tagY = lineY + tagSize * 2.4;
  const lineW = width * 0.48;
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <linearGradient id="bg" x1="20%" y1="0%" x2="80%" y2="100%">
      <stop offset="0%" stop-color="${GRADIENT_TOP}"/>
      <stop offset="45%" stop-color="${SPLASH_MINT}"/>
      <stop offset="100%" stop-color="${GRADIENT_BOTTOM}"/>
    </linearGradient>
  </defs>
  <rect width="${width}" height="${height}" fill="url(#bg)"/>
  <text x="${cx}" y="${titleY}" text-anchor="middle" fill="#ffffff" font-size="${titleSize}" font-family="Georgia, 'Times New Roman', Times, serif" font-weight="700">GatiMitra</text>
  <rect x="${(width - lineW) / 2}" y="${lineY}" width="${lineW}" height="2" fill="#ffffff" fill-opacity="0.92"/>
  <text x="${cx}" y="${tagY}" text-anchor="middle" fill="#ffffff" fill-opacity="0.94" font-size="${tagSize}" font-family="Georgia, 'Times New Roman', Times, serif" font-weight="700" letter-spacing="${tagSize * 0.28}">CRAFTED FOR CONVENIENCE</text>
</svg>`;
}

function android12Svg() {
  // Window + icon share SPLASH_MINT so the Android 12 circle is invisible.
  // Keep copy inside the center ~60% (system icon safe zone).
  const cx = ICON / 2;
  const titleSize = 92;
  const tagSize = 18;
  const titleY = 500;
  const lineY = 548;
  const tagY = 590;
  const lineW = 520;
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${ICON}" height="${ICON}" viewBox="0 0 ${ICON} ${ICON}">
  <rect width="${ICON}" height="${ICON}" fill="${SPLASH_MINT}"/>
  <text x="${cx}" y="${titleY}" text-anchor="middle" fill="#ffffff" font-size="${titleSize}" font-family="Georgia, 'Times New Roman', Times, serif" font-weight="700">GatiMitra</text>
  <rect x="${(ICON - lineW) / 2}" y="${lineY}" width="${lineW}" height="2" fill="#ffffff" fill-opacity="0.92"/>
  <text x="${cx}" y="${tagY}" text-anchor="middle" fill="#ffffff" fill-opacity="0.94" font-size="${tagSize}" font-family="Georgia, 'Times New Roman', Times, serif" font-weight="700" letter-spacing="4">CRAFTED FOR CONVENIENCE</text>
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
  await renderSvg(brandSvg(BRAND_W, BRAND_H), BRAND_OUT, BRAND_W, BRAND_H);
  await renderSvg(android12Svg(), ANDROID12_OUT, ICON, ICON);
  console.log(
    JSON.stringify(
      {
        splashMint: SPLASH_MINT,
        outputs: [
          path.relative(projectRoot, BRAND_OUT),
          path.relative(projectRoot, ANDROID12_OUT),
        ],
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
