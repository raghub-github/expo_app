# Merchant & Rider Buzzer / Sound Notification Architecture Audit

**Date:** 2026-09-21 (native engine hardening)  
**Scope:** Production Android paths for Merchant Partner app + Rider app  
**Status:** Source implementation is in place. **Not production-fixed until real-device tests A–G pass.**

This document traces **backend event → FCM → native service → notification + looping buzzer + overlay**.

---

## Native engine — first install (no Manage Communication)

Opening Manage Communication is **not** a prerequisite. Fresh install → login → kill must still alert.

### Sound waterfall (native, no JS)

```
selected cached file in app filesDir (optional Super Admin slot)
        ↓ missing / corrupt / never copied
bundled res/raw (notification.wav / food_order / parcel_order / ride_order)
        ↓ missing
notification channel / system ringtone
```

`OrderAlertSoundStore` defaults: **buzzer ON**, **ring-in-silent ON**. `selectedFile()` returns null until JS later copies a slot file. `OrderAlertController.createPlayer` then uses bundled raw. Overlay and `startForeground` notification do **not** wait on that copy.

| Remote Super Admin sound | What native does |
|--------------------------|------------------|
| Never cached (first install) | Bundled raw |
| Cached file deleted | Bundled raw |
| URL unavailable / download fail | Bundled raw |
| User selects Sound 1 then Sound 2 | Native `commit()` copy to `gatimitra_selected_alert_{slot}.*` immediately — next killed order uses Sound 2. No app restart. |

### Overlay

`OrderAlertForegroundService` calls `OrderAlertOverlay.show` after `startForeground`. It does **not** depend on React, Manage Communication, or a cached sound. Appear-on-top (`SYSTEM_ALERT_WINDOW`) must be ON for `TYPE_APPLICATION_OVERLAY` above Chrome/Zomato.

### Android exception (do not classify as “killed”)

**Force stop** from Android Settings can block FCM until the user manually opens the app. Swipe-from-recents / process death is **not** force stop.

### Acceptance matrix (source; device-prove before claiming fixed)

| State | Notification | Buzzer | Overlay |
|-------|--------------|--------|---------|
| Foreground | YES | YES | YES / in-app host |
| Background | YES | YES | YES (Appear-on-top ON) |
| Process killed | YES | YES | YES (Appear-on-top ON) |
| Fresh install (never open Manage Communication) | YES | YES (bundled if slot uncached) | YES (Appear-on-top ON) |

Device test after Partner/Rider native APK install: A fresh install → B never open Manage Communication → C login → D kill → E Chrome/Zomato → F new order → G logs `FCM_RECEIVED`, `CRITICAL_EVENT_DETECTED`, `SOUND_RESOLVED`, `NOTIFICATION_POST_SUCCESS`, `BUZZER_STARTED`, `OVERLAY_ADD_VIEW_SUCCESS`, `OVERLAY_VISIBLE` **and** physically see the GatiMitra card above Chrome/Zomato. Repeat after Sound 1, then Sound 2.

---

## Executive verdict (historical 2026-09-19 audit below this line)

| Goal | Native engine (current source) |
|------|-----------------|
| Audible alert while app is **foreground** | **Yes** — native FGS + in-app host |
| Audible alert while app is **background** (process alive) | **Yes** — FCM → native FGS looping MediaPlayer |
| Audible alert while app is **killed** / swiped away | **Yes in source** — FCM → `CriticalAlertMessagingService` → FGS. **Device-prove.** |
| Audible alert while **phone locked** | Same native FGS path if FCM is delivered |
| Repeat until accept/ack while killed | **Yes in source** — looping MediaPlayer until accept/reject/stop/TTL |

---

## Shared platform facts (both apps)

