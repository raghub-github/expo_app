# GAP REPORT — Merchant & Rider Continuous Buzzer Architecture

**Date:** 2026-09-19  
**Method:** Code verification against target architecture (not assuming prior audit).  
**Status:** Analysis only — no code changes.

**Target rules checked:** (1) FCM without JS (2) visible notification block (3) MAX channels before FCM (4) native FCM handling for killed alerts (5) continuous buzzer ≠ React when dead (6) native FGS owns continuous buzzer (7) unique alertSessionId (8) single sound owner (9) accept/reject/expire stops native buzzer (10) reopen attaches to session (11) no FCM+Expo duplicates (12) don’t break tokens/templates/realtime/accept/dedupe.

---

## Direct answers A–T (verified)

| # | Question | Answer |
|---|----------|--------|
| A | Does a `FirebaseMessagingService` actually exist (app-owned)? | **No** in repo source. No `.java`/`.kt` messaging service for merchant/rider. Expo Notifications may embed a generic receiver at prebuild time, but there is **no custom service** that starts a continuous alert. |
| B | Can FCM start native alert handling when JS is dead? | **Only OS tray + channel sound once.** No app-owned native alert pipeline. |
| C | Can a native Foreground Service start from the FCM event? | **No** — no order/dispatch FGS exists. |
| D | Required Android permissions declared? | **Partial.** `POST_NOTIFICATIONS` yes (both). Merchant: `USE_FULL_SCREEN_INTENT`, `WAKE_LOCK`, battery ignore via `withMerchantOrderWake`. Rider: `FOREGROUND_SERVICE` + `FOREGROUND_SERVICE_LOCATION` (location only). **Missing for continuous buzzer:** `FOREGROUND_SERVICE` / `FOREGROUND_SERVICE_MEDIA_PLAYBACK` (or `SPECIAL_USE`) on merchant; media-playback FGS type on rider. |
| E | Service declared in AndroidManifest? | **No** alert FGS (no committed `android/` tree; plugins do not emit one). |
| F | Service exported/permission correct? | **N/A** — service missing. |
| G | Foreground-service type correct? | **N/A** — missing. Rider’s FGS type is **location**, not alert audio. |
| H | Channel created natively before FCM? | **Yes (install / process start)** via `PushChannelBootstrap` from `withAndroidPushChannels.js` + `app.config.js` channel lists. Also JS recreation when app opens (`NewOrderAutoOpenHandler`). |
| I | Can custom sound loop? | **No.** Channel `setSound` plays **once** per notification. JS repeats only while process alive. |
| J | Can loop be stopped from JS after accept/reject? | **JS chime yes** (`stopNewOrderAlert` / `stopOrderAlertSound`). **Native continuous loop N/A** (doesn’t exist). Tray dismiss via `dismissNativeNewOrderAlerts` (merchant). |
| K | Process killed while buzzer running? | JS audio **stops**. Tray may remain. No FGS to survive. |
| L | Phone locked? | Heads-up + channel sound **possible** if FCM posts (MAX + `VISIBILITY_PUBLIC`). Auto-wake is incomplete (see FSI). |
| M | After reboot? | Boot reconnect **local** notification asks user to reopen — **does not** resume order buzzer. FCM resumes only after app/process allowed again. |
| N | Force-stop from Settings? | FCM typically **blocked** until user manually opens app. Current architecture cannot recover without that. |
| O | Battery / OEM restrictions? | Can delay/drop FCM, block TaskManager, mute channels. No FGS mitigates this today. |
| P | Is full-screen intent required / appropriate? | **Permission declared (merchant) but FCM never sets `fullScreenIntent`.** Play policy restricts FSI; food/dispatch usually use high-priority notifications + optional FGS, not call-style FSI. **Not required** if FGS+ongoing notif is used; current FSI wiring is incomplete/misleading. |
| Q | Notification permissions handled? | Merchant: yes (`merchantNotificationPermission.ts`, `NotificationSetup`). Rider: via `usePushPermissionController` / expo-push-kit + `POST_NOTIFICATIONS` in config. |
| R | FCM + Expo duplicate alerts? | **Mostly mitigated:** merchant `selectMerchantPushDelivery` skips Expo when native tokens exist; `notificationService` prefers native over Expo. Residual risk: multiple native tokens, template path + direct fallback race, stale Expo-only path. |
| S | Same order/offer → multiple buzzer sessions? | Merchant JS session deduped by `eventId`/`orderId`. Rider `soundPlayedRef` per offer. **OS** can still re-sound on realert/re-push. No native session store. |
| T | Old offer buzzing after accept/expire? | **JS stops** on accept/reject/expire/miss. **No native siren to stop.** Stale **tray** items can remain until dismissed; no backend “stop alert” data message. |

