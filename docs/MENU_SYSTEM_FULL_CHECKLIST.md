# Full Menu System Checklist — Dashboard, Merchant App, Partnersite (Merchant Portal)

This document lists what is implemented for the **entire menu system** (categories, subcategories, items, variants, customizations, combos, addon library, change requests, item verification) across the three main surfaces: **Dashboard** (agent/partner management), **Merchant App** (Expo), and **Partnersite** (merchant portal web).

---

## 1. Categories

| Feature | Dashboard | Merchant App | Partnersite |
|--------|-----------|--------------|-------------|
| List categories | ✅ GET `/api/merchant/stores/[id]/menu` (categories in payload) + categories/route | ✅ via backend/dashboard API | ✅ `fetchMenuCategories` in database.ts; used by UI |
| Create category | ✅ POST categories/route | ✅ via API | ✅ `createMenuCategory` in database.ts |
| Update category | ✅ PUT categories/[categoryId]/route | ✅ via API | ✅ `updateMenuCategory` in database.ts |
| Delete category | ✅ DELETE categories/[categoryId]/route | ✅ via API | ✅ `deleteMenuCategory` in database.ts |

**Subcategory (parent_category_id):**  
- **Dashboard:** GET menu returns `parent_category_id`; category form can support parent if UI added.  
- **Backend schema:** `merchant_menu_categories.parent_category_id` exists (migration 0107, 0103).  
- **Merchant app / Partnersite:** Typically treat categories as flat unless subcategory UI is added.

---

## 2. Menu Items (CRUD)

| Feature | Dashboard | Merchant App | Partnersite |
|--------|-----------|--------------|-------------|
| List items | ✅ GET menu (items array) + GET items/[itemId] for full detail | ✅ via backend/dashboard API | ✅ GET `/api/merchant/menu-items?storeId=` (with customizations, variants) |
| Create item | ✅ POST items/route (+ images) | ✅ via API | ✅ POST `/api/merchant/menu-items` (direct; no change request) |
| Update item | ✅ PUT items/[itemId]/route (+ images, customizations/variants via handleSaveEditOptions) | ✅ via API | ✅ PATCH `/api/merchant/menu-items` (direct) |
| Delete item | ✅ DELETE items/[itemId]/route | ✅ via API | ✅ DELETE (in menu-items route or separate) (direct) |
| Item images | ✅ items/[itemId]/images (POST), multi-image support | ✅ via API | ✅ merchant_menu_item_images in POST/PATCH |
| Stock toggle | ✅ PATCH items/[itemId]/stock | ✅ via API | ✅ In PATCH body or dedicated endpoint |

**Partnersite:** Uses `merchant_menu_items`, `merchant_menu_item_images`; direct create/update/delete (no change-request flow).

---

## 3. Variants

| Feature | Dashboard | Merchant App | Partnersite |
|--------|-----------|--------------|-------------|
| List variants | ✅ In GET items/[itemId] (variants array) | ✅ via API | ✅ In GET menu-items (variantsByItemId) |
| Add variant | ✅ POST items/[itemId]/variants/route | ✅ via API | ⚠️ Only in POST menu-items body (inline); no separate POST variant |
| Update variant | ✅ PUT variants/[variantId]/route | ✅ via API | ⚠️ Via full PATCH menu-item (replace variants) |
| Delete variant | ✅ DELETE variants/[variantId]/route | ✅ via API | ⚠️ Via full PATCH menu-item |

**Partnersite:** Variants are embedded in item create/update; no standalone variant CRUD API. For full parity, add GET/POST/PUT/DELETE for variants (same as dashboard).

---

## 4. Customizations (per-item groups + options/addons)

| Feature | Dashboard | Merchant App | Partnersite |
|--------|-----------|--------------|-------------|
| List customizations | ✅ In GET items/[itemId] (customizations with addons) | ✅ via API | ✅ In GET menu-items (customizations + addons) |
| Add customization group | ✅ POST items/[itemId]/customization-groups/route | ✅ via API | ✅ In POST/PATCH menu-items body (inline) |
| Update/delete group | ✅ PUT/DELETE customization-groups/[groupId]/route | ✅ via API | ⚠️ Via full item PATCH |
| Add option (addon) to group | ✅ POST customization-groups/[groupId]/options/route | ✅ via API | ✅ Inline in POST/PATCH |
| Update/delete option | ✅ PUT/DELETE customization-options/[optionId]/route | ✅ via API | ⚠️ Via full item PATCH |

**Partnersite:** Uses `merchant_menu_item_customizations` and `merchant_menu_item_addons`; full sync on item create/update. Standalone customization/option APIs would mirror dashboard for granular edits.

---

## 5. Combos

