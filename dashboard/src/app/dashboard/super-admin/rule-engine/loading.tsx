"use client";

import { GmRuleEngineClient } from "@/components/rules/GmRuleEngineClient";
import { readGmRuleEngineCache } from "@/components/rules/gm-rule-engine-cache";
import { DashboardPageLoader } from "@/components/ui/DashboardPageLoader";

/** During RSC auth, show cached list instantly when returning from edit/new save. */
export default function RuleEngineLoading() {
  const cached = readGmRuleEngineCache();
  if (cached && cached.rows.length > 0) {
    return (
      <GmRuleEngineClient
        initialPayload={{
          migrationRequired: false,
          rows: cached.rows,
          catalogs: cached.catalogs,
          loadError: null,
        }}
      />
    );
  }

  return <DashboardPageLoader />;
}
