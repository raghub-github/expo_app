# Merchant menu tables and migrations

## Why you saw "column does not exist" one by one

There is **one** core table for items: **`merchant_menu_items`**. The backend (merchant-menu API) expects it to have a full set of columns defined across several migrations:

| Source | What it does |
|--------|----------------|
| **0010_merchant_domain_complete.sql** | Creates `merchant_menu_items` with `item_id`, `item_name`, `item_description`, `item_image_url`, pricing, stock, flags, etc. |
| **0103_merchant_menu_engine.sql** | Adds `store_id`, `is_deleted`, `approval_status`, `approved_at`, `approved_by`, `short_name`, etc. |
| **0106_menu_item_details_zomato_parity.sql** | Adds `serves_label`, `item_size_unit`, `item_tags`, nutrition columns, etc. |

If your database was created or restored from a state where **0010 did not run** (or ran from an older version), then `merchant_menu_items` can exist with only a subset of columns. Each API call that touches a missing column then fails with a new "column X does not exist" error (e.g. `item_id`, then `item_description`, then `item_image_url`).

## Tables the merchant-menu API actually uses

The service in `backend/src/modules/merchant-menu/merchant-menu.service.ts` uses these tables:

| Table | Purpose |
|-------|---------|
| **merchant_menu_categories** | Categories and subcategories (store_id, category_name, parent_category_id, …). See 0010, 0103, **0107**. |
| **merchant_menu_items** | Menu items (item_id, item_name, item_description, item_image_url, approval_status, …). See 0010, 0103, 0105, 0106, **0111**. |
| **merchant_menu_item_variants** | Size/variant per item (0010). |
| **merchant_menu_item_customizations** | Customization groups per item (0010). |
| **merchant_menu_item_addons** | Addon options under a customization (0010). |
| **merchant_menu_item_images** | Multiple images per item (0103). |
| **merchant_menu_item_approval_log** | Approval audit log (0105). |
| **merchant_menu_addon_groups** | Addon groups per item, separate from customizations (0103). |
| **merchant_menu_addons** | Addons under addon groups (0103). |
| **merchant_menu_combos** | Combos (0103). |
| **merchant_menu_combo_components** | Combo line items (0103). |
| **merchant_menu_category_availability** | Category time windows (0103). |
| **merchant_menu_item_ranking** | Item popularity/ranking (0104). |

The API does **not** use the **merchant_menus** table (that is a different, store-level menu container if present in your schema).

## One migration to fix all missing columns on `merchant_menu_items`

**Run this migration so you don’t get more column errors:**

- **0111_merchant_menu_items_ensure_all_columns.sql**

It uses `ADD COLUMN IF NOT EXISTS` for every column the API expects (from 0010, 0103, 0106). Safe to run multiple times. After it runs, you should no longer see "column X does not exist" for `merchant_menu_items`.

If you have existing rows and had no `item_id` before, also run **0108_merchant_menu_items_ensure_item_id.sql** (backfills `item_id` and sets NOT NULL). Running migrations in order (0108 → 0109 → 0110 → 0111) is fine; 0111 will skip any column that already exists.

## Migration order (relevant to menu)

1. **0010** – Creates `merchant_menu_categories`, `merchant_menu_items`, `merchant_menu_item_customizations`, `merchant_menu_item_addons`, `merchant_menu_item_variants`.
2. **0103** – Adds columns to `merchant_menu_items`; creates `merchant_menu_item_images`, `merchant_menu_addon_groups`, `merchant_menu_addons`, `merchant_menu_combos`, `merchant_menu_combo_components`, `merchant_menu_dietary_tags`, `merchant_menu_item_tags`, `merchant_menu_category_availability`.
3. **0104** – `merchant_menu_item_availability`, `merchant_menu_item_ranking`.
4. **0105** – `merchant_menu_item_approval_log`.
5. **0106** – More columns on `merchant_menu_items`.
6. **0107** – Ensures `merchant_menu_categories` has all required columns.
7. **0108, 0109, 0110** – Ensure `merchant_menu_items` has `item_id`, `item_description`, `item_image_url` (one-off fixes).
8. **0111** – Ensures `merchant_menu_items` has **all** columns in one go; use this to avoid future one-by-one errors.
