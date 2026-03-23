# Unified Catalog Menu Audit (Food → Multi-Industry)

This report audits the current FOOD-only menu/catalog system and maps the existing schema to the unified catalog concepts needed for:
- Food
- Grocery
- Pharma
- Accessories (and future store types)

## Scope: current menu/catalog “engine” in this repo

Primary sources (DB + backend implementation):
- Menu engine service + routes: `backend/src/modules/merchant-menu/merchant-menu.service.ts`, `backend/src/modules/merchant-menu/merchant-menu.routes.ts`
- Menu DB tables created/extended in migrations:
  - `backend/drizzle/0103_merchant_menu_engine.sql`
  - `backend/drizzle/0104_merchant_menu_availability_ranking.sql`
  - `backend/drizzle/0115_merchant_menu_aux_tables_ensure_all.sql`
  - `backend/drizzle/0134_merchant_modifier_groups_reusable_addons.sql` (+ `0136/0137` code fixes)
  - Governance/safety: `backend/drizzle/0120_menu_governance_and_safety.sql`
  - Change requests/audit: `backend/drizzle/0117_merchant_menu_item_change_requests.sql` and `0130_store_activity_feed.sql`

## 1) Table Audit Report (reusable vs refactor vs remove)

### ✅ Reusable Tables (good foundation)

`merchant_menu_categories`
- Hierarchy via `parent_category_id`
- Store-scoped via `store_id`
- Supports “subcategory” without separate tables

`merchant_menu_item_variants`
- Generic concept of “variant dimensions” (size, color, weight, volume)
- Already models `variant_type` and per-variant pricing/stock

`merchant_menu_item_images`
- Multi-image support, R2-backed (`r2_key`), and primary image support (`is_primary`)

`merchant_menu_combos` + `merchant_menu_combo_components`
- Combo header + component composition is industry-generic
- Safe to extend with `combo_type`, `pricing_strategy`, `combo_metadata`

Reusable “Addon Library” (modifier groups)
- `merchant_modifier_groups` (store-level)
- `merchant_modifier_options`
- `merchant_item_modifier_groups` (link item ↔ modifier group)
- Already includes selection constraints (`is_required`, `min_selection`, `max_selection`) and price deltas

Availability/ranking (catalog behavior)
- `merchant_menu_category_availability`
- `merchant_menu_item_availability`
- `merchant_menu_item_ranking`
- These are reusable “catalog presentation/availability” concepts

Governance + audit
- `merchant_menu_item_change_requests`
- `merchant_menu_item_approval_log`
- `store_activity_feed` (already generic and supports `diff jsonb`)

### ⚠️ Tables to Refactor (food coupling / structural duplication)

`merchant_menu_items`
- This is the “items” table today, but it embeds FOOD-specific taxonomy and attributes:
  - `food_type`, `spice_level`, `cuisine_type`
  - nutrition fields + `allergens`, `item_tags`
  - FOOD-oriented UI expectations are enforced in `merchant-menu` routes via Zod schemas
- Refactor target: move these into dynamic attribute definitions/values for multi-industry support.

Dietary taxonomy
- `merchant_menu_dietary_tags`
- `merchant_menu_item_tags`
- For a unified catalog, these should become either:
  - generic “attributes”, or
  - a FOOD-only alias exposed through the unified API.

Addons / customization duplication (main barrier)
There are currently *three* “addon-like” representations:
1. Per-item customizations:
   - `merchant_menu_item_customizations`
   - `merchant_menu_item_addons`
2. Store-level reusable modifier groups (“Addon Library”):
   - `merchant_modifier_groups`
   - `merchant_modifier_options`
   - `merchant_item_modifier_groups`
3. Per-item addon groups (distinct legacy system):
   - `merchant_menu_addon_groups`
   - `merchant_menu_addons`

For multi-industry support, the unified API should return a single “addon_groups” concept, sourced from one or more of the underlying tables (adapter approach).

`merchant_menu_inventory`
- Exists for generic quantity/stock, but does not currently model industry-specific requirements:
  - grocery weight/quantity semantics
  - pharma expiry + prescription semantics
- Refactor target: extend behavior via `store_type_config` and attribute/variant attribute additions.

### ❌ Tables to Remove (currently)

No tables should be hard-dropped in the initial migration phase.

Reason:
- Existing FOOD ordering and historical records depend on the current references.
- The safest strategy is:
  - add generic tables,
  - adapter responses,
  - incremental backfill,
  - only deprecate after full client migration.

## 2) Mapping: current menu tables → unified catalog concepts

### Core catalog entity mapping

- Items (`items` in the unified model)
  - Current physical table: `merchant_menu_items`
  - Future logical attributes: `item_attributes` (dynamic, validated by definitions)

- Categories (`categories/subcategories`)
  - Current physical table: `merchant_menu_categories`
  - Hierarchy: `parent_category_id`
  - Store scoping: `store_id`

- Variants (selection dimensions)
  - Current physical table: `merchant_menu_item_variants`
  - Future: optional variant attributes via `item_variant_attributes`

### Addons / modifiers mapping

- Unified concept: `addon_groups` and `addon_items`
  - Adapter sources (return as one unified collection):
    - `merchant_modifier_groups` ↔ `merchant_modifier_options` + `merchant_item_modifier_groups`
    - `merchant_menu_item_customizations` ↔ `merchant_menu_item_addons`
    - `merchant_menu_addon_groups` ↔ `merchant_menu_addons`

### Combos mapping

- Unified concept: `combos`
  - Current physical tables:
    - `merchant_menu_combos`
    - `merchant_menu_combo_components`
  - Extend with:
    - `combo_type` (fixed/customizable)
    - `pricing_strategy`
    - `combo_metadata`

### Audit mapping

- Unified concept: item/attribute/addon/combo change tracking
  - `store_activity_feed` already supports:
    - `section`
    - `action`
    - `entity_id`
    - `summary`
    - structured `diff jsonb`

## 3) Key risks identified for food-safety

1. FOOD-specific fields are currently first-class columns + Zod validation in backend routes.
   - Mitigation: keep legacy columns for now, compute unified attributes from legacy while `item_attributes` is empty, and add backfill later.

2. Multiple addon systems exist today.
   - Mitigation: unified API must adapter/merge without breaking existing clients.

3. Orders reference menu item ids and related addon/variant ids (historical integrity).
   - Mitigation: do not rename or change PK/FK fields in existing order references.

## 4) Immediate next implementation checkpoints

- Add dynamic attribute tables + feature toggles per `store_type` (schema-only migration).
- Implement backend adapter:
  - read unified attributes from `item_attributes` if present
  - otherwise compute from legacy FOOD columns for backwards compatibility
- Seed + backfill FOOD definitions and values.
- Evolve API response to include unified `attributes` + `addon_groups`.

