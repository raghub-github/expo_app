# Dashboard performance optimizations

Summary of changes for instant UI response and fast data loading.

## Frontend

- **Bootstrap gate**: Dashboard layout shows a full-page skeleton until `GET /api/auth/bootstrap` has run (or session is already in cache). Only one auth request is made instead of 4 (session, permissions, dashboard-access, bootstrap). Children (AuthProvider, sidebar, pages) render only after cache is seeded.
- **Bootstrap API** (`GET /api/auth/bootstrap`): Single request returns session + permissions + dashboard-access. Seeds React Query cache so sidebar/nav use cached data.
- **Prefetch on hover**: Nav links in `HierarchicalSidebar` call `prefetchDashboardSection()` on `mouseEnter` for Customers and Tickets.
- **Skeleton loaders**: Route-level `loading.tsx` for `/dashboard`, `/dashboard/customers`, `/dashboard/tickets`, `/dashboard/area-managers`; bootstrap gate shows a shell skeleton.
- **Request deduplication**: Tickets agents and reference-data use React Query hooks (`useTicketsAgentsQuery`, `useTicketsReferenceDataQuery`) so TicketFilters, TicketList, TicketPropertiesPanel, and NewTicketForm share one request each instead of multiple duplicate calls.
- **Debounce utilities**: `useDebouncedValue` and `useDebouncedCallback` in `@/hooks/useDebouncedValue` for search/filter inputs.

## Backend

- **Bootstrap**: One `getUser()`, then parallel permissions + dashboard access; 10s in-memory cache per user.
- **Dashboard-access route**: Access points fetched in parallel (`Promise.all`).
- **Audit track** (`POST /api/audit/track`): Returns **202 Accepted** immediately; logging runs in `setImmediate` so the response is never blocked. Proxy already fires audit as fire-and-forget.
- **In-memory server cache** (`@/lib/server-cache`): GET `/api/tickets/agents` and GET `/api/tickets/reference-data` cache results for 60s to reduce DB load. For production at scale, replace with Redis (same key/ttl pattern).
- **Tickets agents route**: Removed verbose `console.log` in request path.

## Proxy

- Path logging only in development; production requests are not logged for minimal middleware time.

## Optional next steps

- **Redis**: Replace in-memory server cache with Redis for multi-instance deployments; implement cache invalidation on ticket/agent/reference updates.
- **BullMQ**: Move audit logging to a BullMQ job queue so it never runs in the request process; worker consumes and writes to DB.
- **Optimistic UI**: For ticket assign/status change, update React Query cache optimistically and rollback on error.
- **Lazy load**: Use `next/dynamic` for heavy tables/charts.
- **Compression**: Enable gzip in nginx or middleware when self-hosting.
