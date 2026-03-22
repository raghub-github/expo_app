import { getDb } from "../client";
import { userSessions } from "../schema";
import { and, desc, eq, gte, isNotNull, isNull, lt, ne, sql } from "drizzle-orm";

export type UserLiveStatus = "online" | "offline" | "break" | "emergency";

function secondsBetween(a: Date, b: Date): number {
  return Math.max(0, Math.floor((b.getTime() - a.getTime()) / 1000));
}

/** Any row still “open” in DB terms (logout_time not set). */
export async function getAnyOpenUserSession(userId: number) {
  const db = getDb();
  const rows = await db
    .select()
    .from(userSessions)
    .where(and(eq(userSessions.userId, userId), isNull(userSessions.logoutTime)))
    .orderBy(desc(userSessions.loginTime))
    .limit(1);
  return rows[0] ?? null;
}

/** Open session the user is actively in (not closed, not stuck as offline). */
export async function getActiveWorkSession(userId: number) {
  const db = getDb();
  const rows = await db
    .select()
    .from(userSessions)
    .where(
      and(
        eq(userSessions.userId, userId),
        isNull(userSessions.logoutTime),
        ne(userSessions.currentStatus, "offline")
      )
    )
    .orderBy(desc(userSessions.loginTime))
    .limit(1);
  return rows[0] ?? null;
}

export async function getLatestClosedUserSession(userId: number) {
  const db = getDb();
  const rows = await db
    .select()
    .from(userSessions)
    .where(and(eq(userSessions.userId, userId), isNotNull(userSessions.logoutTime)))
    .orderBy(desc(userSessions.logoutTime))
    .limit(1);
  return rows[0] ?? null;
}

/** Sum work_seconds for rows whose login_time falls on the same local calendar day as `day`. */
export async function sumTodayWorkSeconds(userId: number, day: Date = new Date()): Promise<number> {
  const start = new Date(day);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);

  const db = getDb();
  const rows = await db
    .select({
      total: sql<number>`coalesce(sum(${userSessions.workSeconds}), 0)::int`,
    })
    .from(userSessions)
    .where(
      and(eq(userSessions.userId, userId), gte(userSessions.loginTime, start), lt(userSessions.loginTime, end))
    );
  return Number(rows[0]?.total ?? 0);
}

async function finalizeOpenRow(row: typeof userSessions.$inferSelect, endAt: Date): Promise<void> {
  const status = row.currentStatus as UserLiveStatus;
  const segmentStart = row.statusChangedAt ?? row.loginTime;
  let work = row.workSeconds;
  let brk = row.breakSeconds;
  if (status === "online" || status === "emergency") {
    work += secondsBetween(segmentStart, endAt);
  } else if (status === "break") {
    brk += secondsBetween(segmentStart, endAt);
  }

  const db = getDb();
  await db
    .update(userSessions)
    .set({
      workSeconds: work,
      breakSeconds: brk,
      logoutTime: endAt,
      offlineAt: endAt,
      currentStatus: "offline",
      statusChangedAt: endAt,
      updatedAt: endAt,
    })
    .where(eq(userSessions.id, row.id));
}

/**
 * Close rows that are logically offline but never got logout_time (bad state).
 */
export async function finalizeOrphanOfflineOpenRows(userId: number, endAt: Date = new Date()): Promise<void> {
  const db = getDb();
  const rows = await db
    .select()
    .from(userSessions)
    .where(
      and(
        eq(userSessions.userId, userId),
        isNull(userSessions.logoutTime),
        eq(userSessions.currentStatus, "offline")
      )
    );
  for (const row of rows) {
    await finalizeOpenRow(row, endAt);
  }
}

/**
 * Close every open session row (logout_time IS NULL) for this user.
 */
export async function closeAllOpenUserSessions(userId: number, endAt: Date = new Date()): Promise<void> {
  const db = getDb();
  const openRows = await db
    .select()
    .from(userSessions)
    .where(and(eq(userSessions.userId, userId), isNull(userSessions.logoutTime)));

  for (const row of openRows) {
    await finalizeOpenRow(row, endAt);
  }
}

export async function insertOpenUserSession(userId: number, at: Date = new Date()): Promise<void> {
  const db = getDb();
  await db.insert(userSessions).values({
    userId,
    loginTime: at,
    logoutTime: null,
    offlineAt: null,
    currentStatus: "online",
    statusChangedAt: at,
    workSeconds: 0,
    breakSeconds: 0,
  });
}

async function accumulateSegment(
  row: typeof userSessions.$inferSelect,
  _nextStatus: UserLiveStatus,
  at: Date
): Promise<{ workSeconds: number; breakSeconds: number }> {
  const prev = row.currentStatus as UserLiveStatus;
  const segmentStart = row.statusChangedAt ?? row.loginTime;
  let work = row.workSeconds;
  let brk = row.breakSeconds;
  if (prev === "online" || prev === "emergency") {
    work += secondsBetween(segmentStart, at);
  } else if (prev === "break") {
    brk += secondsBetween(segmentStart, at);
  }
  return { workSeconds: work, breakSeconds: brk };
}

/**
 * Apply live status for the current open session, or open a new session when moving to online after full logout.
 */
export async function setUserLiveStatus(userId: number, next: UserLiveStatus, at: Date = new Date()): Promise<void> {
  await finalizeOrphanOfflineOpenRows(userId, at);

  if (next === "offline") {
    await closeAllOpenUserSessions(userId, at);
    return;
  }

  const openAny = await getAnyOpenUserSession(userId);

  if (next === "online") {
    if (!openAny) {
      await insertOpenUserSession(userId, at);
      return;
    }
    if (openAny.currentStatus === "online" || openAny.currentStatus === "emergency") {
      return;
    }
    if (openAny.currentStatus === "break") {
      const { workSeconds, breakSeconds } = await accumulateSegment(openAny, next, at);
      const db = getDb();
      await db
        .update(userSessions)
        .set({
          workSeconds,
          breakSeconds,
          currentStatus: "online",
          statusChangedAt: at,
          updatedAt: at,
        })
        .where(eq(userSessions.id, openAny.id));
      return;
    }
    await closeAllOpenUserSessions(userId, at);
    await insertOpenUserSession(userId, at);
    return;
  }

  if (!openAny) {
    throw new Error("No active session; go online first");
  }

  if (openAny.currentStatus === next) {
    return;
  }

  const { workSeconds, breakSeconds } = await accumulateSegment(openAny, next, at);
  const db = getDb();
  await db
    .update(userSessions)
    .set({
      workSeconds,
      breakSeconds,
      currentStatus: next,
      statusChangedAt: at,
      updatedAt: at,
    })
    .where(eq(userSessions.id, openAny.id));
}
