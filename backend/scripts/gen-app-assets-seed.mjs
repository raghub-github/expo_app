import { APP_STATIC_ASSET_SEEDS } from "../src/lib/app-static-assets.registry.ts";

function esc(s) {
  return s.replace(/'/g, "''");
}

const rows = APP_STATIC_ASSET_SEEDS.map(
  (s) =>
    `  ('${esc(s.id)}', '${s.app}', '${esc(s.section)}', '${esc(s.label)}', '${esc(s.description)}', ${s.sortOrder})`
).join(",\n");

console.log(rows);
