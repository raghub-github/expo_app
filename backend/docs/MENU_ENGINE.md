# Menu Item Engine — Architecture & Ownership

## Where menu and item management lives

**The menu item engine is managed entirely in the backend.** The frontend (merchant app, customer app, admin tools) are **clients** that read and write via the same REST API. No business logic or source of truth lives in the frontend.

### Backend (single source of truth)

| Concern | Location | Notes |
|--------|----------|--------|
| **Persistence** | PostgreSQL (`merchant_menu_*` tables) | Categories, items, variants, customizations, addons, images, combos, availability, approval, tags |
| **Business logic** | `backend/src/modules/merchant-menu/merchant-menu.service.ts` | All CRUD, validation rules, approval workflow, store scoping |
| **API & validation** | `backend/src/modules/merchant-menu/merchant-menu.routes.ts` | REST under `/v1/merchant-menu`, Zod schemas, auth, store access |
| **Auth & access** | `assertStoreAccess()` + JWT | Every request is scoped to a store and parent merchant |

**Operations the backend owns:**

- **Categories**: list, create, update, delete, availability windows
- **Items**: list (with filters, pagination), get one, create, update, delete (soft), stock toggle
- **Item detail**: variants, customization groups & options, addon groups & addons, images (upload/delete/primary)
- **Combos**: list, create, update, delete, components
- **Approval**: set PENDING on merchant edit, APPROVED/REJECTED by agent, audit log

### Frontend (client only)

| App | Role | How it talks to menu |
|-----|------|----------------------|
| **merchant_app** (Expo) | Merchant manages their menu | `menuApi.ts` → `GET/POST/PUT/DELETE /v1/merchant-menu/:storeId/...` |
| **customer_app** | Customer browses menu | Public or scoped API to read approved items only |
| **Admin / dashboards** | Agent approval, reporting | Same API with agent role; approval endpoints |

**merchant_app data layer (Expo):**

- **`apps/merchant_app/hooks/useMenuQueries.ts`** — All menu read/write goes through these hooks. Uses TanStack Query: `useMenuCategories`, `useMenuItems`, `useMenuItem`, `useCreateMenuItem`, `useUpdateMenuItem`, `usePatchItemStock`, `useCreateCategory`, `useUpdateCategory`, `useDeleteCategory`. Mutations invalidate the relevant query keys so lists stay in sync.
- **Screens** — `(tabs)/menu/index.tsx` (catalog), `(tabs)/menu/add-edit-item.tsx`, `(tabs)/menu/categories.tsx` use the hooks only; no direct `fetchMenu*` in screens.

The frontend must **not**:

- Hold the only copy of menu data (backend is authoritative)
- Enforce business rules that affect persistence (e.g. “max 70 chars” is both client UX and server validation)
- Bypass the API (no direct DB access from apps)

The frontend **should**:

- Cache and invalidate menu data (e.g. TanStack Query) so lists stay in sync after create/update/delete
- Use the same `storeId` and auth token for all menu calls
- Handle loading and error states from API responses

---

## Production & scale

- **Backend**
  - **Pagination**: Item list uses `limit` (max 100) and `offset`; use cursor-based pagination later if needed.
  - **Indexes**: Migrations add indexes on `store_id`, `category_id`, `approval_status`, `in_stock`, `is_deleted` for fast list and filters.
  - **Rate limiting**: Applied at Fastify level (`@fastify/rate-limit`); tune per-route if needed.
  - **Caching**: Optional Redis for read-heavy “public menu” endpoints later; write path stays DB-backed.
- **Frontend**
  - **Data layer**: Use a single client cache (e.g. TanStack Query) with keys like `['menu','categories', storeId]` and `['menu','items', storeId, filters]`; invalidate on mutations so all screens see updates without refetching from scratch.
  - **Optimistic updates**: Optional for toggles (e.g. stock) for snappier UX; always reconcile with server response.

---

## Summary

| Question | Answer |
|----------|--------|
| Where is the menu managed? | **Backend** (service + DB + routes). |
| Where does the frontend manage it? | It doesn’t; it **calls the API** and **caches** responses. |
| Best method for production / large scale? | Keep backend as single source of truth; use pagination, indexes, rate limits; use a frontend cache (e.g. React Query) with invalidation so the app stays consistent and scalable. |
