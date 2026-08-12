import fs from "fs";
import path from "path";

const root = path.resolve("src/app/api/merchant");

const OLD_RE =
  /let areaManagerId: number \| null = null;\r?\n\s*if \(!\(await isSuperAdmin\(user\.id, user\.email\)\)\) \{\r?\n\s*const systemUser = await getSystemUserByEmail\(user\.email\);\r?\n\s*if \(systemUser\) \{\r?\n\s*const am = await getAreaManagerByUserId\(systemUser\.id\);\r?\n\s*if \(am\) areaManagerId = am\.id;\r?\n\s*\}\r?\n\s*\}/g;

const NEW_BLOCK = `const areaManagerId = await resolveMerchantListAreaManagerId({
      supabaseAuthId: user.id,
      email: user.email,
    });`;

const NEW_IMPORT = `import { resolveMerchantListAreaManagerId } from "@/lib/merchants/resolve-merchant-list-scope";`;

function walk(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, out);
    else if (ent.name === "route.ts") out.push(p);
  }
  return out;
}

let patched = 0;
for (const file of walk(root)) {
  let src = fs.readFileSync(file, "utf8");
  if (!OLD_RE.test(src)) continue;
  OLD_RE.lastIndex = 0;

  let next = src.replace(OLD_RE, NEW_BLOCK);

  if (!next.includes("resolveMerchantListAreaManagerId")) {
    if (next.includes('from "@/lib/area-manager/auth"')) {
      next = next.replace(
        /import \{ getAreaManagerByUserId \} from "@\/lib\/area-manager\/auth";/,
        `import { getAreaManagerByUserId } from "@/lib/area-manager/auth";\n${NEW_IMPORT}`
      );
    } else if (next.includes('from "@/lib/auth/user-mapping"')) {
      next = next.replace(
        /import \{ getSystemUserByEmail \} from "@\/lib\/auth\/user-mapping";/,
        `import { getSystemUserByEmail } from "@/lib/auth/user-mapping";\n${NEW_IMPORT}`
      );
    } else {
      next = next.replace(
        /from "@\/lib\/permissions\/engine";/,
        `from "@/lib/permissions/engine";\n${NEW_IMPORT}`
      );
    }
  }

  if (!next.includes("getAreaManagerByUserId(")) {
    next = next.replace(
      /\r?\nimport \{ getAreaManagerByUserId \} from "@\/lib\/area-manager\/auth";/g,
      ""
    );
  }
  if (!next.includes("getSystemUserByEmail(")) {
    next = next.replace(
      /\r?\nimport \{ getSystemUserByEmail \} from "@\/lib\/auth\/user-mapping";/g,
      ""
    );
  }

  if (next !== src) {
    fs.writeFileSync(file, next);
    patched++;
    console.log("patched", path.relative(process.cwd(), file));
  }
}
console.log(`done: ${patched} files`);