1. **Dual delivery path:** Backend prefers **native FCM v1** (`native_device_push_tokens`) and can also send **Expo Push** (`expo_push_tokens`). Critical templates always include an FCM/Expo **`notification` block** (title/body) so Android can show a tray item when the app process does not exist.
2. **Android O+ sound ownership:** The **notification channel’s** configured sound is authoritative. Payload `sound` is a fallback for pre-O / some FCM paths. Changing channel sound requires a **new channel id** (hence `*_v2` / `*_v1` ids).
3. **Channels are bootstrapped natively** at install / process start via `packages/expo-push-kit/plugin/withAndroidPushChannels.js` → `PushChannelBootstrap` (so FCM can resolve the channel before JS runs).
4. **`expo-notifications` `setNotificationHandler`** only runs when the JS runtime can handle the notification (foreground, and sometimes background if process alive). **It does not run when the app is force-killed.**
5. **`BACKGROUND-NOTIFICATION-TASK`** (`expo-task-manager` + `Notifications.registerTaskAsync`) is registered in each app’s `pushBackgroundTask.js`. It is **not** a full FirebaseMessagingService replacement; OEM/Doze can skip or delay it when the process is dead.
6. **No dedicated Android Foreground Service / looping MediaPlayer for killed-state buzzers** exists today.

---

# A. CURRENT ARCHITECTURE

## A1. Merchant (Partner) app

### Trigger (backend)

| Step | What happens |
|------|----------------|
| 1 | Food order lands as merchant-visible `CREATED` |
| 2 | Primary critical path: `notifyMerchantStoreNewOrder` → `notifyMerchantStoreNewOrderPush` (`backend/src/lib/merchant-new-order-notify.ts`, `merchant-push-notify.ts`) |
| 3 | Also: notification event bus can map `CREATED` → template **`MERCHANT_NEW_ORDER`** (`backend/src/modules/notifications/eventBus.ts`) |
| 4 | Delivery: native FCM and/or Expo via `sendFcmV1` / Expo sender; **`silent: false`**, **`playSound: true`**, priority critical |

### Notification identity

| Field | Value |
|-------|--------|
| Template / codes | `MERCHANT_NEW_ORDER` |
| Data markers | `type: merchant_new_order`, `event: NEW_ORDER`, `gmType: MERCHANT_NEW_ORDER`, `template_code: MERCHANT_NEW_ORDER`, `screen: new_order` |
| Channel | **`merchant_new_orders_alert_v2`** (legacy: `merchant_new_orders_alert`) |
| Importance | **5 = MAX** (heads-up capable) |
| Channel sound file | **`notification`** → `android/app/src/main/res/raw/notification` from `apps/merchant_app/assets/sounds/notification.wav` |
| Collapse / tag | Per-order: `gm_new_order_{foodOrderId}` / `merchant-new-order-{id}` so pending orders do not replace each other |
| Push stack | **Native FCM v1 + Expo Push** (both capable of tray + sound when process dead) |

### Client wiring (key files)

| File | Role |
|------|------|
| `apps/merchant_app/pushBackgroundTask.js` | Early `setNotificationHandler` + `BACKGROUND-NOTIFICATION-TASK`; optional cached custom sound in background |
| `apps/merchant_app/lib/merchantNotificationHandler.ts` | Foreground: shade always; mute OS sound when app active (or custom cache present) |
| `apps/merchant_app/components/OrderAlertPushHandler.tsx` | Received / tap / cold-start → `continueOrStartNewOrderAlert` |
| `apps/merchant_app/lib/newOrderAlertManager.ts` | Single session; JS repeats when source is FOREGROUND / MODAL / TAP / COLD_START; BACKGROUND tracks only |
| `apps/merchant_app/lib/playOrderAlertSound.ts` | `expo-audio` playback + configured repeat count |
| `apps/merchant_app/app.config.js` | Packages sound + channel bootstrap |

### Step-by-step flow (Merchant)

```
Order CREATED
  → notifyMerchantStoreNewOrderPush / MERCHANT_NEW_ORDER
  → FCM/Expo with android.notification { channelId: merchant_new_orders_alert_v2, sound: notification }
  → Android NotificationManager posts to tray using channel MAX + raw/notification
       │
       ├─ FOREGROUND (JS alive, AppState active)
       │    → setNotificationHandler: shouldPlaySound=false for new order
       │    → OrderAlertPushHandler / modal → newOrderAlertManager (JS chime, N repeats)
       │
       ├─ BACKGROUND (process alive)
       │    → OS channel sound plays (unless muted because custom cache exists)
       │    → pushBackgroundTask may play cached Manage-communication file once
       │    → newOrderAlertManager source=BACKGROUND does NOT start JS loop
       │
       └─ KILLED (no process)
            → Handler / TaskManager / alert manager DO NOT RUN
            → Only OS channel sound (typically once) + tray notification
            → On reopen/tap: dismiss OS notif, resume remaining JS repeats via COLD_START / NOTIFICATION_TAP
```