---

## 1. ALREADY IMPLEMENTED

### Backend delivery (works for one-shot OS alerts)

| What works | Files |
|------------|-------|
| Merchant new-order critical push with title/body, channel `merchant_new_orders_alert_v2`, sound `notification`, per-order collapse/tag, `alertSessionId` in data | `backend/src/lib/merchant-new-order-notify.ts`, `merchant-push-notify.ts` |
| Prefer native FCM over Expo when native tokens exist | `merchant-push-notify.ts` (`selectMerchantPushDelivery`), `notificationService.ts` (`dispatchExpoRow` → `prefer_native_over_expo`) |
| Visible Android `notification` block (not data-only) for critical templates | `fcmProvider.ts` (`wantsNotificationBlock`), `mustShowWhenKilled` in `notificationService.ts` |
| Event-bus skip of twin `MERCHANT_NEW_ORDER` push when store path already used | `eventBus.ts` (`skipMerchantTemplate` for `MERCHANT_NEW_ORDER` + storeId) |
| Secondary `MERCHANT_NEW_ORDER` send is **in_app channel only** (avoids twin FCM from that call) | `merchant-new-order-notify.ts` (`channel: "in_app"`) |
| Rider dispatch templates `RIDER_NEW_ORDER` / `RIDER_DISPATCH_OFFER`, critical priority, service channels/sounds | `rider-dispatch-notify.ts`, `notificationService.ts` (`channelIdForRecipient`, `soundForRecipient`) |
| Direct FCM fallback when template has no tokens | `rider-dispatch-push.ts` |
| Bounded rider re-alert (one extra push per wave/rider) | `dispatch-offer-realert.ts` |
| Expo `experienceId` stamped on FCM data for Expo-killed rendering | `fcmProvider.ts` (`stampExpoIdentity`) |

### Native channel bootstrap (works)

| What works | Files |
|------------|-------|
| Install-time `PushChannelBootstrap` creates MAX channels + `res/raw` sounds before JS | `packages/expo-push-kit/plugin/withAndroidPushChannels.js` |
| Merchant/Rider `app.config.js` lists channels + packs WAV assets | `apps/merchant_app/app.config.js`, `apps/gatimitra-riderApp/app.config.js` |

### Merchant app (foreground / process-alive)

| What works | Files |
|------------|-------|
| Foreground: mute OS sound, JS repeating chime | `merchantNotificationHandler.ts`, `pushBackgroundTask.js`, `newOrderAlertManager.ts`, `playOrderAlertSound.ts` |
| Background (process alive): OS channel sound; optional cached custom sound via TaskManager | `pushBackgroundTask.js` |
| Accept/reject/expire/dismiss stops **JS** alert + dismisses tray | `IncomingOrderModal.tsx` → `stopNewOrderAlert`, `newOrderAlertManager.ts` |
| Cold start / tap: drain presented notifs, resume remaining JS repeats | `OrderAlertPushHandler.tsx` |
| Session persistence + eventId dedupe for JS | `newOrderAlertManager.ts` |
| Wake permissions + lock-screen activity flags | `plugins/withMerchantOrderWake.js` |
| POST_NOTIFICATIONS UX | `lib/merchantNotificationPermission.ts`, `NotificationSetup.tsx` |
| Boot reconnect prompt (reopen app) | `plugins/withBootReconnectNotification.js` |

