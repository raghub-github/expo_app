import { requireSuperAdminAccess } from "@/lib/permissions/page-protection";
import { GmRuleEngineClient } from "@/components/rules/GmRuleEngineClient";

export const metadata = {
  title: "Financial Rule Engine | Super Admin",
};

/** Data loads client-side (API + session cache) for instant navigation after save. */
export default async function GmRuleEnginePage() {
  await requireSuperAdminAccess();

  return (
    <GmRuleEngineClient
      initialPayload={{
        migrationRequired: false,
        rows: [],
        catalogs: null,
        loadError: null,
      }}
    />
  );
}
