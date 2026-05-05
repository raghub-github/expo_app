## Billing: Packaging charges + Delivery slabs (Customer)

This doc describes how **customer checkout billing** computes:
- **Packaging charges** (per menu item)
- **Delivery fee** (geo slab based)
- Optional **GST** on delivery fee and packaging fee

### Packaging charges

- **Source of truth**: `merchant_menu_items.packaging_charges` (per item)
- **Checkout payload** may also include `itemSnapshot.packaging_charges` and `itemSnapshot.packaging_enabled`

Backend behavior (order quote via `POST /v1/billing/calculate`):
- If item snapshots include packaging charges, packaging total is:
  - \(\sum\) `packaging_charges × quantity` for lines where `packaging_enabled=true`
- If snapshots don’t include packaging, backend fetches `packaging_charges` from `merchant_menu_items` and computes:
  - \(\sum\) `packaging_charges × quantity`

Billing output:
- `packagingFee` is returned as a separate fee bucket and should be shown as **“Packaging charges”** in UI.

### Delivery fee slabs (geo slabs v2)

Backend resolves:
- **Route distance** using the distance engine (Mapbox → OSRM → Haversine fallback)
  - `routes[0].distance` meters → km
  - `routes[0].duration` seconds → minutes
- **Drop geo node** from customer pincode hierarchy
- **Effective slabs** via `delivery_rate_slabs_effective(...)`

Customer slab selection:
- Pick the slab where `min_km <= distance_km <= max_km` (max can be null = Infinity)

Customer fee formula (non-progressive, slab-by-distance):
- If slab is the **first slab** (`min_km = 0`):
  - `delivery_fee = max(min_charge, base_fare + distance_km × per_km_rate)`
- Otherwise:
  - `delivery_fee = max(min_charge, distance_km × per_km_rate)`

### GST configuration (optional runtime injection)

Taxes are primarily DB-driven (`billing_tax_configs` joined via `billing_pricing_rules` type `TAX`).

To enable env-based injection when DB has no tax config for the base:

```json
{
  "apply_gst_on_delivery_fee": true,
  "delivery_fee_gst_percent": 5,
  "apply_gst_on_packaging": true,
  "packaging_gst_mode": "same_as_item"
}
```

Env vars (backend):
- `APPLY_GST_ON_DELIVERY_FEE=true|false`
- `DELIVERY_FEE_GST_PERCENT=5` (percent, optional; default 5 when enabled)
- `APPLY_GST_ON_PACKAGING=true|false`
- `PACKAGING_GST_MODE=same_as_item` (derives packaging GST rate from item GST configs)

Notes for India GST:
- Packaging can be considered part of the principal supply (GST same as food) or separately charged.
- This implementation supports both by allowing packaging GST to be toggled/inferred.

