# Menu Item: Customizations & Variants — Alignment (Merchant App, Dashboard, Partnersite)

## Data model (backend / DB)

- **Item-level customizations**: `merchant_menu_item_customizations` (group per item) and `merchant_menu_item_addons` (options per group). Fields: customization_title, is_required, min_selection, max_selection, customization_type, display_order; addon_name, addon_price.
- **Variants**: `merchant_menu_item_variants`. Fields: variant_name, variant_type (optional), variant_price, display_order, is_default, in_stock.
- **Linked modifier groups**: `merchant_modifier_groups` (reusable Addon Library) and `merchant_item_modifier_groups` (link item ↔ group). Item can link to multiple modifier groups.

---

## Merchant app (source of truth for UX)

| Area | Location | Structure / Copy |
|------|----------|------------------|
| **Customizations** | `apps/merchant_app/app/(tabs)/menu/item-customizations.tsx` | "Customizations & add-ons (extra cheese, spice level, etc.)". **Add customization group**: Group name (e.g. Toppings) → "Add group". **Add add-on (option)**: Select group → Add-on name (e.g. Extra cheese), Add-on price (₹) → "Add add-on". **Existing groups (N)**: Each group shows customization_title, "Required/Optional · Min X / Max Y", Delete; under each, options with addon_name, ₹price, "Remove". |
| **Variants** | `apps/merchant_app/app/(tabs)/menu/item-variants.tsx` | "Add variant": Variant name (e.g. Half, Full), Variant price (₹) → Add. "Existing variants (N)": name, price, Edit, Delete. |
| **Linked addon groups** | `apps/merchant_app/app/(tabs)/menu/add-edit-item.tsx` + `menuApi`: fetchItemModifierGroups, linkModifierGroupToItem, unlinkModifierGroupFromItem | Reusable groups from Addon Library; link/unlink to item. |
| **API** | Backend `v1/merchant-menu/...` (storeId in query) | items/:itemId/customization-groups, customization-groups/:groupId/options, customization-options/:optionId; items/:itemId/variants, variants/:variantId; items/:itemId/modifier-groups. |

---

## Dashboard (align to app)

| Area | Location | Changes |
|------|----------|--------|
| **Customizations & variants tab** | `dashboard/src/app/dashboard/merchants/stores/[id]/menu/MenuItemForm.tsx` | Use same section titles and labels as merchant app: "Add customization group", "Group name (e.g. …)", "Add add-on (option)" / "Add add-on", "Existing groups (N)", "Required/Optional · Min X / Max Y", "Add-on name", "Add-on price (₹)", "Remove". Variants: "Add variant", "Variant name (e.g. Half, Full)", "Variant price (₹)", "Existing variants (N)". |
| **API** | `dashboard/src/app/api/merchant/stores/[id]/menu/` | Already has customization-groups, customization-options, modifier-groups, items/…/modifier-groups. Same DB; no path change. |

---

## Partnersite (aligned)

| Area | Location | Status |
|------|----------|--------|
| **Item fields** | `partnersite/src/app/mx/menu/page.tsx` | FOOD_TYPES use same values as app/dashboard (VEG, NON_VEG, EGG, Vegan with labels). `normalizeFoodTypeForForm` / `normalizeSpiceLevelForForm` applied when loading item for edit. Base/selling price formatted with toFixed(2). discount_percentage, tax_percentage, is_popular, is_recommended in add/edit form and payloads. |
| **Customizations & variants** | Same file (inline ItemForm) | Same copy as dashboard: "Customizations & add-ons (extra cheese, spice level, etc.)", "Add customization group", "Group name *" (e.g. Toppings), "Add group", "Existing groups (N)", "Required/Optional · Min / Max", "Add add-on", "Add-on name (e.g. Extra cheese)", "Remove", "No add-ons in this group", "No customizations added yet. Create a group above.", "Variants (optional) — size, half/full, etc.", "Existing variants (N)", "Variant name *", "Variant price (₹) *", "Add variant". |
| **API** | `partnersite/src/app/api/merchant/menu-items/` | Same DB; backend getItem/list now return discount_percentage, tax_percentage, is_popular, is_recommended. |

---

## Summary

- **Merchant app**: Source of truth for UX and copy (customization group → add-ons; variants; linked addon groups). Item fields: food_type (VEG/NON_VEG/EGG/Vegan), spice_level, discount_percentage, tax_percentage, is_popular, is_recommended.
- **Backend**: `merchant-menu.service.ts` getItem() and list items now return discount_percentage, tax_percentage, is_popular, is_recommended (and list includes spice_level) so all clients get the same item shape.
- **Dashboard**: MenuItemForm "Customizations & variants" tab uses the same labels, section order, and structure as the app; item fields and normalization aligned.
- **Partnersite**: mx/menu page ItemForm aligned: same FOOD_TYPES (value/label), normalization on load, same Customizations & variants labels and variant name+price-only UI; add/edit send discount/tax/popular/recommended.
