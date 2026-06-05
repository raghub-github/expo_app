import { and, eq } from "drizzle-orm";
import { getDb, getSql } from "../client";
import {
  orderCancellationAttributes,
  orderCancellationReasonCatalog,
} from "@/lib/db/schema";
import { ensureCancellationCatalogSchema } from "./ensure-cancellation-catalog-schema";

export type CancellationAttributeRow = {
  code: string;
  displayLabel: string;
  defaultFault: string;
  sortOrder: number;
  isActive: boolean;
};

export type CancellationReasonCatalogRow = {
  id: number;
  attribute: string;
  label: string;
  reasonCode: string;
  sortOrder: number;
  isActive: boolean;
};

export type CancellationReasonCatalogGrouped = Record<
  string,
  CancellationReasonCatalogRow[]
>;

export type CancellationCatalogPayload = {
  attributes: CancellationAttributeRow[];
  grouped: CancellationReasonCatalogGrouped;
};

const DEFAULT_FAULT_BY_CODE: Record<string, string> = {
  CUSTOMER: "customer_fault",
  MERCHANT: "merchant_fault",
  RIDER: "3pl_fault",
  OTHER: "",
};

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

const FALLBACK_ATTRIBUTES: CancellationAttributeRow[] = [
  { code: "CUSTOMER", displayLabel: "Customer", defaultFault: "customer_fault", sortOrder: 1, isActive: true },
  { code: "MERCHANT", displayLabel: "Merchant", defaultFault: "merchant_fault", sortOrder: 2, isActive: true },
  { code: "RIDER", displayLabel: "Rider", defaultFault: "3pl_fault", sortOrder: 3, isActive: true },
  { code: "OTHER", displayLabel: "Other", defaultFault: "", sortOrder: 4, isActive: true },
];

function defaultFaultForCode(code: string): string {
  return DEFAULT_FAULT_BY_CODE[code.trim().toUpperCase()] ?? "";
}

function attributesFromCatalogRows(
  rows: CancellationReasonCatalogRow[]
): CancellationAttributeRow[] {
  const codes = [...new Set(rows.map((r) => r.attribute))].sort();
  return codes.map((code, i) => ({
    code,
    displayLabel: code,
    defaultFault: defaultFaultForCode(code),
    sortOrder: i + 1,
    isActive: true,
  }));
}

export async function listCancellationReasonCatalog(args?: {
  activeOnly?: boolean;
}): Promise<CancellationReasonCatalogRow[]> {
  const activeOnly = args?.activeOnly !== false;
  const sql = getSql();
  if (activeOnly) {
    return sql<CancellationReasonCatalogRow[]>`
      SELECT
        id,
        attribute,
        label,
        reason_code AS "reasonCode",
        sort_order AS "sortOrder",
        is_active AS "isActive"
      FROM order_cancellation_reason_catalog
      WHERE is_active = true
      ORDER BY attribute ASC, sort_order ASC, id ASC
    `;
  }
  return sql<CancellationReasonCatalogRow[]>`
    SELECT
      id,
      attribute,
      label,
      reason_code AS "reasonCode",
      sort_order AS "sortOrder",
      is_active AS "isActive"
    FROM order_cancellation_reason_catalog
    ORDER BY attribute ASC, sort_order ASC, id ASC
  `;
}

export async function listCancellationAttributes(args?: {
  activeOnly?: boolean;
  _retried?: boolean;
}): Promise<CancellationAttributeRow[]> {
  const activeOnly = args?.activeOnly !== false;
  try {
    const sql = getSql();
    if (activeOnly) {
      return sql<CancellationAttributeRow[]>`
        SELECT
          code,
          display_label AS "displayLabel",
          default_fault AS "defaultFault",
          sort_order AS "sortOrder",
          is_active AS "isActive"
        FROM order_cancellation_attributes
        WHERE is_active = true
        ORDER BY sort_order ASC, code ASC
      `;
    }
    return sql<CancellationAttributeRow[]>`
      SELECT
        code,
        display_label AS "displayLabel",
        default_fault AS "defaultFault",
        sort_order AS "sortOrder",
        is_active AS "isActive"
      FROM order_cancellation_attributes
      ORDER BY sort_order ASC, code ASC
    `;
  } catch (e) {
    if (!isRelationMissingError(e)) throw e;
    if (!args?._retried) {
      try {
        await ensureCancellationCatalogSchema();
        return listCancellationAttributes({ ...args, _retried: true });
      } catch {
        /* fall through */
      }
    }
    try {
      const catalogRows = await listCancellationReasonCatalog({ activeOnly: false });
      const derived = attributesFromCatalogRows(catalogRows);
      if (derived.length > 0) return derived;
    } catch {
      /* use static fallback */
    }
    return activeOnly
      ? FALLBACK_ATTRIBUTES.filter((a) => a.isActive)
      : FALLBACK_ATTRIBUTES;
  }
}

