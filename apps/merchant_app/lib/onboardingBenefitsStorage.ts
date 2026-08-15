/**
 * Per-store onboarding benefits.
 * Database (merchant_onboarding_tasks) is the source of truth.
 * Local memory is a session cache only and is never used to SHOW the Home card.
 */

import { getConfig } from "@/config/env";

export const ONBOARDING_BENEFITS_WINDOW_DAYS = 15;
export const ONBOARDING_IMAGE_TARGET = 10;
export const ONBOARDING_BENEFITS_TASK_KEY = "ONBOARDING_BENEFITS";

export type OnboardingTaskApiStatus = "INCOMPLETE" | "COMPLETED" | "NOT_FOUND";

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

export type OnboardingBenefitsState = {
  startedAt: string;
  packagingTipsCompletedAt?: string | null;
  dismissedAt?: string | null;
  completedAt?: string | null;
};

type SessionEntry = {
  dto: OnboardingTaskDto;
};

/** Session cache only. Never used to render the card as visible. */
const sessionByStoreDbId = new Map<number, SessionEntry>();

function apiBase(): string {
  return getConfig().apiBaseUrl.replace(/\/+$/, "");
}

function authHeaders(token: string): HeadersInit {
  return { Authorization: `Bearer ${token}`, "X-Silent-Error": "1" };
}

function normalizeTask(raw: Partial<OnboardingTaskDto> & {
  task_key?: string;
  completed_at?: string | null;
  expires_at?: string | null;
  is_expired?: boolean;
  started_at?: string | null;
  packaging_tips_completed_at?: string | null;
  status?: string | null;
  visible?: boolean;
}): OnboardingTaskDto {
  const statusRaw = String(raw.status ?? "NOT_FOUND").toUpperCase();
  const status: OnboardingTaskApiStatus =
    statusRaw === "COMPLETED" ? "COMPLETED" : statusRaw === "INCOMPLETE" ? "INCOMPLETE" : "NOT_FOUND";
  const completedAt = raw.completedAt ?? raw.completed_at ?? null;
  const expiresAt = raw.expiresAt ?? raw.expires_at ?? null;
  const isExpired = raw.isExpired ?? raw.is_expired ?? false;
  const visible = status === "COMPLETED" ? false : Boolean(raw.visible) && status === "INCOMPLETE" && !isExpired;
  return {
    taskKey: raw.taskKey ?? raw.task_key ?? ONBOARDING_BENEFITS_TASK_KEY,
    status,
    completedAt,
    expiresAt,
    isExpired,
    visible,
    startedAt: raw.startedAt ?? raw.started_at ?? null,
    packagingTipsCompletedAt: raw.packagingTipsCompletedAt ?? raw.packaging_tips_completed_at ?? null,
  };
}

function remember(storeDbId: number, dto: OnboardingTaskDto): OnboardingTaskDto {
  sessionByStoreDbId.set(storeDbId, { dto });
  return dto;
}

export function peekCompletedOnboardingTask(storeDbId: number | null): boolean {
  if (!storeDbId) return false;
  return sessionByStoreDbId.get(storeDbId)?.dto.status === "COMPLETED";
}