### Merchant sound ownership by state

| State | Who plays sound | Repeats until ack? |
|-------|-----------------|--------------------|
| Foreground | JS (`playIncomingOrderAlert` / `newOrderAlertManager`) | **Yes** (configured `alert_sound_repeat_count`, capped) until accept/reject/expire/dismiss |
| Background | OS channel (± one cached JS clip) | **No** continuous loop |
| Killed | OS channel only | **No** |
| Reopen after push | JS resumes remaining repeats (estimates OS already played once) | Remaining JS repeats only |

---

## A2. Rider app

### Trigger (backend)

| Step | What happens |
|------|----------------|
| 1 | Assignment engine offers order to eligible rider |
| 2 | `notifyRiderDispatchOffer` (`backend/src/lib/rider-dispatch-notify.ts`) |
| 3 | Prefer template **`RIDER_NEW_ORDER`**, fallback **`RIDER_DISPATCH_OFFER`** via `notificationService.send` |
| 4 | If template path delivers no tokens: **`sendRiderDispatchDirectPush`** (`rider-dispatch-push.ts`) — native FCM first, Expo only if no native tokens |
| 5 | Parallel: WebSocket / realtime publish for in-app offer (not a substitute for killed-state sound) |
| 6 | Optional re-alert: `dispatch-offer-realert.ts` (gated) can re-notify later |

### Notification identity

| Field | Value |
|-------|--------|
| Templates | `RIDER_NEW_ORDER` (preferred) / `RIDER_DISPATCH_OFFER` |
| Data markers | `type: dispatch_offer`, `gmType: DISPATCH_OFFER`, `event: NEW_ORDER`, (+ serviceType) |
| Channels (MAX / importance 5) | Food: **`rider_dispatch_food_v1`** · Parcel: **`rider_dispatch_parcel_v1`** · Ride: **`rider_dispatch_ride_v1`** · fallback: **`rider_dispatch_offers_alert`** |
| Channel sounds | `food_order.wav` / `parcel_order.wav` / `ride_order.wav` / `notification.wav` |
| Push stack | Template path: FCM + Expo · Direct fallback: native FCM preferred |

### Client wiring (key files)

| File | Role |
|------|------|
| `apps/gatimitra-riderApp/pushBackgroundTask.js` | Handler: mute OS only when dispatch + app active; empty background task body |
| `apps/gatimitra-riderApp/src/lib/riderNotificationHandler.ts` | Same mute rules when installed from `RiderPushSetup` |
| `apps/gatimitra-riderApp/src/components/orders/IncomingRideOrderHost.tsx` | On-duty modal; starts JS chime when offer is shown |
| `apps/gatimitra-riderApp/src/lib/playOrderAlertSound.ts` | `expo-av` / alert playback; default high repeat count for incoming |
| `apps/gatimitra-riderApp/src/components/RiderDispatchRealtime.tsx` | Realtime offer intake (foreground/background process) |
| `apps/gatimitra-riderApp/app.config.js` | Sounds + channel bootstrap |

### Step-by-step flow (Rider)

```
Dispatch offer from assignment engine
  → RIDER_NEW_ORDER / RIDER_DISPATCH_OFFER (+ optional direct FCM fallback)
  → FCM/Expo notification block + service-specific channelId/sound
  → Android posts tray with MAX channel + matching raw/*.wav
       │
       ├─ FOREGROUND
       │    → OS sound muted for dispatch
       │    → IncomingRideOrderHost plays JS chime (repeats) while modal visible
       │    → Realtime can open modal even without relying on push sound
       │
       ├─ BACKGROUND
       │    → OS channel sound (once)
       │    → Background task does not play extra audio
       │    → JS modal/chime only after user brings app forward (or if process still hosts host)
       │
       └─ KILLED
            → OS channel sound once + tray
            → No IncomingRideOrderHost, no JS repeats
            → Reopen: fetch/realtime offer → modal → JS chime starts fresh for that offer
```

---

# B. STATE-BY-STATE RESULT

