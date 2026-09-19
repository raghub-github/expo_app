/** Ops / control portal order detail — same public IDs as control.gatimitra.com/order/[id]. */
const PRODUCTION_CONTROL_DASHBOARD = "https://control.gatimitra.com";

export function orderDetailHref(code: string | null | undefined): string {
  const id = String(code ?? "")
    .trim()
    .replace(/^#/, "")
    .replace(/[-\s]/g, "");
  if (!id) return "#";
  const fromEnv = (
    process.env.NEXT_PUBLIC_DASHBOARD_URL ||
    process.env.NEXT_PUBLIC_OPS_DASHBOARD_URL ||
    ""
  ).trim();
  // Never ship treasury → localhost when env is missing or still points at local dashboard.
  const base = (
    !fromEnv || /localhost|127\.0\.0\.1/i.test(fromEnv)
      ? PRODUCTION_CONTROL_DASHBOARD
      : fromEnv
  ).replace(/\/$/, "");
  return `${base}/order/${encodeURIComponent(id)}`;
}
