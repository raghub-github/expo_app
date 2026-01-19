/**
 * React Query Persistence Configuration
 * 
 * Persists selected queries to localStorage for offline resilience
 * and instant page loads. Only persists Tier 1 (Static) and Tier 2 (Medium) data.
 */

// Note: PersistedClient and Persister types are from @tanstack/react-query-persist-client
// We'll use any for now to avoid type issues if the package structure differs
type PersistedClient = any;
type Persister = {
  persistClient: (client: PersistedClient) => Promise<void>;
  restoreClient: () => Promise<PersistedClient | undefined>;
  removeClient: () => Promise<void>;
};

const CACHE_VERSION = "1.0.0";
const CACHE_KEY = "react-query-cache";

/**
 * Query keys that should be persisted to localStorage
 * Only include Tier 1 (Static) and Tier 2 (Medium) data
 */
const PERSISTED_QUERY_PREFIXES = [
  "permissions",
  "dashboard-access",
  "service-points",
  "users", // List views only, not individual user details
  "menu-items",
  "offers", // List views
  "store", // Store info
];

/**
 * Query keys that should NEVER be persisted (security/privacy)
 */
const EXCLUDED_QUERY_PREFIXES = [
  "auth", // Session data - security risk
  "session-status", // Security risk
  "orders", // Dynamic data
  "tickets", // May contain sensitive info
];

/**
 * Check if a query key should be persisted
 */
function shouldPersistQuery(queryKey: readonly unknown[]): boolean {
  const keyString = JSON.stringify(queryKey);
  
  // Check exclusions first (security)
  for (const excluded of EXCLUDED_QUERY_PREFIXES) {
    if (keyString.includes(excluded)) {
      return false;
    }
  }
  
  // Check if it's in the persisted list
  for (const prefix of PERSISTED_QUERY_PREFIXES) {
    if (keyString.includes(prefix)) {
      return true;
    }
  }
  
  return false;
}

/**
 * Custom storage adapter with expiry support
 */
class CacheStorage {
  private getStorageKey(): string {
    return `${CACHE_KEY}-v${CACHE_VERSION}`;
  }

  getItem(key: string): string | null {
    if (typeof window === "undefined") return null;
    
    try {
      const item = localStorage.getItem(this.getStorageKey());
      if (!item) return null;
      
      const data = JSON.parse(item);
      const now = Date.now();
      
      // Check if cache is expired
      if (data.expiresAt && data.expiresAt < now) {
        localStorage.removeItem(this.getStorageKey());
        return null;
      }
      
      return item;
    } catch (error) {
      console.warn("[CacheStorage] Error reading from localStorage:", error);
      return null;
    }
  }

  setItem(key: string, value: string): void {
    if (typeof window === "undefined") return;
    
    try {
      const data = JSON.parse(value);
      const now = Date.now();
      
      // Add expiry timestamp (7 days for static data, 1 day for medium)
      // This is a simplified approach - in production, you'd calculate per-query expiry
      data.expiresAt = now + (7 * 24 * 60 * 60 * 1000); // 7 days default
      data.version = CACHE_VERSION;
      
      localStorage.setItem(this.getStorageKey(), JSON.stringify(data));
    } catch (error) {
      console.warn("[CacheStorage] Error writing to localStorage:", error);
    }
  }

  removeItem(key: string): void {
    if (typeof window === "undefined") return;
    
    try {
      localStorage.removeItem(this.getStorageKey());
    } catch (error) {
      console.warn("[CacheStorage] Error removing from localStorage:", error);
    }
  }
}

/**
 * Create persister with selective serialization
 */
export function createPersister(): Persister {
  const storage = new CacheStorage();
  
  return {
    persistClient: async (client: PersistedClient) => {
      try {
        // Filter queries to only persist allowed ones
        const filteredClient: PersistedClient = {
          ...client,
          clientState: {
            ...client.clientState,
            queries: client.clientState.queries.filter((query) => {
              const queryKey = query.queryKey || [];
              return shouldPersistQuery(queryKey);
            }),
          },
        };
        
        const serialized = JSON.stringify(filteredClient);
        storage.setItem(CACHE_KEY, serialized);
      } catch (error) {
        console.warn("[Persister] Error persisting client:", error);
      }
    },
    
    restoreClient: async (): Promise<PersistedClient | undefined> => {
      try {
        const item = storage.getItem(CACHE_KEY);
        if (!item) return undefined;
        
        const client = JSON.parse(item) as PersistedClient;
        
        // Validate cache version
        if (client.clientState?.clientState?.version !== CACHE_VERSION) {
          // Clear old cache format
          storage.removeItem(CACHE_KEY);
          return undefined;
        }
        
        // Filter out expired queries
        const now = Date.now();
        if (client.clientState?.queries) {
          client.clientState.queries = client.clientState.queries.filter((query) => {
            // Check if query has expiry metadata
            const queryData = query.state?.data as any;
            if (queryData?.__expiresAt && queryData.__expiresAt < now) {
              return false;
            }
            return true;
          });
        }
        
        return client;
      } catch (error) {
        console.warn("[Persister] Error restoring client:", error);
        // Clear corrupted cache
        storage.removeItem(CACHE_KEY);
        return undefined;
      }
    },
    
    removeClient: async () => {
      storage.removeItem(CACHE_KEY);
    },
  };
}

/**
 * Clear all persisted cache
 */
export function clearPersistedCache(): void {
  if (typeof window === "undefined") return;
  
  try {
    // Clear all cache versions
    const keys = Object.keys(localStorage);
    keys.forEach((key) => {
      if (key.startsWith(CACHE_KEY)) {
        localStorage.removeItem(key);
      }
    });
  } catch (error) {
    console.warn("[clearPersistedCache] Error clearing cache:", error);
  }
}
