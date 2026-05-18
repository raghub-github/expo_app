/**
 * Polls /commission/active for the selected store. Used by the menu item form
 * (to compute the customer-visible price preview) and the earnings screen
 * (rate badge).
 */
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/context/AuthContext";
import { fetchActiveCommission, type ActiveCommission } from "@/services/commissionApi";

export function useActiveCommission(storeIdNumeric: number | null | undefined) {
  const { token } = useAuth();
  return useQuery<ActiveCommission>({
    queryKey: ["commission", "active", storeIdNumeric],
    queryFn: () => fetchActiveCommission(Number(storeIdNumeric), token!),
    enabled: !!storeIdNumeric && !!token,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
}

/** Pure pricing helper — kept in the same file so callers don't import a separate util. */
export function customerVisibleFromBase(baseRupees: number, percent: number): number {
  if (!Number.isFinite(baseRupees) || baseRupees <= 0) return 0;
  if (!Number.isFinite(percent) || percent < 0 || percent >= 100) return baseRupees;
  const exact = (baseRupees * 100) / (100 - percent);
  return Math.round(exact);
}
