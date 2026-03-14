# Modifier / Addon System — Architecture (Swiggy/Zomato-style)

## PHASE 1 — Industry model

Large food delivery platforms (Swiggy, Zomato, Uber Eats) structure addons and modifiers as follows:

- **Modifier groups** (e.g. "Choose your sauce", "Extra toppings") are **store-level reusable** entities. They have a title, description, and selection rules (min/max, required/optional).
- **Modifier options** (e.g. "Mayo +₹10", "Cheese +₹25") belong to a group. Each option has a name, **price delta** (added to item price), optional image, and stock.
- **Item linking**: Items are linked to modifier groups via a many-to-many table. The same "Extra cheese" group can be attached to Burger, Pizza, Pasta without duplicating options.

**Why reusable addons?**

- **No duplication**: "Extra cheese" is defined once; attach to 50 items by linking.
- **Consistency**: Update price in one place; all linked items reflect it.
- **Scalability**: 1M items with 1000 modifier groups and 10k options instead of millions of per-item addon rows.
- **Merchant UX**: Create an "Addon Library", then attach groups to items when editing.

**Terms used in this codebase:**

- **Modifier group** = addon group (store-level, reusable).
- **Modifier option** = single addon option (name + price_delta) inside a group.
- **Item modifier group link** = attaching a modifier group to a menu item.

---

## PHASE 2 — New architecture (implemented)

| Entity | Table | Purpose |
|--------|--------|--------|
| Modifier group | `merchant_modifier_groups` | Store-level; title, description, is_required, min_selection, max_selection, display_order, metadata |
| Modifier option | `merchant_modifier_options` | Belongs to a group; name, price_delta, image_url, in_stock, default_quantity, display_order |
| Item ↔ Group link | `merchant_item_modifier_groups` | menu_item_id + modifier_group_id; display_order |

---

## PHASE 3 — Database

- **Migration**: `0134_merchant_modifier_groups_reusable_addons.sql`
- **Subscription limits**: `merchant_modifier_subscription_limits` (plan_key, max_modifier_groups, max_modifier_options, max_modifier_groups_per_item, max_options_per_group). Default plan `basic`: 20 groups, 100 options, 10 groups per item, 20 options per group.
- **Old tables**: `merchant_menu_item_customizations` and `merchant_menu_item_addons` remain for backward compatibility (per-item customizations). New items can use only linked modifier groups, or both.

---

## PHASE 4 — Subscription limits

- Enforced in backend: `createModifierGroup`, `addModifierOption`, `linkModifierGroupToItem` check limits from `merchant_modifier_subscription_limits` (default plan `basic`).
- Errors: `LIMIT_MODIFIER_GROUPS`, `LIMIT_OPTIONS_PER_GROUP`, `LIMIT_GROUPS_PER_ITEM`, `LIMIT_MODIFIER_OPTIONS`.

---

## PHASE 5 — Merchant dashboard UI (Addon Library)

- **Menu → Addon Library** (or from Catalog Add menu): list all modifier groups with search.
- **Create / Edit / Delete** group; **Add options** inside each group.
- **"Used in X items"** shown per group.
- **Addon Library → [id]**: edit group details (title, description, required, min/max) and list/add/edit/delete options (name, price delta).

---

## PHASE 6 — Item page UX (Linked Addon Groups)

- On **Item edit** (add-edit-item): section **Linked Addon Groups**.
- Lists linked groups (title + option count); **Unlink** per group.
- **[Add existing]** opens a picker of store modifier groups (excluding already linked); tap to link.
- **[Create new]** navigates to Addon Library to create a group; user returns and uses **Add existing** to link.

---

## PHASE 7 — API design

| Method | Path | Description |
|--------|------|-------------|
| GET | `/:storeId/modifier-groups` | List modifier groups (with options_count, used_in_items_count) |
| POST | `/:storeId/modifier-groups` | Create modifier group |
| PUT | `/modifier-groups/:id?storeId=` | Update modifier group |
| DELETE | `/modifier-groups/:id?storeId=` | Delete modifier group |
| GET | `/modifier-groups/:groupId/options?storeId=` | List options of a group |
| POST | `/modifier-groups/:groupId/options?storeId=` | Add option |
| PUT | `/modifier-options/:id?storeId=` | Update option |
| DELETE | `/modifier-options/:id?storeId=` | Delete option |
| GET | `/items/:itemId/modifier-groups?storeId=` | List linked modifier groups for item (with options) |
| POST | `/items/:itemId/modifier-groups?storeId=` | Link group to item (body: modifier_group_id, display_order?) |
| DELETE | `/items/:itemId/modifier-groups/:linkId?storeId=` | Unlink group from item |

---

## PHASE 8 — Safety rules

- **Max options per group**: from subscription (e.g. 20).
- **Max groups per item**: from subscription (e.g. 10).
- **Max modifier groups / total options per store**: from subscription.
- **No circular references**: modifier groups do not reference items; only items reference groups.
- **price_delta** ≥ 0 (DB constraint).

---

## PHASE 9 — Migration strategy (old → new)

- **Optional**: Run a one-off script that, for each store, finds `merchant_menu_item_customizations` and `merchant_menu_item_addons`, creates a `merchant_modifier_group` per customization group and `merchant_modifier_options` per addon, then creates `merchant_item_modifier_groups` links. Old tables can be deprecated later or kept for legacy items.
- **Current**: New flow uses Addon Library + link to items. Old per-item customizations continue to work; `getItem` returns both `customizations` and `linked_modifier_groups`.

---

## Example API responses

**GET /:storeId/modifier-groups**

```json
{
  "modifierGroups": [
    {
      "id": 1,
      "group_id": "MG_01ARZ3NDEKTSV4RRFFQ69G5FAV",
      "title": "Extra cheese",
      "description": "Add cheese to your item",
      "is_required": false,
      "min_selection": 0,
      "max_selection": 1,
      "display_order": 0,
      "options_count": 3,
      "used_in_items_count": 5
    }
  ]
}
```

**GET /items/:itemId/modifier-groups**

```json
{
  "linkedModifierGroups": [
    {
      "id": 10,
      "modifier_group_id": 1,
      "display_order": 0,
      "group": {
        "id": 1,
        "group_id": "MG_01ARZ3NDEKTSV4RRFFQ69G5FAV",
        "title": "Extra cheese",
        "description": "Add cheese to your item",
        "is_required": false,
        "min_selection": 0,
        "max_selection": 1,
        "options": [
          { "id": 1, "option_id": "MO_01...", "name": "Mozzarella", "price_delta": "25", "in_stock": true, "display_order": 0 },
          { "id": 2, "option_id": "MO_02...", "name": "Cheddar", "price_delta": "20", "in_stock": true, "display_order": 1 }
        ]
      }
    }
  ]
}
```

**getItem** response now includes `linked_modifier_groups` (same shape as above) in addition to `customizations` (legacy per-item addons).
