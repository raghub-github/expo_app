/**
 * Production 1024×1024 GatiMitra Partner launcher icon.
 * Edge-to-edge dark green (#0B241C), centered branding, no black/white corners.
 */
import sharp from "sharp";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const assetsDir = path.resolve(__dirname, "../assets");
const SOURCE = path.join(assetsDir, "mxappicon.png");
const OUT_SIZE = 1024;
/** Matches MERCHANT_SPLASH_BG in app.config.js */
const BG = { r: 11, g: 36, b: 28 };
const BG_HEX = "#0B241C";
/** Logo wordmark width ≈ Zomato-style launcher fill. */
const LOGO_WIDTH_RATIO = 0.74;

function isBackgroundPixel(r, g, b) {
  // Black outer frame or in-icon dark green field.
  if (r < 8 && g < 8 && b < 8) return true;
  if (r < 40 && g > 12 && g < 80 && b > 8 && b < 55) return true;
  return false;
}

async function extractLogoRgba(inputBuffer) {
  const { data, info } = await sharp(inputBuffer)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const out = Buffer.from(data);
  for (let i = 0; i < out.length; i += 4) {
    const r = out[i];
    const g = out[i + 1];
    const b = out[i + 2];
    if (isBackgroundPixel(r, g, b)) {
      out[i + 3] = 0;
    } else {
      out[i + 3] = 255;
    }
  }

  return sharp(out, {
    raw: { width: info.width, height: info.height, channels: 4 },
  })
    .trim({ threshold: 1 })
    .png()
    .toBuffer({ resolveWithObject: true });
}

async function main() {
  const trimmedBlack = await sharp(SOURCE).trim({ threshold: 12 }).png().toBuffer();

  const logo = await extractLogoRgba(trimmedBlack);
  const targetLogoW = Math.round(OUT_SIZE * LOGO_WIDTH_RATIO);
  const scale = targetLogoW / logo.info.width;
  const targetLogoH = Math.round(logo.info.height * scale);

  const logoScaled = await sharp(logo.data)
    .resize(targetLogoW, targetLogoH, {
      fit: "inside",
      kernel: sharp.kernel.lanczos3,
    })
    .png()
    .toBuffer();

  const iconPng = await sharp({
    create: {
      width: OUT_SIZE,
      height: OUT_SIZE,
      channels: 3,
      background: BG,
    },
  })
    .composite([{ input: logoScaled, gravity: "center" }])
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toBuffer();

  const verify = await sharp(iconPng).raw().toBuffer({ resolveWithObject: true });
  const { data, info } = verify;
  const corners = [
    [0, 0],
    [info.width - 1, 0],
    [0, info.height - 1],
    [info.width - 1, info.height - 1],
  ];
  for (const [x, y] of corners) {
    const i = (y * info.width + x) * info.channels;
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const hex = `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
    console.log(`Corner (${x},${y}): ${hex}`);
    if (r > 30 || g < 20 || Math.abs(r - BG.r) > 8 || Math.abs(g - BG.g) > 8) {
      throw new Error(`Corner not dark green: ${hex}`);
    }
  }

  const outputs = [
    path.join(assetsDir, "mxappicon.png"),
    path.join(assetsDir, "images", "splash-logo.png"),
  ];

  for (const out of outputs) {
    await sharp(iconPng).toFile(out);
    console.log("Wrote", out);
  }

  console.log(
    `Launcher icon: ${OUT_SIZE}×${OUT_SIZE}, bg ${BG_HEX}, logo ${targetLogoW}px wide (${Math.round(LOGO_WIDTH_RATIO * 100)}% fill).`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