### Rider app (foreground / process-alive)

| What works | Files |
|------------|-------|
| Foreground: mute OS for dispatch; `IncomingRideOrderHost` plays JS chime | `riderNotificationHandler.ts`, `pushBackgroundTask.js`, `IncomingRideOrderHost.tsx`, `playOrderAlertSound.ts` |
| Background/killed: OS channel sound once (via FCM notification block) | Backend + channel bootstrap |
| Accept/reject/expire/miss stops **JS** sound | `IncomingRideOrderHost.tsx` (`stopOrderAlertSound`) |
| Realtime offer intake parallel to push | `RiderDispatchRealtime.tsx`, `rider-dispatch-notify.ts` WS |
| Token registration via expo-push-kit controller | `RiderPushSetup.tsx` |
| Location FGS permissions (unrelated to buzzer) | `app.config.js` |

---

## 2. MISSING

Every gap vs target continuous-buzzer architecture:

| Missing component | Where it must be added |
|-------------------|------------------------|
| Custom `FirebaseMessagingService` (or Expo config-plugin equivalent) that handles critical data on killed process | **CREATE** native module/plugin under e.g. `packages/expo-push-kit` or `apps/*/plugins/withCriticalOrderAlertFgs.js` generating Java/Kotlin |
| Native **Foreground Service** owning continuous MediaPlayer/Ringtone loop keyed by `alertSessionId` | Same plugin → `OrderAlertForegroundService` / `DispatchAlertForegroundService` |
| Manifest entries: service, `foregroundServiceType`, `exported=false`, stop/action intents | Generated `AndroidManifest` via config plugin |
| Permissions: merchant `FOREGROUND_SERVICE` + correct type (`mediaPlayback` / `specialUse` as policy allows); ensure Android 14+ type declared | Merchant `app.config.js` / wake plugin; rider alert FGS type (not only location) |
| FCM → start FGS path when JS dead (and optionally suppress double OS sound) | Messaging service `onMessageReceived` / notification-open bridge |
| Native stop API callable from JS (`stopAlert(sessionId)`) + notification action buttons | Native module + wire from accept/reject/expire |
| Single sound-owner lock across JS ↔ native | Shared native singleton + JS claims/releases |
| Reopen attaches to **native** session (not only JS SecureStore session) | Native query “active alert?” on JS boot |
| Backend optional **stop-alert** silent/data push when order accepted elsewhere / expired | `merchant-push-notify.ts` / `rider-dispatch-notify.ts` (or status hooks) |
| Merchant continuous buzzer while killed | Entire native stack above |
| Rider continuous buzzer while killed | Same |
| Looping sound resource / Ringtone URI strategy (channel sound cannot loop) | `res/raw` + FGS player; possibly new channel for **ongoing** silent tray while FGS plays audio |
| Full-screen intent on FCM payload (only if product insists) | `fcmProvider.ts` — currently **absent**; permission alone does nothing |
| Rider `USE_FULL_SCREEN_INTENT` / show-when-locked (only if needed) | Rider plugin — currently merchant-only |
| Hard guarantee one notification per device when multiple native FCM token rows exist | Token selection / collapse hardening in `merchant-push-notify.ts` / rider loaders |

---

## 3. INCORRECT IMPLEMENTATION

Code that exists but **does not** satisfy killed/background continuous-alert goals:

