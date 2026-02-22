# GatiMitra Restaurant Detail Flow

## Features Implemented

- **Sticky collapsing header** – On scroll up, hero banner collapses and a sticky bar shows: Back button, search bar (“Search in {Restaurant Name}”), and 3-dot options menu. Smooth opacity animation; semi-transparent background.
- **Dynamic restaurant search** – Search bar filters menu items for that restaurant only (client-side filter on `merchant.menu` by item name). API also supports `GET /v1/merchants/:id/menu?q=` for server-side filter.
- **Options bottom sheet** – 3-dot menu opens a sheet with: Add to Collection, Group Order, See more about this restaurant, Share this restaurant, Hide this restaurant, Report fraud or bad practices. Footer text explains that menu content is set by the restaurant.
- **About restaurant page** – “See more about this restaurant” navigates to `/home/merchant/about/[id]`. Page fetches from `GET /v1/merchants/:id/about` (data from `merchant_stores`): store name, full address, city, postal code, cuisine types, operational status, prep time, logo/banner. Rounded cards, soft shadow, mint-green highlights, “Go back to menu” CTA.
- **Report issue system** – “Report fraud or bad practices” opens a second sheet: “Report an issue with the menu” with options: Inaccurate photos or descriptions, Pricing related issues, Items are missing in the menu, I have some other issue. On submit, `POST /v1/merchants/:id/report` with `report_type` and optional `description`; stored in `restaurant_reports` (backend).
- **Fully database-driven UI** – No dummy data. Store and menu from `merchant_stores` and `merchant_menu_items` (Supabase). Reports in `restaurant_reports` (backend Postgres).

## Data Sources

| Source | Use |
|--------|-----|
| **merchant_stores** (Supabase) | Store name, address, cuisine, operational status, prep time, logo, banner. About page and detail header. |
| **merchant_menu_items** (Supabase) | Menu list and in-restaurant search. Images from `item_image_url` with fallback to store logo. |
| **customers** (backend) | Resolve customer for report API (JWT → customer_id). |
| **restaurant_reports** (backend) | Store customer reports (report_type, description) per store. |

## UX Behaviour

- **Scroll** – Collapses hero; sticky header appears with search and 3-dot.
- **Search** – Filters current restaurant menu only (by item name).
- **Reports** – Stored per customer + store; report type and optional description.
- **No dummy UI** – All labels and options are fixed (e.g. report types); data comes from API/DB only.

## Branding

- **Mint green gradient** – Primary buttons (ADD, “Go back to menu”): `#1FBF8F` → `#4ADE80`.
- **Soft elevation** – Cards with light shadow; rounded 16px where specified.
- **Layout** – Delivery-first: sticky header, clear hierarchy, options and report sheets from 3-dot menu.

## API Endpoints

- `GET /v1/merchants/:id/menu?q=` – Store + menu; optional `q` filters menu by item name.
- `GET /v1/merchants/:id/about` – Store info for About page (full_address, operational_status, etc.).
- `POST /v1/merchants/:id/report` – Submit report (auth). Body: `{ report_type, description? }`.

## Backend Migration

- **0072_restaurant_reports.sql** – Creates `restaurant_reports` (id, customer_id, store_id, report_type, description, created_at). Run on backend DB.
