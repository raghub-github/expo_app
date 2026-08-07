/**
 * GET/POST /api/customers/[id]/service-blocks
 * Per-service block / unblock for customers.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedApiUser } from "@/lib/auth/api-session";
import { checkPermission } from "@/lib/permissions/engine";
import { getCustomerById, getCustomerByCustomerId } from "@/lib/db/operations/customers";
import {
  blockCustomerServices,
  listActiveCustomerServiceBlocks,
  listCustomerServiceBlockHistory,
  normalizeCustomerServiceTypes,
  unblockCustomerServices,
} from "@/lib/db/operations/customer-service-blocks";
import { getSystemUserByEmail } from "@/lib/db/operations/users";

export const runtime = "nodejs";

const CUSTOMER_SERVICE_TYPES = [
  "food",
  "parcel",
  "person_ride",
  "ecommerce",
  "vouchers",
  "near_me",
] as const;

const blockBodySchema = z.object({
  services: z.array(z.enum(CUSTOMER_SERVICE_TYPES)).min(1),
  reason: z.string().trim().min(5).max(2000),
});

const unblockBodySchema = z.object({
  services: z.array(z.enum(CUSTOMER_SERVICE_TYPES)).min(1),
  reason: z.string().trim().max(2000).optional(),
});

async function resolveCustomer(id: string) {
  const numericId = parseInt(id, 10);
  if (!Number.isNaN(numericId) && numericId.toString() === id) {
    return getCustomerById(numericId);
  }
  return getCustomerByCustomerId(id);
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await getAuthenticatedApiUser(_request);
    if (!auth.ok) {
      return NextResponse.json(auth.body, { status: auth.status });
    }

    const hasPermission = await checkPermission(
      auth.user.id,
      auth.user.email ?? "",
      "CUSTOMERS",
      "VIEW"
    );
    if (!hasPermission) {
      return NextResponse.json({ success: false, error: "Insufficient permissions" }, { status: 403 });
    }

    const { id } = await params;
    const customer = await resolveCustomer(id);
    if (!customer) {
      return NextResponse.json({ success: false, error: "Customer not found" }, { status: 404 });
    }

    const [activeBlocks, history] = await Promise.all([
      listActiveCustomerServiceBlocks(customer.id),
      listCustomerServiceBlockHistory(customer.id, 30),
    ]);

    return NextResponse.json({
      success: true,
      data: { activeBlocks, history },
    });
  } catch (error) {
    console.error("[GET /api/customers/[id]/service-blocks]", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await getAuthenticatedApiUser(request);
    if (!auth.ok) {
      return NextResponse.json(auth.body, { status: auth.status });
    }

    const hasPermission = await checkPermission(
      auth.user.id,
      auth.user.email ?? "",
      "CUSTOMERS",
      "BLOCK"
    );
    if (!hasPermission) {
      return NextResponse.json({ success: false, error: "Insufficient permissions" }, { status: 403 });
    }

    const systemUser = await getSystemUserByEmail(auth.user.email ?? "");
    const { id } = await params;
    const customer = await resolveCustomer(id);
    if (!customer) {
      return NextResponse.json({ success: false, error: "Customer not found" }, { status: 404 });
    }

    const body = blockBodySchema.parse(await request.json());
    const services = normalizeCustomerServiceTypes(body.services);
    const activeBlocks = await blockCustomerServices({
      customerId: customer.id,
      services,
      reason: body.reason,
      actorId: systemUser?.id ?? null,
      actorEmail: auth.user.email ?? null,
    });

    return NextResponse.json({ success: true, data: { activeBlocks } });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ success: false, error: error.flatten().fieldErrors }, { status: 400 });
    }
    console.error("[POST /api/customers/[id]/service-blocks]", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await getAuthenticatedApiUser(request);
    if (!auth.ok) {
      return NextResponse.json(auth.body, { status: auth.status });
    }

    const hasPermission = await checkPermission(
      auth.user.id,
      auth.user.email ?? "",
      "CUSTOMERS",
      "UNBLOCK"
    );
    if (!hasPermission) {
      return NextResponse.json({ success: false, error: "Insufficient permissions" }, { status: 403 });
    }

    const systemUser = await getSystemUserByEmail(auth.user.email ?? "");
    const { id } = await params;
    const customer = await resolveCustomer(id);
    if (!customer) {
      return NextResponse.json({ success: false, error: "Customer not found" }, { status: 404 });
    }

    const body = unblockBodySchema.parse(await request.json());
    const services = normalizeCustomerServiceTypes(body.services);
    await unblockCustomerServices({
      customerId: customer.id,
      services,
      reason: body.reason?.trim() || "Unblocked by admin",
      actorId: systemUser?.id ?? null,
      actorEmail: auth.user.email ?? null,
    });

    const activeBlocks = await listActiveCustomerServiceBlocks(customer.id);
    return NextResponse.json({ success: true, data: { activeBlocks } });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ success: false, error: error.flatten().fieldErrors }, { status: 400 });
    }
    console.error("[DELETE /api/customers/[id]/service-blocks]", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