export async function listCancellationReasonCatalogGrouped(args?: {
  activeOnly?: boolean;
}): Promise<CancellationReasonCatalogGrouped> {
  const rows = await listCancellationReasonCatalog(args);
  const grouped: CancellationReasonCatalogGrouped = {};
  for (const row of rows) {
    if (!grouped[row.attribute]) grouped[row.attribute] = [];
    grouped[row.attribute].push(row);
  }
  return grouped;
}

export async function getCancellationCatalogPayload(args?: {
  activeOnly?: boolean;
}): Promise<CancellationCatalogPayload> {
  let grouped: CancellationReasonCatalogGrouped = {};
  try {
    grouped = await listCancellationReasonCatalogGrouped(args);
  } catch (e) {
    if (isRelationMissingError(e)) {
      await ensureCancellationCatalogSchema();
      grouped = await listCancellationReasonCatalogGrouped(args);
    } else {
      throw e;
    }
  }

  let attributes = await listCancellationAttributes({ activeOnly: args?.activeOnly });
  if (attributes.length === 0 && Object.keys(grouped).length > 0) {
    attributes = attributesFromCatalogRows(Object.values(grouped).flat());
  }
  if (attributes.length === 0 && Object.keys(grouped).length === 0) {
    attributes = args?.activeOnly === false
      ? FALLBACK_ATTRIBUTES
      : FALLBACK_ATTRIBUTES.filter((a) => a.isActive);
  }
  return { attributes, grouped };
}

export async function getCancellationAttributeByCode(
  code: string
): Promise<CancellationAttributeRow | null> {
  const normalized = code.trim().toUpperCase();
  try {
    const sql = getSql();
    const rows = await sql<CancellationAttributeRow[]>`
      SELECT
        code,
        display_label AS "displayLabel",
        default_fault AS "defaultFault",
        sort_order AS "sortOrder",
        is_active AS "isActive"
      FROM order_cancellation_attributes
      WHERE code = ${normalized}
      LIMIT 1
    `;
    return rows[0] ?? null;
  } catch (e) {
    if (isRelationMissingError(e)) return null;
    throw e;
  }
}

export async function ensureCancellationAttribute(code: string): Promise<CancellationAttributeRow> {
  const normalized = code.trim().toUpperCase();
  const existing = await getCancellationAttributeByCode(normalized);
  if (existing?.isActive) return existing;
  if (existing && !existing.isActive) {
    const revived = await updateCancellationAttribute(normalized, { isActive: true });
    if (revived) return revived;
  }
  try {
    return await insertCancellationAttribute({
      code: normalized,
      displayLabel: normalized,
      defaultFault: defaultFaultForCode(normalized),
    });
  } catch {
    return {
      code: normalized,
      displayLabel: normalized,
      defaultFault: defaultFaultForCode(normalized),
      sortOrder: 0,
      isActive: true,
    };
  }
}

export async function getDefaultFaultForAttributeCode(
  code: string
): Promise<string> {
  const row = await getCancellationAttributeByCode(code);
  return row?.defaultFault ?? defaultFaultForCode(code);
}

export async function insertCancellationAttribute(input: {
  code: string;
  displayLabel: string;
  defaultFault?: string;
  sortOrder?: number;
  isActive?: boolean;
}): Promise<CancellationAttributeRow> {
  await ensureCancellationCatalogSchema();
  const db = getDb();
  const code = input.code.trim().toUpperCase();
  const [row] = await db
    .insert(orderCancellationAttributes)
    .values({
      code,
      displayLabel: input.displayLabel.trim() || code,
      defaultFault: input.defaultFault ?? defaultFaultForCode(code),
      sortOrder: input.sortOrder ?? 0,
      isActive: input.isActive ?? true,
      updatedAt: new Date(),
    })
    .returning();
  return {
    code: row.code,
    displayLabel: row.displayLabel,
    defaultFault: row.defaultFault ?? "",
    sortOrder: row.sortOrder,
    isActive: row.isActive,
  };
}

