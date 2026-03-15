# R2 bucket and attachments

Single source of truth for R2 folder structure, DB URL format, and which attachments are editable after onboarding.

## R2 folder structure (parent first, then child)

All paths live under **one bucket** with prefix `docs/merchants/`.

- **Parent first:** `docs/merchants/{parent_code}/` (e.g. `GMMP1005`).
- **Child store:** `docs/merchants/{parent_code}/stores/{store_code}/` (e.g. `GMMC1017`).

Use the helpers in `src/lib/r2-paths.ts` for every upload, read, and delete. Do not hardcode paths.

### Tree

```
docs/
  merchants/
    {parent_code}/                    e.g. GMMP1005
      logo/                           parent logo (registration)
        {timestamp}_{name}.{ext}
      assets/                         optional parent assets
      draft/                          onboarding before store exists
        onboarding/
          documents/
            pan/
            aadhaar/
            fssai/
            gst/
            bank/
            agreements/
            pharma/
            other/
          menu/
            images/
            csv/
            pdf/
          store-media/                 logo, banner
          store-media/gallery/
          bank/
          agreements/
      stores/
        {store_code}/                 e.g. GMMC1017
          onboarding/
            documents/
              pan/ | aadhaar/ | fssai/ | gst/ | bank/ | agreements/ | pharma/ | other/
            menu/
              images/ | csv/ | pdf/
            store-media/  (logo, banner)
            store-media/gallery/
            bank/
            agreements/
          menu/                       post-onboarding (editable)
            items/                    optional per-item folder
              {item_id}/
            csv/
            pdf/
          store-media/                 post-onboarding (editable)
            logo/ | banner/ | gallery/
          bank/                       post-onboarding bank/UPI (editable)
          documents/                  read-only; do not overwrite primary credentials
```

### Helpers (r2-paths.ts)

- **Parent:** `getParentRoot`, `getParentLogoPath`, `getParentLogoKey`
- **Onboarding:** `getOnboardingR2Base`, `getOnboardingR2Path`, `getOnboardingDocumentPath` (use for PAN, Aadhaar, FSSAI, GST, bank, agreements, pharma, other)
- **Child store:** `getChildStoreRoot`, `getMerchantMenuPath`, `getMerchantMenuItemPath`, `getMerchantMenuCsvPath`, `getMerchantMenuPdfPath`, `getMerchantAssetsPath`, `getMerchantStoreMediaPath` (logo, banner, gallery), `getMerchantBankAttachmentPath`, `getOffersR2Path`

## DB URL format (accessible line format)

- **Store in DB:** Prefer the **proxy URL** `/api/attachments/proxy?key=<r2_key>` (or the raw **R2 object key**). Do **not** store `https://` signed URLs in the DB — they expire and users would see errors.
- **Serving:** Use the stored proxy URL directly in the UI (e.g. `<img src="/api/attachments/proxy?key=..." />`, or “View PDF” linking to the same). The proxy fetches the object from R2 on every request and streams it — so there is **no expiry** for the user. Every access is valid.
- **Consistency:** All attachment columns (e.g. `merchant_stores.logo_url`, `banner_url`, `gallery_images`, `merchant_store_documents.*_document_url`, `merchant_menu_item_images.image_url`, contract PDF URLs) should store proxy URL or key. Use `toStoredDocumentUrl(key)` from `@/lib/r2` when writing.

## No expiry / auto-renew on access

- **Proxy behaviour:** `GET /api/attachments/proxy?key=<r2_key>` uses server credentials to fetch the object from R2 and stream it to the client. No signed URL is sent to the client, so **no expiry is ever shown** — whether the user opens the attachment once or regularly, it always works.
- **Applies to:** All attachment types (images, PDFs, CSV, contracts, KYC documents, logos, banners, gallery, menu files). Use the proxy URL for display and download so errors are never shown for expired links.
- **Optional:** If you need a temporary download URL outside the app (e.g. email link), generate a short-lived signed URL at that moment; do not store it in the DB.

## Fetching from the correct R2 folder

- **Parent logo:** Under `docs/merchants/{parent_code}/logo/`. Stored in `merchant_parents.store_logo`.
- **Store logo / banner / gallery:** Onboarding under `.../stores/{store_code}/onboarding/store-media/` and `.../store-media/gallery/`. Post-onboarding under `.../stores/{store_code}/store-media/logo`, `banner`, `gallery`. Stored in `merchant_stores.logo_url`, `banner_url`, `gallery_images`.
- **KYC/documents (PAN, Aadhaar, FSSAI, GST, bank, etc.):** Under `.../onboarding/documents/{pan|aadhaar|fssai|gst|bank|pharma|other}/`. Stored in `merchant_store_documents` (e.g. `pan_document_url`, `aadhaar_document_url`).
- **Contract/agreement PDF:** Under `.../onboarding/agreements/` or `.../stores/{store_code}/onboarding/agreements/`. Stored in agreement acceptance / contract URL fields.
- **Menu item images:** Post-onboarding under `.../stores/{store_code}/menu/` or `.../menu/items/{item_id}/`. Stored in `merchant_menu_item_images.image_url` and optionally `merchant_menu_items.item_image_url`.
- **Menu CSV/PDF:** **Onboarding (Step 3 uploads) under** `.../onboarding/menu/csv` and `.../onboarding/menu/pdf` (via `getMenuUploadR2Key` → `getOnboardingR2Path`). **Post-onboarding** under `.../stores/{store_code}/menu/csv` and `.../stores/{store_code}/menu/pdf`.

## Editable vs read-only after onboarding

After onboarding is completed and the merchant has access to the main dashboard:

- **Read-only (primary credentials):** PAN, Aadhaar, GST, FSSAI, contract PDF. Do not allow replace/delete from the dashboard; view only (or use a separate “request change” flow if needed).
- **Editable:** Logo, banner, gallery images, menu item images, menu CSV/PDF, bank/UPI proof images. Full CRUD: upload (replace), delete, and list from the correct R2 paths; update DB with the new key or proxy URL and refresh the UI in real time.

Implement dashboard APIs for editable attachments using the post-onboarding paths (`getMerchantStoreMediaPath`, `getMerchantMenuPath`, `getMerchantBankAttachmentPath`, etc.) and ensure the UI updates and DB is updated on each change.
