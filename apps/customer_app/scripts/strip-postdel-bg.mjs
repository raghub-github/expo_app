import sharp from "sharp";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const target = path.join(__dirname, "../public/img/postdel.png");

function isBg(r, g, b) {
  return r <= 8 && g <= 8 && b <= 8;
}

const { data, info } = await sharp(target).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const { width, height, channels } = info;
const visited = new Uint8Array(width * height);
const queue = [];

const pushIfBg = (x, y) => {
  if (x < 0 || y < 0 || x >= width || y >= height) return;
  const idx = y * width + x;
  if (visited[idx]) return;
  const i = idx * channels;
  if (!isBg(data[i], data[i + 1], data[i + 2])) return;
  visited[idx] = 1;
  queue.push(idx);
};

for (let x = 0; x < width; x++) {
  pushIfBg(x, 0);
  pushIfBg(x, height - 1);
}
for (let y = 0; y < height; y++) {
  pushIfBg(0, y);
  pushIfBg(width - 1, y);
}

while (queue.length) {
  const idx = queue.pop();
  const x = idx % width;
  const y = (idx - x) / width;
  pushIfBg(x - 1, y);
  pushIfBg(x + 1, y);
  pushIfBg(x, y - 1);
  pushIfBg(x, y + 1);
}

let cleared = 0;
for (let idx = 0; idx < width * height; idx++) {
  if (!visited[idx]) continue;
  const i = idx * channels;
  data[i] = 0;
  data[i + 1] = 0;
  data[i + 2] = 0;
  data[i + 3] = 0;
  cleared++;
}

await sharp(Buffer.from(data), { raw: { width, height, channels: 4 } })
  .png({ compressionLevel: 9 })
  .toFile(target);

console.log(`postdel.png: cleared ${cleared} / ${width * height} pixels`);
