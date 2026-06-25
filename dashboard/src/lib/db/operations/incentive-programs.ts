import { getSql } from "../client";
import { ensureIncentiveProgramSlotColumns } from "../ensure-incentive-program-slot-columns";

function serializeDbValue(value: unknown): unknown {
  if (value == null) return null;
  if (typeof value === "bigint") return Number(value);
  if (value instanceof Date) return value.toISOString();
  return value;
}

function serializeDbRow(row: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [key, serializeDbValue(value)]));
}

async function attachIncentiveProgramChildren(
  programId: string,
  input: IncentiveProgramCreateInput,
): Promise<void> {
  const sql = getSql();
  const geoMode = input.geo_scope_mode ?? "selected_states";
  if (geoMode === "all_india") {
    await sql`
      INSERT INTO incentive_program_geo_scopes (program_id, scope_type)
      VALUES (${programId}::uuid, 'all_india')
    `;
  } else if (input.state_ids?.length) {
    for (const stateId of input.state_ids) {
      await sql`
        INSERT INTO incentive_program_geo_scopes (program_id, scope_type, state_id)
        VALUES (${programId}::uuid, 'state', ${stateId}::uuid)
      `;
    }
  }

  const rules = input.rules ?? {};
  await sql`
    INSERT INTO incentive_program_rules (
      program_id,
      min_completed_orders, min_accepted_orders, min_active_minutes,
      min_acceptance_rate, max_cancellation_rate, min_customer_rating,
      min_login_days, min_peak_slot_orders, max_fraud_score,
      exclude_suspended_riders, exclude_low_rating_riders, exclude_if_any_fraud_flag
    ) VALUES (
      ${programId}::uuid,
      ${rules.min_completed_orders ?? null},
      ${rules.min_accepted_orders ?? null},
      ${rules.min_active_minutes ?? null},
      ${rules.min_acceptance_rate ?? null},
      ${rules.max_cancellation_rate ?? null},
      ${rules.min_customer_rating ?? null},
      ${rules.min_login_days ?? null},
      ${rules.min_peak_slot_orders ?? null},
      ${rules.max_fraud_score ?? null},
      ${rules.exclude_suspended_riders === true},
      ${rules.exclude_low_rating_riders === true},
      ${rules.exclude_if_any_fraud_flag === true}
    )
  `;

  for (const tier of input.reward_tiers ?? []) {
    await sql`
      INSERT INTO incentive_program_reward_tiers (
        program_id, tier_no, tier_type,
        min_orders, max_orders, rank_from, rank_to, reward_amount
      ) VALUES (
        ${programId}::uuid,
        ${tier.tier_no},
        ${tier.tier_type},
        ${tier.min_orders ?? null},
        ${tier.max_orders ?? null},
        ${tier.rank_from ?? null},
        ${tier.rank_to ?? null},
        ${tier.reward_amount}
      )
    `;
  }

  for (const tw of input.time_windows ?? []) {
    await sql`
      INSERT INTO incentive_program_time_windows (
        program_id, day_of_week, start_time, end_time, label
      ) VALUES (
        ${programId}::uuid,
        ${tw.day_of_week ?? null},
        ${tw.start_time}::time,
        ${tw.end_time}::time,
        ${tw.label ?? null}
      )
    `;
  }
}

export type IncentiveProgramListRow = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  service: string;
  vehicle_type: string | null;
  status: string;
  start_at: string;
  end_at: string;
  timezone: string;
  recurrence_type: string;
  slot_mode: string;
  geo_scope_mode: string;
  visibility_mode: string;
  requires_gmitra_max: boolean;
  show_to_non_subscribers: boolean;
  show_before_eligible: boolean;
  reward_type: string;
  payout_mode: string;
  payout_cap_mode: string;
  max_winners: number | null;
  max_total_payout: string | null;
  max_payout_per_rider: string | null;
  stop_on_budget_exhaust: boolean;
  sort_basis: string | null;
  tie_breaker: string | null;
  is_active: boolean;
  is_paused: boolean;
  created_at: string;
  updated_at: string;
  geo_summary: string;
  state_ids: string[];
  eligible_count: number;
  winners_count: number;
  total_payout_estimate: string | null;
  actual_payout: string | null;
};

