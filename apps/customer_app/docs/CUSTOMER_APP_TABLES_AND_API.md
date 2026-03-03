# Customer App – Project mein use hone wale tables aur API (Updated)

Yeh document batata hai ki **GatiMitra Customer App** mein **kaun kaun se backend / DB tables use ho rahe hain** aur **unka kya use hai**.  
Sab **current changes** ke hisaab se updated hai (addresses, saved addresses, location, profile, orders, merchants, support, bookmarks).

---

## 1. Backend database (Postgres – `DATABASE_URL`) – Kaun se tables use ho rahe hain

Yeh tables **backend** ke Postgres DB mein hote hain. Migrations: `backend/drizzle/` (aur 0070, 0071 zaroor run karein).

| Table / Feature | Use kya hai (App mein kahan use) | API / Migration |
|-----------------|----------------------------------|-----------------|
| **customers** | User login (OTP verify), profile resolve, har authenticated request mein customer id nikalne ke liye. Addresses, bookmarks, tickets sab isi `customers.id` se link hain. | Auth: `POST /v1/auth/otp/verify`. Me: profile resolve. Migration: 0066 / customers table. |
| **customer_addresses** | Saved addresses – Location screen par saved list, Profile > Saved addresses par list / add / delete / set default. Home, Work, Other jaisa label, full address, lat/lon store hota hai. | `GET/POST/PATCH/DELETE /v1/me/addresses`, `POST /v1/me/addresses/:id/default`. Migration: **0070_customer_addresses_and_active_location.sql**. |
| **customer_active_location** | Abhi select ki hui delivery location (session-level). Order place par lock ho jati hai, delivery complete par unlock. Store listing / delivery address isi se aati hai. | `GET /v1/me/active-location`, `PUT /v1/me/active-location`. Migration: **0070_customer_addresses_and_active_location.sql**. |
| **orders_core** | Order create / list / detail (jab order APIs backend par hon). Delivery time par lat/lon/address snapshot bhi isi table par (columns: delivery_latitude, delivery_longitude, delivery_address). | Order APIs (e.g. `POST /v1/orders`, `GET /v1/orders`, `GET /v1/orders/:id`). Snapshot columns: **0071_orders_delivery_location_snapshot.sql**. |
| **user_profiles** | Profile screen – name, email, photo, phone display/update. Backend `GET/PATCH /v1/me/profile` isi se data leta/update karta hai. | `GET /v1/me/profile`, `PATCH /v1/me/profile`. |
| **tickets** (enterpriseTickets) | Support / Help – ticket create, list, detail. Subject, description, status yahan store hota hai. | `POST /v1/support/tickets`, `GET /v1/support/tickets`, `GET /v1/support/tickets/:id`. |
| **ticket_participants** | Ticket ka link customer se – kaun sa customer kaun se ticket se linked hai. | Support routes internally. |
| **ticket_messages** | Ticket ke andar messages (conversation). | Support ticket detail. |

---

## 2. Merchant DB (Supabase) – Kaun se tables / RPC use ho rahe hain

App **merchant list, menu, search** ke liye backend use karti hai; backend internally **Supabase (merchant_db)** se yeh tables / RPC use karta hai.

| Table / RPC | Use kya hai (App mein kahan use) |
|-------------|----------------------------------|
| **merchant_stores** | Store list (Home), store detail, store search. Store name, image, cuisines, open/close, distance, prep time sab yahan se. |
| **merchant_menu_items** | Menu items – store ke andar dishes, price, image, in_stock. Search bhi isi table par (fulltext). |
| **merchant_menu_categories** | Menu categories (e.g. Starters, Main Course) – category name aur display order. |
| **get_nearby_merchant_stores** (RPC) | User lat/lng se 15 km ke andar stores, distance ke hisaab se sort. Migration: merchant_db `0046_get_nearby_merchant_stores.sql`. |
| **customer_store_bookmarks** | Saved/favourite stores – “Save” / “Unsave” store. Backend bookmarks Supabase isi table use karte hain. | `GET /v1/bookmarks/check`, `POST /v1/bookmarks`. |

---

