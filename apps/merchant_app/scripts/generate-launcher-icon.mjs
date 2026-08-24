/**
 * GatiMitra Partner launcher icons with Android adaptive-icon safe area.
 *
 * Outputs:
 * - assets/adaptive-icon.png  — transparent foreground, logo ≤66% of canvas
 * - assets/mxappicon.png      — full launcher (iOS + Android legacy) on brand bg
 * - assets/images/splash-logo.png — logo-only for splash
 * - assets/icon-previews/*    — circle / squircle / rounded-square mask checks
 *
 * Important artwork stays inside the center ~66% so circle/squircle masks
 * never clip the mark. Launcher *label* stays "GatiMitra Partner" (app.json).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const assetsDir = path.resolve(__dirname, "../assets");
const imagesDir = path.join(assetsDir, "images");
const previewDir = path.join(assetsDir, "icon-previews");

const CANVAS = 1024;
/** Android adaptive safe zone ≈ 66% of full canvas (108dp → 66dp). */
const SAFE_SCALE = 0.66;
/** Slightly larger for solid legacy icon (still ≥15% padding each side). */
const LEGACY_SCALE = 0.70;
const BG = { r: 11, g: 36, b: 28 }; // #0B241C — Partner brand
const BG_HEX = "#0B241C";

const SOURCE_CANDIDATES = [
  path.join(imagesDir, "onlylogo.png"), // circular mark — preferred (no wordmark)
  path.join(assetsDir, "mxappicon-source.png"),
  path.join(assetsDir, "mxappicon.png"),
];

function resolveSource() {
  for (const p of SOURCE_CANDIDATES) {
    if (fs.existsSync(p)) return p;
  }
  throw new Error(
    `No icon source found. Tried:\n${SOURCE_CANDIDATES.map((p) => `  - ${p}`).join("\n")}`,
  );
}

function isNearBlack(r, g, b, a) {
  if (a != null && a < 16) return true;
  return r < 28 && g < 28 && b < 28;
}

/** Extract opaque logo pixels; drop near-black canvas so we can re-pad. */
async function extractLogoRgba(inputPath) {
  const { data, info } = await sharp(inputPath)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const out = Buffer.from(data);
  for (let i = 0; i < out.length; i += 4) {
    const r = out[i];
    const g = out[i + 1];
    const b = out[i + 2];
    const a = out[i + 3];
    if (isNearBlack(r, g, b, a)) {
      out[i + 3] = 0;
    }
  }

  return sharp(out, {
    raw: { width: info.width, height: info.height, channels: 4 },
  })
    .trim({ threshold: 8 })
    .png()
    .toBuffer({ resolveWithObject: true });
}

async function buildCenteredLayer(logoPng, scale) {
  const box = Math.round(CANVAS * scale);
  const resized = await sharp(logoPng)
    .resize(box, box, {
      fit: "inside",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
      kernel: sharp.kernel.lanczos3,
    })
    .png()
    .toBuffer({ resolveWithObject: true });

  const left = Math.round((CANVAS - resized.info.width) / 2);
  const top = Math.round((CANVAS - resized.info.height) / 2);
  return { buffer: resized.data, width: resized.info.width, height: resized.info.height, left, top, box };
}

async function composeCanvas(layer, background) {
  return sharp({
    create: {
      width: CANVAS,
      height: CANVAS,
      channels: 4,
      background,
    },
  })
    .composite([{ input: layer.buffer, left: layer.left, top: layer.top }])
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toBuffer();
}

/** Apply a soft mask preview so we can judge clipping before device install. */
async function writeMaskPreview(iconPng, outPath, maskSvg) {
  const mask = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${CANVAS}" height="${CANVAS}">${maskSvg}</svg>`,
  );
  await sharp(iconPng)
    .composite([{ input: await sharp(mask).png().toBuffer(), blend: "dest-in" }])
    .png()
    .toFile(outPath);
}

