/**
 * POST multipart — upload a queue alert sound into public/uploads/ticket-queue/ (manager ticket access).
 */

import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { randomBytes } from "crypto";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getSystemUserByEmail } from "@/lib/db/operations/users";
import { isSuperAdmin, hasDashboardAccessByAuth } from "@/lib/permissions/engine";
import { isInvalidRefreshToken, signOutIfSessionDead } from "@/lib/auth/session-errors";

export const runtime = "nodejs";

const MAX_BYTES = 800_000;
const ALLOWED_EXT = new Set([".wav", ".mp3", ".ogg", ".mpeg", ".m4a"]);
const ALLOWED_MIME = new Set([
  "audio/wav",
  "audio/x-wav",
  "audio/wave",
  "audio/mpeg",
  "audio/mp3",
  "audio/ogg",
  "audio/mp4",
  "audio/x-m4a",
]);

async function requireTicketAccess() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError) {
    if (isInvalidRefreshToken(userError)) {
      await signOutIfSessionDead(supabase, userError);
      return {
        error: NextResponse.json({ success: false, error: "Session invalid", code: "SESSION_INVALID" }, { status: 401 }),
      };
    }
    return { error: NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 }) };
  }
  if (!user) {
    return { error: NextResponse.json({ success: false, error: "Not authenticated" }, { status: 401 }) };
  }
  const systemUser = await getSystemUserByEmail(user.email!);
  if (!systemUser) {
    return { error: NextResponse.json({ success: false, error: "User not found" }, { status: 404 }) };
  }
  const userIsSuperAdmin = await isSuperAdmin(user.id, user.email!);
  const hasTicketAccess = await hasDashboardAccessByAuth(user.id, user.email!, "TICKET");
  if (!userIsSuperAdmin && !hasTicketAccess) {
    return { error: NextResponse.json({ success: false, error: "Insufficient permissions" }, { status: 403 }) };
  }
  return { systemUser };
}

export async function POST(request: NextRequest) {
  const auth = await requireTicketAccess();
  if ("error" in auth && auth.error) return auth.error;

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid form data" }, { status: 400 });
  }

  const file = form.get("file");
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ success: false, error: 'Expected file field "file"' }, { status: 400 });
  }

  if (file.size > MAX_BYTES) {
    return NextResponse.json({ success: false, error: `File too large (max ${MAX_BYTES / 1000} KB)` }, { status: 400 });
  }

  const orig = String(file.name || "sound").trim() || "sound";
  const ext = path.extname(orig).toLowerCase();
  if (!ALLOWED_EXT.has(ext)) {
    return NextResponse.json(
      { success: false, error: "Use .wav, .mp3, .ogg, .mpeg, or .m4a" },
      { status: 400 }
    );
  }

  const type = String(file.type || "").toLowerCase();
  if (type && !ALLOWED_MIME.has(type) && !type.startsWith("audio/")) {
    return NextResponse.json({ success: false, error: "Not an audio file" }, { status: 400 });
  }

  const buf = Buffer.from(await file.arrayBuffer());
  const name = `assignment-${Date.now()}-${randomBytes(6).toString("hex")}${ext}`;
  const relDir = path.join("public", "uploads", "ticket-queue");
  const absDir = path.join(process.cwd(), relDir);
  await mkdir(absDir, { recursive: true });
  const absPath = path.join(absDir, name);
  await writeFile(absPath, buf);

  const publicUrl = `/uploads/ticket-queue/${name}`;
  return NextResponse.json({ success: true, data: { url: publicUrl } });
}
