# Page-Based Smart API Calling (Sidebar Navigation Architecture)

The dashboard follows a **page-driven API execution model**: APIs are called **only when the user opens a specific page** from the sidebar (e.g. Home, Merchants, Orders, Riders, Analytics). No background or unnecessary API calls run for inactive pages.

## Core principles

1. **Sidebar-based API execution**  
   Each sidebar menu item controls its own API lifecycle. When the user clicks a sidebar item, only that page’s required APIs run. APIs of other pages must **not** run in the background.

2. **No preloading of unused data**  
   Do not preload APIs for pages the user has not visited. Avoid global API calls tied to layout or sidebar rendering. **Sidebar rendering must not trigger API requests** for page data (only minimal shell data for nav visibility may run when the sidebar mounts).

3. **Smart data persistence**  
   Once a page’s data is loaded it is cached. If the user navigates away and returns, show cached data immediately. Re-fetch only when the user refreshes, data is updated, or cache expires (see `cache-strategies.ts` and React Query `staleTime` / `gcTime`).

4. **Instant UI loading**  
   The UI renders immediately. Skeleton loaders are used **only for the active page**. There are no global layout-level skeletons that block the whole app.

5. **API isolation**  
   Each page has its own hooks and API usage. Loading and error state are per page. There are no shared, cross-page API triggers.

## Implementation

### Layout

- **`DashboardLayoutClient`** does **not** call or prefetch any page-specific APIs.
- It does **not** block rendering of `children` on permissions or dashboard access.
- The sidebar may use `usePermissionsQuery` / `useDashboardAccessQuery` for **nav visibility only**; those run when the sidebar mounts and are cached (no prefetch from layout).

### Pages

- Each **page** (or its client components) is the only place that calls that page’s APIs.
- Use React Query with appropriate `staleTime` / `gcTime` so that returning to a page shows cached data first; refetch only when needed.
- Do **not** invalidate queries on mount for “freshness” unless the product explicitly requires it (e.g. after a mutation). Prefer cache-first for fast navigation.

### Optional: route-scoped queries

For hooks that should run only when the user is on a given route, use `enabled` with `usePathname()`:

```ts
import { usePathname } from "next/navigation";

export function useSomePageQuery() {
  const pathname = usePathname();
  const isOnPage = pathname.startsWith("/dashboard/analytics");

  return useQuery({
    queryKey: queryKeys.analytics.dashboard(),
    queryFn: fetchAnalytics,
    enabled: isOnPage, // only fetch when user is on Analytics page
    staleTime: 5 * 60 * 1000,
  });
}
```

The **page component** that mounts when the user opens that route is the natural place to call the hook; then the query runs only when that page is active. Using `enabled` is an extra guard if the same hook is ever used from a shared component.

### Cache and persistence

- **`lib/cache-strategies.ts`** defines tiers (e.g. STATIC, MEDIUM, DYNAMIC). Use the right tier per query.
- **`lib/react-query.ts`** sets default `staleTime` / `gcTime` and persistence. Persisted cache gives an app-like experience when returning to a page.

## Expected result

- APIs run only for the active page.
- No hidden or background API spam.
- Faster dashboard performance and smooth navigation (e.g. Amazon/Zomato-style).
- Reduced server load and frontend lag.
- Clear, scalable architecture per page.
