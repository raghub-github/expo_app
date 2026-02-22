# Order Placement Flow (Swiggy/Zomato-style)

This document describes the **correct** order lifecycle, backend transaction flow, UI success behavior, navigation rules, state machine, and realtime event design for GatiMitra food delivery.

---

## 1. Order Lifecycle (Customer perspective)

| Stage | Description | UI / Backend |
|-------|-------------|--------------|
| **Cart** | User adds items, selects address, payment method | `cartStore`, address selection |
| **Checkout** | Review bill, apply coupon (optional), tip/donation | `POST /v1/orders/pending` → lock cart |
| **Payment** | Razorpay WebView (UPI/card/wallet) | Create Razorpay order → open WebView |
| **Payment success** | Gateway redirects to internal URL; app intercepts | **No app reload.** `gm-internal://pay-success` only. |
| **Finalize** | Backend verifies payment, creates order in one transaction | `POST /v1/orders/finalize` → returns `order_id` |
| **Success screen** | Shown **immediately** after finalize response | Confetti, order summary, ETA, **Track Order** |
| **Track order** | User taps Track Order → order tracking screen | `router.replace("/(tabs)/")` then `router.push(\`/orders/${orderId}\`)` |
| **Live updates** | Status changes (preparing, out for delivery, delivered) | Realtime / polling; no navigation reset |

---

## 2. Backend Transaction Flow

### 2.1 Payment-first (recommended)

1. **Create pending order**  
   `POST /v1/orders/pending`  
   - Input: cart items, addressId, paymentMethod, tip, donation.  
   - Backend: validates address/cart, computes amount, inserts into `pending_orders`, returns `pendingId` and `amount` (paise).

2. **Create Razorpay order**  
   `POST /v1/payment/create-order`  
   - Input: amount (paise), receipt = `pendingId`.  
   - Returns: `orderId` (Razorpay), `keyId`, `amount` for opening checkout.

3. **Customer pays** in Razorpay WebView (UPI/card/wallet).

4. **Finalize order** (after payment success)  
   `POST /v1/orders/finalize`  
   - Input: `pendingId`, `razorpayOrderId`, `razorpayPaymentId`, `razorpaySignature`.  
   - Backend:  
     - Verifies Razorpay signature.  
     - Loads pending order; if already finalized, returns existing order (idempotent).  
     - Single DB transaction:  
       - Insert `core_orders`.  
       - Insert `core_order_items` + `core_order_item_addons`.  
       - Insert `core_payments`.  
       - Update `pending_orders` (set `finalizedOrderId`, `finalizedAt`).  
       - Insert `order_events` (PLACED).  
   - Response (frontend **must** wait for this before navigating):

   ```json
   {
     "success": true,
     "order_id": "GM-<ts>-<hex>",
     "orderId": "GM-<ts>-<hex>",
     "status": "PLACED",
     "totalAmount": 45000,
     "createdAt": "2025-02-22T..."
   }
   ```

### 2.2 Legacy single-call create

- `POST /v1/orders` with payment params (razorpayOrderId, razorpayPaymentId, razorpaySignature) in one shot.  
- Still supported; payment-first (pending + finalize) is preferred for reliability and clear UX.

---

## 3. UI Success Behavior (mandatory)

- **Immediately** after payment verification and finalize API success:
  - Close payment modal.
  - Update local state: `setActiveOrder`, `clearCart`, invalidate "my-orders" queries.
  - Navigate to **Order Success** screen with `orderId`:  
    `navigation.replace("success", { orderId })` (within checkout stack).

- **Success screen shows:**
  - **Message:** “🎉 Order placed successfully!”
  - **Confetti / crackers animation** (no full-screen reload).
  - **Order summary** (items, total).
  - **ETA** (e.g. “Estimated delivery in ~25 mins”).
  - **Primary button:** “Track Order” → navigates to order tracking (`/orders/:id`).
  - **Secondary:** “Back to Home” → `router.replace("/(tabs)/")`.

- **Forbidden:**
  - App reload after payment.
  - Navigation reset (e.g. sending user to home without showing success).
  - Background polling that redirects away from success screen.
  - Delayed automatic redirect to home (no “redirect after 2–3 minutes”).

---

## 4. Navigation Rules

| Action | Route / API | Notes |
|--------|-------------|--------|
| After payment success | `navigation.replace("success", { orderId })` | Checkout stack only; **not** `router.replace('/home')`. |
| Success screen → Track Order | `router.replace("/(tabs)/")` then `router.push(\`/orders/${orderId}\`)` | User lands on Orders tab with order detail on top. |
| Success screen → Back to Home | `router.replace("/(tabs)/")` | No order screen pushed. |
| Order tracking route | `/orders/[id]` | Same as “Track Order” target. |

**Correct pattern:**  
After finalize returns → `router.replace(\`/checkout/success?orderId=...\`)` or stack `replace("success", { orderId })`.  
**Not:** `router.replace('/home')` or any path that resets to home without showing success.

---

## 5. State Machine (order status)

High-level status flow (backend + frontend):

- **PLACED** → order created, payment recorded.  
- **CONFIRMED** → merchant accepted (optional step).  
- **PREPARING** / **READY** → kitchen.  
- **PICKED_UP** / **OUT_FOR_DELIVERY** / **ON_THE_WAY** → rider.  
- **DELIVERED** → complete; clear active order.  
- **CANCELLED** → clear active order.

Realtime or polling updates `orderStore.activeOrder` (status, etaMinutes); **no navigation change** unless user explicitly taps “Track Order” or “Back to Home”.

---

## 6. Realtime / Event Design

- **Order events** are written to `order_events` (e.g. PLACED, status changes).
- **Customer app** can:
  - **Poll** active order: `GET /v1/orders/:id` on an interval while `activeOrder` is set (e.g. every 5s), and update status/ETA in store.
  - **Supabase Realtime** (when enabled): subscribe to `order_status_changes` for the order and update store from payload; then polling can be disabled for that order.
- **Rule:** Realtime/polling only updates **state** (status, ETA). It must **not** trigger navigation away from the success screen or cause an app reload.

---

## 7. Root Cause of Past Issues (and fixes)

| Issue | Cause | Fix |
|-------|--------|-----|
| App reload after payment | WebView redirected to `gatimitra://pay-success`; OS opened app via scheme → reload | Use **internal** callback URL: `gm-internal://pay-success` so only WebView intercepts; OS does not open app. |
| User sent to home, no success | Navigation used wrong navigator or path | Use checkout stack `navigation.replace("success", { orderId })` after backend response. |
| Delayed home redirect | Polling or auth/session logic reset navigation | Isolate payment flow: no global redirect on session refresh; polling only updates `activeOrder`, does not replace route. |
| Success state not preserved | Full reload or navigation reset | No reload; single replace to success with `orderId`; success screen reads `orderId` from params or URL. |

---

## 8. Summary Checklist

- [x] Finalize order on backend after payment; return `order_id` in response.  
- [x] Frontend waits for finalize response before navigating.  
- [x] Navigate to Order Success screen (checkout success) with `orderId`.  
- [x] Success screen: “Order placed successfully!”, confetti, order summary, ETA, Track Order button.  
- [x] No app reload (internal payment callback URL).  
- [x] No navigation reset or delayed home redirect from payment/realtime.  
- [x] Track Order → `/orders/:id`; Back to Home → `/(tabs)/`.
