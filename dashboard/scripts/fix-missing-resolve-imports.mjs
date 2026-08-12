import fs from "fs";
import path from "path";

const root = path.resolve("src/app/api/merchant");
const imp =
  'import { resolveMerchantListAreaManagerId } from "@/lib/merchants/resolve-merchant-list-scope";';

function walk(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, out);
    else if (ent.name.endsWith(".ts")) out.push(p);
  }
  return out;
}

let n = 0;
for (const f of walk(root)) {
  let s = fs.readFileSync(f, "utf8");
  if (!s.includes("resolveMerchantListAreaManagerId")) continue;
  if (s.includes("@/lib/merchants/resolve-merchant-list-scope")) continue;

  if (s.includes('from "@/lib/permissions/engine"')) {
    s = s.replace(
      /from "@\/lib\/permissions\/engine";/,
      `from "@/lib/permissions/engine";\n${imp}`
    );
  } else if (s.includes('from "@/lib/permissions/merchant-access"')) {
    s = s.replace(
      /from "@\/lib\/permissions\/merchant-access";/,
      `from "@/lib/permissions/merchant-access";\n${imp}`
    );
  } else if (s.includes('from "@/lib/supabase/server"')) {
    s = s.replace(
      /from "@\/lib\/supabase\/server";/,
      `from "@/lib/supabase/server";\n${imp}`
    );
  } else {
    console.log("manual", path.relative(process.cwd(), f));
    continue;
  }
  fs.writeFileSync(f, s);
  n++;
  console.log("fixed import", path.relative(process.cwd(), f));
}
console.log("done", n);
