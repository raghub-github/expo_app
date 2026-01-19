/**
 * Cache Strategy Definitions
 * 
 * Defines caching strategies for different data types based on volatility:
 * - Tier 1: Static/Long-lived data (aggressive caching)
 * - Tier 2: Medium frequency data (moderate caching)
 * - Tier 3: Dynamic/Real-time data (minimal/no caching)
 */

export enum CacheTier {
  STATIC = "STATIC",      // Tier 1: Permissions, Access, Service Points
  MEDIUM = "MEDIUM",      // Tier 2: Users, Offers, Tickets List
  DYNAMIC = "DYNAMIC",    // Tier 3: Orders, Session Status, Notifications
}

export interface CacheConfig {
  staleTime: number;
  gcTime: number;
  refetchOnMount: boolean;
  refetchOnWindowFocus: boolean;
  refetchInterval?: number | false;
  persist: boolean;
  persistMaxAge?: number; // Max age for persisted data in ms
}

/**
 * Cache configurations for each tier
 */
export const cacheStrategies: Record<CacheTier, CacheConfig> = {
  [CacheTier.STATIC]: {
    staleTime: 30 * 60 * 1000, // 30 minutes
    gcTime: 24 * 60 * 60 * 1000, // 24 hours
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    persist: true,
    persistMaxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  },
  [CacheTier.MEDIUM]: {
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 60 * 60 * 1000, // 1 hour
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    persist: true,
    persistMaxAge: 24 * 60 * 60 * 1000, // 1 day
  },
  [CacheTier.DYNAMIC]: {
    staleTime: 0, // Always stale
    gcTime: 5 * 60 * 1000, // 5 minutes
    refetchOnMount: true,
    refetchOnWindowFocus: true,
    refetchInterval: 30 * 1000, // 30 seconds for real-time updates
    persist: false,
  },
};

/**
 * Authentication-specific cache config
 * Session data: Cache but verify on critical operations
 */
export const authCacheConfig: CacheConfig = {
  staleTime: 2 * 60 * 1000, // 2 minutes
  gcTime: 5 * 60 * 1000, // 5 minutes
  refetchOnMount: false,
  refetchOnWindowFocus: true, // Refetch on focus to catch logout in other tabs
  persist: false, // Don't persist session data (security)
};

/**
 * Permissions cache config (aggressive caching, safe to persist)
 */
export const permissionsCacheConfig: CacheConfig = {
  staleTime: 30 * 60 * 1000, // 30 minutes
  gcTime: 24 * 60 * 60 * 1000, // 24 hours
  refetchOnMount: false,
  refetchOnWindowFocus: false,
  persist: true,
  persistMaxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
};

/**
 * Session status cache config (don't cache for security)
 */
export const sessionStatusCacheConfig: CacheConfig = {
  staleTime: 0, // Always stale
  gcTime: 2 * 60 * 1000, // 2 minutes
  refetchOnMount: true,
  refetchOnWindowFocus: true,
  refetchInterval: 60 * 1000, // 60 seconds
  persist: false,
};

/**
 * Helper to get cache config for a query
 */
export function getCacheConfig(tier: CacheTier): CacheConfig {
  return cacheStrategies[tier];
}
