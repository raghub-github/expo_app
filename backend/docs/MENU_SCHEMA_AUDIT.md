# Merchant Menu Schema Audit

## Summary

The codebase has **two naming patterns** for menu-related tables. Migrations in this repo define one set; the plan and user-shared DDL reference another. This document records what exists in repo migrations vs what the plan assumes, and how the implementation will align.

---

## Tables in Repo Migrations (0010 + 0076)

### merchant_menu_categories (0010)
- **Columns:** `id`, `store_id` (FK merchant_stores), `category_name`, `category_description`, `category_image_url`, `display_order`, `is_active`, `category_metadata`, `created_at`, `updated_at`
- **No:** `menu_id`, `parent_category_id`, `availability_mode`, `is_deleted`

### merchant_menu_items (0010)
- **Columns:** `id`, `store_id`, `category_id`, `item_id` (unique text), `item_name`, `item_description`, `item_image_url`, `food_type`, `spice_level`, `cuisine_type`, `base_price`, `selling_price`, `discount_percentage`, `tax_percentage`, `in_stock`, `available_quantity`, `low_stock_threshold`, `has_customizations`, `has_addons`, `has_variants`, `is_popular`, `is_recommended`, `preparation_time_minutes`, `serves`, `display_order`, `is_active`, `item_metadata`, `nutritional_info`, `allergens`, `created_at`, `updated_at`
- **Missing (per plan):** `packaging_charges`, `tax_group_id`, `discount_flat`, `dynamic_pricing`, `seasonal_flag`, `short_name`, `is_deleted` (soft delete)

### merchant_menu_item_customizations (0010)
- **Columns:** `id`, `customization_id` (unique text), `menu_item_id`, `customization_title`, `customization_type`, `is_required`, `min_selection`, `max_selection`, `display_order`, `created_at`, `updated_at`
- **Note:** One table holds “group” info; options live in addons linked to customization_id.

### merchant_menu_item_addons (0010)
- **Columns:** `id`, `addon_id`, `customization_id` (FK merchant_menu_item_customizations), `addon_name`, `addon_price`, `addon_image_url`, `in_stock`, `display_order`, `created_at`, `updated_at`
- **Note:** These are the “options” under a customization group in current schema.

### merchant_menu_item_variants (0010)
- **Columns:** `id`, `variant_id`, `menu_item_id`, `variant_name`, `variant_type`, `variant_price`, `price_difference`, `in_stock`, `available_quantity`, `sku`, `barcode`, `display_order`, `is_default`, `created_at`, `updated_at`
- **Missing (per plan):** `price_mode` (absolute vs delta), `image_url` override

### Not in 0010 (user-shared / plan)
- `merchant_menus` (store-level menu container)
- `merchant_menu_customization_groups` / `merchant_menu_customization_options` (alternative to customizations + addons)
- `merchant_menu_item_images` (multi-image per item)
- `merchant_menu_item_ingredients`, `merchant_menu_item_cuisines`
- `merchant_menu_item_availability`, `merchant_menu_item_ranking`
- `merchant_menu_inventory`, `merchant_menu_uploads`
- `merchant_menu_addon_groups`, `merchant_menu_addons` (separate from customization addons)
- `merchant_menu_combos`, `merchant_menu_combo_components`
- `merchant_menu_dietary_tags`, `merchant_menu_item_tags`
- `merchant_menu_category_availability`

---

## Backend Code vs Schema

- **merchant.service.ts** uses: `merchant_menu_categories`, `merchant_menu_items`, `merchant_menu_item_variants`, `merchant_menu_item_customizations`, `merchant_menu_item_addons`.
- Column names in code: `item_id`, `item_name`, `selling_price`, `has_customizations`, `has_addons`, `has_variants`, etc. — match 0010.

---

## Decision for Implementation

1. **Use existing 0010 tables** for categories, items, variants, customizations, and addons. No rename to `customization_groups`/`customization_options` in DB; backend will keep using `merchant_menu_item_customizations` (group) and `merchant_menu_item_addons` (options).
2. **Migrations will:** add missing columns to existing tables (items, categories, variants, etc.), create new tables for images, inventory, addon_groups/addons (plan’s separate addon concept), combos, dietary tags, category availability, and add indexes.
3. **New merchant-menu APIs** will use the same table and column names as 0010 so customer-facing `getMenuByStoreId` / `getMenuItemFullConfig` remain valid.

---

## Column Mapping (API ↔ DB)

| API / Plan term     | 0010 DB column / table                          |
|---------------------|--------------------------------------------------|
| Category            | merchant_menu_categories (store_id)             |
| Item                | merchant_menu_items (store_id, category_id)     |
| Customization group | merchant_menu_item_customizations (menu_item_id)|
| Customization option| merchant_menu_item_addons (customization_id)     |
| Variant             | merchant_menu_item_variants (menu_item_id)      |

New tables (to be created) will follow plan names: `merchant_menu_item_images`, `merchant_menu_addon_groups`, `merchant_menu_addons`, `merchant_menu_combos`, etc.