export type IncentiveProgramRulesInput = {
  min_completed_orders?: number | null;
  min_accepted_orders?: number | null;
  min_active_minutes?: number | null;
  min_acceptance_rate?: number | null;
  max_cancellation_rate?: number | null;
  min_customer_rating?: number | null;
  min_login_days?: number | null;
  min_peak_slot_orders?: number | null;
  max_fraud_score?: number | null;
  exclude_suspended_riders?: boolean;
  exclude_low_rating_riders?: boolean;
  exclude_if_any_fraud_flag?: boolean;
};

export type IncentiveRewardTierInput = {
  tier_no: number;
  tier_type: string;
  min_orders?: number | null;
  max_orders?: number | null;
  rank_from?: number | null;
  rank_to?: number | null;
  reward_amount: number;
};

export type IncentiveTimeWindowInput = {
  day_of_week?: number | null;
  start_time: string;
  end_time: string;
  label?: string | null;
};

export type IncentiveProgramCreateInput = {
  code: string;
  name: string;
  description?: string | null;
  service: string;
  vehicle_type?: string | null;
  status?: string;
  start_at: string;
  end_at: string;
  timezone?: string;
  recurrence_type?: string;
  slot_mode?: string;
  slot_day_mode?: string;
  active_days?: number[];
  geo_scope_mode?: string;
  visibility_mode?: string;
  requires_gmitra_max?: boolean;
  show_to_non_subscribers?: boolean;
  show_before_eligible?: boolean;
  reward_type: string;
  payout_mode?: string;
  payout_cap_mode?: string;
  max_winners?: number | null;
  max_total_payout?: number | null;
  max_payout_per_rider?: number | null;
  stop_on_budget_exhaust?: boolean;
  sort_basis?: string | null;
  tie_breaker?: string | null;
  is_active?: boolean;
  is_paused?: boolean;
  state_ids?: string[];
  rules?: IncentiveProgramRulesInput;
  reward_tiers?: IncentiveRewardTierInput[];
  time_windows?: IncentiveTimeWindowInput[];
  calendar_badges?: Array<{ date: string; label: string }>;
};

function buildGeoSummary(mode: string, stateNames: string[]): string {
  if (mode === "all_india") return "All India";
  if (stateNames.length === 0) return "—";
  if (stateNames.length === 1) return stateNames[0]!;
  if (stateNames.length <= 3) return stateNames.join(" + ");
  return `${stateNames.length} States / UTs`;
}

export async function listIncentivePrograms(): Promise<IncentiveProgramListRow[]> {
  await ensureIncentiveProgramSlotColumns();
  const sql = getSql();
  const rows = (await sql`
    SELECT
      p.id,
      p.code,
      p.name,
      p.description,
      p.service,
      p.vehicle_type,
      p.status,
      p.start_at::text AS start_at,
      p.end_at::text AS end_at,
      p.timezone,
      p.recurrence_type,
      p.slot_mode,
      p.geo_scope_mode,
      p.visibility_mode,
      p.requires_gmitra_max,
      p.show_to_non_subscribers,
      p.show_before_eligible,
      p.reward_type,
      p.payout_mode,
      p.payout_cap_mode,
      p.max_winners,
      p.max_total_payout::text AS max_total_payout,
      p.max_payout_per_rider::text AS max_payout_per_rider,
      p.stop_on_budget_exhaust,
      p.sort_basis,
      p.tie_breaker,
      p.is_active,
      p.is_paused,
      p.created_at::text AS created_at,
      p.updated_at::text AS updated_at,
      COALESCE(
        array_agg(DISTINCT g.state_id::text) FILTER (WHERE g.state_id IS NOT NULL),
        ARRAY[]::text[]
      ) AS state_ids,
      COALESCE(
        array_agg(DISTINCT s.name ORDER BY s.name) FILTER (WHERE s.name IS NOT NULL),
        ARRAY[]::text[]
      ) AS state_names,
      COALESCE(stats.eligible_count, 0)::int AS eligible_count,
      COALESCE(stats.winners_count, 0)::int AS winners_count,
      stats.total_payout_estimate::text AS total_payout_estimate,
      stats.actual_payout::text AS actual_payout
    FROM incentive_programs p
    LEFT JOIN incentive_program_geo_scopes g
      ON g.program_id = p.id AND g.is_active = true
    LEFT JOIN states s ON s.id = g.state_id
    LEFT JOIN LATERAL (
      SELECT
        COUNT(*) FILTER (WHERE rip.base_eligible = true)::int AS eligible_count,
        COUNT(*) FILTER (WHERE rip.winner_selected = true)::int AS winners_count,
        SUM(rip.projected_reward) FILTER (WHERE rip.base_eligible = true) AS total_payout_estimate,
        SUM(rip.final_reward) FILTER (WHERE rip.rider_status = 'REWARD_EARNED') AS actual_payout
      FROM rider_incentive_progress rip
      WHERE rip.program_id = p.id
    ) stats ON true
    GROUP BY p.id, stats.eligible_count, stats.winners_count, stats.total_payout_estimate, stats.actual_payout
    ORDER BY p.created_at DESC
  `) as Array<IncentiveProgramListRow & { state_names: string[] | null; state_ids?: string[] }>;

  return rows.map((r) => ({
    ...r,
    geo_summary: buildGeoSummary(r.geo_scope_mode, r.state_names ?? []),
    state_ids: r.state_ids ?? [],
  }));
}

