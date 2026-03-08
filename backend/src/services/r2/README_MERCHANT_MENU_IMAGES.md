# Merchant menu item images – R2 layout and URLs

## Folder structure (object keys)

All menu item images use this key pattern for fast access and clear hierarchy:

```
merchant-menu/stores/{store_id}/items/{item_id}/images/{uuid}.{ext}
```

- **store_id** – numeric store id (e.g. `123`)
- **item_id** – numeric menu item id (e.g. `456`)
- **uuid** – v4 UUID for the file (no collisions, short)
- **ext** – `jpg`, `png`, `gif`, or `webp` (normalized; `jpeg` → `jpg`)

Examples:

- `merchant-menu/stores/1/items/5/images/a1b2c3d4-e5f6-7890-abcd-ef1234567890.jpg`
- `merchant-menu/stores/1/items/5/images/f9e8d7c6-b5a4-3210-9876-543210fedcba.png`

Benefits:

- **List/delete by item:** prefix `merchant-menu/stores/{store_id}/items/{item_id}/images/`
- **List/delete by store:** prefix `merchant-menu/stores/{store_id}/`
- **Direct access:** full key is stored in `merchant_menu_item_images.r2_key` for instant delete
- **No expiry in path:** UUID-based; no timestamps in key

## Database

- **image_url** – URL used in API and app. Prefer permanent public URL (see below).
- **r2_key** – full R2 object key; used for delete and for regenerating signed URL if needed.

## Permanent (non-expiring) URLs

To avoid expiring links:

1. **Use a public R2 bucket** (or R2 with custom domain and public access).
2. **Set `R2_PUBLIC_BASE_URL`** in env to your public base (e.g. `https://cdn.example.com` or R2 public bucket URL).
3. **Stored URL format:** `{R2_PUBLIC_BASE_URL}/{r2_key}`  
   Example: `https://cdn.example.com/merchant-menu/stores/1/items/5/images/uuid.jpg`

If `R2_PUBLIC_BASE_URL` is not set, the backend falls back to a **signed URL** (expires in 7 days). For production, set the public base so `image_url` in the DB is permanent and fast to serve.

## Helpers

- `merchantMenuR2Paths.ts`: `buildMenuItemImageKey()`, `buildPublicUrl()`, `itemImagesPrefix()`, `storeMenuPrefix()`.
