"use client";

import { GmRuleEngineClient } from "@/components/rules/GmRuleEngineClient";
import { readGmRuleEngineCache } from "@/components/rules/gm-rule-engine-cache";
import { GmRuleListSkeleton } from "@/components/rules/gm-rule-form-ui";

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

  return (
    <div className="p-6">
      <GmRuleListSkeleton />
    </div>
  );
}