async function main() {
  const source = resolveSource();
  fs.mkdirSync(imagesDir, { recursive: true });
  fs.mkdirSync(previewDir, { recursive: true });

  const logo = await extractLogoRgba(source);
  const adaptiveLayer = await buildCenteredLayer(logo.data, SAFE_SCALE);
  const legacyLayer = await buildCenteredLayer(logo.data, LEGACY_SCALE);

  const adaptivePng = await composeCanvas(adaptiveLayer, {
    r: 0,
    g: 0,
    b: 0,
    alpha: 0,
  });
  const legacyPng = await composeCanvas(legacyLayer, { ...BG, alpha: 255 });

  const adaptiveOut = path.join(assetsDir, "adaptive-icon.png");
  const legacyOut = path.join(assetsDir, "mxappicon.png");
  const splashOut = path.join(imagesDir, "splash-logo.png");

  await sharp(adaptivePng).toFile(adaptiveOut);
  await sharp(legacyPng).toFile(legacyOut);
  // Splash: logo-only (transparent), slightly larger for splash screen.
  const splashLayer = await buildCenteredLayer(logo.data, 0.58);
  await sharp(await composeCanvas(splashLayer, { r: 0, g: 0, b: 0, alpha: 0 })).toFile(
    splashOut,
  );

  // Mask previews use the solid legacy icon (what users see on many launchers).
  const r = Math.round(CANVAS / 2);
  await writeMaskPreview(
    legacyPng,
    path.join(previewDir, "mask-circle.png"),
    `<circle cx="${r}" cy="${r}" r="${r}" fill="white"/>`,
  );
  await writeMaskPreview(
    legacyPng,
    path.join(previewDir, "mask-squircle.png"),
    `<rect x="0" y="0" width="${CANVAS}" height="${CANVAS}" rx="${Math.round(CANVAS * 0.22)}" ry="${Math.round(CANVAS * 0.22)}" fill="white"/>`,
  );
  await writeMaskPreview(
    legacyPng,
    path.join(previewDir, "mask-rounded-square.png"),
    `<rect x="0" y="0" width="${CANVAS}" height="${CANVAS}" rx="${Math.round(CANVAS * 0.12)}" ry="${Math.round(CANVAS * 0.12)}" fill="white"/>`,
  );

  // Corner check: legacy must stay brand green at edges.
  const verify = await sharp(legacyPng).raw().toBuffer({ resolveWithObject: true });
  for (const [x, y] of [
    [0, 0],
    [CANVAS - 1, 0],
    [0, CANVAS - 1],
    [CANVAS - 1, CANVAS - 1],
  ]) {
    const i = (y * verify.info.width + x) * verify.info.channels;
    const [cr, cg, cb] = [verify.data[i], verify.data[i + 1], verify.data[i + 2]];
    if (Math.abs(cr - BG.r) > 10 || Math.abs(cg - BG.g) > 10 || Math.abs(cb - BG.b) > 10) {
      throw new Error(`Corner (${x},${y}) not brand green: #${[cr, cg, cb].map((v) => v.toString(16).padStart(2, "0")).join("")}`);
    }
  }

  const padAdaptive = Math.round((CANVAS - adaptiveLayer.box) / 2);
  const padLegacy = Math.round((CANVAS - legacyLayer.box) / 2);

  console.log(
    JSON.stringify(
      {
        source: path.relative(path.resolve(__dirname, ".."), source),
        canvas: `${CANVAS}x${CANVAS}`,
        brandBackground: BG_HEX,
        adaptiveSafeScale: `${SAFE_SCALE * 100}%`,
        adaptivePaddingPx: padAdaptive,
        legacyScale: `${LEGACY_SCALE * 100}%`,
        legacyPaddingPx: padLegacy,
        logoTrimmed: `${logo.info.width}x${logo.info.height}`,
        outputs: [
          path.relative(path.resolve(__dirname, ".."), adaptiveOut),
          path.relative(path.resolve(__dirname, ".."), legacyOut),
          path.relative(path.resolve(__dirname, ".."), splashOut),
          "assets/icon-previews/mask-circle.png",
          "assets/icon-previews/mask-squircle.png",
          "assets/icon-previews/mask-rounded-square.png",
        ],
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
