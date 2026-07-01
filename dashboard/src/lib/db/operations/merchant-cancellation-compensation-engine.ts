import { getSql } from "../client";
import { ensureMerchantCompensationEngineSchema } from "./ensure-merchant-compensation-engine-schema";
import type {
  MerchantCompensationEnginePayload,
  MerchantCompensationExclusionCode,
  MerchantCompensationScenarioCode,
  SaveMerchantCompensationEngineInput,
} from "@/lib/merchant-cancellation-compensation-engine.types";

function isRelationMissingError(e: unknown): boolean {
  if (e && typeof e === "object") {
    const o = e as { code?: string; message?: string };
    if (o.code === "42P01") return true;
    if (typeof o.message === "string" && /relation .* does not exist/i.test(o.message)) {
      return true;
    }
  }
  const msg = e instanceof Error ? e.message : String(e);
  return /relation .* does not exist/i.test(msg) || msg.includes("42P01");
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export async function getMerchantCompensationEnginePayload(): Promise<MerchantCompensationEnginePayload> {
  await ensureMerchantCompensationEngineSchema();

  try {
    const sql = getSql();

    const settingsRows = await sql.unsafe<
      {
        is_enabled: boolean;
        order_ready_accuracy_threshold: string;
        customer_cancel_grace_seconds: number;
        amount_base: string;
        policy_modal_title: string;
        updated_at: string;
      }[]
    >(`
      SELECT
        is_enabled,
        order_ready_accuracy_threshold::text,
        customer_cancel_grace_seconds,
        amount_base,
        policy_modal_title,
        updated_at::text
      FROM gm_merchant_compensation_engine_settings
      WHERE id = 1
      LIMIT 1
    `);

    const scenarios = await sql.unsafe<
      {
        scenario_code: MerchantCompensationScenarioCode;
        is_enabled: boolean;
        compensation_pct: string;
        sort_order: number;
        policy_title: string;
        policy_description: string;
        ledger_title: string;
        ledger_description: string;
        updated_at: string;
      }[]
    >(`
      SELECT
        scenario_code,
        is_enabled,
        compensation_pct::text,
        sort_order,
        policy_title,
        policy_description,
        ledger_title,
        ledger_description,
        updated_at::text
      FROM gm_merchant_compensation_scenario_config
      ORDER BY sort_order, scenario_code
    `);

    const exclusions = await sql.unsafe<
      {
        exclusion_code: MerchantCompensationExclusionCode;
        is_enabled: boolean;
        policy_title: string;
        policy_description: string;
        updated_at: string;
      }[]
    >(`
      SELECT
        exclusion_code,
        is_enabled,
        policy_title,
        policy_description,
        updated_at::text
      FROM gm_merchant_compensation_exclusion_rules
      ORDER BY exclusion_code
    `);

    const s = settingsRows[0];
    return {
      migrationRequired: false,
      settings: s
        ? {
            isEnabled: s.is_enabled,
            orderReadyAccuracyThreshold: num(s.order_ready_accuracy_threshold),
            customerCancelGraceSeconds: Number(s.customer_cancel_grace_seconds) || 60,
            amountBase: s.amount_base,
            policyModalTitle: s.policy_modal_title,
            updatedAt: s.updated_at,
          }
        : null,
      scenarios: scenarios.map((row) => ({
        scenarioCode: row.scenario_code,
        isEnabled: row.is_enabled,
        compensationPct: num(row.compensation_pct),
        sortOrder: row.sort_order,
        policyTitle: row.policy_title,
        policyDescription: row.policy_description,
        ledgerTitle: row.ledger_title,
        ledgerDescription: row.ledger_description,
        updatedAt: row.updated_at,
      })),
      exclusions: exclusions.map((row) => ({
        exclusionCode: row.exclusion_code,
        isEnabled: row.is_enabled,
        policyTitle: row.policy_title,
        policyDescription: row.policy_description,
        updatedAt: row.updated_at,
      })),
    };
  } catch (e) {
    if (isRelationMissingError(e)) {
      return {
        migrationRequired: true,
        settings: null,
        scenarios: [],
        exclusions: [],
      };
    }
    throw e;
  }
}

export async function saveMerchantCompensationEngineConfig(
  input: SaveMerchantCompensationEngineInput
): Promise<MerchantCompensationEnginePayload> {
  await ensureMerchantCompensationEngineSchema();
  const sql = getSql();

  if (input.settings) {
    const s = input.settings;
    await sql.unsafe(
      `
        UPDATE gm_merchant_compensation_engine_settings
        SET
          is_enabled = COALESCE($1, is_enabled),
          order_ready_accuracy_threshold = COALESCE($2::numeric, order_ready_accuracy_threshold),
          customer_cancel_grace_seconds = COALESCE($3, customer_cancel_grace_seconds),
          amount_base = COALESCE($4, amount_base),
          policy_modal_title = COALESCE($5, policy_modal_title),
          updated_at = NOW()
        WHERE id = 1
      `,
      [
        s.isEnabled ?? null,
        s.orderReadyAccuracyThreshold ?? null,
        s.customerCancelGraceSeconds ?? null,
        s.amountBase ?? null,
        s.policyModalTitle ?? null,
      ]
    );
  }

  if (input.scenarios) {
    for (const [code, patch] of Object.entries(input.scenarios) as [
      MerchantCompensationScenarioCode,
      NonNullable<SaveMerchantCompensationEngineInput["scenarios"]>[MerchantCompensationScenarioCode],
    ][]) {
      if (!patch) continue;
      await sql.unsafe(
        `
          UPDATE gm_merchant_compensation_scenario_config
          SET
            is_enabled = COALESCE($2, is_enabled),
            compensation_pct = COALESCE($3::numeric, compensation_pct),
            policy_title = COALESCE($4, policy_title),
            policy_description = COALESCE($5, policy_description),
            ledger_title = COALESCE($6, ledger_title),
            ledger_description = COALESCE($7, ledger_description),
            updated_at = NOW()
          WHERE scenario_code = $1::gm_merchant_compensation_scenario_code
        `,
        [
          code,
          patch.isEnabled ?? null,
          patch.compensationPct ?? null,
          patch.policyTitle ?? null,
          patch.policyDescription ?? null,
          patch.ledgerTitle ?? null,
          patch.ledgerDescription ?? null,
        ]
      );
    }
  }

  if (input.exclusions) {
    for (const [code, patch] of Object.entries(input.exclusions) as [
      MerchantCompensationExclusionCode,
      NonNullable<SaveMerchantCompensationEngineInput["exclusions"]>[MerchantCompensationExclusionCode],
    ][]) {
      if (!patch) continue;
      await sql.unsafe(
        `
          UPDATE gm_merchant_compensation_exclusion_rules
          SET
            is_enabled = COALESCE($2, is_enabled),
            policy_title = COALESCE($3, policy_title),
            policy_description = COALESCE($4, policy_description),
            updated_at = NOW()
          WHERE exclusion_code = $1::gm_merchant_compensation_exclusion_code
        `,
        [
          code,
          patch.isEnabled ?? null,
          patch.policyTitle ?? null,
          patch.policyDescription ?? null,
        ]
      );
    }
  }

  return getMerchantCompensationEnginePayload();
}
