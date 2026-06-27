import { getSql } from "../client";
import {
  getCancellationCatalogPayload,
} from "./order-cancellation-reason-catalog";
import { ensureCancellationCatalogSchema } from "./ensure-cancellation-catalog-schema";
import { ensureRiderPenaltyEngineSchema } from "./ensure-rider-penalty-engine-schema";
import type {
  PartyPenaltyPanelRow,
  PenaltyPartyCode,
  RiderPenaltyAmountBase,
  RiderPenaltyEnginePayload,
  RiderPenaltyReasonRuleRow,
  RiderPenaltyScenarioCode,
  RiderPenaltyScenarioConfigRow,
  SaveRiderPenaltyEngineInput,
} from "@/lib/rider-cancellation-penalty-engine.types";

export type {
  PartyPenaltyPanelRow,
  PenaltyPartyCode,
  RiderPenaltyAmountBase,
  RiderPenaltyEnginePayload,
  RiderPenaltyReasonRuleRow,
  RiderPenaltyScenarioCode,
  RiderPenaltyScenarioConfigRow,
  SaveRiderPenaltyEngineInput,
} from "@/lib/rider-cancellation-penalty-engine.types";

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

function num(v: unknown): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export async function getRiderPenaltyEnginePayload(args?: {
  channel?: "web" | "app";
}): Promise<RiderPenaltyEnginePayload> {
  const channel = args?.channel === "app" ? "app" : "web";
  await ensureCancellationCatalogSchema();
  await ensureRiderPenaltyEngineSchema();
  const { grouped } = await getCancellationCatalogPayload({ activeOnly: true, channel });
  const riderReasons = grouped.RIDER ?? [];

  try {
    const sql = getSql();

    const parties = await sql.unsafe<
      {
        party_code: PenaltyPartyCode;
        is_enabled: boolean;
        panel_label: string;
        updated_at: string;
      }[]
    >(`
      SELECT party_code, is_enabled, panel_label, updated_at::text
      FROM gm_party_penalty_panel
      ORDER BY party_code
    `);

    const scenarios = await sql.unsafe<
      {
        id: number;
        scenario_code: RiderPenaltyScenarioCode;
        is_enabled: boolean;
        flat_penalty_amount: string | null;
        ledger_title: string;
        ledger_description: string;
        penalty_title: string;
        amount_base: RiderPenaltyAmountBase | null;
        updated_at: string;
      }[]
    >(`
      SELECT
        id,
        scenario_code,
        is_enabled,
        flat_penalty_amount::text,
        ledger_title,
        ledger_description,
        penalty_title,
        amount_base,
        updated_at::text
      FROM gm_rider_penalty_scenario_config
      ORDER BY scenario_code
    `);

    const reasonRules = await sql.unsafe<
      {
        id: number;
        scenario_code: RiderPenaltyScenarioCode;
        catalog_reason_id: number;
        applies_penalty: boolean;
        reason_label: string;
        reason_code: string;
        attribute: string;
        default_fault: string;
      }[]
    >(`
      SELECT
        r.id,
        r.scenario_code,
        r.catalog_reason_id,
        r.applies_penalty,
        c.label AS reason_label,
        c.reason_code,
        c.attribute,
        COALESCE(a.default_fault, '3pl_fault') AS default_fault
      FROM gm_rider_penalty_reason_rules r
      INNER JOIN order_cancellation_reason_catalog c ON c.id = r.catalog_reason_id
      LEFT JOIN order_cancellation_attributes a ON upper(a.code) = upper(c.attribute)
      WHERE upper(trim(c.attribute)) = 'RIDER'
        AND c.channel = $1
      ORDER BY r.scenario_code, c.sort_order, c.label
    `, [channel]);

    return {
      migrationRequired: false,
      channel,
      parties: parties.map((p) => ({
        partyCode: p.party_code,
        isEnabled: p.is_enabled,
        panelLabel: p.panel_label,
        updatedAt: p.updated_at,
      })),
      scenarios: scenarios.map((s) => ({
        id: s.id,
        scenarioCode: s.scenario_code,
        isEnabled: s.is_enabled,
        flatPenaltyAmount: num(s.flat_penalty_amount),
        ledgerTitle: s.ledger_title,
        ledgerDescription: s.ledger_description,
        penaltyTitle: s.penalty_title,
        amountBase: s.amount_base,
        updatedAt: s.updated_at,
      })),
      reasonRules: reasonRules.map((r) => ({
        id: Number(r.id),
        scenarioCode: r.scenario_code,
        catalogReasonId: Number(r.catalog_reason_id),
        appliesPenalty: r.applies_penalty,
        reasonLabel: r.reason_label,
        reasonCode: r.reason_code,
        attribute: r.attribute,
        defaultFault: r.default_fault,
      })),
      riderReasons: riderReasons.map((r) => ({ ...r, id: Number(r.id) })),
    };
  } catch (e) {
    if (isRelationMissingError(e)) {
      return {
        migrationRequired: true,
        channel,
        parties: [],
        scenarios: [],
        reasonRules: [],
        riderReasons,
      };
    }
    throw e;
  }
}

