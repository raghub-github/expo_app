/**
 * Writes launcher mask previews for visual QA (circle / squircle / rounded square).
 * Run after generate-launcher-icon.mjs.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const assetsDir = path.resolve(__dirname, "../assets");
const previewDir = path.join(assetsDir, "icon-previews");
const CANVAS = 1024;
const BG = { r: 11, g: 36, b: 28, alpha: 255 };

async function maskPreview(composed, name, svgInner) {
  const maskSvg = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${CANVAS}" height="${CANVAS}">${svgInner}</svg>`,
  );
  const mask = await sharp(maskSvg).png().toBuffer();
  const masked = await sharp(composed)
    .composite([{ input: mask, blend: "dest-in" }])
    .png()
    .toBuffer();
  await sharp({
    create: {
      width: CANVAS,
      height: CANVAS,
      channels: 4,
      background: { r: 240, g: 240, b: 242, alpha: 255 },
    },
  })
    .composite([{ input: masked, gravity: "center" }])
    .png()
    .toFile(path.join(previewDir, name));
}

async function main() {
  const fg = await sharp(path.join(assetsDir, "mxappicon.png")).ensureAlpha().png().toBuffer();
  const composed = await sharp({
    create: { width: CANVAS, height: CANVAS, channels: 4, background: BG },
  })
    .composite([{ input: fg, gravity: "center" }])
    .png()
    .toBuffer();

  const r = CANVAS / 2;
  await maskPreview(
    composed,
    "mask-circle.png",
    `<circle cx="${r}" cy="${r}" r="${r}" fill="white"/>`,
  );
  await maskPreview(
    composed,
    "mask-squircle.png",
    `<rect x="0" y="0" width="${CANVAS}" height="${CANVAS}" rx="${Math.round(CANVAS * 0.22)}" ry="${Math.round(CANVAS * 0.22)}" fill="white"/>`,
  );
  await maskPreview(
    composed,
    "mask-rounded-square.png",
    `<rect x="0" y="0" width="${CANVAS}" height="${CANVAS}" rx="${Math.round(CANVAS * 0.12)}" ry="${Math.round(CANVAS * 0.12)}" fill="white"/>`,
  );

  const guide = Buffer.from(`
<svg xmlns="http://www.w3.org/2000/svg" width="${CANVAS}" height="${CANVAS}">
  <rect x="174" y="174" width="676" height="676" fill="none" stroke="#3EB489" stroke-width="6" stroke-dasharray="24 16" opacity="0.95"/>
  <text x="512" y="148" text-anchor="middle" fill="#3EB489" font-family="Arial, sans-serif" font-size="34">66% Android safe zone</text>
</svg>`);
  await sharp(composed)
    .composite([{ input: await sharp(guide).png().toBuffer() }])
    .png()
    .toFile(path.join(previewDir, "safe-zone-guide.png"));

  console.log("Wrote icon-previews/{mask-circle,mask-squircle,mask-rounded-square,safe-zone-guide}.png");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
