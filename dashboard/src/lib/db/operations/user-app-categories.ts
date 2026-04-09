import { getSql } from "@/lib/db/client";
import type { UserAppCategoryRow, UserAppCategoryStatus } from "@/lib/user-app-categories/shared";

export type { UserAppCategoryRow };

function numId(v: unknown): number {
  if (typeof v === "bigint") return Number(v);
  return Number(v);
}

function mapRow(r: Record<string, unknown>): UserAppCategoryRow {
  const st = String(r.status ?? "active");
  const status: UserAppCategoryStatus = st === "inactive" ? "inactive" : "active";
  const doRaw = r.display_order;
  const display_order =
    typeof doRaw === "bigint"
      ? Number(doRaw)
      : typeof doRaw === "number" && Number.isFinite(doRaw)
        ? Math.trunc(doRaw)
        : Number.isFinite(Number(doRaw))
          ? Math.trunc(Number(doRaw))
          : 0;
  return {
    id: numId(r.id),
    name: String(r.name),
    image_url: r.image_url != null ? String(r.image_url) : null,
    store_type: String(r.store_type ?? "FOOD"),
    status,
    display_order,
  };
}

export async function listUserAppCategories(opts: {
  storeType: string;
  /** When false, only `status = active` (matches partial index use in app). */
  includeInactive: boolean;
}): Promise<UserAppCategoryRow[]> {
  const sql = getSql();
  const { storeType, includeInactive } = opts;
  const raw = includeInactive
    ? await sql`
        SELECT id, name, image_url, store_type, status, display_order
        FROM user_app_category
        WHERE store_type = ${storeType}
        ORDER BY display_order ASC, id ASC
      `
    : await sql`
        SELECT id, name, image_url, store_type, status, display_order
        FROM user_app_category
        WHERE store_type = ${storeType}
          AND status = 'active'
        ORDER BY display_order ASC, id ASC
      `;
  const arr = Array.isArray(raw) ? raw : [];
  return arr.map((x) => mapRow(x as Record<string, unknown>));
}

/** Set display_order to 0..n-1 for all rows in a store, preserving current sort (display_order, id). */
export async function normalizeDisplayOrdersForStore(storeType: string): Promise<void> {
  const sql = getSql();
  const raw = await sql`
    SELECT id FROM user_app_category
    WHERE store_type = ${storeType}
    ORDER BY display_order ASC, id ASC
  `;
  const arr = Array.isArray(raw) ? raw : [];
  if (arr.length === 0) return;
  await sql.begin(async (tx) => {
    const run = tx as unknown as typeof sql;
    for (let i = 0; i < arr.length; i++) {
      const rowId = numId((arr[i] as Record<string, unknown>).id);
      await run`
        UPDATE user_app_category
        SET display_order = ${i}
        WHERE id = ${rowId}
      `;
    }
  });
}

export async function createUserAppCategory(input: {
  store_type: string;
  name: string;
  image_url: string | null;
  status: UserAppCategoryStatus;
  display_order: number;
}): Promise<{ ok: true; row: UserAppCategoryRow } | { ok: false; error: "invalid_status" }> {
  const name = input.name.trim();
  if (input.status !== "active" && input.status !== "inactive") {
    return { ok: false, error: "invalid_status" };
  }
  const display_order = Number.isFinite(input.display_order) ? Math.trunc(input.display_order) : 0;
  const sql = getSql();
  const [created] = await sql`
    INSERT INTO user_app_category (name, image_url, store_type, status, display_order)
    VALUES (${name}, ${input.image_url}, ${input.store_type}, ${input.status}, ${display_order})
    RETURNING id, name, image_url, store_type, status, display_order
  `;
  if (!created) {
    throw new Error("insert returned no row");
  }
  return { ok: true, row: mapRow(created as Record<string, unknown>) };
}

