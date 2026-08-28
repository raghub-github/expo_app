/**
 * GET / PUT — grid-first hero media list for grocery home (per state).
 */
import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdminApi } from "@/lib/super-admin-api";
import {
  getStateGroceryGridFirstHeroMedia,
  saveStateGroceryGridFirstHeroMedia,
} from "@/lib/db/operations/cxapp-grocery-home-layout";
import { deleteDocument } from "@/lib/services/r2";
import { parseGridFirstHeroMediaItems } from "@/lib/cxapp-home/grid-first-hero-media";

export const runtime = "nodejs";

type RouteCtx = { params: Promise<{ stateId: string }> };

export async function GET(_request: NextRequest, ctx: RouteCtx) {
  const gate = await requireSuperAdminApi();
  if (!gate.ok) return gate.response;

  const { stateId } = await ctx.params;
  if (!stateId?.trim()) {
    return NextResponse.json({ error: "stateId required" }, { status: 400 });
  }

  try {
    const items = await getStateGroceryGridFirstHeroMedia(stateId);
    return NextResponse.json({ stateId, items });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to load hero media";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, ctx: RouteCtx) {
  const gate = await requireSuperAdminApi();
  if (!gate.ok) return gate.response;

  const { stateId } = await ctx.params;
  if (!stateId?.trim()) {
    return NextResponse.json({ error: "stateId required" }, { status: 400 });
  }

  try {
    const body = (await request.json()) as { items?: unknown };
    const items = parseGridFirstHeroMediaItems(body.items);
    const saved = await saveStateGroceryGridFirstHeroMedia(stateId, items);
    return NextResponse.json({ stateId, items: saved });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to save hero media";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

function extractKeyFromProxyOrUrl(value: string): string | null {
  const v = (value || "").trim();
  if (!v) return null;
  if (v.includes("/api/attachments/proxy") && v.includes("key=")) {
    try {
      const u = new URL(v, "http://dummy");
      const k = u.searchParams.get("key");
      return k ? decodeURIComponent(k) : null;
    } catch {
      return null;
    }
  }
  if (v.startsWith("http://") || v.startsWith("https://")) {
    try {
      const u = new URL(v);
      const key = u.searchParams.get("key");
      if (key) return decodeURIComponent(key);
      return u.pathname.replace(/^\/+/, "") || null;
    } catch {
      return null;
    }
  }
  return v.replace(/^\/+/, "");
}

export async function DELETE(request: NextRequest, ctx: RouteCtx) {
  const gate = await requireSuperAdminApi();
  if (!gate.ok) return gate.response;

  const { stateId } = await ctx.params;
  if (!stateId?.trim()) {
    return NextResponse.json({ error: "stateId required" }, { status: 400 });
  }

  const itemId = new URL(request.url).searchParams.get("itemId")?.trim();
  if (!itemId) {
    return NextResponse.json({ error: "itemId query required" }, { status: 400 });
  }

  try {
    const existing = await getStateGroceryGridFirstHeroMedia(stateId);
    const target = existing.find((i) => i.id === itemId);
    if (!target) {
      return NextResponse.json({ error: "Item not found" }, { status: 404 });
    }

    const remaining = existing.filter((i) => i.id !== itemId);
    const items = await saveStateGroceryGridFirstHeroMedia(stateId, remaining);

    const oldKey = extractKeyFromProxyOrUrl(target.url);
    if (oldKey) {
      deleteDocument(oldKey).catch(() => undefined);
    }

    return NextResponse.json({ stateId, items });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to delete hero media";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