| Feature | Dashboard | Merchant App | Partnersite |
|--------|-----------|--------------|-------------|
| List combos | ✅ GET combos/route | ✅ via API | ✅ GET `/api/merchant/combos?storeId=` |
| Create combo | ✅ POST combos/route | ✅ via API | ✅ POST `/api/merchant/combos?storeId=` |
| Get combo | ✅ GET combos/[comboId]/route | ✅ via API | ✅ GET `/api/merchant/combos/[comboId]?storeId=` |
| Update combo | ✅ PUT combos/[comboId]/route | ✅ via API | ✅ PUT `/api/merchant/combos/[comboId]?storeId=` |
| Delete combo | ✅ DELETE combos/[comboId]/route | ✅ via API | ✅ DELETE `/api/merchant/combos/[comboId]?storeId=` |
| Combo components | ✅ GET/POST/DELETE combos/[comboId]/components & [componentId] | ✅ via API | ✅ POST/DELETE `/api/merchant/combos/[comboId]/components` & `...[componentId]?storeId=` |

**Partnersite:** Implemented in `partnersite/src/app/api/merchant/combos/` (list, create, get, update, delete, components). Same DB tables; merchant auth via `assertStoreAccess(storeId)`.

---

## 6. Addon Library (Reusable Modifier Groups)

| Feature | Dashboard | Merchant App | Partnersite |
|--------|-----------|--------------|-------------|
| List modifier groups | ✅ GET modifier-groups/route | ✅ via backend/dashboard API | ✅ GET `/api/merchant/modifier-groups?storeId=` |
| Create group | ✅ POST modifier-groups/route | ✅ via API | ✅ POST `/api/merchant/modifier-groups?storeId=` |
| Update/delete group | ✅ PUT/DELETE modifier-groups/[groupId]/route | ✅ via API | ✅ PUT/DELETE `/api/merchant/modifier-groups/[groupId]?storeId=` |
| List options in group | ✅ GET modifier-groups/[groupId]/options/route | ✅ via API | ✅ GET `/api/merchant/modifier-groups/[groupId]/options?storeId=` |
| Add option | ✅ POST modifier-groups/[groupId]/options/route | ✅ via API | ✅ POST `/api/merchant/modifier-groups/[groupId]/options?storeId=` |
| Update/delete option | ✅ PUT/DELETE modifier-options/[optionId]/route | ✅ via API | ✅ PUT/DELETE `/api/merchant/modifier-options/[optionId]?storeId=` |
| Link group to item | ✅ POST items/[itemId]/modifier-groups/route | ✅ via API | ✅ POST `/api/merchant/menu-items/[itemId]/modifier-groups?storeId=` |
| Unlink group | ✅ DELETE items/[itemId]/modifier-groups/[linkId]/route | ✅ via API | ✅ DELETE `/api/merchant/menu-items/[itemId]/modifier-groups/[linkId]?storeId=` |

**Partnersite:** Implemented in `partnersite/src/app/api/merchant/modifier-groups/`, `modifier-options/[optionId]/`, and `menu-items/[itemId]/modifier-groups/`. Uses `group_code` and `option_code` columns.

---

## 7. Item Verification & Change Requests

| Feature | Dashboard | Merchant App | Partnersite |
|--------|-----------|--------------|-------------|
| Item approval status | ✅ In menu list + GET items/[itemId]; Review drawer | ✅ via API | ⚠️ approval_status on items; no review flow (agent-only in dashboard) |
| Approve/reject item | ✅ PATCH items/[itemId]/approval/route | N/A (agent) | N/A (agent) |
| Create change request (add/edit/delete item) | ✅ Via StoreMenuClient (submit to change-requests API) | ✅ via API | ❌ Merchants create/update/delete items directly; no change-request submission |
| List change requests | ✅ GET merchant-menu/change-requests (dashboard) | ✅ via API | ❌ Not implemented |
| Approve/reject change request | ✅ Dashboard approve/reject routes | N/A (agent) | N/A (agent) |

**Partnersite:** Items are created/updated/deleted directly. For full parity with “merchant requests → agent approves,” partnersite should: (1) Submit create/update/delete as change requests instead of direct writes; (2) List pending change requests for the store; (3) Keep variants/customizations/combos/addons as direct edits (same as dashboard).

---

## 8. Summary: Partnersite Status

**Implemented in partnersite (API):**

1. **Combos:** Full CRUD + components at `/api/merchant/combos` (query `storeId=`). Same DB tables; merchant auth via `assertStoreAccess`.
2. **Addon library:** Full CRUD for modifier groups and options, and link/unlink to items at `/api/merchant/modifier-groups`, `modifier-options/[optionId]`, `menu-items/[itemId]/modifier-groups`. Uses `group_code` / `option_code`.

**Still optional / follow-up:**

3. **Variants:** Standalone variant CRUD routes (currently variants are inline in item POST/PATCH).
4. **Customizations:** Standalone customization-group and option routes (currently inline in item POST/PATCH).
5. **Change requests:** Submit item create/update/delete as change requests and list store’s change requests (currently partnersite does direct item CRUD).
6. **UI:** Menu page with tabs **Menu Items** | **Addon Library** | **Combos**; item form with variants, customizations, linked addon groups. Build UI to call the new combos and modifier-groups APIs.

---

## 9. mxportal-main (dashboards/mxportal-main)

The same parity goals apply to **mxportal-main** (see `dashboards/mxportal-main/docs/MENU_PARITY_IMPLEMENTATION.md`). It currently uses different tables for customizations (`menu_items`, `item_customizations`, `item_addons`) and has no variants, combos, or addon library. Align with `merchant_*` tables and the same API/UX as above.
