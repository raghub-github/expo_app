/**
 * Generates launcher icons for GatiMitra Rider from assets/images/rideraap.png.
 *
 * - icon.png: 1024×1024 full launcher (designed squircle artwork, mint background)
 * - adaptive-icon.png: foreground scaled to Android safe zone (~72%) on transparent canvas
 * - splash-logo.png: centered artwork for splash screen
 *
 * Source artwork already includes inner padding + green ring — we still inset for
 * adaptive masks (circle / squircle / teardrop) so edges never clip after install.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");

const CANVAS = 1024;
/** Android adaptive icon safe zone ≈ 66%; use 72% because rideraap has built-in padding. */
const ADAPTIVE_SCALE = 0.72;
const SPLASH_SCALE = 0.58;
const BRAND_BG = "#C4E8D1";
const LOGO_SOURCE = path.join(projectRoot, "assets/images/rideraap.png");
const ICON_OUT = path.join(projectRoot, "assets/icon.png");
const ADAPTIVE_OUT = path.join(projectRoot, "assets/adaptive-icon.png");
const SPLASH_LOGO_OUT = path.join(projectRoot, "assets/images/splash-logo.png");

async function buildScaledLayer(scale) {
  const renderSize = Math.round(CANVAS * scale);
  const resized = await sharp(LOGO_SOURCE)
    .resize(renderSize, renderSize, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();

  const left = Math.round((CANVAS - renderSize) / 2);
  const top = Math.round((CANVAS - renderSize) / 2);

  return { resized, renderSize, left, top };
}

async function generateIcons() {
  if (!fs.existsSync(LOGO_SOURCE)) {
    throw new Error(`Logo source not found: ${LOGO_SOURCE}`);
  }

  fs.mkdirSync(path.dirname(SPLASH_LOGO_OUT), { recursive: true });

  const sourceMeta = await sharp(LOGO_SOURCE).metadata();

  // Full launcher icon — entire designed artwork on white (iOS + Android legacy).
  await sharp(LOGO_SOURCE)
    .resize(CANVAS, CANVAS, {
      fit: "contain",
      background: BRAND_BG,
    })
    .png()
    .toFile(ICON_OUT);

  const { resized, renderSize, left, top } = await buildScaledLayer(ADAPTIVE_SCALE);

  await sharp({
    create: {
      width: CANVAS,
      height: CANVAS,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: resized, left, top }])
    .png()
    .toFile(ADAPTIVE_OUT);

  const splashLayer = await buildScaledLayer(SPLASH_SCALE);
  await sharp({
    create: {
      width: CANVAS,
      height: CANVAS,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: splashLayer.resized, left: splashLayer.left, top: splashLayer.top }])
    .png()
    .toFile(SPLASH_LOGO_OUT);

  const report = {
    canvas: `${CANVAS}x${CANVAS}`,
    adaptiveScale: `${ADAPTIVE_SCALE * 100}%`,
    adaptiveRenderedSize: `${renderSize}x${renderSize}px`,
    adaptiveSafePadding: `${left}px per side`,
    splashScale: `${SPLASH_SCALE * 100}%`,
    background: BRAND_BG,
    source: path.relative(projectRoot, LOGO_SOURCE),
    sourceSize: `${sourceMeta.width}x${sourceMeta.height}`,
    outputs: [
      path.relative(projectRoot, ICON_OUT),
      path.relative(projectRoot, ADAPTIVE_OUT),
      path.relative(projectRoot, SPLASH_LOGO_OUT),
    ],
  };

  console.log("Generated launcher icons:");
  console.log(JSON.stringify(report, null, 2));
}

generateIcons().catch((error) => {
  console.error(error);
  process.exit(1);
});
