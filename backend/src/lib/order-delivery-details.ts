import { and, eq, isNull } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { customerAddresses, customers, pendingOrders } from "../db/schema.js";
import { applyAlternateAsEffectiveDeliveryContact } from "./order-alternate-contact.js";

export type OrderDeliveryDetails = {
  deliveryAddressLabel: string | null;
  deliveryContactName: string | null;
  deliveryContactPhone: string | null;
  deliveryInstructionsList: string[];
};

function readString(meta: Record<string, unknown>, ...keys: string[]): string | null {
  for (const key of keys) {
    const v = meta[key];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

function readInstructionsList(meta: Record<string, unknown>): string[] {
  const raw = meta.deliveryInstructionsList ?? meta.delivery_instructions_list;
  if (!Array.isArray(raw)) return [];
  return raw
    .map((x) => (typeof x === "string" ? x.trim() : ""))
    .filter(Boolean);
}

function parseStoredInstructionsList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((x) => (typeof x === "string" ? x.trim() : ""))
    .filter(Boolean);
}

export function formatAddressLabelEnum(label: string | null | undefined, customLabel?: string | null): string | null {
  const custom = customLabel?.trim();
  if (custom) return custom;
  const raw = (label ?? "").trim();
  if (!raw) return null;
  if (raw.toUpperCase() === "OTHER") return "Other";
  return raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
}

function mergeInstructionLists(...lists: string[][]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const list of lists) {
    for (const item of list) {
      const key = item.trim().toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push(item.trim());
    }
  }
  return out;
}

function instructionsFromCheckoutFlags(meta: Record<string, unknown>): string[] {
  const out: string[] = [];
  if (meta.leaveAtDoor === true) out.push("Leave at door");
  if (meta.leaveWithGuard === true) out.push("Leave with guard");
  if (meta.avoidCalling === true) out.push("Avoid calling");
  if (meta.dontRingBell === true) out.push("Do not ring bell");
  if (meta.petAtHome === true) out.push("Pet at home");
  const note =
    typeof meta.deliveryInstructions === "string" ? meta.deliveryInstructions.trim() : "";
  if (note) out.push(note);
  return out;
}

export async function resolveOrderDeliveryDetails(
  db: PostgresJsDatabase<Record<string, unknown>>,
  input: {
    orderIdText: string | null;
    customerPk: number | null;
    checkoutMetadata: unknown;
    deliveryAddress: string | null;
    foodCustomerName?: string | null;
    foodCustomerPhone?: string | null;
    foodDeliveryInstructions?: string | null;
    storedDeliveryInstructionsList?: unknown;
    alternateContactName?: string | null;
    alternateContactPhone?: string | null;
    deliveryPrimaryContactName?: string | null;
    deliveryPrimaryContactPhone?: string | null;
  }
): Promise<OrderDeliveryDetails> {
  const meta =
    input.checkoutMetadata && typeof input.checkoutMetadata === "object"
      ? (input.checkoutMetadata as Record<string, unknown>)
      : {};

  let deliveryAddressLabel = readString(meta, "addressLabel", "address_label");
  let deliveryContactName = readString(
    meta,
    "receiverContactName",
    "receiver_contact_name",
    "receiverName",
    "receiver_name",
    "contactName"
  );
  let deliveryContactPhone = readString(
    meta,
    "receiverContactMobile",
    "receiver_contact_mobile",
    "receiverMobile",
    "receiver_mobile",
    "contactMobile"
  );

  let addressInstructions: string[] = [];

  if (
    input.orderIdText &&
    (!deliveryAddressLabel || !deliveryContactName || !deliveryContactPhone)
  ) {
    const [pendingRow] = await db
      .select({ addressIdUsed: pendingOrders.addressIdUsed })
      .from(pendingOrders)
      .where(eq(pendingOrders.finalizedOrderId, input.orderIdText))
      .limit(1);

    if (pendingRow?.addressIdUsed != null) {
      const [addrRow] = await db
        .select({
          label: customerAddresses.label,
          customLabel: customerAddresses.customLabel,
          contactName: customerAddresses.contactName,
          contactMobile: customerAddresses.contactMobile,
          deliveryInstructionsList: customerAddresses.deliveryInstructionsList,
        })
        .from(customerAddresses)
        .where(
          and(
            eq(customerAddresses.id, pendingRow.addressIdUsed),
            isNull(customerAddresses.deletedAt)
          )
        )
        .limit(1);

      if (addrRow) {
        deliveryAddressLabel =
          deliveryAddressLabel ??
          formatAddressLabelEnum(String(addrRow.label ?? ""), addrRow.customLabel);
        deliveryContactName = deliveryContactName ?? addrRow.contactName?.trim() ?? null;
        deliveryContactPhone = deliveryContactPhone ?? addrRow.contactMobile?.trim() ?? null;
        if (Array.isArray(addrRow.deliveryInstructionsList)) {
          addressInstructions = addrRow.deliveryInstructionsList
            .map((x) => String(x ?? "").trim())
            .filter(Boolean);
        }
      }
    }
  }

  // Parcel receiver / food primary snapshot — prefer over customer-profile fallback.
  const primaryName = input.deliveryPrimaryContactName?.trim() || null;
  const primaryPhone = input.deliveryPrimaryContactPhone?.trim() || null;
  if (primaryName) deliveryContactName = deliveryContactName ?? primaryName;
  if (primaryPhone) deliveryContactPhone = deliveryContactPhone ?? primaryPhone;

  if ((!deliveryContactName || !deliveryContactPhone) && input.customerPk != null) {
    const [customerRow] = await db
      .select({
        fullName: customers.fullName,
        primaryMobile: customers.primaryMobile,
      })
      .from(customers)
      .where(eq(customers.id, input.customerPk))
      .limit(1);
    if (customerRow) {
      deliveryContactName = deliveryContactName ?? customerRow.fullName?.trim() ?? null;
      deliveryContactPhone = deliveryContactPhone ?? customerRow.primaryMobile?.trim() ?? null;
    }
  }

  deliveryContactName = deliveryContactName ?? input.foodCustomerName?.trim() ?? null;
  deliveryContactPhone = deliveryContactPhone ?? input.foodCustomerPhone?.trim() ?? null;

  const deliveryInstructionsList = mergeInstructionLists(
    parseStoredInstructionsList(input.storedDeliveryInstructionsList),
    readInstructionsList(meta),
    instructionsFromCheckoutFlags(meta),
    addressInstructions,
    input.foodDeliveryInstructions?.trim()
      ? input.foodDeliveryInstructions
          .split(/[·|]/)
          .map((s) => s.trim())
          .filter(Boolean)
      : []
  );

  const effectiveContact = applyAlternateAsEffectiveDeliveryContact({
    deliveryContactName,
    deliveryContactPhone,
    alternate: {
      alternateContactName: input.alternateContactName,
      alternateContactPhone: input.alternateContactPhone,
      deliveryPrimaryContactName: input.deliveryPrimaryContactName,
      deliveryPrimaryContactPhone: input.deliveryPrimaryContactPhone,
    },
  });

  return {
    deliveryAddressLabel,
    deliveryContactName: effectiveContact.deliveryContactName,
    deliveryContactPhone: effectiveContact.deliveryContactPhone,
    deliveryInstructionsList,
  };
}
