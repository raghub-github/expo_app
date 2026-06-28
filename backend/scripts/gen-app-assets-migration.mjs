/**
 * Generate 0373_app_static_assets.sql from seed registry + bundled local file map.
 * Each row gets deterministic r2_key + proxy_url for the images previously bundled in apps.
 *
 * Usage (from backend): node scripts/gen-app-assets-migration.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");
const backendRoot = path.resolve(__dirname, "..");

const seeds = JSON.parse(
  fs.readFileSync(path.join(backendRoot, "drizzle/app-static-assets-seed.json"), "utf8")
);
const localFiles = JSON.parse(
  fs.readFileSync(path.join(backendRoot, "drizzle/app-static-assets-local-files.json"), "utf8")
);

function esc(s) {
  return String(s).replace(/'/g, "''");
}

function extFromPath(filePath) {
  const m = /\.([a-z0-9]+)$/i.exec(filePath);
  const ext = (m?.[1] || "png").toLowerCase();
  return ext === "jpeg" ? "jpg" : ext;
}

function r2KeyFor(id, ext) {
  const app = id.split(".")[0];
  const slug = id.replace(/\./g, "_");
  return `app-static-assets/${app}/${slug}/bundled.${ext}`;
}

function proxyUrlFor(r2Key) {
  return `/api/attachments/proxy?key=${encodeURIComponent(r2Key)}`;
}

const missing = [];
const rows = seeds.map((s) => {
  const rel = localFiles[s.id];
  if (!rel) {
    missing.push(s.id);
    return null;
  }
  const abs = path.join(repoRoot, rel);
  if (!fs.existsSync(abs)) {
    missing.push(`${s.id} (${rel})`);
    return null;
  }
  const ext = extFromPath(rel);
  const r2Key = r2KeyFor(s.id, ext);
  const proxyUrl = proxyUrlFor(r2Key);
  return `  ('${esc(s.id)}', '${s.app}', '${esc(s.section)}', '${esc(s.label)}', '${esc(s.description)}', '${esc(r2Key)}', '${esc(proxyUrl)}', ${s.sortOrder})`;
});

if (missing.length) {
  console.error("Missing local file mapping or file not found:");
  for (const m of missing) console.error("  -", m);
  process.exit(1);
}

const sql = `-- App static assets — managed images for customer / rider / merchant apps.
-- Bundled app images uploaded to R2 under app-static-assets/{app}/{slot}/bundled.{ext}
-- Regenerate: node scripts/gen-app-assets-migration.mjs
-- Upload to R2: npm run db:upload-app-assets

CREATE TABLE IF NOT EXISTS public.app_static_assets (
  id text PRIMARY KEY,
  app text NOT NULL CHECK (app IN ('customer', 'rider', 'merchant')),
  section text NOT NULL,
  label text NOT NULL,
  description text NOT NULL DEFAULT '',
  r2_key text,
  proxy_url text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_app_static_assets_app_sort
  ON public.app_static_assets (app, section, sort_order, id);

COMMENT ON TABLE public.app_static_assets IS
  'CMS-managed static images for mobile apps. proxy_url is /api/attachments/proxy?key=...';

INSERT INTO public.app_static_assets (id, app, section, label, description, r2_key, proxy_url, sort_order)
VALUES
${rows.join(",\n")}
ON CONFLICT (id) DO UPDATE SET
  r2_key = EXCLUDED.r2_key,
  proxy_url = EXCLUDED.proxy_url,
  updated_at = now();
`;

const outBackend = path.join(backendRoot, "drizzle/0373_app_static_assets.sql");
const outDashboard = path.join(repoRoot, "dashboard/drizzle/0373_app_static_assets.sql");
fs.writeFileSync(outBackend, sql);
fs.writeFileSync(outDashboard, sql);
console.log("Wrote", outBackend, "and dashboard copy with", seeds.length, "rows");
