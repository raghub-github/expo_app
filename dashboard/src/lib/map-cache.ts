/**
 * Global Map Instance Cache
 * 
 * Prevents Mapbox map from re-initializing on every route change.
 * Maintains a singleton map instance that can be reused across component mounts.
 */

interface MapCacheEntry {
  mapInstance: any; // Mapbox map instance
  container: HTMLElement;
  token: string;
  initializedAt: number;
  lastUsedAt: number;
}

class MapCacheManager {
  private mapCache: MapCacheEntry | null = null;
  private scriptLoaded: boolean = false;
  private scriptLoading: Promise<void> | null = null;

  /**
   * Check if Mapbox script is already loaded
   */
  isScriptLoaded(): boolean {
    return this.scriptLoaded || !!(typeof window !== "undefined" && (window as any).mapboxgl);
  }

  /**
   * Load Mapbox script if not already loaded
   */
  async loadMapboxScript(): Promise<void> {
    if (this.isScriptLoaded()) {
      this.scriptLoaded = true;
      return Promise.resolve();
    }

    if (this.scriptLoading) {
      return this.scriptLoading;
    }

    this.scriptLoading = new Promise((resolve, reject) => {
      // Load CSS if not already loaded
      if (!document.querySelector('link[href*="mapbox-gl.css"]')) {
        const cssLink = document.createElement('link');
        cssLink.rel = 'stylesheet';
        cssLink.href = 'https://api.mapbox.com/mapbox-gl-js/v3.0.1/mapbox-gl.css';
        document.head.appendChild(cssLink);
      }

      // Load JavaScript
      const script = document.createElement('script');
      script.src = 'https://api.mapbox.com/mapbox-gl-js/v3.0.1/mapbox-gl.js';
      script.async = true;
      
      script.onload = () => {
        this.scriptLoaded = true;
        this.scriptLoading = null;
        resolve();
      };
      
      script.onerror = () => {
        this.scriptLoading = null;
        reject(new Error('Failed to load Mapbox library'));
      };
      
      document.head.appendChild(script);
    });

    return this.scriptLoading;
  }

  /**
   * Get cached map instance if available and valid
   */
  getCachedMap(token: string): any | null {
    if (!this.mapCache) return null;
    
    // Check if token matches and map is still valid
    if (this.mapCache.token === token && this.mapCache.mapInstance) {
      // Check if map container still exists in DOM
      if (document.body.contains(this.mapCache.container)) {
        this.mapCache.lastUsedAt = Date.now();
        return this.mapCache.mapInstance;
      } else {
        // Container removed from DOM, clear cache
        this.clearCache();
      }
    }
    
    return null;
  }

  /**
   * Cache a map instance
   */
  cacheMap(mapInstance: any, container: HTMLElement, token: string): void {
    this.mapCache = {
      mapInstance,
      container,
      token,
      initializedAt: Date.now(),
      lastUsedAt: Date.now(),
    };
  }

  /**
   * Clear the map cache
   */
  clearCache(): void {
    if (this.mapCache?.mapInstance) {
      try {
        // Remove map instance
        this.mapCache.mapInstance.remove();
      } catch (error) {
        console.warn("[MapCache] Error removing map instance:", error);
      }
    }
    
    this.mapCache = null;
  }

  /**
   * Check if cache is stale (older than 1 hour of inactivity)
   */
  isCacheStale(): boolean {
    if (!this.mapCache) return true;
    
    const oneHour = 60 * 60 * 1000;
    const timeSinceLastUse = Date.now() - this.mapCache.lastUsedAt;
    
    return timeSinceLastUse > oneHour;
  }

  /**
   * Get or create map instance
   * Returns cached instance if available, otherwise creates new one
   */
  async getOrCreateMap(
    container: HTMLElement,
    token: string,
    options: {
      center?: [number, number];
      zoom?: number;
      style?: string;
    }
  ): Promise<any> {
    // Try to get cached map
    const cached = this.getCachedMap(token);
    if (cached) {
      // Update container reference if it changed
      if (this.mapCache) {
        this.mapCache.container = container;
      }
      return cached;
    }

    // Load script if needed
    await this.loadMapboxScript();

    // Create new map instance
    const mapboxgl = (window as any).mapboxgl;
    if (!mapboxgl) {
      throw new Error('Mapbox library not available');
    }

    mapboxgl.accessToken = token;

    const map = new mapboxgl.Map({
      container,
      style: options.style || 'mapbox://styles/mapbox/streets-v12',
      center: options.center || [78.0, 22.0],
      zoom: options.zoom || 3.0,
      accessToken: token,
    });

    // Cache the instance
    this.cacheMap(map, container, token);

    return map;
  }
}

// Singleton instance
export const mapCache = new MapCacheManager();

/**
 * Clear map cache on logout or app close
 */
if (typeof window !== "undefined") {
  // Clear cache on page unload (optional - you may want to keep it)
  // window.addEventListener('beforeunload', () => {
  //   mapCache.clearCache();
  // });
  
  // Clear cache on visibility change (when user switches tabs for extended time)
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && mapCache.isCacheStale()) {
      // Don't clear immediately, just mark as potentially stale
      // Map will be recreated on next use if needed
    }
  });
}
