import type { getSql } from "../db/client.js";

export const ONBOARDING_BENEFITS_TASK_KEY = "ONBOARDING_BENEFITS";
export const ONBOARDING_BENEFITS_WINDOW_DAYS = 15;

export type OnboardingCompletionStatus = "INCOMPLETE" | "COMPLETED";
export type OnboardingTaskApiStatus = OnboardingCompletionStatus | "NOT_FOUND";

export type OnboardingTaskRow = {
  store_id: number;
  task_key: string;
  status: OnboardingCompletionStatus;
  completed_at: Date | string | null;
  expires_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
  completed_by: string | null;
  metadata: Record<string, unknown> | null;
};

export type OnboardingTaskDto = {
  taskKey: string;
  status: OnboardingTaskApiStatus;
  completedAt: string | null;
  expiresAt: string | null;
  isExpired: boolean;
  visible: boolean;
  startedAt: string | null;
  packagingTipsCompletedAt: string | null;
};

type Sql = ReturnType<typeof getSql>;

function toIso(value: Date | string | null | undefined): string | null {
  if (value == null) return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function asMetadata(raw: OnboardingTaskRow["metadata"]): Record<string, unknown> {
  return raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
}

export function isOnboardingTaskExpired(
  expiresAt: Date | string | null | undefined,
  now = new Date()
): boolean {
  const iso = toIso(expiresAt ?? null);
  if (!iso) return false;
  return new Date(iso).getTime() < now.getTime();
}

/**
 * Home card visibility. Completion and expiry are independent:
 * COMPLETED is always hidden, even after expires_at.
 * INCOMPLETE is hidden once expired (no longer eligible).
 */
export function isOnboardingTaskVisible(
  row: Pick<OnboardingTaskRow, "status" | "expires_at"> | null,
  now = new Date()
): boolean {
  if (!row) return false;
  if (row.status === "COMPLETED") return false;
  if (isOnboardingTaskExpired(row.expires_at, now)) return false;
  return true;
}

export function toOnboardingTaskDto(
  row: OnboardingTaskRow | null,
  taskKey = ONBOARDING_BENEFITS_TASK_KEY,
  now = new Date()
): OnboardingTaskDto {
  if (!row) {
    return {
      taskKey,
      status: "NOT_FOUND",
      completedAt: null,
      expiresAt: null,
      isExpired: false,
      visible: false,
      startedAt: null,
      packagingTipsCompletedAt: null,
    };
  }
  const meta = asMetadata(row.metadata);
  const expired = isOnboardingTaskExpired(row.expires_at, now);
  const startedAt =
    typeof meta.started_at === "string" && meta.started_at.trim()
      ? meta.started_at
      : toIso(row.created_at);
  const packagingTipsCompletedAt =
    typeof meta.packaging_tips_completed_at === "string" && meta.packaging_tips_completed_at.trim()
      ? meta.packaging_tips_completed_at
      : null;
  return {
    taskKey: row.task_key,
    status: row.status,
    completedAt: toIso(row.completed_at),
    expiresAt: toIso(row.expires_at),
    isExpired: expired,
    visible: isOnboardingTaskVisible(row, now),
    startedAt,
    packagingTipsCompletedAt,
  };
}

function mapRow(raw: Record<string, unknown>): OnboardingTaskRow {
  return {
    store_id: Number(raw.store_id),
    task_key: String(raw.task_key),
    status: String(raw.status) === "COMPLETED" ? "COMPLETED" : "INCOMPLETE",
    completed_at: (raw.completed_at as Date | string | null) ?? null,
    expires_at: (raw.expires_at as Date | string | null) ?? null,
    created_at: (raw.created_at as Date | string) ?? new Date().toISOString(),
    updated_at: (raw.updated_at as Date | string) ?? new Date().toISOString(),
    completed_by: raw.completed_by != null ? String(raw.completed_by) : null,
    metadata: asMetadata((raw.metadata as Record<string, unknown> | null) ?? null),
  };
}

export async function getOnboardingTask(
  sql: Sql,
  storeId: number,
  taskKey = ONBOARDING_BENEFITS_TASK_KEY
): Promise<OnboardingTaskRow | null> {
  const rows = await sql`
    SELECT store_id, task_key, status, completed_at, expires_at,
           created_at, updated_at, completed_by, metadata
    FROM merchant_onboarding_tasks
    WHERE store_id = ${storeId} AND task_key = ${taskKey}
    LIMIT 1
  `;
  const row = rows[0] as Record<string, unknown> | undefined;
  return row ? mapRow(row) : null;
}

export async function ensureOnboardingTaskStarted(
  sql: Sql,
  storeId: number,
  taskKey = ONBOARDING_BENEFITS_TASK_KEY
): Promise<OnboardingTaskRow> {
  const startedAt = new Date().toISOString();
  const metaJson = JSON.stringify({ started_at: startedAt });
  const inserted = await sql`
    INSERT INTO merchant_onboarding_tasks (
      store_id, task_key, status, expires_at, metadata
    )
    VALUES (
      ${storeId},
      ${taskKey},
      'INCOMPLETE',
      now() + interval '15 days',
      ${metaJson}::jsonb
    )
    ON CONFLICT (store_id, task_key) DO NOTHING
    RETURNING store_id, task_key, status, completed_at, expires_at,
              created_at, updated_at, completed_by, metadata
  `;
  if (inserted[0]) return mapRow(inserted[0] as Record<string, unknown>);
  const existing = await getOnboardingTask(sql, storeId, taskKey);
  if (!existing) {
    throw new Error("onboarding_task_ensure_failed");
  }
  return existing;
}

export async function completeOnboardingTask(
  sql: Sql,
  storeId: number,
  opts?: { taskKey?: string; completedBy?: string | null; metadata?: Record<string, unknown> }
): Promise<OnboardingTaskRow> {
  const taskKey = opts?.taskKey ?? ONBOARDING_BENEFITS_TASK_KEY;
  const completedBy = opts?.completedBy ?? null;
  const extraMeta = opts?.metadata ?? {};
  const metaJson = JSON.stringify(extraMeta);
  const rows = await sql`
    INSERT INTO merchant_onboarding_tasks (
      store_id, task_key, status, completed_at, completed_by, expires_at, metadata
    )
    VALUES (
      ${storeId},
      ${taskKey},
      'COMPLETED',
      now(),
      ${completedBy},
      now() + interval '15 days',
      ${metaJson}::jsonb
    )
    ON CONFLICT (store_id, task_key) DO UPDATE SET
      status = 'COMPLETED',
      completed_at = COALESCE(merchant_onboarding_tasks.completed_at, EXCLUDED.completed_at),
      completed_by = COALESCE(merchant_onboarding_tasks.completed_by, EXCLUDED.completed_by),
      metadata = COALESCE(merchant_onboarding_tasks.metadata, '{}'::jsonb)
        || COALESCE(EXCLUDED.metadata, '{}'::jsonb),
      updated_at = now()
    RETURNING store_id, task_key, status, completed_at, expires_at,
              created_at, updated_at, completed_by, metadata
  `;
  return mapRow(rows[0] as Record<string, unknown>);
}

export async function patchOnboardingTaskMetadata(
  sql: Sql,
  storeId: number,
  patch: Record<string, unknown>,
  taskKey = ONBOARDING_BENEFITS_TASK_KEY
): Promise<OnboardingTaskRow> {
  await ensureOnboardingTaskStarted(sql, storeId, taskKey);
  const metaJson = JSON.stringify(patch);
  const rows = await sql`
    UPDATE merchant_onboarding_tasks
    SET metadata = COALESCE(metadata, '{}'::jsonb) || ${metaJson}::jsonb,
        updated_at = now()
    WHERE store_id = ${storeId} AND task_key = ${taskKey}
    RETURNING store_id, task_key, status, completed_at, expires_at,
              created_at, updated_at, completed_by, metadata
  `;
  return mapRow(rows[0] as Record<string, unknown>);
}
