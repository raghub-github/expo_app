import fs from "fs";

const files = [
  "src/app/api/merchant/stores/[id]/store-settings/route.ts",
  "src/app/api/merchant/stores/[id]/self-delivery-riders/route.ts",
  "src/app/api/merchant/stores/[id]/operating-hours/route.ts",
  "src/app/api/merchant/stores/[id]/plans/route.ts",
];

const helperRe =
  /async function getAreaManagerId\(userId: string, email: string\) \{[\s\S]*?\n\}/;

const newHelper = `async function getAreaManagerId(userId: string, email: string) {
  return resolveMerchantListAreaManagerId({ supabaseAuthId: userId, email });
}`;

const importLine =
  'import { resolveMerchantListAreaManagerId } from "@/lib/merchants/resolve-merchant-list-scope";';

for (const f of files) {
  let s = fs.readFileSync(f, "utf8");
  if (!helperRe.test(s)) {
    console.log("no helper", f);
    continue;
  }
  helperRe.lastIndex = 0;
  s = s.replace(helperRe, newHelper);
  if (!s.includes("resolveMerchantListAreaManagerId")) {
    if (s.includes('from "@/lib/area-manager/auth"')) {
      s = s.replace(
        /import \{ getAreaManagerByUserId \} from "@\/lib\/area-manager\/auth";\r?\n/,
        `${importLine}\n`
      );
    } else {
      s = s.replace(
        /from "@\/lib\/permissions\/engine";/,
        `from "@/lib/permissions/engine";\n${importLine}`
      );
    }
  }
  if (!s.includes("getAreaManagerByUserId(")) {
    s = s.replace(
      /\r?\nimport \{ getAreaManagerByUserId \} from "@\/lib\/area-manager\/auth";/g,
      ""
    );
  }
  if (!s.includes("getSystemUserByEmail(")) {
    s = s.replace(
      /\r?\nimport \{ getSystemUserByEmail \} from "@\/lib\/auth\/user-mapping";/g,
      ""
    );
  }
  fs.writeFileSync(f, s);
  console.log("patched", f);
}
