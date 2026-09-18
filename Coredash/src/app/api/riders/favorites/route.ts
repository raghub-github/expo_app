import { NextRequest } from "next/server";
import { withAuth } from "@/lib/api";
import { listFavoriteRiderIds, setRiderFavorite } from "@/lib/db/favorites";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return withAuth(async (user) => {
    const ids = await listFavoriteRiderIds(user.systemUserId);
    return { ids };
  });
}

export async function POST(request: NextRequest) {
  return withAuth(async (user) => {
    const body = (await request.json()) as { riderId?: number; favorite?: boolean };
    const riderId = Number(body.riderId);
    if (!Number.isFinite(riderId) || riderId <= 0) {
      throw new Error("Invalid riderId");
    }
    const favorite = Boolean(body.favorite);
    return setRiderFavorite(user.systemUserId, riderId, favorite);
  });
}
