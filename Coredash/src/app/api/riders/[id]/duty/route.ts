import { NextRequest } from "next/server";
import { withAuth } from "@/lib/api";
import { markRiderDutyOff } from "@/lib/db/rider-duty";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  return withAuth(async (user) => {
    const riderId = Number(id);
    return markRiderDutyOff({
      riderId,
      adminSystemUserId: user.systemUserId,
      adminEmail: user.email,
    });
  });
}