export async function saveRiderPenaltyEngineConfig(
  input: SaveRiderPenaltyEngineInput
): Promise<RiderPenaltyEnginePayload> {
  await ensureCancellationCatalogSchema();
  await ensureRiderPenaltyEngineSchema();
  const sql = getSql();

  if (input.parties) {
    for (const [partyCode, patch] of Object.entries(input.parties) as [
      PenaltyPartyCode,
      { isEnabled?: boolean },
    ][]) {
      if (patch.isEnabled == null) continue;
      await sql.unsafe(
        `
          UPDATE gm_party_penalty_panel
          SET is_enabled = $1, updated_at = NOW()
          WHERE party_code = $2::gm_penalty_party_code
        `,
        [patch.isEnabled, partyCode]
      );
    }
  }

  if (input.scenarios) {
    const accept = input.scenarios.AFTER_ACCEPT_DISPATCH;
    if (accept) {
      await sql.unsafe(
        `
          UPDATE gm_rider_penalty_scenario_config
          SET
            is_enabled = $1,
            flat_penalty_amount = $2::numeric,
            ledger_title = $3,
            ledger_description = $4,
            updated_at = NOW()
          WHERE scenario_code = 'AFTER_ACCEPT_DISPATCH'::gm_rider_penalty_scenario_code
        `,
        [
          accept.isEnabled ?? true,
          accept.flatPenaltyAmount ?? 0,
          accept.ledgerTitle ?? "",
          accept.ledgerDescription ?? "",
        ]
      );
    }
    const pickup = input.scenarios.AFTER_MARK_PICKUP;
    if (pickup) {
      await sql.unsafe(
        `
          UPDATE gm_rider_penalty_scenario_config
          SET
            is_enabled = $1,
            penalty_title = $2,
            ledger_description = $3,
            amount_base = $4::gm_rider_penalty_amount_base,
            updated_at = NOW()
          WHERE scenario_code = 'AFTER_MARK_PICKUP'::gm_rider_penalty_scenario_code
        `,
        [
          pickup.isEnabled ?? true,
          pickup.penaltyTitle ?? "",
          pickup.ledgerDescription ?? "",
          pickup.amountBase ?? "DELIVERY_FARE",
        ]
      );
    }
  }

  if (input.reasonRules?.length) {
    for (const rule of input.reasonRules) {
      await sql.unsafe(
        `
          INSERT INTO gm_rider_penalty_reason_rules (
            scenario_code,
            catalog_reason_id,
            applies_penalty,
            updated_at
          )
          VALUES (
            $1::gm_rider_penalty_scenario_code,
            $2,
            $3,
            NOW()
          )
          ON CONFLICT (scenario_code, catalog_reason_id) DO UPDATE SET
            applies_penalty = EXCLUDED.applies_penalty,
            updated_at = NOW()
        `,
        [rule.scenarioCode, rule.catalogReasonId, rule.appliesPenalty]
      );

      await sql.unsafe(
        `
          INSERT INTO gm_rider_penalty_reason_rules (
            scenario_code,
            catalog_reason_id,
            applies_penalty,
            updated_at
          )
          SELECT
            $1::gm_rider_penalty_scenario_code,
            sibling.id,
            $3,
            NOW()
          FROM order_cancellation_reason_catalog source
          INNER JOIN order_cancellation_reason_catalog sibling
            ON upper(trim(sibling.attribute)) = upper(trim(source.attribute))
           AND lower(trim(sibling.label)) = lower(trim(source.label))
          WHERE source.id = $2
            AND sibling.id <> source.id
          ON CONFLICT (scenario_code, catalog_reason_id) DO UPDATE SET
            applies_penalty = EXCLUDED.applies_penalty,
            updated_at = NOW()
        `,
        [rule.scenarioCode, rule.catalogReasonId, rule.appliesPenalty]
      );
    }
  }

  return getRiderPenaltyEnginePayload({ channel: input.channel ?? "web" });
}

/** Sync missing catalog reasons into penalty rules (web + app channels). */
export async function syncRiderPenaltyReasonRulesFromCatalog(): Promise<void> {
  try {
    await ensureCancellationCatalogSchema();
    await ensureRiderPenaltyEngineSchema();
  } catch (e) {
    if (isRelationMissingError(e)) return;
    throw e;
  }
  const sql = getSql();
  try {
    await sql.unsafe(`
    INSERT INTO gm_rider_penalty_reason_rules (scenario_code, catalog_reason_id, applies_penalty)
    SELECT s.scenario_code, c.id, FALSE
    FROM order_cancellation_reason_catalog c
    CROSS JOIN (
      SELECT unnest(ARRAY['AFTER_ACCEPT_DISPATCH', 'AFTER_MARK_PICKUP']::gm_rider_penalty_scenario_code[]) AS scenario_code
    ) s
    WHERE upper(trim(c.attribute)) = 'RIDER'
      AND c.is_active = TRUE
      AND c.channel IN ('web', 'app')
    ON CONFLICT (scenario_code, catalog_reason_id) DO NOTHING
  `);
  } catch (e) {
    if (isRelationMissingError(e)) return;
    throw e;
  }
}