export async function fetchOnboardingTask(
  storeDbId: number,
  token: string
): Promise<OnboardingTaskDto | null> {
  try {
    const res = await fetch(
      `${apiBase()}/v1/merchant-partner/stores/${storeDbId}/onboarding/tasks`,
      { headers: authHeaders(token) }
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { task?: Partial<OnboardingTaskDto>; tasks?: Partial<OnboardingTaskDto>[] };
    const raw = data.task ?? data.tasks?.[0];
    if (!raw) {
      const missing = normalizeTask({ status: "NOT_FOUND", visible: false });
      return remember(storeDbId, missing);
    }
    return remember(storeDbId, normalizeTask(raw));
  } catch {
    return null;
  }
}

export async function startOnboardingTask(
  storeDbId: number,
  token: string
): Promise<OnboardingTaskDto | null> {
  try {
    const res = await fetch(
      `${apiBase()}/v1/merchant-partner/stores/${storeDbId}/onboarding/tasks/${ONBOARDING_BENEFITS_TASK_KEY}/start`,
      { method: "POST", headers: authHeaders(token) }
    );
    if (!res.ok) return null;
    const data = (await res.json()) as Partial<OnboardingTaskDto>;
    return remember(storeDbId, normalizeTask(data));
  } catch {
    return null;
  }
}

export async function completeOnboardingTaskRemote(
  storeDbId: number,
  token: string
): Promise<OnboardingTaskDto | null> {
  try {
    const res = await fetch(
      `${apiBase()}/v1/merchant-partner/stores/${storeDbId}/onboarding/tasks/${ONBOARDING_BENEFITS_TASK_KEY}/complete`,
      { method: "POST", headers: authHeaders(token) }
    );
    if (!res.ok) return null;
    const data = (await res.json()) as Partial<OnboardingTaskDto>;
    return remember(storeDbId, normalizeTask({ ...data, status: "COMPLETED", visible: false }));
  } catch {
    return null;
  }
}

async function patchRemoteState(
  storeDbId: number,
  token: string,
  patch: Record<string, unknown>
): Promise<OnboardingTaskDto | null> {
  try {
    const res = await fetch(`${apiBase()}/v1/merchant-partner/stores/${storeDbId}/onboarding-benefits`, {
      method: "PATCH",
      headers: {
        ...authHeaders(token),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(patch),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as Partial<OnboardingTaskDto> & {
      completed_at?: string | null;
      started_at?: string | null;
      packaging_tips_completed_at?: string | null;
      status?: string | null;
      visible?: boolean;
      is_expired?: boolean;
      expires_at?: string | null;
    };
    return remember(storeDbId, normalizeTask(data));
  } catch {
    return null;
  }
}

function dtoToState(dto: OnboardingTaskDto): OnboardingBenefitsState | null {
  if (dto.status === "NOT_FOUND" && !dto.startedAt) return null;
  return {
    startedAt: dto.startedAt ?? new Date().toISOString(),
    packagingTipsCompletedAt: dto.packagingTipsCompletedAt,
    dismissedAt: dto.status === "COMPLETED" ? dto.completedAt : null,
    completedAt: dto.completedAt,
  };
}

export async function loadOnboardingBenefitsState(
  _storeId: string,
  opts?: { storeDbId?: number | null; token?: string | null }
): Promise<OnboardingBenefitsState | null> {
  if (opts?.storeDbId && opts.token) {
    const cached = sessionByStoreDbId.get(opts.storeDbId)?.dto;
    if (cached) return dtoToState(cached);
    const dto = await fetchOnboardingTask(opts.storeDbId, opts.token);
    return dto ? dtoToState(dto) : null;
  }
  return null;
}

export async function syncOnboardingBenefitsFromServer(
  _storePublicId: string,
  storeDbId: number | null,
  token: string | null
): Promise<OnboardingBenefitsState | null> {
  if (!storeDbId || !token) return null;
  const dto = await fetchOnboardingTask(storeDbId, token);
  return dto ? dtoToState(dto) : null;
}

export async function ensureOnboardingBenefitsStarted(
  _storeId: string,
  opts?: { storeDbId?: number | null; token?: string | null }
): Promise<OnboardingBenefitsState> {
  if (opts?.storeDbId && opts.token) {
    const existing = await fetchOnboardingTask(opts.storeDbId, opts.token);
    if (existing?.status === "COMPLETED") {
      return dtoToState(existing)!;
    }
    if (existing?.status === "INCOMPLETE" && existing.startedAt) {
      return dtoToState(existing)!;
    }
    const started = await startOnboardingTask(opts.storeDbId, opts.token);
    if (started) return dtoToState(started)!;
  }
  return {
    startedAt: new Date().toISOString(),
    packagingTipsCompletedAt: null,
    dismissedAt: null,
    completedAt: null,
  };
}

export async function markPackagingTipsCompleted(
  _storeId: string,
  opts?: { storeDbId?: number | null; token?: string | null }
): Promise<void> {
  if (!opts?.storeDbId || !opts.token) return;
  const current = sessionByStoreDbId.get(opts.storeDbId)?.dto;
  if (current?.packagingTipsCompletedAt) return;
  const at = new Date().toISOString();
  await patchRemoteState(opts.storeDbId, opts.token, { packaging_tips_completed_at: at });
}

export async function dismissOnboardingBenefits(
  _storeId: string,
  opts?: { storeDbId?: number | null; token?: string | null; completed?: boolean }
): Promise<void> {
  if (!opts?.storeDbId || !opts.token) return;
  if (opts.completed) {
    await completeOnboardingTaskRemote(opts.storeDbId, opts.token);
    return;
  }
  const at = new Date().toISOString();
  await patchRemoteState(opts.storeDbId, opts.token, { dismissed_at: at });
}

export async function confirmOnboardingBenefitsCompleted(
  storeId: string,
  opts: {
    storeDbId?: number | null;
    token?: string | null;
    itemsWithImages: number;
    itemCount: number;
    packagingTipsDone?: boolean;
  }
): Promise<{ ok: boolean; reason?: "tasks_incomplete" | "already_completed" | "server_error" }> {
  const cached = opts.storeDbId ? sessionByStoreDbId.get(opts.storeDbId)?.dto : undefined;
  if (cached?.status === "COMPLETED") return { ok: true, reason: "already_completed" };

  const imagesDone = isImageUploadComplete(opts.itemsWithImages, opts.itemCount);
  const tipsDone = Boolean(cached?.packagingTipsCompletedAt) || opts.packagingTipsDone === true;
  if (!imagesDone || !tipsDone) {
    return { ok: false, reason: "tasks_incomplete" };
  }
  if (!opts.storeDbId || !opts.token) return { ok: false, reason: "server_error" };
  const dto = await completeOnboardingTaskRemote(opts.storeDbId, opts.token);
  if (!dto || dto.status !== "COMPLETED") return { ok: false, reason: "server_error" };
  return { ok: true };
}

export async function reviveOnboardingBenefitsIfPending(
  _storeId: string,
  _opts: { itemsWithImages: number; itemCount: number }
): Promise<OnboardingBenefitsState | null> {
  return null;
}

export function getOnboardingDeadline(startedAt: string): Date {
  const start = new Date(startedAt);
  const end = new Date(start);
  end.setDate(end.getDate() + ONBOARDING_BENEFITS_WINDOW_DAYS);
  return end;
}

export function isOnboardingExpired(startedAt: string, now = new Date()): boolean {
  return now.getTime() > getOnboardingDeadline(startedAt).getTime();
}

export function formatOnboardingDeadline(startedAt: string): string {
  const d = getOnboardingDeadline(startedAt);
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    timeZone: "Asia/Calcutta",
  }).format(d);
}

export function resolveImageUploadTarget(itemCount: number): number {
  if (itemCount <= 0) return ONBOARDING_IMAGE_TARGET;
  return Math.min(ONBOARDING_IMAGE_TARGET, itemCount);
}

export function isImageUploadComplete(itemsWithImages: number, itemCount: number): boolean {
  const target = resolveImageUploadTarget(itemCount);
  return target > 0 && itemsWithImages >= target;
}

export function formatAddPhotosTaskTitle(itemCount: number): string {
  const target = resolveImageUploadTarget(itemCount);
  if (target === 1) return "Add photo on 1 item";
  return `Add photos on ${target} items`;
}

/**
 * Home card: never show until the backend task payload is known.
 * COMPLETED / EXPIRED / NOT_FOUND / loading → hidden.
 */
export function shouldShowOnboardingBenefitsCard(opts: {
  ready: boolean;
  visibleFromServer: boolean;
}): boolean {
  if (!opts.ready) return false;
  return opts.visibleFromServer === true;
}
