import { requireSuperAdminAccess } from "@/lib/permissions/page-protection";
import { GmRuleEditForm } from "@/components/rules/GmRuleEditForm";
import { getGmRuleEngineCatalogs, isGmRuleEngineMigrated } from "@/lib/db/operations/gm-rule-engine";

export const metadata = {
  title: "Create rule | Financial Rule Engine",
};

export default async function NewGmRulePage() {
  await requireSuperAdminAccess();

  let catalogs: Awaited<ReturnType<typeof getGmRuleEngineCatalogs>> | null = null;
  try {
    if (await isGmRuleEngineMigrated()) {
      catalogs = await getGmRuleEngineCatalogs();
    }
  } catch {
    catalogs = null;
  }

  return <GmRuleEditForm catalogs={catalogs} />;
}
