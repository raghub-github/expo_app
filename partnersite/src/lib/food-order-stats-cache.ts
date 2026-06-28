import type { FoodOrderStats } from '@/hooks/useFoodOrders';

export const DEFAULT_FOOD_ORDER_STATS: FoodOrderStats = {
  ordersToday: 0,
  ordersTodayActive: 0,
  deliveredTodayCount: 0,
  activeOrders: 0,
  pendingCount: 0,
  avgPreparationTimeMinutes: 0,
  totalRevenueToday: 0,
  completionRatePercent: 0,
};

function cacheKey(storeId: string): string {
  return `mx-food-order-stats:${storeId.trim()}`;
}

export function readCachedFoodOrderStats(storeId: string): FoodOrderStats | null {
  if (typeof window === 'undefined' || !storeId.trim()) return null;
  try {
    const raw = sessionStorage.getItem(cacheKey(storeId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as FoodOrderStats;
    if (typeof parsed !== 'object' || parsed == null) return null;
    return { ...DEFAULT_FOOD_ORDER_STATS, ...parsed };
  } catch {
    return null;
  }
}

export function writeCachedFoodOrderStats(storeId: string, stats: FoodOrderStats): void {
  if (typeof window === 'undefined' || !storeId.trim()) return;
  try {
    sessionStorage.setItem(cacheKey(storeId), JSON.stringify(stats));
  } catch {
    /* ignore */
  }
}
