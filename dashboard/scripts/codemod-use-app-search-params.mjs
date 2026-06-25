import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "src");
const skip = new Set([
  path.normalize("lib/navigation/use-app-search-params.ts"),
  path.normalize("context/DashboardSearchParamsContext.tsx"),
]);

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(entry.name)) out.push(full);
  }
  return out;
}

function transform(content, rel) {
  if (!content.includes("useSearchParams")) return null;
  if (skip.has(rel.replace(/\\/g, "/"))) return null;

  let next = content;
  const importRe =
    /import\s*\{([^}]+)\}\s*from\s*["']next\/navigation["'];?/g;

  let usesHook = /\buseSearchParams\s*\(/.test(next);
  if (!usesHook) return null;

  next = next.replace(importRe, (full, specifiers) => {
    const parts = specifiers
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const kept = [];
    let hadSearchParams = false;
    for (const part of parts) {
      const aliasMatch = part.match(/^useSearchParams\s+as\s+(\w+)$/);
      if (part === "useSearchParams" || aliasMatch) {
        hadSearchParams = true;
        continue;
      }
      kept.push(part);
    }
    if (!hadSearchParams) return full;
    if (kept.length === 0) return "";
    return `import { ${kept.join(", ")} } from "next/navigation";`;
  });

  if (!next.includes('from "@/lib/navigation/use-app-search-params"')) {
    const appImport =
      'import { useAppSearchParams } from "@/lib/navigation/use-app-search-params";\n';
    const firstImport = next.search(/^import\s/m);
    if (firstImport >= 0) {
      next = next.slice(0, firstImport) + appImport + next.slice(firstImport);
    } else {
      next = appImport + next;
    }
  }

  next = next.replace(/\buseSearchParams\s*\(/g, "useAppSearchParams(");
  return next === content ? null : next;
}

let changed = 0;
for (const file of walk(root)) {
  const rel = path.relative(root, file).replace(/\\/g, "/");
  const original = fs.readFileSync(file, "utf8");
  const updated = transform(original, rel);
  if (updated) {
    fs.writeFileSync(file, updated);
    changed += 1;
    console.log("updated", rel);
  }
}
console.log(`done: ${changed} files`);
