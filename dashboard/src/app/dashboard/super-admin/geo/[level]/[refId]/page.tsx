"use client";

import { useAppParams, useAppSearchParams } from "@/hooks/useAppSearchParams";
import { GeoNodePricingContent, type GeoNodeLevel } from "@/components/geo-admin/GeoNodePricingContent";

const VALID_LEVELS: GeoNodeLevel[] = ["state", "region", "district", "division", "post_office", "pincode"];

export default function GeoNodePricingPage() {
  const params = useAppParams<{ level: string; refId: string }>();
  const searchParams = useAppSearchParams();

  const levelRaw = params.level ?? "";
  const level: GeoNodeLevel = (VALID_LEVELS as string[]).includes(levelRaw)
    ? (levelRaw as GeoNodeLevel)
    : "state";
  const refId = params.refId ?? "";
  const name = searchParams.get("name") || refId;

  return (
    <div className="w-full px-6 py-6">
      <GeoNodePricingContent level={level} refId={refId} name={name} />
    </div>
  );
}
