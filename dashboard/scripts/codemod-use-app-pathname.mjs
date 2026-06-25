import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "src");

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(entry.name)) out.push(full);
  }
  return out;
}

function transform(content) {
  if (!/\busePathname\s*\(/.test(content)) return null;

  let next = content;
  const importRe =
    /import\s*\{([^}]+)\}\s*from\s*["']next\/navigation["'];?/g;

  next = next.replace(importRe, (full, specifiers) => {
    const parts = specifiers
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const kept = [];
    let hadPathname = false;
    for (const part of parts) {
      if (part === "usePathname" || /^usePathname\s+as\s+/.test(part)) {
        hadPathname = true;
        continue;
      }
      kept.push(part);
    }
    if (!hadPathname) return full;
    if (kept.length === 0) return "";
    return `import { ${kept.join(", ")} } from "next/navigation";`;
  });

  if (!next.includes('from "@/lib/navigation/use-app-pathname"')) {
    const appImport = 'import { useAppPathname } from "@/lib/navigation/use-app-pathname";\n';
    const firstImport = next.search(/^import\s/m);
    if (firstImport >= 0) {
      next = next.slice(0, firstImport) + appImport + next.slice(firstImport);
    } else {
      next = appImport + next;
    }
  }

  next = next.replace(/\busePathname\s*\(/g, "useAppPathname(");
  return next === content ? null : next;
}

let changed = 0;
for (const file of walk(root)) {
  const original = fs.readFileSync(file, "utf8");
  const updated = transform(original);
  if (updated) {
    fs.writeFileSync(file, updated);
    changed += 1;
    console.log("updated", path.relative(root, file));
  }
}
console.log(`done: ${changed} files`);
