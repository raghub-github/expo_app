import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSuperAdminApi } from "@/lib/super-admin-api";
import {
  listCustomerRideServiceCatalog,
  listRideCatalogVehicleAssignments,
  saveRideCatalogVehicleAssignments,
} from "@/lib/db/operations/customer-ride-service-catalog-admin";

export const runtime = "nodejs";

export async function GET() {
  const gate = await requireSuperAdminApi();
  if (!gate.ok) return gate.response;
  try {
    const [catalog, vehicles] = await Promise.all([
      listCustomerRideServiceCatalog(),
      listRideCatalogVehicleAssignments(),
    ]);
    return NextResponse.json({ success: true, catalog, vehicles });
  } catch (e) {
    console.error("[super-admin customer-ride-service-catalog GET]", e);
    const msg = e instanceof Error ? e.message : "Failed";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

const putSchema = z.object({
  updates: z
    .array(
      z.object({
        vehicleTypeCode: z.string().min(1),
        catalogCodes: z.array(z.string()),
      })
    )
    .min(1),
});

export async function PUT(req: NextRequest) {
  const gate = await requireSuperAdminApi();
  if (!gate.ok) return gate.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = putSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: "Validation failed" }, { status: 400 });
  }

  try {
    const result = await saveRideCatalogVehicleAssignments(parsed.data.updates);
    return NextResponse.json({ success: true, ...result });
  } catch (e) {
    console.error("[super-admin customer-ride-service-catalog PUT]", e);
    const msg = e instanceof Error ? e.message : "Failed";
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
