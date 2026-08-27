/**
 * Mask previews for the canonical Partner launcher icon (assets/mxappicon.png).
 *
 * Edit mxappicon.png directly — this script never overwrites it.
 * app.json / app.config.js point every launcher surface at mxappicon.png only.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const assetsDir = path.resolve(__dirname, "../assets");
const previewDir = path.join(assetsDir, "icon-previews");
const CANVAS = 1024;
const ICON_PATH = path.join(assetsDir, "mxappicon.png");

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
  if (!fs.existsSync(ICON_PATH)) {
    throw new Error(`Canonical launcher icon missing: ${ICON_PATH}`);
  }

  fs.mkdirSync(previewDir, { recursive: true });

  const iconPng = await sharp(ICON_PATH)
    .resize(CANVAS, CANVAS, { fit: "cover" })
    .png()
    .toBuffer();

  const r = Math.round(CANVAS / 2);
  await writeMaskPreview(
    iconPng,
    path.join(previewDir, "mask-circle.png"),
    `<circle cx="${r}" cy="${r}" r="${r}" fill="white"/>`,
  );
  await writeMaskPreview(
    iconPng,
    path.join(previewDir, "mask-squircle.png"),
    `<rect x="0" y="0" width="${CANVAS}" height="${CANVAS}" rx="${Math.round(CANVAS * 0.22)}" ry="${Math.round(CANVAS * 0.22)}" fill="white"/>`,
  );
  await writeMaskPreview(
    iconPng,
    path.join(previewDir, "mask-rounded-square.png"),
    `<rect x="0" y="0" width="${CANVAS}" height="${CANVAS}" rx="${Math.round(CANVAS * 0.12)}" ry="${Math.round(CANVAS * 0.12)}" fill="white"/>`,
  );

  console.log(
    JSON.stringify(
      {
        canonicalIcon: "assets/mxappicon.png",
        note: "Launcher + adaptive foreground both use mxappicon.png; this script only writes previews.",
        outputs: [
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
