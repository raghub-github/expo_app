/**
 * Generates launcher + notification icons for GatiMitra Partner (merchant).
 *
 * Source of truth: assets/images/splash-logo.png (GatiMitra — Partner Control).
 * That file is NEVER overwritten — only icon.png / adaptive-icon.png / notification-icon.png.
 *
 * Android adaptive masks crop the outer ~18%; we inset artwork so text never clips L/R.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");

const CANVAS = 1024;
/** Keep well inside Android adaptive safe zone (~66% diameter). */
const ICON_SCALE = 0.72;
const ADAPTIVE_SCALE = 0.68;
const BRAND_BG = "#000000";
const ADAPTIVE_BG = "#000000";

const SPLASH_LOGO = path.join(projectRoot, "assets/images/splash-logo.png");
const LOGO_CANDIDATES = [
  SPLASH_LOGO,
  path.join(projectRoot, "assets/mxappicon.png"),
];
const ICON_OUT = path.join(projectRoot, "assets/icon.png");
const ADAPTIVE_OUT = path.join(projectRoot, "assets/adaptive-icon.png");
/** Android status-bar / notification small icon — white alpha only, compact monogram. */
const NOTIFICATION_ICON_OUT = path.join(projectRoot, "assets/notification-icon.png");
const NOTIFICATION_CANVAS = 96;

function resolveLogoSource() {
  for (const candidate of LOGO_CANDIDATES) {
    if (fs.existsSync(candidate)) return candidate;
  }
  throw new Error(
    `Logo source not found. Tried:\n${LOGO_CANDIDATES.map((p) => `  - ${p}`).join("\n")}`
  );
}

async function buildScaledLayer(sourcePath, scale) {
  const trimmed = await sharp(sourcePath).trim({ threshold: 8 }).png().toBuffer();
  const renderSize = Math.round(CANVAS * scale);
  const resized = await sharp(trimmed)
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

/**
 * Compact white "GM" monogram (like Zomato's "Z") for Android notification small icon.
 * Must be white-on-transparent — the OS tints it with the plugin `color`.
 */
async function generateGmNotificationIcon() {
  const c = NOTIFICATION_CANVAS;
  // Pad letters well inside the circle so L/R never clip in the shade or status bar.
  const svg = `
<svg width="${c}" height="${c}" viewBox="0 0 ${c} ${c}" xmlns="http://www.w3.org/2000/svg">
  <text
    x="50%"
    y="52%"
    dominant-baseline="middle"
    text-anchor="middle"
    font-family="Arial Black, Helvetica Neue, Helvetica, Arial, sans-serif"
    font-weight="900"
    font-size="38"
    letter-spacing="-1"
    fill="#FFFFFF"
  >GM</text>
</svg>`;
  await sharp(Buffer.from(svg)).png().toFile(NOTIFICATION_ICON_OUT);
}

async function generateIcons() {
  const logoSource = resolveLogoSource();
  fs.mkdirSync(path.dirname(SPLASH_LOGO_OUT), { recursive: true });

  const sourceMeta = await sharp(logoSource).metadata();
  const iconLayer = await buildScaledLayer(logoSource, ICON_SCALE);
  const adaptiveLayer = await buildScaledLayer(logoSource, ADAPTIVE_SCALE);

  await generateGmNotificationIcon();

  await sharp({
    create: {
      width: CANVAS,
      height: CANVAS,
      channels: 4,
      background: BRAND_BG,
    },
  })
    .composite([{ input: iconLayer.resized, left: iconLayer.left, top: iconLayer.top }])
    .png()
    .toFile(ICON_OUT);

  await sharp({
    create: {
      width: CANVAS,
      height: CANVAS,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([
      { input: adaptiveLayer.resized, left: adaptiveLayer.left, top: adaptiveLayer.top },
    ])
    .png()
    .toFile(ADAPTIVE_OUT);

  console.log(
    JSON.stringify(
      {
        canvas: `${CANVAS}x${CANVAS}`,
        iconScale: `${ICON_SCALE * 100}%`,
        adaptiveScale: `${ADAPTIVE_SCALE * 100}%`,
        brandBackground: BRAND_BG,
        adaptiveBackgroundHint: ADAPTIVE_BG,
        sourceLogo: path.relative(projectRoot, logoSource),
        sourceSize: `${sourceMeta.width}x${sourceMeta.height}`,
        splashLogoPreserved: path.relative(projectRoot, SPLASH_LOGO),
        outputs: [
          path.relative(projectRoot, ICON_OUT),
          path.relative(projectRoot, ADAPTIVE_OUT),
          path.relative(projectRoot, NOTIFICATION_ICON_OUT),
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
