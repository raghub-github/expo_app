import { NextResponse } from "next/server";
import { CoreAuthError, requireCoreUser, type CoreUser } from "@/lib/auth/session";

export class ApiHttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiHttpError";
    this.status = status;
  }
}

export async function jsonError(error: unknown, fallback = "Request failed") {
  if (error instanceof CoreAuthError) {
    const res = NextResponse.json({ success: false, error: error.message }, { status: error.status });
    res.headers.set("Cache-Control", "no-store, private");
    return res;
  }
  if (error instanceof ApiHttpError) {
    const res = NextResponse.json({ success: false, error: error.message }, { status: error.status });
    res.headers.set("Cache-Control", "no-store, private");
    return res;
  }
  const message = error instanceof Error ? error.message : fallback;
  const status =
    message === "UNAUTHORIZED"
      ? 401
      : message === "FORBIDDEN"
        ? 403
        : message === "Customer not found" || message === "Rider not found" || message === "Merchant not found"
          ? 404
          : 500;
  const res = NextResponse.json({ success: false, error: message }, { status });
  res.headers.set("Cache-Control", "no-store, private");
  return res;
}

export async function withAuth<T>(handler: (user: CoreUser) => Promise<T>) {
  try {
    const user = await requireCoreUser();
    const data = await handler(user);
    const res = NextResponse.json({ success: true, data });
    res.headers.set("Cache-Control", "no-store, private");
    return res;
  } catch (error) {
    return jsonError(error);
  }
}