## 3. Customer App – API endpoints (summary)

| Endpoint | Kaun se table(s) use | Use kya hai |
|----------|----------------------|-------------|
| `POST /v1/auth/otp/request` | – | OTP bhejne ke liye. |
| `POST /v1/auth/otp/verify` | **customers** | Login – customer create/update, JWT return. |
| `POST /v1/me/logout-all` | – | Sab sessions invalidate. |
| `GET /v1/me/profile` | **customers**, **user_profiles** | Profile dikhana. |
| `PATCH /v1/me/profile` | **customers**, **user_profiles** | Profile update. |
| `GET /v1/me/addresses` | **customer_addresses** | Saved addresses list (Location + Profile > Saved addresses). |
| `POST /v1/me/addresses` | **customer_addresses** | Naya address add. |
| `PATCH /v1/me/addresses/:id` | **customer_addresses** | Address edit. |
| `DELETE /v1/me/addresses/:id` | **customer_addresses** | Address delete. |
| `POST /v1/me/addresses/:id/default` | **customer_addresses** | Default address set. |
| `GET /v1/me/active-location` | **customer_active_location** | Current delivery location (lock status bhi). |
| `PUT /v1/me/active-location` | **customer_active_location** | Delivery location set/update. |
| `GET /v1/merchants` | **merchant_stores**, **merchant_menu_items** (Supabase) | Nearby stores list (lat/lng use). |
| `GET /v1/merchants/:id/menu` | **merchant_stores**, **merchant_menu_categories**, **merchant_menu_items** (Supabase) | Store + menu. |
| `GET /v1/search` | **merchant_menu_items**, **merchant_stores** (Supabase) | Search dishes + stores. |
| `GET /v1/bookmarks/check` | **customer_store_bookmarks** (Supabase) | Store saved hai ya nahi. |
| `POST /v1/bookmarks` | **customer_store_bookmarks** (Supabase) | Store save/unsave. |
| `POST /v1/orders` | **orders_core** (and related) | Order place (delivery snapshot bhi yahan save). |
| `GET /v1/orders`, `GET /v1/orders/:id` | **orders_core** (and related) | My orders, order detail. |
| `POST /v1/support/tickets` | **tickets**, **ticket_participants**, **ticket_messages** | Naya ticket create. |
| `GET /v1/support/tickets` | **tickets**, **ticket_participants** | Ticket list. |
| `GET /v1/support/tickets/:id` | **tickets**, **ticket_participants**, **ticket_messages** | Ticket detail. |

---

## 4. Migrations – Customer app ke liye zaroori

- **Backend Postgres:**  
  - **0070_customer_addresses_and_active_location.sql** – `customer_addresses`, `customer_active_location` (saved addresses + current location).  
  - **0071_orders_delivery_location_snapshot.sql** – `orders_core` par delivery_latitude, delivery_longitude, delivery_address.  
  Run: `backend/drizzle/README.md` dekhein (Phase 10).

- **Merchant DB (Supabase):**  
  - Stores/menu ke liye: `merchant_stores`, `merchant_menu_items`, `merchant_menu_categories`.  
  - Nearby stores: RPC `get_nearby_merchant_stores` (e.g. merchant_db migration 0046).  
  - Search: fulltext on menu items (e.g. 0045).

---

## 5. Short summary (Hindi)

- **Login / Profile:** `customers`, `user_profiles` – sign in, profile dikhana/update.
- **Saved addresses:** `customer_addresses` – Location + Profile > Saved addresses; add, delete, set default.
- **Current delivery location:** `customer_active_location` – abhi ka address, order par lock.
- **Orders:** `orders_core` – order place/list/detail, delivery ka snapshot (lat/lon/address).
- **Stores & Menu:** Supabase – `merchant_stores`, `merchant_menu_items`, `merchant_menu_categories`; nearby ke liye RPC.
- **Bookmarks:** Supabase – `customer_store_bookmarks`.
- **Support:** Backend – `tickets`, `ticket_participants`, `ticket_messages`.

Is document ko app ke current behaviour ke hisaab se hi likha gaya hai; koi naya table/API add karte waqt yahi file update karein.
