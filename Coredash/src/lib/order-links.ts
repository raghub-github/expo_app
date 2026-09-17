/** Ops dashboard order detail — same public IDs as control.gatimitra /order/[id].
 * Local dashboard (`npm run dev` in /dashboard) listens on :3001; :3000 is the API. */
export function orderDetailHref(code: string | null | undefined): string {
  const id = String(code ?? "")
    .trim()
    .replace(/^#/, "")
    .replace(/[-\s]/g, "");
  if (!id) return "#";
  const base = (
    process.env.NEXT_PUBLIC_DASHBOARD_URL ||
    process.env.NEXT_PUBLIC_OPS_DASHBOARD_URL ||
    "http://localhost:3001"
  ).replace(/\/$/, "");
  return `${base}/order/${encodeURIComponent(id)}`;
}