| Item | Why it fails the target |
|------|-------------------------|
| `newOrderAlertManager` “BACKGROUND = OS only; KILLED = FCM channel” | Correct for one-shot OS sound; **incorrect** if product expects continuous buzzer — documents the gap as intentional. |
| `pushBackgroundTask.js` TaskManager playing cached sound | Only when process can be woken; **not reliable when killed**; not an FGS; can race with OS channel sound. |
| `setNotificationHandler` mute/play rules | **Do not run when process is dead** — cannot own killed-state audio. |
| `IncomingRideOrderHost` chime | Requires on-duty + JS mount; **zero effect when killed**. |
| `withMerchantOrderWake` + comments about FSI | Declares `USE_FULL_SCREEN_INTENT` and MainActivity lock flags, but **`fcmProvider` never sets `fullScreenIntent`** — auto-open-over-lock **not actually implemented**. |
| `wakeMerchantAppForOrder` in `NewOrderAutoOpenHandler` | Runs from JS push handler — **needs living process**; cannot wake from fully killed. |
| Channel sound as “buzzer” | Android plays **once**; cannot repeat until ack. |
| Rider `FOREGROUND_SERVICE_LOCATION` | Exists for GPS, **not** for dispatch audio; does not meet target #6. |
| Merchant JS `alertSessionId` in push data | Present in payload but **no native consumer** binds a looping service to it. |
| Boot reconnect notification | UX prompt only — **does not** restore or start order alert audio. |
| Assuming Expo’s built-in FCM path = “native FCM handling for continuous alerts” | Expo displays the notification; it does **not** implement your FGS buzzer contract. |

---

## 4. RISK / EDGE CASES

| Area | Risk |
|------|------|
| **OEM** (Samsung/Xiaomi/Oppo/Vivo) | Delayed FCM, killed TaskManager, muted custom sounds, need autostart / unrestricted battery. |
| **Android 12+** | Exact-alarm / FSI restrictions; background start limits — FGS from FCM must follow notification + type rules. |
| **Android 13+** | Without `POST_NOTIFICATIONS`, tray + channel sound silent/blocked. |
| **Android 14+** | FGS type mandatory; misuse of `mediaPlayback`/`specialUse` can cause Play rejection or runtime crash. |
| **Android 15+** | Further FSI / background activity tightening — prefer ongoing FGS notification over FSI. |
| **Force-stop** | No FCM until manual launch — **unfixable** by FGS until user opens app once. |
| **Locked screen** | Sound may play; UI may not; incomplete FSI. |
| **Duplicate push** | Prefer-native mitigates Expo+FCM; multiple native tokens / realert / collapse edge cases remain. |
| **Duplicate buzzer** | Foreground OS+JS mitigated by mute; background cache+OS race on merchant; future FGS+JS double-play if claim lock missing. |
| **Stale offers** | JS stops on miss/accept; tray can linger; realert can re-notify after UI closed; no native stop for remote accept-by-other-rider. |
| **Reboot** | Must reopen app; no sticky FGS across reboot without BOOT + rehydrate logic. |

---

## 5. REQUIRED ARCHITECTURE

```
Backend critical event
  (merchant NEW_ORDER / rider DISPATCH_OFFER)
    → notificationService / direct FCM
    → FCM message:
         • Visible notification block (tray) OR data + native post
         • data: alertSessionId, orderId/offerId, type, stop=false
         • Prefer single native token per device
    → Android (process may be dead)
         → App FirebaseMessagingService / Expo plugin handler
         → Start OrderAlertForegroundService(sessionId)
              • startForeground(ongoing notif, MAX channel)
              • MediaPlayer/Ringtone loop (NOT channel one-shot alone)
              • Store active sessionId
    → User opens app / already open
         → JS UI (IncomingOrderModal / IncomingRideOrderHost)
         → Claim session: mute OS residual; do NOT start second player
         → Attach to same alertSessionId
    → Accept / reject / expire / missed / cancelled
         → JS calls NativeModules.OrderAlert.stop(sessionId)
         → Service stops audio + cancels ongoing notif
         → Optional backend data push { stop: true, alertSessionId } for multi-device / remote resolve
```

**Sound ownership rule**

| State | Owner |
|-------|--------|
| Foreground | Exactly one: prefer native FGS **or** JS — pick one product-wide; other muted |
| Background / killed | Native FGS only |
| After reopen | Attach; never `play()` again if same session active |

