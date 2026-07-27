/**
 * Generates Android/iOS launcher icons for GatiMitra Customer.
 *
 * - icon.png: 1024×1024 full launcher icon (logo on pure black background)
 * - adaptive-icon.png: 1024×1024 transparent foreground (logo only, safe-zone sized)
 * - splash-logo.png: logo-only for splash (transparent background)
 *
 * Logo occupies ~56% of canvas (~14% smaller than the prior 65% mark) for
 * better whitespace inside circle/squircle/teardrop masks.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");

const CANVAS = 1024;
/** ~14% smaller than prior 0.65 scale for balanced launcher whitespace. */
const LOGO_SCALE = 0.56;
const BRAND_BG = "#000000";
const LOGO_CANDIDATES = [
  path.join(projectRoot, "public/img/fav.png"),
  path.join(projectRoot, "assets/images/splash-logo.png"),
  path.join(projectRoot, "assets/adaptive-icon.png"),
];
const ICON_OUT = path.join(projectRoot, "assets/icon.png");
const ADAPTIVE_OUT = path.join(projectRoot, "assets/adaptive-icon.png");
const SPLASH_LOGO_OUT = path.join(projectRoot, "assets/images/splash-logo.png");

function resolveLogoSource() {
  for (const candidate of LOGO_CANDIDATES) {
    if (fs.existsSync(candidate)) return candidate;
  }
  throw new Error(
    `Logo source not found. Tried:\n${LOGO_CANDIDATES.map((p) => `  - ${p}`).join("\n")}`
  );
}

async function buildLogoLayer() {
  const logoSource = resolveLogoSource();
  const trimmed = await sharp(logoSource).trim().png().toBuffer();
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

  return { resized, logoSize, left, top, trimmedMeta: meta, logoSource };
}

async function generateIcons() {
  fs.mkdirSync(path.dirname(SPLASH_LOGO_OUT), { recursive: true });

  const { resized, logoSize, left, top, trimmedMeta, logoSource } = await buildLogoLayer();

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
        sourceLogo: path.relative(projectRoot, logoSource),
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
