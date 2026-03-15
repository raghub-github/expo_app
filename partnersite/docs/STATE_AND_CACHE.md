# State and cache management

This app uses **TanStack React Query** for server state (API data) with a shared cache and **React Context** for auth/session. This keeps pages fast, avoids duplicate requests, and limits memory use.

## Architecture

- **TanStack Query** – Server state: wallet, ledger, bank accounts, store operations, self-delivery riders. Cached per query key; stale/gc times control memory.
- **MerchantSessionContext** – Auth and merchant session (user, session status, parent). No caching; single source of truth for “who is logged in”.
- **Local `useState`** – UI-only state (modals, filters, form inputs, pagination offset). Not persisted across pages.

## Query client (memory and cache)

Configured in `src/lib/query-client.ts`:

- **staleTime**: 60s – Data is fresh for 60s; no refetch on remount within that window.
- **gcTime**: 5 min – Unused cache entries are dropped after 5 minutes to limit memory.
- **refetchOnWindowFocus**: true – Refetch when the user returns to the tab (respects staleTime).
- **retry**: 1 – One retry on failure.
- **structuralSharing**: true – Same reference when data unchanged (fewer re-renders).

## Query keys and invalidation

Central keys live in `src/lib/query-keys.ts` (e.g. `merchantKeys.wallet(storeId)`). Use them in:

- **Hooks** – So the same key is used everywhere for the same resource.
- **Mutations** – Invalidate after create/update/delete so the UI refetches or uses updated cache.

Example: after a payout request, we invalidate `merchantKeys.wallet(storeId)` and ledger keys so dashboard and payments show new balance and ledger without manual refresh.

## Hooks (`src/hooks/useMerchantApi.ts`)

- **useMerchantWallet(storeId)** – Wallet summary. Shared between dashboard and payments; one fetch, shared cache.
- **useMerchantLedger(storeId, params)** – Paginated ledger with filters. Params are memoized so the query key is stable and we don’t refetch every render.
- **useMerchantBankAccounts(storeId, { enabled })** – Bank accounts. Fetched only when the bank section or withdrawal modal is open.
- **useSelfDeliveryRiders(storeId, enabled)** – Riders list when self-delivery is on.
- **usePayoutRequestMutation()** – Payout request; on success invalidates wallet and ledger.

After any bank account change (add/set default/disable/enable), call `invalidateBankAccounts(storeId)` so the list refetches.

## High load and smooth UX

- **Deduplication** – Multiple components using the same query key (e.g. wallet on dashboard and payments) share one request and one cache entry.
- **Stable keys** – Ledger params are passed in a `useMemo` so the key only changes when limit/offset/filters actually change.
- **placeholders** – Ledger uses `keepPreviousData` so pagination doesn’t flash empty while loading the next page.
- **Filter UX** – Ledger filters apply on “Apply” click (not every keystroke), so we don’t hammer the API while the user types.

## Adding a new API-backed page

1. Add a query key in `src/lib/query-keys.ts` if it’s a new resource.
2. Add a fetcher and `useQuery` (or `useMutation`) in `src/hooks/useMerchantApi.ts` (or a dedicated hook file).
3. Use the hook in the page; keep UI state (modals, filters, offset) in local state.
4. After mutations that change that data, invalidate the matching query key so the cache updates.

## Provider order

In `src/app/layout.tsx`, **QueryProvider** wraps **MerchantSessionProvider** so the whole app can use both React Query and merchant session.
