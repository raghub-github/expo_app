import { NextRequest, NextResponse } from "next/server";
import { requireSuperAdminApi } from "@/lib/super-admin-api";
import { uploadWithKey } from "@/lib/services/r2";

export const runtime = "nodejs";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED = new Set(["audio/wav", "audio/x-wav", "audio/mpeg", "audio/mp3", "audio/ogg", "audio/webm", "audio/mp4"]);

function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 200) || "sound";
}

function buildProxyUrl(r2Key: string): string {
  return `/api/attachments/proxy?key=${encodeURIComponent(r2Key)}`;
}

export async function POST(req: NextRequest) {
  const gate = await requireSuperAdminApi();
  if (!gate.ok) return gate.response;

  const contentType = req.headers.get("content-type") || "";
  if (!contentType.includes("multipart/form-data")) {
    return NextResponse.json({ error: "Expected multipart/form-data" }, { status: 400 });
  }

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file is required" }, { status: 400 });
  }
  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json({ error: "File too large (max 10MB)" }, { status: 400 });
  }
  const mime = file.type || "application/octet-stream";
  if (!ALLOWED.has(mime) && !mime.startsWith("audio/")) {
    return NextResponse.json({ error: "Invalid file type" }, { status: 400 });
  }

  const safeName = sanitizeFileName(file.name);
  const crypto = await import("crypto");
  const key = `admin/order-acceptance-sound/${crypto.randomUUID()}-${safeName}`;

  try {
    await uploadWithKey(file, key);
    return NextResponse.json({ ok: true, url: buildProxyUrl(key), key });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Upload failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