---

## 6. IMPLEMENTATION PLAN (lowest → highest risk)

1. **Instrument & confirm** production tokens/channels (no behavior change).  
2. **Harden delivery dedupe** (one native token primary; keep templates/realtime).  
3. **Add native FGS + Messaging hook via Expo config plugin** (both apps or shared package); start/stop by `alertSessionId`.  
4. **Wire JS accept/reject/expire/miss → native stop**; cold start query active session.  
5. **Choose single foreground owner** (recommend: native FGS always for critical; JS UI only) to avoid dual audio.  
6. **Adjust channels:** ongoing silent/heads-up channel vs one-shot legacy; version ids if needed (`*_v3`).  
7. **Optional backend stop-alert** on terminal order/offer events.  
8. **Optional merchant realert** (capped) — only after FGS exists, or as weak fallback.  
9. **FSI** — only if legal/product requires; otherwise leave permission unused or remove to avoid false confidence.  
10. **Play Console / OEM QA** on Android 13–15 devices.

---

## 7. FILE-BY-FILE CHANGE LIST

### Backend

| File | Action |
|------|--------|
| `backend/src/lib/merchant-new-order-notify.ts` | **MODIFY** (optional): ensure `alertSessionId` stable; later emit stop events |
| `backend/src/lib/merchant-push-notify.ts` | **MODIFY**: token dedupe; optional stop-alert helper; keep prefer-native |
| `backend/src/lib/rider-dispatch-notify.ts` | **MODIFY**: pass/stop `alertSessionId`; keep WS + templates |
| `backend/src/lib/rider-dispatch-push.ts` | **MODIFY**: align session ids; keep fallback |
| `backend/src/modules/notifications/notificationService.ts` | **NO CHANGE** initially; later optional stop template / data |
| `backend/src/modules/notifications/fcmProvider.ts` | **MODIFY** only if adding FSI or sticky/ongoing flags — carefully |
| `backend/src/lib/dispatch-offer-realert.ts` | **NO CHANGE** initially; tune after FGS (avoid double sirens) |
| `backend/src/modules/notifications/eventBus.ts` | **NO CHANGE** (skip twin already correct) |

### Merchant

| File | Action |
|------|--------|
| `pushBackgroundTask.js` | **MODIFY**: stop competing cached playback once FGS owns audio |
| `merchantNotificationHandler.ts` | **MODIFY**: align mute rules with FGS ownership |
| `OrderAlertPushHandler.tsx` | **MODIFY**: attach/stop native session on cold start/tap |
| `newOrderAlertManager.ts` | **MODIFY**: claim/release native; or demote to UI-only timing |
| `playOrderAlertSound.ts` | **MODIFY** or **NO CHANGE** if FGS owns all critical audio |
| `IncomingOrderModal.tsx` | **MODIFY**: call native stop on accept/reject/expire (in addition to JS) |
| `app.config.js` | **MODIFY**: plugin + permissions + FGS type |
| `plugins/withMerchantOrderWake.js` | **MODIFY** or leave; FSI only if used |
| `plugins/withCriticalOrderAlertFgs.js` (new) | **CREATE** |

### Rider

| File | Action |
|------|--------|
| `pushBackgroundTask.js` | **MODIFY**: align with FGS |
| `riderNotificationHandler.ts` | **MODIFY**: mute when FGS playing |
| `IncomingRideOrderHost.tsx` | **MODIFY**: native stop on accept/reject/expire/miss; attach on show |
| `RiderPushSetup.tsx` | **NO CHANGE** for tokens; optional permission prompts |
| `playOrderAlertSound.ts` | **MODIFY** or demote if FGS owns |
| `app.config.js` | **MODIFY**: alert FGS plugin + permissions/types |
| `plugins/withCriticalDispatchAlertFgs.js` (new) | **CREATE** |

### Native / shared

