/**
 * Rewrite `import { Text, ... } from "react-native"` → AppText as Text
 * across merchant app source (excludes AppText itself).
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const SKIP = new Set([
  path.join(ROOT, "components", "AppText.tsx"),
]);

function walk(dir, out = []) {
  for (const name of fs.readdirSync(dir)) {
    if (name === "node_modules" || name === ".expo" || name === "dist") continue;
    const full = path.join(dir, name);
    const st = fs.statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (/\.(tsx|jsx)$/.test(name)) out.push(full);
  }
  return out;
}

function transform(source) {
  // Already uses AppText as Text
  if (/import\s*\{\s*AppText\s+as\s+Text\s*\}\s*from\s*["']@\/components\/AppText["']/.test(source)) {
    return null;
  }

  let changed = false;
  let next = source;

  // Multi-line or single-line: import { ..., Text, ... } from "react-native"
  next = next.replace(
    /import\s*\{([^}]*)\}\s*from\s*(["'])react-native\2\s*;?/g,
    (full, body, quote) => {
      const parts = body.split(",").map((p) => p.trim()).filter(Boolean);
      const textParts = [];
      const otherParts = [];
      for (const p of parts) {
        // Text, Text as Foo, type TextStyle — keep types
        if (/^type\s+/.test(p) || /^TextProps$/.test(p) || /^TextStyle$/.test(p) || /^TextInput/.test(p)) {
          otherParts.push(p);
          continue;
        }
        if (p === "Text" || /^Text\s+as\s+\w+$/.test(p)) {
          textParts.push(p);
          continue;
        }
        otherParts.push(p);
      }
      if (textParts.length === 0) return full;
      changed = true;
      const lines = [];
      // Map `Text` → AppText as Text; `Text as X` → AppText as X
      const appSpecs = textParts.map((p) => {
        if (p === "Text") return "AppText as Text";
        const m = p.match(/^Text\s+as\s+(\w+)$/);
        return m ? `AppText as ${m[1]}` : p;
      });
      lines.push(`import { ${appSpecs.join(", ")} } from ${quote}@/components/AppText${quote};`);
      if (otherParts.length > 0) {
        lines.push(`import { ${otherParts.join(", ")} } from ${quote}react-native${quote};`);
      }
      return lines.join("\n");
    }
  );

  return changed ? next : null;
}

const files = walk(ROOT).filter((f) => !SKIP.has(f));
let updated = 0;
for (const file of files) {
  const src = fs.readFileSync(file, "utf8");
  const out = transform(src);
  if (!out) continue;
  fs.writeFileSync(file, out);
  updated += 1;
  console.log("updated", path.relative(ROOT, file));
}
console.log(`\nDone. Updated ${updated} files.`);
