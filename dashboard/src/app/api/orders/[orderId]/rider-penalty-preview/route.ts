import { getAuthenticatedApiUser, authFailureResponse } from "@/lib/auth/api-session";
/**
 * POST /api/orders/[orderId]/rider-penalty-preview
 * Preview 3PL Fault rider penalty for confirm-refund modal (rider picker + amount).
 */
import { NextRequest, NextResponse } from "next/server";
import { canRefundOrder } from "@/lib/permissions/actions";
import { getSql } from "@/lib/db/client";
import { listOrderRiderAssignmentsForOrder } from "@/lib/db/operations/order-rider-assignments";
import { previewThreePlRiderCancellationPenalty } from "@/lib/orders/apply-rider-cancellation-penalty";

export const runtime = "nodejs";

function parseOrderId(param: string | undefined): number | null {
  if (!param) return null;
  const id = Number(param);
  return Number.isFinite(id) && id > 0 ? id : null;
}

type RiderOption = {
  riderId: number;
  riderName: string | null;
  riderMobile: string | null;
  assignmentStatus: string | null;
  acceptedAt: string | null;
  pickedUpAt: string | null;
  isCurrentOnOrder: boolean;
  label: string;
};

function riderOptionLabel(args: {
  riderName: string | null;
  riderMobile: string | null;
  riderId: number;
  assignmentStatus: string | null;
  pickedUpAt: string | null;
  isCurrentOnOrder: boolean;
}): string {
  const name =
    args.riderName?.trim() ||
    (args.riderMobile?.trim() ? args.riderMobile.trim() : `Rider #${args.riderId}`);
  const parts = [name];
  if (args.isCurrentOnOrder) parts.push("(current)");
  if (args.pickedUpAt) parts.push("· picked up");
  else if (args.assignmentStatus) parts.push(`· ${args.assignmentStatus.replace(/_/g, " ").toLowerCase()}`);
  return parts.join(" ");
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ orderId: string }> }
) {
  try {
    const { orderId: orderIdParam } = await context.params;
    const orderId = parseOrderId(orderIdParam);
    if (!orderId) {
      return NextResponse.json({ success: false, error: "Invalid order id" }, { status: 400 });
    }

    const auth = await getAuthenticatedApiUser(request);
    if (!auth.ok) {
      return authFailureResponse(auth);
    }
    const { user } = auth;

    const canRefund = await canRefundOrder(user.id, user.email ?? "", "ORDER_FOOD");
    if (!canRefund) {
      return NextResponse.json({ success: false, error: "Insufficient permissions" }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const requestedRiderId =
      typeof body?.riderId === "number"
        ? body.riderId
        : Number(body?.riderId);

    const sql = getSql();
    const coreRows = await sql.unsafe<{ rider_id: number | null }[]>(
      `SELECT rider_id FROM orders_core WHERE id = $1 LIMIT 1`,
      [orderId]
    );
    const currentRiderId = Number(coreRows[0]?.rider_id);

    const assignments = await listOrderRiderAssignmentsForOrder(orderId);
    const byRider = new Map<number, RiderOption>();

    for (const a of assignments) {
      if (a.riderId == null) continue;
      const existing = byRider.get(a.riderId);
      const pickedUpAt = a.pickedUpAt?.toISOString() ?? null;
      const acceptedAt = a.acceptedAt?.toISOString() ?? null;
      const isCurrent = Number.isFinite(currentRiderId) && a.riderId === currentRiderId;
      const next: RiderOption = {
        riderId: a.riderId,
        riderName: a.riderName,
        riderMobile: a.riderMobile,
        assignmentStatus: a.assignmentStatus,
        acceptedAt,
        pickedUpAt,
        isCurrentOnOrder: isCurrent,
        label: "",
      };
      next.label = riderOptionLabel(next);

      if (!existing) {
        byRider.set(a.riderId, next);
        continue;
      }
      if (pickedUpAt && !existing.pickedUpAt) {
        byRider.set(a.riderId, next);
      }
    }

    const riders = [...byRider.values()].sort((a, b) => {
      if (a.isCurrentOnOrder !== b.isCurrentOnOrder) return a.isCurrentOnOrder ? -1 : 1;
      if (a.pickedUpAt && !b.pickedUpAt) return -1;
      if (!a.pickedUpAt && b.pickedUpAt) return 1;
      return a.riderId - b.riderId;
    });

    let defaultRiderId: number | null = null;
    if (Number.isFinite(requestedRiderId) && requestedRiderId > 0 && byRider.has(requestedRiderId)) {
      defaultRiderId = requestedRiderId;
    } else if (Number.isFinite(currentRiderId) && currentRiderId > 0 && byRider.has(currentRiderId)) {
      defaultRiderId = currentRiderId;
    } else {
      const pickedUp = riders.find((r) => r.pickedUpAt);
      const accepted = riders.find((r) => r.acceptedAt);
      defaultRiderId = pickedUp?.riderId ?? accepted?.riderId ?? riders[0]?.riderId ?? null;
    }

    const previewsByRiderId: Record<number, Awaited<ReturnType<typeof previewThreePlRiderCancellationPenalty>>> =
      {};
    await Promise.all(
      riders.map(async (r) => {
        previewsByRiderId[r.riderId] = await previewThreePlRiderCancellationPenalty({
          orderCoreId: orderId,
          riderId: r.riderId,
        });
      })
    );

    const preview = defaultRiderId != null ? previewsByRiderId[defaultRiderId] ?? null : null;

    return NextResponse.json({
      success: true,
      riders,
      selectedRiderId: defaultRiderId,
      preview,
      previewsByRiderId,
    });
  } catch (error) {
    console.error("[POST rider-penalty-preview]", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Preview failed",
      },
      { status: 500 }
    );
  }
}
