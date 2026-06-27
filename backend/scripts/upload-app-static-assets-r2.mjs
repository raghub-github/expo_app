/**
 * Upload bundled app static asset images to R2 (deterministic keys matching migration).
 *
 * Usage (from backend): npm run db:upload-app-assets
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");
const backendRoot = path.resolve(__dirname, "..");

// Load env the same way as backend scripts
const envFiles = [".env", ".env.local"];
for (const f of envFiles) {
  const p = path.join(backendRoot, f);
  if (!fs.existsSync(p)) continue;
  for (const line of fs.readFileSync(p, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq < 0) continue;
    const key = t.slice(0, eq).trim();
    let val = t.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}

const localFiles = JSON.parse(
  fs.readFileSync(path.join(backendRoot, "drizzle/app-static-assets-local-files.json"), "utf8")
);

function extFromPath(filePath) {
  const m = /\.([a-z0-9]+)$/i.exec(filePath);
  const ext = (m?.[1] || "png").toLowerCase();
  return ext === "jpeg" ? "jpg" : ext;
}

function mimeForExt(ext) {
  if (ext === "jpg") return "image/jpeg";
  if (ext === "webp") return "image/webp";
  if (ext === "gif") return "image/gif";
  return "image/png";
}

function r2KeyFor(id, ext) {
  const app = id.split(".")[0];
  const slug = id.replace(/\./g, "_");
  return `app-static-assets/${app}/${slug}/bundled.${ext}`;
}

const {
  R2_ACCESS_KEY,
  R2_SECRET_KEY,
  R2_ENDPOINT,
  R2_BUCKET_NAME,
  R2_REGION = "auto",
} = process.env;

if (!R2_ACCESS_KEY || !R2_SECRET_KEY || !R2_ENDPOINT || !R2_BUCKET_NAME) {
  console.error(
    "R2 not configured. Set R2_ACCESS_KEY, R2_SECRET_KEY, R2_ENDPOINT, R2_BUCKET_NAME in backend/.env"
  );
  process.exit(1);
}

const client = new S3Client({
  region: R2_REGION,
  endpoint: R2_ENDPOINT,
  credentials: {
    accessKeyId: R2_ACCESS_KEY,
    secretAccessKey: R2_SECRET_KEY,
  },
  forcePathStyle: true,
});

let ok = 0;
let fail = 0;

for (const [id, rel] of Object.entries(localFiles)) {
  const abs = path.join(repoRoot, rel);
  if (!fs.existsSync(abs)) {
    console.error("MISS", id, rel);
    fail++;
    continue;
  }
  const ext = extFromPath(rel);
  const key = r2KeyFor(id, ext);
  const buffer = fs.readFileSync(abs);
  try {
    await client.send(
      new PutObjectCommand({
        Bucket: R2_BUCKET_NAME,
        Key: key,
        Body: buffer,
        ContentType: mimeForExt(ext),
      })
    );
    console.log("OK  ", key);
    ok++;
  } catch (e) {
    console.error("FAIL", key, e instanceof Error ? e.message : e);
    fail++;
  }
}

console.log(`\nDone: ${ok} uploaded, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
