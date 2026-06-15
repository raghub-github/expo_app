/**
 * Generates Android/iOS launcher icons for GatiMitra Customer.
 *
 * - icon.png: 1024×1024 full launcher icon (logo on brand background)
 * - adaptive-icon.png: 1024×1024 transparent foreground (logo only, safe-zone sized)
 * - splash-logo.png: logo-only for splash (transparent background)
 *
 * Logo occupies ~65% of canvas so it stays inside circle/squircle/teardrop masks.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");

const CANVAS = 1024;
const LOGO_SCALE = 0.65;
const BRAND_BG = "#14b8a6";
const LOGO_SOURCE = path.join(projectRoot, "public/img/fav.png");
const ICON_OUT = path.join(projectRoot, "assets/icon.png");
const ADAPTIVE_OUT = path.join(projectRoot, "assets/adaptive-icon.png");
const SPLASH_LOGO_OUT = path.join(projectRoot, "assets/images/splash-logo.png");

async function buildLogoLayer() {
  const trimmed = await sharp(LOGO_SOURCE).trim().png().toBuffer();
  const meta = await sharp(trimmed).metadata();
  const logoSize = Math.round(CANVAS * LOGO_SCALE);
  const resized = await sharp(trimmed)
    .resize(logoSize, logoSize, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();

  const left = Math.round((CANVAS - logoSize) / 2);
  const top = Math.round((CANVAS - logoSize) / 2);

  return { resized, logoSize, left, top, trimmedMeta: meta };
}

async function generateIcons() {
  if (!fs.existsSync(LOGO_SOURCE)) {
    throw new Error(`Logo source not found: ${LOGO_SOURCE}`);
  }

  fs.mkdirSync(path.dirname(SPLASH_LOGO_OUT), { recursive: true });

  const { resized, logoSize, left, top, trimmedMeta } = await buildLogoLayer();

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

  await sharp({
    create: {
      width: CANVAS,
      height: CANVAS,
      channels: 4,
      background: BRAND_BG,
    },
  })
    .composite([{ input: resized, left, top }])
    .png()
    .toFile(ICON_OUT);

  await sharp(resized).png().toFile(SPLASH_LOGO_OUT);

  console.log(
    JSON.stringify(
      {
        canvas: `${CANVAS}x${CANVAS}`,
        logoScale: `${LOGO_SCALE * 100}%`,
        logoRenderedSize: `${logoSize}x${logoSize}px`,
        brandBackground: BRAND_BG,
        sourceLogo: path.relative(projectRoot, LOGO_SOURCE),
        trimmedSource: `${trimmedMeta.width}x${trimmedMeta.height}`,
        outputs: [
          path.relative(projectRoot, ICON_OUT),
          path.relative(projectRoot, ADAPTIVE_OUT),
          path.relative(projectRoot, SPLASH_LOGO_OUT),
        ],
      },
      null,
      2
    )
  );
}

generateIcons().catch((error) => {
  console.error(error);
  process.exit(1);
});
