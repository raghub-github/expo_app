/**
 * Reusable hook for managing URL-based filters with persistence
 * Ensures filters persist on refresh and navigation
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import { useSearchParams, useRouter } from "next/navigation";

export interface FilterConfig<T extends string> {
  paramName: string;
  defaultValue: T;
  validValues: readonly T[];
}

export interface UseUrlFiltersOptions {
  filters: Record<string, FilterConfig<string>>;
  onFilterChange?: (filters: Record<string, string>) => void;
}

/**
 * Hook for managing multiple URL-based filters
 * Automatically syncs state with URL parameters and persists on refresh
 */
export function useUrlFilters(
  options: UseUrlFiltersOptions
): {
  filters: Record<string, string>;
  setFilter: (paramName: string, value: string | null) => void;
  updateFilters: (updates: Partial<Record<string, string | null>>) => void;
  isInitialized: boolean;
} {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isInitialized, setIsInitialized] = useState(false);

  // Initialize filters from URL params
  const initialFilters = useMemo(() => {
    const result: Record<string, string> = {};
    for (const [key, config] of Object.entries(options.filters)) {
      const urlValue = searchParams.get(config.paramName);
      if (urlValue && config.validValues.includes(urlValue)) {
        result[key] = urlValue;
      } else {
        result[key] = config.defaultValue;
      }
    }
    return result;
  }, [searchParams, options.filters]);

  const [filters, setFiltersState] = useState<Record<string, string>>(initialFilters);

  // Mark as initialized after first render
  useEffect(() => {
    setIsInitialized(true);
  }, []);

  // Sync filters with URL params when URL changes (after initialization)
  useEffect(() => {
    if (!isInitialized) return;

    let hasChanges = false;
    const newFilters = { ...filters };

    for (const [key, config] of Object.entries(options.filters)) {
      const urlValue = searchParams.get(config.paramName);
      if (urlValue && config.validValues.includes(urlValue)) {
        if (newFilters[key] !== urlValue) {
          newFilters[key] = urlValue;
          hasChanges = true;
        }
      } else if (!urlValue && newFilters[key] !== config.defaultValue) {
        newFilters[key] = config.defaultValue;
        hasChanges = true;
      }
    }

    if (hasChanges) {
      setFiltersState(newFilters);
      options.onFilterChange?.(newFilters);
    }
  }, [searchParams, isInitialized, filters, options.filters, options.onFilterChange]);

  // Update URL when filters change
  const updateFilters = useCallback(
    (updates: Partial<Record<string, string | null>>) => {
      if (!isInitialized) return;

      const params = new URLSearchParams(searchParams.toString());
      let hasUrlChanges = false;

      for (const [key, value] of Object.entries(updates)) {
        const config = options.filters[key];
        if (!config) continue;
        if (value === undefined) continue;

        if (value === null || value === config.defaultValue) {
          if (params.has(config.paramName)) {
            params.delete(config.paramName);
            hasUrlChanges = true;
          }
        } else if (
          typeof value === "string" &&
          config.validValues.includes(value)
        ) {
          if (params.get(config.paramName) !== value) {
            params.set(config.paramName, value);
            hasUrlChanges = true;
          }
        }
      }

      if (hasUrlChanges) {
        router.push(`?${params.toString()}`, { scroll: false });
      }
    },
    [router, searchParams, isInitialized, options.filters]
  );

  const setFilter = useCallback(
    (paramName: string, value: string | null) => {
      updateFilters({ [paramName]: value });
    },
    [updateFilters]
  );

  return {
    filters,
    setFilter,
    updateFilters,
    isInitialized,
  };
}

/**
 * Simplified hook for single filter
 */
export function useUrlFilter<T extends string>(
  paramName: string,
  defaultValue: T,
  validValues: readonly T[]
): {
  value: T;
  setValue: (value: T | null) => void;
  isInitialized: boolean;
} {
  const { filters, setFilter, isInitialized } = useUrlFilters({
    filters: {
      [paramName]: {
        paramName,
        defaultValue,
        validValues: validValues as readonly string[],
      },
    },
  });

  return {
    value: (filters[paramName] ?? defaultValue) as T,
    setValue: (value: T | null) => setFilter(paramName, value as string | null),
    isInitialized,
  };
}