export async function updateUserAppCategory(
  id: number,
  patch: {
    store_type?: string;
    name?: string;
    image_url?: string | null;
    status?: UserAppCategoryStatus;
    display_order?: number;
  }
): Promise<{ ok: true; row: UserAppCategoryRow } | { ok: false; error: "not_found" | "invalid_status" }> {
  const sql = getSql();
  const [row] = await sql`
    SELECT id, name, image_url, store_type, status, display_order
    FROM user_app_category
    WHERE id = ${id}
    LIMIT 1
  `;
  if (!row) {
    return { ok: false, error: "not_found" };
  }
  const r = row as Record<string, unknown>;
  const nextStore =
    patch.store_type !== undefined && String(patch.store_type).trim() !== ""
      ? String(patch.store_type).trim()
      : String(r.store_type);
  const nextName = patch.name !== undefined ? patch.name.trim() : String(r.name);
  const nextImage =
    patch.image_url !== undefined
      ? patch.image_url === "" || patch.image_url == null
        ? null
        : String(patch.image_url)
      : r.image_url != null
        ? String(r.image_url)
        : null;
  const rawStatus =
    patch.status !== undefined ? patch.status : String(r.status ?? "active");
  if (rawStatus !== "active" && rawStatus !== "inactive") {
    return { ok: false, error: "invalid_status" };
  }
  const nextStatus: UserAppCategoryStatus = rawStatus;
  const doRaw = r.display_order;
  const currentOrder =
    typeof doRaw === "bigint"
      ? Number(doRaw)
      : typeof doRaw === "number" && Number.isFinite(doRaw)
        ? Math.trunc(doRaw)
        : Number.isFinite(Number(doRaw))
          ? Math.trunc(Number(doRaw))
          : 0;
  const nextDisplayOrder =
    patch.display_order !== undefined
      ? Number.isFinite(patch.display_order)
        ? Math.trunc(patch.display_order)
        : currentOrder
      : currentOrder;

  const orderChanged = nextDisplayOrder !== currentOrder;

  if (orderChanged) {
    await sql.begin(async (tx) => {
      const run = tx as unknown as typeof sql;
      const [other] = await run`
        SELECT id
        FROM user_app_category
        WHERE store_type = ${nextStore}
          AND display_order = ${nextDisplayOrder}
          AND id <> ${id}
        LIMIT 1
      `;
      if (other) {
        const otherId = numId((other as Record<string, unknown>).id);
        await run`
          UPDATE user_app_category
          SET display_order = ${currentOrder}
          WHERE id = ${otherId}
        `;
      }
      await run`
        UPDATE user_app_category
        SET store_type = ${nextStore},
          name = ${nextName},
          image_url = ${nextImage},
          status = ${nextStatus},
          display_order = ${nextDisplayOrder}
        WHERE id = ${id}
      `;
    });
  } else {
    await sql`
      UPDATE user_app_category
      SET store_type = ${nextStore},
        name = ${nextName},
        image_url = ${nextImage},
        status = ${nextStatus},
        display_order = ${nextDisplayOrder}
      WHERE id = ${id}
    `;
  }

  const [out] = await sql`
    SELECT id, name, image_url, store_type, status, display_order
    FROM user_app_category
    WHERE id = ${id}
    LIMIT 1
  `;
  return { ok: true, row: mapRow(out as Record<string, unknown>) };
}

export async function deleteUserAppCategory(
  id: number
): Promise<{ ok: true } | { ok: false; error: "not_found" }> {
  const sql = getSql();
  const [existing] = await sql`
    SELECT id, store_type FROM user_app_category
    WHERE id = ${id}
    LIMIT 1
  `;
  if (!existing) {
    return { ok: false, error: "not_found" };
  }
  const storeType = String((existing as Record<string, unknown>).store_type ?? "FOOD");
  await sql`DELETE FROM user_app_category WHERE id = ${id}`;
  await normalizeDisplayOrdersForStore(storeType);
  return { ok: true };
}
