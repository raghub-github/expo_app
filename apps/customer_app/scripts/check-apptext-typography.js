/**
 * Fail if UI files import RN Text outside the allowlist.
 * Use: node scripts/check-apptext-typography.js
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

const ALLOWLIST = new Set([
  "components/checkout/CheckoutText.tsx",
  "components/AppText.tsx",
  "components/store/StoreText.tsx",
  "components/MarkdownView.tsx",
  // Monospace rows kept as RN Text (partial)
  "app/(auth)/login.tsx",
  "app/location-map.tsx",
]);

function walk(d, a = []) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) {
      if (["node_modules", ".expo", "scripts", "dist"].includes(e.name)) continue;
      walk(p, a);
    } else if (p.endsWith(".tsx")) a.push(p);
  }
  return a;
}

function rel(f) {
  return path.relative(ROOT, f).split(path.sep).join("/");
}

const violations = [];

for (const root of ["app", "components", "features"]) {
  const dir = path.join(ROOT, root);
  if (!fs.existsSync(dir)) continue;
  for (const f of walk(dir)) {
    const r = rel(f);
    if (ALLOWLIST.has(r)) continue;
    const s = fs.readFileSync(f, "utf8");
    const importsRnText = /import\s*\{[^}]*\bText\b[^}]*\}\s*from\s*["']react-native["']/.test(s);
    const usesJsxText = /<Text[\s/>]/.test(s);
    if (importsRnText && usesJsxText) {
      violations.push(r);
    }
  }
}

if (violations.length) {
  console.error("RN <Text> found outside allowlist. Use AppText (Lora/Poppins):\n");
  for (const v of violations) console.error(" -", v);
  console.error("\nAllowlist:", [...ALLOWLIST].join(", "));
  process.exit(1);
}

console.log("Typography check OK — no unexpected RN Text usage.");
