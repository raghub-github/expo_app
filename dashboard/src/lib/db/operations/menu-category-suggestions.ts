/**
 * Peer category name suggestions for menu UI (same rules as backend suggestPeerCategoryNames).
 * Names come from other stores; excludes names already on the target store.
 */

import { getSql } from "../client";

function tokenizeCategoryQuery(q: string): string[] {
  return q
    .toLowerCase()
    .trim()
    .split(/\s+/)
    .map((t) => t.replace(/[^a-z0-9]+/gi, ""))
    .filter((t) => t.length > 0)
    .slice(0, 6);
}

function allTokensMatchWordStarts(nameLower: string, tokens: string[]): boolean {
  if (tokens.length === 0) return false;
  const words = nameLower
    .split(/[^a-z0-9]+/i)
    .map((w) => w.toLowerCase())
    .filter(Boolean);
  return tokens.every((tok) => words.some((w) => w.startsWith(tok)));
}

export async function suggestPeerCategoryNamesForStore(
  storeIdNum: number,
  opts: { q: string; limit?: number; editingCategoryId?: number | null }
): Promise<string[]> {
  const sql = getSql();
  const limit = Math.min(Math.max(opts.limit ?? 12, 1), 30);
  const qRaw = (opts.q ?? "").trim().slice(0, 30);
  const qNorm = qRaw.toLowerCase();
  const tokens = tokenizeCategoryQuery(qRaw);
  const editingId = opts.editingCategoryId ?? null;

  const forbiddenRows =
    editingId != null
      ? await sql<{ n: string }[]>`
          SELECT LOWER(TRIM(category_name)) AS n
          FROM merchant_menu_categories
          WHERE store_id = ${storeIdNum} AND id <> ${editingId}
            AND COALESCE(is_deleted, FALSE) = FALSE
        `
      : await sql<{ n: string }[]>`
          SELECT LOWER(TRIM(category_name)) AS n
          FROM merchant_menu_categories
          WHERE store_id = ${storeIdNum}
            AND COALESCE(is_deleted, FALSE) = FALSE
        `;
  const forbidden = new Set(
    forbiddenRows.map((r) => r.n).filter((x) => x != null && x !== "")
  );

  type Row = { name: string; store_count: number };
  let rows: Row[];

  if (tokens.length === 0) {
    rows = await sql<Row[]>`
      SELECT TRIM(category_name) AS name, COUNT(DISTINCT store_id)::int AS store_count
      FROM merchant_menu_categories
      WHERE store_id <> ${storeIdNum}
        AND COALESCE(is_deleted, FALSE) = FALSE
        AND LENGTH(TRIM(category_name)) BETWEEN 1 AND 30
      GROUP BY TRIM(category_name)
      ORDER BY COUNT(DISTINCT store_id) DESC, LENGTH(TRIM(category_name)) ASC, TRIM(category_name) ASC
      LIMIT 250
    `;
  } else {
    let tokenCond = sql`TRUE`;
    for (const t of tokens) {
      tokenCond = sql`${tokenCond} AND POSITION(${t} IN LOWER(TRIM(category_name))) > 0`;
    }
    rows = await sql<Row[]>`
      SELECT TRIM(category_name) AS name, COUNT(DISTINCT store_id)::int AS store_count
      FROM merchant_menu_categories
      WHERE store_id <> ${storeIdNum}
        AND COALESCE(is_deleted, FALSE) = FALSE
        AND LENGTH(TRIM(category_name)) BETWEEN 1 AND 30
        AND ${tokenCond}
      GROUP BY TRIM(category_name)
      ORDER BY COUNT(DISTINCT store_id) DESC, LENGTH(TRIM(category_name)) ASC, TRIM(category_name) ASC
      LIMIT 200
    `;
  }

  const filtered = rows.filter((r) => {
    const ln = String(r.name).toLowerCase().trim();
    return ln.length > 0 && !forbidden.has(ln);
  });

  const rank = (r: Row): [number, number, number, number, number, number, string] => {
    const name = String(r.name);
    const ln = name.toLowerCase().trim();
    const hasQ = tokens.length > 0 || qNorm.length > 0;

    const exact = hasQ && ln === qNorm ? 0 : 1;
    const prefix = hasQ && ln.startsWith(qNorm) ? 0 : 1;
    const wordStarts =
      tokens.length > 0 ? (allTokensMatchWordStarts(ln, tokens) ? 0 : 1) : 1;
    const contains =
      tokens.length > 0 ? (tokens.every((t) => ln.includes(t)) ? 0 : 1) : 0;

    return [exact, prefix, wordStarts, contains, -r.store_count, name.length, name];
  };

  filtered.sort((a, b) => {
    const ra = rank(a);
    const rb = rank(b);
    for (let i = 0; i < ra.length; i++) {
      if (ra[i] < rb[i]) return -1;
      if (ra[i] > rb[i]) return 1;
    }
    return 0;
  });

  return filtered.slice(0, limit).map((r) => r.name);
}

