#!/usr/bin/env node
/**
 * Builds apps/customer_app/legal/bundle.generated.ts from every .md file
 * in this directory (except INDEX, CHANGELOG, and this script).
 *
 * Run before every release:
 *   npm --workspace=gatimitra-customer-app run legal:build
 *
 * Or wire it into prebuild in package.json.
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

const EXCLUDED = new Set(["INDEX.md", "CHANGELOG.md"]);

const files = readdirSync(__dirname)
  .filter((f) => f.endsWith(".md") && !EXCLUDED.has(f))
  .sort();

const entries = files.map((file) => {
  const body = readFileSync(join(__dirname, file), "utf8");
  // Use String.raw via JSON to handle backticks, dollars, backslashes safely.
  return `  ${JSON.stringify(file)}: ${JSON.stringify(body)}`;
});

const out = `/**
 * AUTO-GENERATED — do not edit by hand.
 *
 * Source: apps/customer_app/legal/*.md
 * Generator: apps/customer_app/legal/build-bundle.mjs
 * Built at: ${new Date().toISOString()}
 *
 * Run \`npm --workspace=gatimitra-customer-app run legal:build\` after editing
 * any .md file in this folder.
 */

export const LEGAL_BUNDLE: Record<string, string> = {
${entries.join(",\n")}
};

export const LEGAL_BUNDLE_BUILT_AT = ${JSON.stringify(new Date().toISOString())};
`;

const outPath = join(__dirname, "bundle.generated.ts");
writeFileSync(outPath, out, "utf8");

const totalBytes = entries.reduce((s, e) => s + e.length, 0);
console.log(
  `[legal:build] Wrote ${files.length} docs (${(totalBytes / 1024).toFixed(1)} KB) to ${outPath}`
);
