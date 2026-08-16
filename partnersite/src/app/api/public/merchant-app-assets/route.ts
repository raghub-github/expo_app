import { NextResponse } from "next/server";
import { fetchBackend } from "@/lib/fetch-backend";

export const dynamic = "force-dynamic";

/** Public read-only proxy for merchant CMS images (no auth). Never blocks the dashboard. */
export async function GET() {
  try {
    const res = await fetchBackend("/v1/app-assets/merchant", {
      timeoutMs: 1_500,
      headers: { "X-Silent-Error": "1" },
    });
    if (!res?.ok) {
      // Soft-fail: empty payload so UI keeps working offline / without Fastify.
      return NextResponse.json(
        { assets: {}, offline: true },
        {
          status: 200,
          headers: { "Cache-Control": "public, max-age=30" },
        }
      );
    }
    const body = await res.json();
    return NextResponse.json(body, {
      headers: { "Cache-Control": "public, max-age=60, stale-while-revalidate=300" },
    });
  } catch (e) {
    console.warn("[GET /api/public/merchant-app-assets]", e instanceof Error ? e.message : e);
    return NextResponse.json(
      { assets: {}, offline: true },
      { status: 200, headers: { "Cache-Control": "public, max-age=30" } }
    );
  }
}