export async function createIncentiveProgram(input: IncentiveProgramCreateInput): Promise<{ id: string }> {
  await ensureIncentiveProgramSlotColumns();
  const sql = getSql();
  const status = input.status ?? "draft";
  const isActive = input.is_active ?? status === "active";

  const inserted = await sql<{ id: string }[]>`
    INSERT INTO incentive_programs (
      code, name, description, service, vehicle_type, status,
      start_at, end_at, timezone, recurrence_type, slot_mode, slot_day_mode, active_days,
      calendar_badges,
      geo_scope_mode, visibility_mode,
      requires_gmitra_max, show_to_non_subscribers, show_before_eligible,
      reward_type, payout_mode, payout_cap_mode,
      max_winners, max_total_payout, max_payout_per_rider, stop_on_budget_exhaust,
      sort_basis, tie_breaker, is_active, is_paused
    ) VALUES (
      ${input.code.trim()},
      ${input.name.trim()},
      ${input.description ?? null},
      ${input.service},
      ${input.vehicle_type ?? null},
      ${status},
      ${input.start_at}::timestamptz,
      ${input.end_at}::timestamptz,
      ${input.timezone ?? "Asia/Kolkata"},
      ${input.recurrence_type ?? "one_time"},
      ${input.slot_mode ?? "all_day"},
      ${input.slot_day_mode ?? "full_week"},
      ${JSON.stringify(input.active_days ?? [])}::jsonb,
      ${JSON.stringify(input.calendar_badges ?? [])}::jsonb,
      ${input.geo_scope_mode ?? "selected_states"},
      ${input.visibility_mode ?? "scoped_visible"},
      ${input.requires_gmitra_max ?? true},
      ${input.show_to_non_subscribers ?? true},
      ${input.show_before_eligible ?? true},
      ${input.reward_type},
      ${input.payout_mode ?? "manual_approve"},
      ${input.payout_cap_mode ?? "top_n"},
      ${input.max_winners ?? null},
      ${input.max_total_payout ?? null},
      ${input.max_payout_per_rider ?? null},
      ${input.stop_on_budget_exhaust ?? false},
      ${input.sort_basis ?? null},
      ${input.tie_breaker ?? null},
      ${isActive},
      ${input.is_paused ?? false}
    )
    RETURNING id::text AS id
  `;
  const programId = inserted[0]?.id;
  if (!programId) throw new Error("Failed to create incentive program");

  await attachIncentiveProgramChildren(programId, input);

  return { id: programId };
}

