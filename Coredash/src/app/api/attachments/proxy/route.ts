import { NextRequest, NextResponse } from "next/server";
import { contentTypeFromKey, getR2Object, headR2Object, normalizeMediaKey } from "@/lib/r2";
import { CoreAuthError, requireCoreUser } from "@/lib/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function keyFromRequest(request: NextRequest) {
  const raw = (request.nextUrl.searchParams.get("key") || request.nextUrl.searchParams.get("url") || "").trim();
  return normalizeMediaKey(raw);
}

export async function HEAD(request: NextRequest) {
  try {
    await requireCoreUser();
    const key = keyFromRequest(request);
    if (!key) return new NextResponse(null, { status: 400 });
    const meta = await headR2Object(key);
    if (!meta) return new NextResponse(null, { status: 404 });
    return new NextResponse(null, {
      status: 200,
      headers: {
        "Content-Type": contentTypeFromKey(key, meta.contentType),
        "Cache-Control": "private, max-age=3600",
        ...(meta.contentLength != null ? { "Content-Length": String(meta.contentLength) } : {}),
      },
    });
  } catch (error) {
    const status = error instanceof CoreAuthError ? error.status : 401;
    return new NextResponse(null, { status });
  }
}

export async function GET(request: NextRequest) {
  try {
    await requireCoreUser();
    const key = keyFromRequest(request);
    if (!key) return NextResponse.json({ error: "Missing key" }, { status: 400 });
    const obj = await getR2Object(key);
    if (!obj) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return new NextResponse(new Uint8Array(obj.buffer), {
      status: 200,
      headers: {
        "Content-Type": contentTypeFromKey(key, obj.contentType),
        "Cache-Control": "private, max-age=3600",
        "Content-Disposition": "inline",
      },
    });
  } catch (error) {
    if (error instanceof CoreAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed" },
      { status: 500 }
    );
  }
}