/** Peer subcategory names (rows with a parent on other stores); excludes names already under this parent on the target store. */
export async function suggestPeerSubcategoryNamesForStore(
  storeIdNum: number,
  opts: {
    q: string;
    limit?: number;
    parentCategoryId: number;
    editingCategoryId?: number | null;
  }
): Promise<string[]> {
  const parentId = opts.parentCategoryId;
  if (!Number.isFinite(parentId) || parentId <= 0) {
    return [];
  }

  const sql = getSql();
  const limit = Math.min(Math.max(opts.limit ?? 12, 1), 30);
  const qRaw = (opts.q ?? "").trim().slice(0, 30);
  const qNorm = qRaw.toLowerCase();
  const tokens = tokenizeCategoryQuery(qRaw);
  const editingId = opts.editingCategoryId ?? null;

  const forbiddenRows =
    editingId != null
      ? await sql<{ n: string }[]>`
          SELECT LOWER(TRIM(category_name)) AS n
          FROM merchant_menu_categories
          WHERE store_id = ${storeIdNum}
            AND parent_category_id = ${parentId}
            AND id <> ${editingId}
            AND COALESCE(is_deleted, FALSE) = FALSE
        `
      : await sql<{ n: string }[]>`
          SELECT LOWER(TRIM(category_name)) AS n
          FROM merchant_menu_categories
          WHERE store_id = ${storeIdNum}
            AND parent_category_id = ${parentId}
            AND COALESCE(is_deleted, FALSE) = FALSE
        `;
  const forbidden = new Set(
    forbiddenRows.map((r) => r.n).filter((x) => x != null && x !== "")
  );

  type Row = { name: string; store_count: number };
  let rows: Row[];

  if (tokens.length === 0) {
    rows = await sql<Row[]>`
      SELECT TRIM(category_name) AS name, COUNT(DISTINCT store_id)::int AS store_count
      FROM merchant_menu_categories
      WHERE store_id <> ${storeIdNum}
        AND parent_category_id IS NOT NULL
        AND COALESCE(is_deleted, FALSE) = FALSE
        AND LENGTH(TRIM(category_name)) BETWEEN 1 AND 30
      GROUP BY TRIM(category_name)
      ORDER BY COUNT(DISTINCT store_id) DESC, LENGTH(TRIM(category_name)) ASC, TRIM(category_name) ASC
      LIMIT 250
    `;
  } else {
    let tokenCond = sql`TRUE`;
    for (const t of tokens) {
      tokenCond = sql`${tokenCond} AND POSITION(${t} IN LOWER(TRIM(category_name))) > 0`;
    }
    rows = await sql<Row[]>`
      SELECT TRIM(category_name) AS name, COUNT(DISTINCT store_id)::int AS store_count
      FROM merchant_menu_categories
      WHERE store_id <> ${storeIdNum}
        AND parent_category_id IS NOT NULL
        AND COALESCE(is_deleted, FALSE) = FALSE
        AND LENGTH(TRIM(category_name)) BETWEEN 1 AND 30
        AND ${tokenCond}
      GROUP BY TRIM(category_name)
      ORDER BY COUNT(DISTINCT store_id) DESC, LENGTH(TRIM(category_name)) ASC, TRIM(category_name) ASC
      LIMIT 200
    `;
  }

  const filtered = rows.filter((r) => {
    const ln = String(r.name).toLowerCase().trim();
    return ln.length > 0 && !forbidden.has(ln);
  });

  const rank = (r: Row): [number, number, number, number, number, number, string] => {
    const name = String(r.name);
    const ln = name.toLowerCase().trim();
    const hasQ = tokens.length > 0 || qNorm.length > 0;

    const exact = hasQ && ln === qNorm ? 0 : 1;
    const prefix = hasQ && ln.startsWith(qNorm) ? 0 : 1;
    const wordStarts =
      tokens.length > 0 ? (allTokensMatchWordStarts(ln, tokens) ? 0 : 1) : 1;
    const contains =
      tokens.length > 0 ? (tokens.every((t) => ln.includes(t)) ? 0 : 1) : 0;

    return [exact, prefix, wordStarts, contains, -r.store_count, name.length, name];
  };

  filtered.sort((a, b) => {
    const ra = rank(a);
    const rb = rank(b);
    for (let i = 0; i < ra.length; i++) {
      if (ra[i] < rb[i]) return -1;
      if (ra[i] > rb[i]) return 1;
    }
    return 0;
  });

  return filtered.slice(0, limit).map((r) => r.name);
}
