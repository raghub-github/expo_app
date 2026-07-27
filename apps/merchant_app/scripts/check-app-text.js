const fs = require("fs");
const path = require("path");
function walk(d, a = []) {
  for (const n of fs.readdirSync(d)) {
    if (n === "node_modules" || n === ".expo") continue;
    const f = path.join(d, n);
    const s = fs.statSync(f);
    if (s.isDirectory()) walk(f, a);
    else if (/\.(tsx|jsx)$/.test(n)) a.push(f);
  }
  return a;
}
const bad = [];
for (const f of walk(".")) {
  const t = fs.readFileSync(f, "utf8");
  if (!/<Text[\s>]/.test(t)) continue;
  if (f.includes("AppText.tsx")) continue;
  if (/AppText as Text|@\/components\/AppText/.test(t)) continue;
  bad.push(f);
}
console.log(bad.length ? bad.join("\n") : "OK: all Text JSX use AppText");