export async function updateIncentiveProgram(
  id: string,
  input: IncentiveProgramCreateInput,
): Promise<void> {
  await ensureIncentiveProgramSlotColumns();
  const sql = getSql();
  const status = input.status ?? "draft";
  const isActive = input.is_active ?? status === "active";

  const updated = await sql<{ id: string }[]>`
    UPDATE incentive_programs SET
      code = ${input.code.trim()},
      name = ${input.name.trim()},
      description = ${input.description ?? null},
      service = ${input.service},
      vehicle_type = ${input.vehicle_type ?? null},
      status = ${status},
      start_at = ${input.start_at}::timestamptz,
      end_at = ${input.end_at}::timestamptz,
      timezone = ${input.timezone ?? "Asia/Kolkata"},
      recurrence_type = ${input.recurrence_type ?? "one_time"},
      slot_mode = ${input.slot_mode ?? "all_day"},
      slot_day_mode = ${input.slot_day_mode ?? "full_week"},
      active_days = ${JSON.stringify(input.active_days ?? [])}::jsonb,
      calendar_badges = ${JSON.stringify(input.calendar_badges ?? [])}::jsonb,
      geo_scope_mode = ${input.geo_scope_mode ?? "selected_states"},
      visibility_mode = ${input.visibility_mode ?? "scoped_visible"},
      requires_gmitra_max = ${input.requires_gmitra_max ?? true},
      show_to_non_subscribers = ${input.show_to_non_subscribers ?? true},
      show_before_eligible = ${input.show_before_eligible ?? true},
      reward_type = ${input.reward_type},
      payout_mode = ${input.payout_mode ?? "manual_approve"},
      payout_cap_mode = ${input.payout_cap_mode ?? "top_n"},
      max_winners = ${input.max_winners ?? null},
      max_total_payout = ${input.max_total_payout ?? null},
      max_payout_per_rider = ${input.max_payout_per_rider ?? null},
      stop_on_budget_exhaust = ${input.stop_on_budget_exhaust ?? false},
      sort_basis = ${input.sort_basis ?? null},
      tie_breaker = ${input.tie_breaker ?? null},
      is_active = ${isActive},
      is_paused = ${input.is_paused ?? false},
      updated_at = now()
    WHERE id = ${id}::uuid
    RETURNING id::text AS id
  `;
  if (!updated.length) throw new Error("Incentive program not found");

  await sql`DELETE FROM incentive_program_geo_scopes WHERE program_id = ${id}::uuid`;
  await sql`DELETE FROM incentive_program_rules WHERE program_id = ${id}::uuid`;
  await sql`DELETE FROM incentive_program_reward_tiers WHERE program_id = ${id}::uuid`;
  await sql`DELETE FROM incentive_program_time_windows WHERE program_id = ${id}::uuid`;

  await attachIncentiveProgramChildren(id, input);
}

export async function updateIncentiveProgramStatus(
  id: string,
  patch: { status?: string; is_active?: boolean; is_paused?: boolean },
): Promise<void> {
  const sql = getSql();
  if (patch.status != null) {
    await sql`
      UPDATE incentive_programs
      SET status = ${patch.status}, is_active = ${patch.status === "active"}, updated_at = now()
      WHERE id = ${id}::uuid
    `;
  } else if (patch.is_active != null) {
    await sql`
      UPDATE incentive_programs
      SET is_active = ${patch.is_active}, updated_at = now()
      WHERE id = ${id}::uuid
    `;
  }
  if (patch.is_paused != null) {
    await sql`
      UPDATE incentive_programs
      SET is_paused = ${patch.is_paused}, updated_at = now()
      WHERE id = ${id}::uuid
    `;
  }
}

export async function deleteIncentiveProgram(id: string): Promise<void> {
  const sql = getSql();
  await sql`DELETE FROM incentive_programs WHERE id = ${id}::uuid`;
}

export async function getIncentiveProgramDetail(id: string) {
  await ensureIncentiveProgramSlotColumns();
  const sql = getSql();
  const programs = await sql`
    SELECT * FROM incentive_programs WHERE id = ${id}::uuid LIMIT 1
  `;
  if (!programs.length) return null;

  const [rules, tiers, geo, windows] = await Promise.all([
    sql`SELECT * FROM incentive_program_rules WHERE program_id = ${id}::uuid LIMIT 1`,
    sql`
      SELECT
        id,
        program_id,
        tier_no,
        tier_type,
        min_orders,
        max_orders,
        rank_from,
        rank_to,
        reward_amount::text AS reward_amount
      FROM incentive_program_reward_tiers
      WHERE program_id = ${id}::uuid
      ORDER BY tier_no
    `,
    sql`SELECT state_id::text AS state_id FROM incentive_program_geo_scopes WHERE program_id = ${id}::uuid AND is_active = true`,
    sql`SELECT * FROM incentive_program_time_windows WHERE program_id = ${id}::uuid ORDER BY day_of_week NULLS FIRST, start_time`,
  ]);

  return {
    program: serializeDbRow(programs[0] as Record<string, unknown>),
    rules: rules[0] ? serializeDbRow(rules[0] as Record<string, unknown>) : null,
    reward_tiers: tiers.map((t) => serializeDbRow(t as Record<string, unknown>)),
    state_ids: (geo as unknown as Array<{ state_id: string | null }>).map((g) => g.state_id).filter(Boolean),
    time_windows: windows.map((w) => serializeDbRow(w as Record<string, unknown>)),
  };
}
