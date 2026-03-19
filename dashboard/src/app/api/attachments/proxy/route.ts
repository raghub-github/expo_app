/**
 * GET /api/attachments/proxy?key=<r2_key>
 * Serves file from R2 by key. Used as public_url for menu/media files.
 */
import { NextRequest, NextResponse } from "next/server";
import { getObjectByKey } from "@/lib/services/r2";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const key = request.nextUrl.searchParams.get("key");
  if (!key || typeof key !== "string") {
    return NextResponse.json(
      { error: "Missing key parameter" },
      { status: 400 }
    );
  }

  try {
    const result = await getObjectByKey(key);
    if (!result) {
      return NextResponse.json(
        { error: "File not found" },
        { status: 404 }
      );
    }

    const contentType = result.contentType || "application/octet-stream";
    return new NextResponse(result.buffer as any, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (e) {
    console.error("[GET /api/attachments/proxy]", e);
    return NextResponse.json(
      { error: "Failed to load file" },
      { status: 500 }
    );
  }
}
