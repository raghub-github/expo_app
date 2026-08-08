/**
 * Next.js App Router `loading.tsx` default export.
 * Intentionally empty — dashboard client pages own skeletons/spinners where needed.
 * Avoids a full-screen GM spinner flash on every soft navigation while RSC revalidates.
 */
export default function DashboardRouteLoading() {
  return null;
}