| App State | Merchant Buzzer | Rider Buzzer | Mechanism | Reliable? | Reason |
|-----------|-----------------|--------------|-----------|-----------|--------|
| **Foreground** | Yes (JS loop) | Yes (JS loop via IncomingRideOrderHost) | Mute OS; `expo-audio` / `expo-av` | **Reliable** (if device volume / silent policy allow) | Full JS runtime; designed ownership |
| **Background** (process alive) | Yes (OS once ± cached clip) | Yes (OS once) | FCM/Expo → NotificationManager → channel sound; Merchant TaskManager may play cache | **Mostly reliable**; OEM may delay | Handler may run; channel sound does not need JS; TaskManager not guaranteed |
| **Killed** / swiped from recents | **One OS beep** (not JS loop) | **One OS beep** (not JS loop) | FCM `notification` block + pre-created channel | **Partial** | No JS; channel sound plays once; delivery depends on FCM + OEM battery |
| **Phone locked** | Same as BG/killed for that process state | Same | Lockscreen-visible channel (`VISIBILITY_PUBLIC`) + sound | **Partial** | Sound usually allowed on MAX channels; OEM “silent lockscreen” / DND can mute |
| **Reopened after event** | Resume remaining JS repeats; open new-order UI | Stop relying on OS; start JS if offer still active | Tap / cold start / realtime poll | **Reliable once JS up** | Deduped session (merchant); rider plays when modal shows offer |

### Can Android play the buzzer in each state?

| State | OS channel sound | JS app chime |
|-------|------------------|--------------|
| Foreground | Suppressed by design | Yes |
| Background | Yes (if not muted for merchant custom cache) | Merchant: optional short cached play; Rider: no |
| Killed | Yes (once), if FCM delivered | **No** |
| Locked | Yes if notification posts | Only if process alive and JS runs |

### Continues / repeats until acknowledge?

| | Merchant | Rider |
|--|----------|-------|
| Foreground | Yes (configured repeats / until stop reason) | Yes while modal + on duty |
| Background / killed | **No** — OS plays channel sound **once** per notification post | **No** |
| Re-alert | Not a continuous siren; new push = new OS play | Optional `DISPATCH_OFFER_REALERT` can fire another push |

### Duplicate sounds / notifications?

| Risk | When |
|------|------|
| Dual Expo + FCM tokens | Same device registered in both tables → possible **double tray / double OS sound** |
| Merchant custom cache + OS | Mitigated: when cache exists, OS sound suppressed and cache played instead |
| Foreground OS + JS | Mitigated: `shouldPlaySound: false` when active |
| Merchant same `eventId` | `knownEventIds` / session dedupe in `newOrderAlertManager` |
| Collapse key | Per-order tags reduce replacement of *different* orders; same order re-push can still re-sound |

---

# C. ROOT CAUSES — why killed-state “buzzer” is weak

If product expectation is **“siren keeps ringing until merchant/rider opens or accepts” while the app is completely killed**, the current implementation **cannot** meet that. Exact reasons:

1. **Sound in killed state is only the Android notification channel clip**, played by `NotificationManager` when FCM delivers a message that includes a `notification` block. That API plays the channel sound **once per posted notification**, not as an app-owned looping MediaPlayer.
2. **`newOrderAlertManager` / `IncomingRideOrderHost` / `playOrderAlertSound` require a running JS runtime.** Comments in merchant code explicitly state: *KILLED — FCM channel sound (this module never runs)*.
3. **`BACKGROUND-NOTIFICATION-TASK` is not a always-on native service.** When the process is gone, Expo TaskManager often **does not** wake long enough (or at all) to run custom audio. Merchant’s cached-sound path in the task is best-effort and **does not apply when fully killed** in practice.
4. **There is no `FirebaseMessagingService` subclass or foreground service** that starts sticky looping audio on `onMessageReceived` for data messages. Architecture deliberately uses **display notifications** (notification block) so the OS shows the tray without JS — which also means **OS owns the sound**.
5. **OEM battery savers** (Samsung, Xiaomi/HyperOS, Oppo/ColorOS, Vivo/Funtouch, etc.) can:
   - Delay or drop FCM when app is “force stopped”
   - Restrict background start / TaskManager
   - Silence or group notification sounds
   - Require “Autostart”, “unrestricted battery”, “lock app in recents”
6. **User channel settings:** If the user muted `merchant_new_orders_alert_v2` / rider dispatch channels, or set importance lower after first create, killed-state sound fails even when FCM arrives (channel sound is immutable without a new channel id).

