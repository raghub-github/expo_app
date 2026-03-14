# Merchant Portal Menu Parity with Dashboard & Merchant App

This document describes what must be implemented in the merchant portal (mxportal-main) so that **item verification**, **addons**, **combos**, **customizations**, and **variants** behave the same as in the **dashboard** (agent/partner site) and **merchant app** (Expo).

## Current state (mxportal-main)

- **Menu** (`/mx/menu`): Uses Supabase + `merchant_stores`, `merchant_menu_categories`, `merchant_menu_items`. Items are created/updated/deleted **directly** (no change-request flow).
- **Customizations**: `app/api/customizations/route.ts` uses Drizzle with **different** tables (`menu_items`, `item_customizations`, `item_addons` in `lib/schema.ts`) — **not** `merchant_menu_item_customizations` / `merchant_menu_item_addons`.
- **No** variants API, **no** combos, **no** addon library (reusable modifier groups).

## Target state (parity with dashboard & merchant app)

### 1. Item create/update/delete → change requests only

- Merchants must **not** write directly to `merchant_menu_items`.
- **Create**: Submit a change request (type `CREATE`); agent approves in dashboard → item is created.
- **Update**: Submit a change request (type `UPDATE`); agent approves → item is updated.
- **Delete**: Submit a change request (type `DELETE`); agent approves → item is soft-deleted/handled per backend.
- Use tables: `merchant_menu_item_change_requests`, and existing backend or dashboard APIs for submitting and listing change requests.

### 2. Variants, customizations, combos, addon library → direct CRUD (same as dashboard)

- **Variants**: Use `merchant_menu_item_variants`. APIs: POST `items/[itemId]/variants`, PUT/DELETE `variants/[variantId]`.
- **Customizations**: Use `merchant_menu_item_customizations` and `merchant_menu_item_addons`. APIs: POST `items/[itemId]/customization-groups`, PUT/DELETE `customization-groups/[groupId]`, POST `customization-groups/[groupId]/options`, PUT/DELETE `customization-options/[optionId]`.
- **Combos**: Use `merchant_menu_combos` and related component tables. APIs: GET/POST `combos`, GET/PUT/DELETE `combos/[comboId]`, components sub-routes.
- **Addon library (reusable modifier groups)**: Use `merchant_modifier_groups`, `merchant_modifier_options`, `merchant_item_modifier_groups`. APIs: modifier-groups CRUD, modifier-options CRUD, `items/[itemId]/modifier-groups` (link/unlink).

All of the above should use the **same** database tables and the **same** API contract as the dashboard (see `dashboard/src/app/api/merchant/stores/[id]/menu/`).

### 3. UI alignment

- **Menu page**: Tabs or sections for **Menu Items** | **Addon Library** | **Combos** (same as dashboard).
- **Item form**: When editing an item (after approval or within a change request draft), show:
  - Basic fields (name, description, price, image, etc.)
  - **Variants** (add/edit/delete)
  - **Customizations** (groups + options/addons)
  - **Linked addon groups** (from Addon Library: link existing group, create new, unlink)
- **Item actions**: Only “Request add”, “Request edit”, “Request delete” (change requests); no direct item create/update/delete.
- **Verification**: Merchants see approval status and pending change request state; only agents approve/reject in the dashboard.

## Implementation options

1. **Option A – Same Next.js API shape in mxportal**  
   Add Next.js API routes under e.g. `/api/merchant/stores/[id]/menu/` in mxportal that use the **same** DB (Supabase/Postgres with `merchant_*` tables) and mirror the dashboard’s route handlers and Drizzle/SQL logic. Share types and validation where possible.

2. **Option B – Call main backend (Node)**  
   If the main backend (e.g. `backend/`) already exposes merchant menu APIs (change requests, items, variants, customizations, combos, modifier groups), have mxportal call those APIs instead of implementing duplicate logic. Ensures one source of truth.

## Reference locations

- **Dashboard menu APIs**: `dashboard/src/app/api/merchant/stores/[id]/menu/` (route.ts, items/[itemId], variants, customization-groups, combos, modifier-groups, etc.)
- **Dashboard menu UI**: `dashboard/src/app/dashboard/merchants/stores/[id]/menu/` (StoreMenuClient, StoreMenuTabs, MenuItemForm, AddonLibraryClient, StoreCombosClient)
- **Backend (if used)**: `backend/src/modules/merchant-menu/` (merchant-menu.service.ts, merchant-menu.routes.ts)
- **Merchant app (Expo)**: Addon Library, Linked Addon Groups, and item detail/forms as reference for UX and data shape.

## Customization schema alignment

- **Stop** using `menu_items`, `item_customizations`, `item_addons` (in `lib/schema.ts`) for the **merchant menu** flow.
- Use **only** `merchant_menu_items`, `merchant_menu_item_customizations`, `merchant_menu_item_addons` for item-level customizations, so that dashboard, merchant app, and mxportal all see the same data.

Once the above is implemented, item verification, addons (view/add/edit), combos, customizations, and variants will be consistent across dashboard, merchant app, and merchant portal.