| File | Action |
|------|--------|
| `packages/expo-push-kit/plugin/withAndroidPushChannels.js` | **MODIFY** if new ongoing channel ids/sounds |
| New: `OrderAlertForegroundService.java` (+ stop receiver) | **CREATE** |
| New: `CriticalAlertMessagingService.java` or integrate with Expo’s | **CREATE** |
| `AndroidManifest.xml` | **CREATE via plugin** (not hand-maintained; no committed android/ today) |
| Existing location FGS (rider) | **NO CHANGE** / **DO NOT DELETE** |

### Delete?

| Item | Action |
|------|--------|
| Nothing required to delete initially | **NO DELETE** — keep TaskManager/JS chime until FGS proven, then optionally remove competing background cache playback |

---

## 8. BUILD REQUIREMENTS

- **EAS/dev-client rebuild** required (config plugins, permissions, new Java services, raw sounds).  
- Expo prebuild generates `android/`; plugins must inject:
  - `PushChannelBootstrap` (already)
  - New FGS + Messaging service
  - Permissions: `POST_NOTIFICATIONS`, `FOREGROUND_SERVICE`, typed FGS permission, `WAKE_LOCK`; evaluate `FOREGROUND_SERVICE_MEDIA_PLAYBACK` / Play-accepted type  
- Package WAVs already via `expo-notifications` `sounds` — keep.  
- If new channel sound/importance: **new channel id** (immutable sound).  
- Google Services / FCM: keep existing `google-services.json` paths.  
- Play Console: declare FGS type justification; avoid unjustified FSI.  
- Test matrix: Android 12–15; OEM battery modes; force-stop; reboot; lock screen; accept from partnersite while app killed.

---

## 9. REGRESSION CHECKLIST

Do **not** break:

| Area | Guard |
|------|-------|
| Push token registration | Leave `NotificationSetup` / `RiderPushSetup` / expo-push-kit sync intact |
| FCM Admin send | Keep `sendFcmV1` notification block for critical templates |
| Expo notifications | Keep Expo path as fallback when no native token |
| Merchant new-order tray | Keep `notifyMerchantStoreNewOrderPush` + channel v2 |
| Rider dispatch tray | Keep templates + direct fallback |
| Realtime offers | Keep WS publish parallel; FGS must not block |
| Accept / reject APIs | Only add native stop **after** existing mutate success paths |
| Missed-offer | Keep `offer-missed` + stop sound |
| Notification dedupe | Keep idempotency keys / prefer-native / collapse tags |
| Existing foreground buzzer | Until FGS owns audio, keep JS path; then switch with feature flag |

---

## 10. FINAL VERDICT

### What is missing
- Entire **native continuous-buzzer stack**: custom FCM handler, Foreground Service, manifest/permissions for alert FGS, JS↔native stop/attach, looping audio independent of channel one-shot.
- Real **killed-state siren until ack** (today: one OS beep only).
- Working **FSI wake** (permission without FCM `fullScreenIntent`).
- Backend **stop-alert** for remote/terminal resolution (optional but needed for stale multi-device).

### What must be fixed
- Treat channel sound + JS TaskManager as **insufficient** for target #5–#10.
- Implement FGS-owned alert with `alertSessionId` and single owner.
- Wire stop on accept/reject/expire/miss to **native**, not only JS.
- Cold start must **attach**, not start a second buzzer.
- Clarify/remove misleading FSI comments or implement FSI properly under Play policy.

### What can remain unchanged
- Critical push templates, channels v2/v1, WAV assets, prefer-native delivery, eventBus twin-skip, in_app secondary MERCHANT_NEW_ORDER, rider WS + realert gate, Expo token registration, accept/reject/miss API contracts, merchant JS session manager (as UI/session layer), rider Incoming modal UX, location FGS.

**Bottom line:** Delivery of a **visible, MAX-channel, one-shot** OS notification when the app is killed is largely implemented. The **target continuous native buzzer architecture is not implemented** for either Merchant or Rider. Do not code until product confirms: FGS-owned loop (recommended) vs capped backend re-alert fallback.
