import { notFound } from "next/navigation";
import { requireSuperAdminAccess } from "@/lib/permissions/page-protection";
import { GmRuleEditForm } from "@/components/rules/GmRuleEditForm";
import { snapshotToForm } from "@/components/rules/gm-rule-form-model";
import {
  getGmRuleForEdit,
  getGmRuleEngineCatalogs,
  isGmRuleEngineMigrated,
} from "@/lib/db/operations/gm-rule-engine";

export const metadata = {
  title: "Edit rule | Financial Rule Engine",
};

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function EditGmRulePage({ params }: PageProps) {
  await requireSuperAdminAccess();
  const { id } = await params;
  const ruleId = Number(id);
  if (!Number.isFinite(ruleId) || ruleId <= 0) notFound();

  if (!(await isGmRuleEngineMigrated())) notFound();

  const [catalogs, row] = await Promise.all([
    getGmRuleEngineCatalogs(),
    getGmRuleForEdit(ruleId),
  ]);

  if (!row) notFound();

  const initialForm = snapshotToForm(row as Record<string, unknown>);

  return (
    <GmRuleEditForm ruleId={ruleId} catalogs={catalogs as unknown as Parameters<typeof GmRuleEditForm>[0]["catalogs"]} initialForm={initialForm} />
  );
}
