import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(request: Request) {
  // Some browsers still request /favicon.ico directly.
  // Redirect to the canonical PNG favicon so the icon is always available.
  return NextResponse.redirect(new URL("/favicon.png?v=1", request.url), 308);
}