---

# D. REQUIRED ARCHITECTURE (correct Android design)

To get an audible alert in **foreground, background, killed, and locked**, separate **delivery** from **playback ownership**:

### D1. Non-negotiable delivery layer (already mostly present)

- Keep **high-priority FCM** with a visible `notification` block + **MAX importance channel** + bundled `res/raw` sound so **at least one** alert plays when JS is dead.
- Keep dual token registration (native FCM + Expo) but **dedupe delivery** so one device gets one critical push.
- Preserve deep link / data payload for open → accept flow.

### D2. Reliable “buzzer until ack” layer (missing today)

Pick one production pattern (or combine carefully):

**Option A — Full-screen intent + ongoing high-priority notification (recommended for orders)**  
- On critical incoming order, post an **ongoing** notification (or full-screen intent where policy allows) with a **custom sound / looping ringtone URI** or a short repeating pattern via a **native Foreground Service**.  
- Service starts from FCM (native module) when message arrives, even if JS was dead.  
- Stop service when merchant/rider **accepts, rejects, expires, or opens and dismisses**.  
- JS UI (modal) attaches to the same session id; does not start a second siren.

**Option B — Data-only FCM + native handler**  
- High-priority **data** message → custom `FirebaseMessagingService` → start Foreground Service + MediaPlayer loop.  
- Must still show a user-visible notification (Android 8+/12+ background limits).  
- Harder with Expo managed workflow unless a config plugin adds the service.

**Option C — Accept OS-once + aggressive re-alert**  
- Keep channel sound as the killed-state alert.  
- Backend **re-pushes** every N seconds until ack (rider already has gated realert).  
- Simpler, but spammy, battery-heavy, and still not a continuous siren; OEM may rate-limit.

### D3. State ownership matrix (target)

| State | Sound owner | Stop condition |
|-------|-------------|----------------|
| Foreground | JS or FGS (single owner) | Accept / reject / expire |
| Background | FGS or OS ongoing notif | Same |
| Killed | **Native FGS started by FCM** (or repeating critical pushes) | Same |
| Locked | Same as BG/killed + public lockscreen visibility | Same |

### D4. What not to rely on

- Do not rely on `setNotificationHandler` for killed sound.
- Do not rely on `expo-task-manager` alone for sirens.
- Do not expect channel sound to loop.
- Do not double-play Expo + FCM without idempotent notification ids / collapse keys / client dedupe.

---

# E. FIX PLAN (no code changes yet — safest path)

Goal: add killed/locked continuity **without** breaking existing pushes, tokens, dedupe, accept flows, or current foreground behavior.

### E1. Inventory — touch carefully

| Area | Files | Rule |
|------|-------|------|
| Backend merchant push | `merchant-new-order-notify.ts`, `merchant-push-notify.ts` | Keep payload shape; add optional `alertSessionId` / stop signal only |
| Backend rider push | `rider-dispatch-notify.ts`, `rider-dispatch-push.ts`, `notificationService.ts` | Keep templates + channels; unify realert with session stop |
| FCM provider | `fcmProvider.ts` | Do not strip `notification` block for critical templates |
| Merchant app | `OrderAlertPushHandler.tsx`, `newOrderAlertManager.ts`, `merchantNotificationHandler.ts`, `pushBackgroundTask.js`, `playOrderAlertSound.ts`, `app.config.js` | Keep FOREGROUND mute OS + JS ownership |
| Rider app | `IncomingRideOrderHost.tsx`, `riderNotificationHandler.ts`, `pushBackgroundTask.js`, `RiderPushSetup.tsx`, `app.config.js` | Keep FOREGROUND mute OS + host chime |
| Native channels | `packages/expo-push-kit/plugin/withAndroidPushChannels.js` | New channel id if sound/importance must change |

### E2. Safest phased implementation

**Phase 0 — Measure (no behavior change)**  
- Log per delivery: token type (FCM vs Expo), channelId, app state if known, whether duplicate tokens exist.  
- Confirm production devices have `merchant_new_orders_alert_v2` / `rider_dispatch_*_v1` created and unmuted.

