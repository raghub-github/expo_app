import { getAuthenticatedApiUser, authFailureResponse } from "@/lib/auth/api-session";
/**
 * POST /api/orders/[orderId]/rider-penalty-preview
 * Preview 3PL Fault rider penalty for confirm-refund modal (rider picker + amount).
 */
import { NextRequest, NextResponse } from "next/server";
import { canRefundOrder } from "@/lib/permissions/actions";
import { getSql } from "@/lib/db/client";
import {
  listDistinctOrderRidersForRecon,
  listOrderRiderAssignmentsForOrder,
} from "@/lib/db/operations/order-rider-assignments";
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
    const coreRows = await sql.unsafe<
      { rider_id: number | null; rider_name: string | null; rider_mobile: string | null }[]
    >(
      `SELECT oc.rider_id,
              NULLIF(TRIM(r.name), '') AS rider_name,
              NULLIF(TRIM(r.mobile), '') AS rider_mobile
       FROM orders_core oc
       LEFT JOIN riders r ON r.id = oc.rider_id
       WHERE oc.id = $1
       LIMIT 1`,
      [orderId]
    );
    const currentRiderId = Number(coreRows[0]?.rider_id);

    const byRider = new Map<number, RiderOption>();

    const upsertRider = ( partial: Omit<RiderOption, "label"> ) => {
      if (!Number.isFinite(partial.riderId) || partial.riderId <= 0) return;
      const existing = byRider.get(partial.riderId);
      const next: RiderOption = {
        ...partial,
        isCurrentOnOrder:
          Number.isFinite(currentRiderId) && partial.riderId === currentRiderId,
        label: "",
      };
      next.label = riderOptionLabel(next);
      if (!existing) {
        byRider.set(partial.riderId, next);
        return;
      }
      // Prefer richer milestone / identity data when merging sources.
      const merged: RiderOption = {
        riderId: partial.riderId,
        riderName: existing.riderName || next.riderName,
        riderMobile: existing.riderMobile || next.riderMobile,
        assignmentStatus: existing.assignmentStatus || next.assignmentStatus,
        acceptedAt: existing.acceptedAt || next.acceptedAt,
        pickedUpAt: existing.pickedUpAt || next.pickedUpAt,
        isCurrentOnOrder: existing.isCurrentOnOrder || next.isCurrentOnOrder,
        label: "",
      };
      if (next.pickedUpAt && !existing.pickedUpAt) {
        merged.pickedUpAt = next.pickedUpAt;
        merged.acceptedAt = next.acceptedAt || merged.acceptedAt;
        merged.assignmentStatus = next.assignmentStatus || merged.assignmentStatus;
      }
      merged.label = riderOptionLabel(merged);
      byRider.set(partial.riderId, merged);
    };

    try {
      const assignments = await listOrderRiderAssignmentsForOrder(orderId);
      for (const a of assignments) {
        if (a.riderId == null) continue;
        upsertRider({
          riderId: a.riderId,
          riderName: a.riderName,
          riderMobile: a.riderMobile,
          assignmentStatus: a.assignmentStatus,
          acceptedAt: a.acceptedAt?.toISOString() ?? null,
          pickedUpAt: a.pickedUpAt?.toISOString() ?? null,
          isCurrentOnOrder: false,
        });
      }
    } catch (assignmentErr) {
      console.warn("[POST rider-penalty-preview] assignments:", assignmentErr);
    }

    try {
      const reconRiders = await listDistinctOrderRidersForRecon(orderId);
      for (const r of reconRiders) {
        if (r.riderId == null || !Number.isFinite(r.riderId)) continue;
        upsertRider({
          riderId: r.riderId,
          riderName: r.riderName,
          riderMobile: r.riderMobile,
          assignmentStatus: null,
          acceptedAt: null,
          pickedUpAt: null,
          isCurrentOnOrder: false,
        });
      }
    } catch (reconErr) {
      console.warn("[POST rider-penalty-preview] recon riders:", reconErr);
    }

    // Always surface the current rider on the order, even if assignment rows are missing.
    if (Number.isFinite(currentRiderId) && currentRiderId > 0) {
      const coreRider = coreRows[0];
      upsertRider({
        riderId: currentRiderId,
        riderName: coreRider?.rider_name ?? null,
        riderMobile: coreRider?.rider_mobile ?? null,
        assignmentStatus: null,
        acceptedAt: null,
        pickedUpAt: null,
        isCurrentOnOrder: true,
      });
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
        try {
          previewsByRiderId[r.riderId] = await previewThreePlRiderCancellationPenalty({
            orderCoreId: orderId,
            riderId: r.riderId,
          });
        } catch (previewErr) {
          console.warn(
            `[POST rider-penalty-preview] preview rider=${r.riderId}:`,
            previewErr
          );
          previewsByRiderId[r.riderId] = {
            appliesPenalty: false,
            penaltyAmount: 0,
            scenarioCode: null,
            scenarioLabel: null,
            ledgerTitle: "",
            ledgerDescription: "",
            skipped: "preview_failed",
            skippedLabel: "Could not calculate penalty for this rider.",
          } as Awaited<ReturnType<typeof previewThreePlRiderCancellationPenalty>>;
        }
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
    // Last resort: still try to return the current rider so the UI can render a picker.
    try {
      const { orderId: orderIdParam } = await context.params;
      const orderId = parseOrderId(orderIdParam);
      if (orderId) {
        const sql = getSql();
        const coreRows = await sql.unsafe<
          { rider_id: number | null; rider_name: string | null; rider_mobile: string | null }[]
        >(
          `SELECT oc.rider_id,
                  NULLIF(TRIM(r.name), '') AS rider_name,
                  NULLIF(TRIM(r.mobile), '') AS rider_mobile
           FROM orders_core oc
           LEFT JOIN riders r ON r.id = oc.rider_id
           WHERE oc.id = $1
           LIMIT 1`,
          [orderId]
        );
        const currentRiderId = Number(coreRows[0]?.rider_id);
        if (Number.isFinite(currentRiderId) && currentRiderId > 0) {
          const coreRider = coreRows[0];
          const rider: RiderOption = {
            riderId: currentRiderId,
            riderName: coreRider?.rider_name ?? null,
            riderMobile: coreRider?.rider_mobile ?? null,
            assignmentStatus: null,
            acceptedAt: null,
            pickedUpAt: null,
            isCurrentOnOrder: true,
            label: "",
          };
          rider.label = riderOptionLabel(rider);
          return NextResponse.json({
            success: true,
            riders: [rider],
            selectedRiderId: currentRiderId,
            preview: {
              appliesPenalty: false,
              penaltyAmount: 0,
              scenarioCode: null,
              scenarioLabel: null,
              ledgerTitle: "",
              ledgerDescription: "",
              skipped: "preview_failed",
              skippedLabel:
                error instanceof Error ? error.message : "Could not load rider penalty preview.",
            },
            previewsByRiderId: {},
          });
        }
      }
    } catch {
      /* fall through to 500 */
    }
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Preview failed",
      },
      { status: 500 }
    );
  }
}
