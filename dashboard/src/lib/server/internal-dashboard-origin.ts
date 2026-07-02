import "server-only";

import { headers } from "next/headers";

/** Origin for server-side fetches to this dashboard's own API routes. */
export async function getInternalDashboardOrigin(): Promise<string> {
  const explicit =
    process.env.DASHBOARD_APP_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, "");

  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) return `https://${vercel.replace(/^https?:\/\//, "")}`.replace(/\/$/, "");

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (host) {
    const protocol = h.get("x-forwarded-proto") ?? "http";
    return `${protocol}://${host}`.replace(/\/$/, "");
  }

  const port = process.env.PORT?.trim() || "3001";
  return `http://127.0.0.1:${port}`;
}

export async function readJsonResponse<T>(res: Response, fallback: T): Promise<T> {
  const text = await res.text();
  if (!text.trim()) return fallback;
  try {
    return JSON.parse(text) as T;
  } catch {
    return fallback;
  }
}