**Phase 1 — Harden what already works (low risk)**  
- Enforce **single delivery** per device (prefer native FCM; skip Expo if native token fresh).  
- Ensure critical pushes always set `priority: critical`, correct channel, `playSound: true`, unique tag per order/offer.  
- Merchant: when opening from killed, always `dismissNativeNewOrderAlerts` before JS chime (already present) to avoid overlap.  
- Document OEM allowlisting for partners/riders.

**Phase 2 — Continuous alert without rewriting accept flow (medium risk)**  
- Add **native Foreground Service + config plugin** (both apps or shared package) that:
  - Starts on critical FCM (new-order / dispatch_offer) if not already running for that `alertSessionId`
  - Plays looping/bundled sound at ringtone usage
  - Stops on: local broadcast from JS accept/reject, notification action, TTL, or backend “offer closed” data push  
- Keep JS modal as UI only; call into native “claim session / stop buzzer” APIs used by existing accept handlers.

**Phase 3 — Optional backend re-alert alignment**  
- Extend rider realert pattern to merchant pending accept with strict caps and cancel-on-accept.  
- Use same idempotency keys so duplicates do not stack five tray items.

### E3. Explicit non-goals / do-not-break checklist

- Do **not** remove FCM token registration or Expo registration without a migration.  
- Do **not** switch critical templates to data-only without a native service ready.  
- Do **not** change channel ids in place (sound immutable) — version to `*_v3` if needed.  
- Do **not** start JS audio from background task *and* leave OS sound on (duplicate).  
- Do **not** alter accept-order / dispatch accept API contracts when adding stop-buzzer hooks.  
- Preserve existing sound assets (`notification.wav`, `food_order.wav`, etc.) unless product renames channels.

### E4. Suggested ownership after fix

| Concern | Owner |
|---------|--------|
| Tray visibility when killed | OS + FCM notification block (unchanged) |
| One-shot fallback sound | Channel `res/raw` (unchanged) |
| Continuous buzzer | Native FGS (new) |
| In-app modal UX | Existing React hosts |
| Stop / dedupe | Shared `alertSessionId` across FCM data + JS + native |

---

## Quick reference — channels & sounds

### Merchant

| Channel id | Importance | Sound |
|------------|------------|-------|
| `merchant_new_orders_alert_v2` | MAX (5) | `notification` ← `assets/sounds/notification.wav` |
| `merchant_new_orders_alert` | MAX (5) | `notification` (legacy) |
| `merchant_new_orders` | MAX (5) | default / none for non-new-order critical |

### Rider

| Channel id | Importance | Sound |
|------------|------------|-------|
| `rider_dispatch_food_v1` | MAX (5) | `food_order` |
| `rider_dispatch_parcel_v1` | MAX (5) | `parcel_order` |
| `rider_dispatch_ride_v1` | MAX (5) | `ride_order` |
| `rider_dispatch_offers_alert` | MAX (5) | `notification` |

---

## OEM / battery notes (Samsung, Xiaomi, Oppo, Vivo, …)

Even with a correct FCM + MAX channel setup:

- **Force stop** from App Info often blocks all FCM until next manual open.  
- **Battery unrestricted / Autostart / “Allow background activity”** often required for TaskManager and for timely FCM.  
- Some OEMs redirect custom channel sounds to a generic tone.  
- DND / work profile / Focus mode can mute notification sounds while still showing the shade item.  
- A Foreground Service with a visible ongoing notification is the industry pattern food-delivery apps use for killed-state reliability; pure Expo JS cannot fully replace it.

---

## Source map (primary)

**Backend:** `merchant-new-order-notify.ts`, `merchant-push-notify.ts`, `rider-dispatch-notify.ts`, `rider-dispatch-push.ts`, `dispatch-offer-realert.ts`, `notificationService.ts`, `fcmProvider.ts`, `eventBus.ts`  

**Merchant app:** `pushBackgroundTask.js`, `merchantNotificationHandler.ts`, `OrderAlertPushHandler.tsx`, `newOrderAlertManager.ts`, `playOrderAlertSound.ts`, `app.config.js`  

**Rider app:** `pushBackgroundTask.js`, `riderNotificationHandler.ts`, `IncomingRideOrderHost.tsx`, `RiderPushSetup.tsx`, `playOrderAlertSound.ts`, `app.config.js`  

**Native bootstrap:** `packages/expo-push-kit/plugin/withAndroidPushChannels.js`
