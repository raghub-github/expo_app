/**
 * Generates the Android notification small icon for GatiMitra Partner.
 *
 * Launcher icon: assets/mxappicon.png only (see generate-launcher-icon.mjs for previews).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");

/** Android status-bar / notification small icon — white alpha only, compact monogram. */
const NOTIFICATION_ICON_OUT = path.join(projectRoot, "assets/notification-icon.png");
const NOTIFICATION_CANVAS = 96;

/**
 * Compact white "GM" monogram (like Zomato's "Z") for Android notification small icon.
 * Must be white-on-transparent — the OS tints it with the plugin `color`.
 */
async function generateGmNotificationIcon() {
  const c = NOTIFICATION_CANVAS;
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
  fs.mkdirSync(path.dirname(NOTIFICATION_ICON_OUT), { recursive: true });
  await sharp(Buffer.from(svg)).png().toFile(NOTIFICATION_ICON_OUT);
}

async function generateIcons() {
  await generateGmNotificationIcon();
  console.log(
    JSON.stringify(
      {
        output: path.relative(projectRoot, NOTIFICATION_ICON_OUT),
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
