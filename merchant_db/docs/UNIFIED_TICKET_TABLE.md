# Unified Ticket System — Which Table to Use

## Current ticket table for the entire unified ticket system: **`unified_tickets`**

Use **`public.unified_tickets`** for:

- Merchant-raised tickets (from merchant portal)
- Customer tickets
- Rider tickets (when using the unified flow)
- Any ticket that can be raised by multiple actor types (MERCHANT, CUSTOMER, RIDER, etc.)

**Schema highlights:**

- `ticket_id` (unique), `ticket_type`, `ticket_source`, `service_type`, `ticket_title`, `ticket_category`
- `raised_by_type` / `raised_by_id` (MERCHANT, CUSTOMER, RIDER, etc.)
- `merchant_store_id`, `merchant_parent_id`, `customer_id`, `rider_id`, `order_id`
- `subject`, `description`, **`attachments` (text[])** for optional image URLs
- `priority`, `status`, assignment and resolution fields

Related tables:

- `unified_ticket_activities` — references `unified_tickets(id)`
- `unified_ticket_messages` — references `unified_tickets(id)`

---

## Legacy table: **`public.tickets`**

**`public.tickets`** is the older, **rider-centric** table:

- `rider_id` is **NOT NULL** (tied to riders)
- Used by the dashboard and some backend flows (e.g. agent-created tickets with `ticket_number`, `title_id`, etc.)
- Supporting tables like `ticket_attachments`, `ticket_messages`, `ticket_status_history` reference `tickets(id)`

Do **not** use `tickets` for new merchant- or customer-origin tickets; use **`unified_tickets`** instead.

---

## Summary

| Use case                         | Table             |
|----------------------------------|-------------------|
| Merchant / customer / unified    | **unified_tickets** |
| Dashboard / rider-centric flows   | tickets           |

Merchant portal ticket creation (e.g. `/api/merchant/tickets`) writes only to **`unified_tickets`**.

---

## Ticket attachment images (private R2)

If your R2 bucket is **private**, direct attachment URLs will return an "Authorization" or "InvalidArgument" error when opened. Use the **attachment proxy** so images load in the app and in the ticket dashboard:

1. **Merchant portal**  
   Set `NEXT_PUBLIC_R2_PUBLIC_BASE_URL` to the same value as `R2_PUBLIC_BASE_URL` in `.env`. The app will use `GET /api/attachments/proxy?url=<encoded-url>` for attachment images so they load without making the bucket public.

2. **Ticket dashboard (other app)**  
   Set in the dashboard’s `.env`:
   - `NEXT_PUBLIC_MERCHANT_ATTACHMENT_PROXY` = merchant portal origin (e.g. `https://merchant.example.com`)
   - `NEXT_PUBLIC_MERCHANT_R2_BASE_URL` = same as merchant’s `R2_PUBLIC_BASE_URL`  
   Attachment links and thumbnails will then load via the merchant proxy.
