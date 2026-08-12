import fs from "fs";
import path from "path";

const root = path.resolve("src/app/api/merchant");

const patterns = [
  // Pattern A: classic non-superadmin AM lookup
  {
    re: /let areaManagerId: number \| null = null;\r?\n\s*if \(!\(await isSuperAdmin\(user\.id, user\.email\)\)\) \{\r?\n\s*const systemUser = await getSystemUserByEmail\(user\.email\);\r?\n\s*if \(systemUser\) \{\r?\n\s*const am = await getAreaManagerByUserId\(systemUser\.id\);\r?\n\s*if \(am\) areaManagerId = am\.id;\r?\n\s*\}\r?\n\s*\}/g,
    replacement: `const areaManagerId = await resolveMerchantListAreaManagerId({
      supabaseAuthId: user.id,
      email: user.email,
    });`,
  },
  // Pattern B: access.isSuperAdmin / access.isAdmin
  {
    re: /let areaManagerId: number \| null = null;\r?\n\s*if \(!access\.isSuperAdmin && !access\.isAdmin\) \{\r?\n\s*const am = await getAreaManagerByUserId\(access\.systemUserId\);\r?\n\s*if \(am\) areaManagerId = am\.id;\r?\n\s*\}/g,
    replacement: `const areaManagerId = await resolveMerchantListAreaManagerId({
      supabaseAuthId: user.id,
      email: user.email,
    });`,
  },
  // Pattern C: systemUser already fetched, then AM if not superadmin
  {
    re: /let areaManagerId: number \| null = null;\r?\n\s*if \(systemUser && !\(await isSuperAdmin\(user\.id, user\.email\)\)\) \{\r?\n\s*const am = await getAreaManagerByUserId\(systemUser\.id\);\r?\n\s*if \(am\) areaManagerId = am\.id;\r?\n\s*\}/g,
    replacement: `const areaManagerId = await resolveMerchantListAreaManagerId({
      supabaseAuthId: user.id,
      email: user.email,
    });`,
  },
  // Pattern D: !access.isSuperAdmin && !access.isAdmin with systemUser lookup
  {
    re: /let areaManagerId: number \| null = null;\r?\n\s*if \(!access\.isSuperAdmin && !access\.isAdmin\) \{\r?\n\s*const systemUser = await getSystemUserByEmail\(user\.email\);\r?\n\s*if \(systemUser\) \{\r?\n\s*const am = await getAreaManagerByUserId\(systemUser\.id\);\r?\n\s*if \(am\) areaManagerId = am\.id;\r?\n\s*\}\r?\n\s*\}/g,
    replacement: `const areaManagerId = await resolveMerchantListAreaManagerId({
      supabaseAuthId: user.id,
      email: user.email,
    });`,
  },
];

const NEW_IMPORT =
  'import { resolveMerchantListAreaManagerId } from "@/lib/merchants/resolve-merchant-list-scope";';

function walk(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, out);
    else if (ent.name === "route.ts" || ent.name.endsWith(".ts")) out.push(p);
  }
  return out;
}

let patched = 0;
for (const file of walk(root)) {
  let src = fs.readFileSync(file, "utf8");
  let next = src;
  let changed = false;
  for (const { re, replacement } of patterns) {
    if (re.test(next)) {
      re.lastIndex = 0;
      next = next.replace(re, replacement);
      changed = true;
    }
  }
  if (!changed) continue;

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

  if (next !== src) {
    fs.writeFileSync(file, next);
    patched++;
    console.log("patched", path.relative(process.cwd(), file));
  }
}
console.log(`done: ${patched} files`);