export async function updateCancellationAttribute(
  code: string,
  input: {
    displayLabel?: string;
    defaultFault?: string;
    sortOrder?: number;
    isActive?: boolean;
  }
): Promise<CancellationAttributeRow | null> {
  const db = getDb();
  const normalized = code.trim().toUpperCase();
  const patch: Partial<typeof orderCancellationAttributes.$inferInsert> = {
    updatedAt: new Date(),
  };
  if (input.displayLabel != null) patch.displayLabel = input.displayLabel.trim();
  if (input.defaultFault != null) patch.defaultFault = input.defaultFault;
  if (input.sortOrder != null) patch.sortOrder = input.sortOrder;
  if (input.isActive != null) patch.isActive = input.isActive;

  const [row] = await db
    .update(orderCancellationAttributes)
    .set(patch)
    .where(eq(orderCancellationAttributes.code, normalized))
    .returning();
  if (!row) return null;
  return {
    code: row.code,
    displayLabel: row.displayLabel,
    defaultFault: row.defaultFault ?? "",
    sortOrder: row.sortOrder,
    isActive: row.isActive,
  };
}

export async function getCancellationReasonCatalogById(
  id: number
): Promise<CancellationReasonCatalogRow | null> {
  const sql = getSql();
  const rows = await sql<CancellationReasonCatalogRow[]>`
    SELECT
      id,
      attribute,
      label,
      reason_code AS "reasonCode",
      sort_order AS "sortOrder",
      is_active AS "isActive"
    FROM order_cancellation_reason_catalog
    WHERE id = ${id}
    LIMIT 1
  `;
  return rows[0] ?? null;
}

export function slugifyCancellationReasonCode(label: string): string {
  const base = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);
  return base || "reason";
}

export async function insertCancellationReasonCatalog(input: {
  attribute: string;
  label: string;
  reasonCode?: string;
  sortOrder?: number;
  isActive?: boolean;
}): Promise<CancellationReasonCatalogRow> {
  const attribute = input.attribute.trim().toUpperCase();
  await ensureCancellationAttribute(attribute);

  const db = getDb();
  const label = input.label.trim();
  const reasonCode =
    input.reasonCode?.trim() ||
    `${attribute.toLowerCase()}__${slugifyCancellationReasonCode(label)}`;
  const [row] = await db
    .insert(orderCancellationReasonCatalog)
    .values({
      attribute,
      label,
      reasonCode,
      sortOrder: input.sortOrder ?? 0,
      isActive: input.isActive ?? true,
      updatedAt: new Date(),
    })
    .returning();
  return {
    id: row.id,
    attribute: row.attribute,
    label: row.label,
    reasonCode: row.reasonCode,
    sortOrder: row.sortOrder,
    isActive: row.isActive,
  };
}

export async function updateCancellationReasonCatalog(
  id: number,
  input: {
    attribute?: string;
    label?: string;
    reasonCode?: string;
    sortOrder?: number;
    isActive?: boolean;
  }
): Promise<CancellationReasonCatalogRow | null> {
  if (input.attribute != null) {
    await ensureCancellationAttribute(input.attribute);
  }

  const db = getDb();
  const patch: Partial<typeof orderCancellationReasonCatalog.$inferInsert> = {
    updatedAt: new Date(),
  };
  if (input.attribute != null) patch.attribute = input.attribute.trim().toUpperCase();
  if (input.label != null) patch.label = input.label.trim();
  if (input.reasonCode != null) patch.reasonCode = input.reasonCode.trim();
  if (input.sortOrder != null) patch.sortOrder = input.sortOrder;
  if (input.isActive != null) patch.isActive = input.isActive;

  const [row] = await db
    .update(orderCancellationReasonCatalog)
    .set(patch)
    .where(eq(orderCancellationReasonCatalog.id, id))
    .returning();
  if (!row) return null;
  return {
    id: row.id,
    attribute: row.attribute,
    label: row.label,
    reasonCode: row.reasonCode,
    sortOrder: row.sortOrder,
    isActive: row.isActive,
  };
}

export async function resolveCancellationCatalogForOrder(args: {
  catalogReasonId?: number | null;
  attribute?: string | null;
  rejection?: string | null;
}): Promise<CancellationReasonCatalogRow | null> {
  if (args.catalogReasonId != null && Number.isFinite(args.catalogReasonId)) {
    const row = await getCancellationReasonCatalogById(args.catalogReasonId);
    if (!row?.isActive) return null;
    if (args.attribute && row.attribute !== args.attribute.trim().toUpperCase()) {
      return null;
    }
    if (args.rejection && row.label !== args.rejection.trim()) {
      return null;
    }
    return row;
  }
  if (!args.attribute?.trim() || !args.rejection?.trim()) return null;
  const sql = getSql();
  const rows = await sql<CancellationReasonCatalogRow[]>`
    SELECT
      id,
      attribute,
      label,
      reason_code AS "reasonCode",
      sort_order AS "sortOrder",
      is_active AS "isActive"
    FROM order_cancellation_reason_catalog
    WHERE attribute = ${args.attribute.trim().toUpperCase()}
      AND label = ${args.rejection.trim()}
      AND is_active = true
    LIMIT 1
  `;
  return rows[0] ?? null;
}
