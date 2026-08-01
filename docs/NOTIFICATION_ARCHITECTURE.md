# Gatimitra Notification Architecture

This document is the source of truth for the enterprise notification system across **backend, three mobile apps (customer, merchant, rider), partnersite, dashboard, and cxsite**. It supersedes any ad-hoc notification code paths.

---

## 1. Goal

> One centralised `NotificationService` is the single entry point for every push, in-app, browser, scheduled, automatic, manual, silent, rich, deep-linked, image, action-button, topic, broadcast, individual or multi-user notification across the platform.
>
> No controller ever talks to a notification carrier (Expo Push, FCM, APNs, browser-push, Socket.io) directly. Everything goes through `NotificationService`.

---

## 2. Architecture

```
┌────────────────────────────────────────────────────────────────────┐
│                          Controllers (any module)                  │
│   order.routes.ts │ payment.routes.ts │ super-admin/notif.routes   │
└────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌────────────────────────────────────────────────────────────────────┐
│                       NotificationService                          │
│   • sendToUser/Users/Role/Topic/Broadcast                          │
│   • schedule / cancel / retry / replaceVariables / saveHistory     │
│   • applies notification_templates + notification_user_prefs      │
│   • writes notification_dispatch_logs row BEFORE enqueue (audit-first)      │
└────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌────────────────────────────────────────────────────────────────────┐
│                    BullMQ queues (Redis)                           │
│   q.push.send  │  q.notification.broadcast  │  q.notification.scheduled │
└────────────────────────────────────────────────────────────────────┘
                                  │
            ┌─────────────────────┼─────────────────────┐
            ▼                     ▼                     ▼
┌─────────────────────┐ ┌────────────────────┐ ┌────────────────────┐
│ Expo Push provider  │ │ FCM v1 provider    │ │ Socket.io provider │
│ (mobile, default)   │ │ (web + direct FCM) │ │ (admin in-app)     │
└─────────────────────┘ └────────────────────┘ └────────────────────┘
            │                     │                     │
            ▼                     ▼                     ▼
   Expo → FCM v1 / APNs   Firebase FCM v1     Browser WebSocket
            │                     │                     │
            ▼                     ▼                     ▼
        Device              Device / Web              UI
```

### Why both Expo Push AND FCM v1 providers?

| Use case | Carrier |
|---|---|
| Mobile push to customer/merchant/rider apps | **Expo Push** (uses FCM v1 internally for Android, APNs for iOS) |
| Browser push to partnersite + dashboard | **FCM v1 web** (via VAPID + service worker) |
| Direct FCM token send (super-admin "Send to one device" testing) | **FCM v1** |
| Real-time admin notifications inside super-admin dashboard | **Socket.io** |

Choosing Expo Push as the mobile carrier (instead of `@react-native-firebase/messaging` direct) is the **Phase 0 decision**: it preserves the working device-token base, avoids a multi-week mobile rewrite, and Expo internally routes through FCM v1 — so the "Use FCM v1" requirement is satisfied transparently.

---

## 3. Credentials & env (single source of truth)

### 3.1 Backend (`backend/.env` on laptop and on VPS at `/opt/gatimitra/backend/.env`)

Pick **one** of these three credential sources. The Firebase singleton (`backend/src/config/firebase.ts`) resolves them in this priority order:

```bash
# Option 1 (recommended for VPS) — path to mounted file
GOOGLE_APPLICATION_CREDENTIALS=./credentials/serviceAccountKey.json

# Option 2 (recommended for managed PaaS, single env var) — full JSON inline
# FCM_SERVICE_ACCOUNT_JSON='{"type":"service_account","project_id":"gatimitra-dev-ad500", …}'

# Option 3 (legacy inline trio — still works; used by Firebase Auth before FCM was added)
FIREBASE_PROJECT_ID=gatimitra-dev-ad500
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-…@gatimitra-dev-ad500.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n…\n-----END PRIVATE KEY-----\n"
```

**Phase 0 status:** Option 1 is set. The file is at `backend/credentials/serviceAccountKey.json` (gitignored). The trio (Option 3) is also present and remains the fallback.

### 3.2 Notification worker (`services/notification-worker/.env`)

When the worker starts sending via FCM v1 (Phase 2), it needs the same credentials:
```bash
GOOGLE_APPLICATION_CREDENTIALS=./credentials/serviceAccountKey.json
```
For now (Phase 0/1) it only sends via Expo Push and needs no Firebase credentials.

### 3.3 Mobile apps (customer, merchant, rider — `apps/*/`)

Each app's `.env` (read by `app.config.js` at build time) needs:

```bash
EXPO_PUBLIC_FIREBASE_API_KEY=AIzaSy…                # apiKey from google-services.json client[0].api_key[0]
EXPO_PUBLIC_FIREBASE_PROJECT_ID=gatimitra-dev-ad500
EXPO_PUBLIC_FCM_SENDER_ID=752611559489              # project_number from google-services.json
EXPO_PUBLIC_FIREBASE_APP_ID_ANDROID=1:752611559489:android:…  # mobilesdk_app_id from google-services.json
```

None of these are secrets — they're public identifiers bundled into the APK anyway. The `google-services.json` files themselves are now gitignored (Phase 0) so each developer/CI must place them locally.

**EAS Build:** for production builds, upload `google-services.json` per app as an EAS File secret:
```
eas secret:create --scope project --name GOOGLE_SERVICES_JSON --type file --value ./google-services.json
```
Then in `app.config.js` reference it via `process.env.GOOGLE_SERVICES_JSON`. (We will wire this in Phase 5.)

### 3.4 Browser-push web apps (`partnersite/.env.local`, `dashboard/.env.local`)

```bash
NEXT_PUBLIC_FIREBASE_API_KEY=AIzaSy…
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=gatimitra-dev-ad500.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=gatimitra-dev-ad500
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=gatimitra-dev-ad500.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=752611559489
NEXT_PUBLIC_FIREBASE_APP_ID=1:752611559489:web:…
NEXT_PUBLIC_FIREBASE_VAPID_KEY=BFr…                 # see Phase 6 setup below
```

### 3.5 cxsite (gatimitra.com customer site) — **no Firebase env needed**

Customers receive push via their mobile app, not via the marketing site. Adding browser push here is consent fatigue with no upside.

---

## 4. How to obtain each value (one-time setup)

| Value | Where in Firebase Console |
|---|---|
| `FIREBASE_PROJECT_ID` | Project Settings → General → Project ID |
| `serviceAccountKey.json` (file) | Project Settings → Service Accounts → "Generate new private key" → save downloaded JSON to `backend/credentials/serviceAccountKey.json` |
| `EXPO_PUBLIC_FCM_SENDER_ID` / `MESSAGING_SENDER_ID` | Project Settings → General → "Project number" |
| `EXPO_PUBLIC_FIREBASE_API_KEY` | Project Settings → General → Your apps → Android/Web app → "Web API key" |
| `NEXT_PUBLIC_FIREBASE_VAPID_KEY` (web push) | Project Settings → Cloud Messaging tab → Web configuration → "Generate key pair" → copy the key starting with `B…` |
| `google-services.json` per app | Project Settings → Your apps → click Android app → "Download google-services.json" (one per package name) |

---

## 5. Database schema (Phase 1 deliverable)

```sql
-- Editable per-event templates with variable substitution + locale.
CREATE TABLE notification_templates (
  id              BIGSERIAL PRIMARY KEY,
  code            TEXT UNIQUE NOT NULL,            -- e.g. ORDER_ACCEPTED
  category        TEXT NOT NULL,                   -- order|payment|kyc|wallet|marketing|system
  role            TEXT NOT NULL,                   -- customer|merchant|rider|admin|all
  channel         TEXT NOT NULL,                   -- push|in_app|browser|all
  title_template  TEXT NOT NULL,                   -- "Order accepted by {{merchantName}}"
  body_template   TEXT NOT NULL,
  image_url       TEXT,
  deep_link       TEXT,                            -- e.g. /orders/{{orderId}}
  click_action    TEXT,                            -- optional android click action
  priority        TEXT DEFAULT 'normal',           -- low|normal|high
  sound           TEXT DEFAULT 'default',
  vibration       BOOLEAN DEFAULT TRUE,
  buttons         JSONB,                           -- [{label, action}]
  variables_schema JSONB,                          -- { customerName: "string", orderId: "string" }
  locale          TEXT DEFAULT 'en',
  version         INT DEFAULT 1,
  enabled         BOOLEAN DEFAULT TRUE,
  retry_count     INT DEFAULT 3,
  expiry_seconds  INT DEFAULT 86400,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now(),
  updated_by      TEXT
);

-- One row per "send job" submitted (campaign or one-off automatic).
CREATE TABLE notification_campaigns (
  id              BIGSERIAL PRIMARY KEY,
  name            TEXT NOT NULL,
  template_code   TEXT REFERENCES notification_templates(code),
  target_filter   JSONB NOT NULL,                  -- {role:"customer", city:"Kolkata", subscription:"active"}
  variables       JSONB,                           -- baked-in vars (offer code etc.)
  scheduled_at    TIMESTAMPTZ,                     -- NULL => send immediately
  status          TEXT DEFAULT 'draft',            -- draft|scheduled|running|completed|cancelled|failed
  sent_count      INT DEFAULT 0,
  delivered_count INT DEFAULT 0,
  clicked_count   INT DEFAULT 0,
  failed_count    INT DEFAULT 0,
  started_at      TIMESTAMPTZ,
  finished_at     TIMESTAMPTZ,
  created_by      TEXT,
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- One row per actual delivery attempt (this is the audit trail + analytics source).
CREATE TABLE notification_dispatch_logs (
  id              BIGSERIAL PRIMARY KEY,
  notification_id UUID UNIQUE DEFAULT gen_random_uuid(),
  campaign_id     BIGINT REFERENCES notification_campaigns(id),
  template_code   TEXT,
  recipient_user_id TEXT NOT NULL,
  recipient_role  TEXT NOT NULL,
  device_token    TEXT,
  device_id       TEXT,
  platform        TEXT,                            -- android|ios|web
  channel         TEXT,                            -- push|in_app|browser
  title           TEXT,
  body            TEXT,
  image_url       TEXT,
  deep_link       TEXT,
  priority        TEXT,
  status          TEXT DEFAULT 'queued',           -- queued|sent|delivered|clicked|failed|expired
  error           TEXT,
  queued_at       TIMESTAMPTZ DEFAULT now(),
  sent_at         TIMESTAMPTZ,
  delivered_at    TIMESTAMPTZ,
  clicked_at      TIMESTAMPTZ,
  expired_at      TIMESTAMPTZ,
  revoked_at      TIMESTAMPTZ,                      -- super-admin "Block": hidden from /inbox, kept for audit (0482)
  metadata        JSONB
);
CREATE INDEX ON notification_dispatch_logs (recipient_user_id, queued_at DESC);
CREATE INDEX ON notification_dispatch_logs (campaign_id, status);
CREATE INDEX ON notification_dispatch_logs (status) WHERE status IN ('queued','failed');

-- Per-user, per-type preferences for opt-outs.
CREATE TABLE notification_user_prefs (
  user_id   TEXT NOT NULL,
  type      TEXT NOT NULL,                         -- template_code OR category
  push      BOOLEAN DEFAULT TRUE,
  in_app    BOOLEAN DEFAULT TRUE,
  browser   BOOLEAN DEFAULT TRUE,
  email     BOOLEAN DEFAULT FALSE,
  PRIMARY KEY (user_id, type)
);

-- Global platform settings (rate limits, default channel, quiet hours…).
CREATE TABLE notification_settings (
  key       TEXT PRIMARY KEY,
  value     JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now(),
  updated_by TEXT
);
```

Existing tables to reuse, **not duplicate**:
- `expo_push_tokens` — keep; primary mobile token registry
- `merchant_store_push_tokens` — keep; per-store merchant device tokens
- `user_device_sessions` — keep; device identity / "logged in" tracking
- `merchant_store_notifications`, `order_notifications` — keep; legacy in-app inbox tables (Phase 5 will migrate these into a unified `notification_inbox` view backed by `notification_dispatch_logs`)

---

## 6. Phased rollout

| Phase | Scope | Risk | Estimated effort |
|---|---|---|---|
| **0** (done) | Singleton + env fix + gitignore + doc | Low | 1 hour |
| **1** | DB migrations for the 5 new tables | Low | 1 day |
| **2** | `NotificationService` + template renderer + scheduled poller + FCM v1 direct provider | Medium | 2 days |
| **3** | Wire all 63 automatic notification events through `NotificationService` (per the spec's lists) | Medium | 1 day |
| **4** | Super Admin "Notifications" module (Dashboard, Templates, Campaigns, Scheduled, Drafts, History, Analytics, Channels, Topics, Devices, Logs, Failures, Settings) | High — large UI surface | 5-7 days |
| **5** | Mobile in-app notification center + preferences + badge count + deep links (one screen per app × 3) | Medium | 2 days per app |
| **6** | Browser push for partnersite + dashboard (service worker + foreground handler + permission UI) | Medium — needs VAPID key | 2 days |
| **7** | Testing, observability (Grafana panels), `NOTIFICATIONS_V2_ENABLED` feature flag rollout, rollback plan | Low | 2 days |

Each phase ships behind no flag for the schema; behind `NOTIFICATIONS_V2_ENABLED` for the serving path until Phase 7. Phase 4 is the largest by far and will be broken into sub-phases when we get there.

---

## 7. Rollback strategy

- Schema migrations are **additive only** (no drops, no destructive ALTER). If we revert a phase, the new tables remain but are unread; old code paths keep working.
- The `NOTIFICATIONS_V2_ENABLED` feature flag (Phase 7) gates routing: when off, the existing `enqueuePush` direct path is used, exactly as today. When on, the new `NotificationService` path is used.
- The notification-worker is a separate container — we can roll back just the worker independently of the backend.
- Templates are seeded via a one-shot SQL script that's idempotent (`ON CONFLICT (code) DO NOTHING`).

---

## 8. Generating the Web VAPID key (needed for Phase 6)

1. Open https://console.firebase.google.com → select project `gatimitra-dev-ad500`.
2. Click ⚙ → **Project settings** → **Cloud Messaging** tab.
3. Scroll to **Web configuration** (towards the bottom).
4. Under **Web Push certificates**, click **Generate key pair**.
5. Copy the long string starting with `B…` (about 88 chars).
6. Paste it into both:
   - `partnersite/.env.local` → `NEXT_PUBLIC_FIREBASE_VAPID_KEY=B…`
   - `dashboard/.env.local`   → `NEXT_PUBLIC_FIREBASE_VAPID_KEY=B…`
7. Add the same `NEXT_PUBLIC_FIREBASE_VAPID_KEY=` placeholder to the EAS Build / CI secrets so production builds also have it.

Do this **before** we start Phase 6 — without it, browser push subscription will fail silently.

---

## 9. Delivered code map (Phases 1–7)

### Backend
- `backend/drizzle/0385_notification_v2_schema.sql` — 5 new tables + trigger
- `backend/drizzle/0386_notification_templates_seed.sql` — 55 automatic-event templates
- `backend/drizzle/0387_notification_templates_seed_additions.sql` — 8 templates for existing enqueuePush callers
- `backend/src/config/firebase.ts` — Firebase Admin singleton (auth + FCM)
- `backend/src/modules/notifications/`
  - `types.ts` — public contract
  - `templateRenderer.ts` — safe `{{var}}` substitution + missing-var detection
  - `preferences.ts` — per-user opt-outs (critical priority bypasses)
  - `targetResolver.ts` — resolves TargetFilter → recipients (users, roles, stores, orders, topics, device tokens)
  - `fcmProvider.ts` — direct FCM v1 send + topic subscribe/unsubscribe
  - `db.ts` — templates/logs/campaigns/settings persistence
  - `notificationService.ts` — the ONE entry point (`send`, `sendToUser`, `sendToUsers`, `sendToRole`, `sendToTopic`, `sendBroadcast`, `schedule`, `cancel`, `previewTemplate`, `markClicked`)
  - `scheduledPoller.ts` — Redis-locked poller for scheduled campaigns
  - `notification.routes.ts` — admin + end-user REST + `/v1/notifications/admin/users/:userId/send`
  - `index.ts` — barrel export
- `backend/src/config/env.ts` — added `GOOGLE_APPLICATION_CREDENTIALS`, `FCM_SERVICE_ACCOUNT_JSON`, `BACKEND_SCHEDULE_TICK_SECRET`, `NOTIFICATIONS_V2_ENABLED`
- `backend/src/index.ts` — wires notification routes + starts scheduled poller
- Refactored 8 existing `enqueuePush` callers → `sendNotification({templateCode,...})`

### Dashboard (super-admin UI)
- `dashboard/src/app/dashboard/super-admin/notifications/`
  - `layout.tsx` — side navigation
  - `page.tsx` — Dashboard tile (today counts, top templates, top campaigns)
  - `templates/page.tsx` — CRUD with filter + edit + create drawers
  - `campaigns/page.tsx` — list + create (draft/now/scheduled) with preview
  - `scheduled/page.tsx` — scheduled queue with cancel
  - `history/page.tsx` — paged logs with filters
  - `analytics/page.tsx` — raw summary
  - `devices/page.tsx` — placeholder for Phase 7 device browser
  - `logs/page.tsx` — failures view
  - `settings/page.tsx` — global config viewer
- `dashboard/src/app/api/super-admin/notifications/**` — 7 proxy routes → backend admin endpoints (via BACKEND_SCHEDULE_TICK_SECRET)
- `dashboard/src/lib/notif-backend.ts` — proxy helper
- `dashboard/src/app/dashboard/super-admin/page.tsx` — added "Notifications v2" landing card
- `dashboard/public/firebase-messaging-sw.js` — web push service worker
- `dashboard/src/lib/browser-push/firebase-web.ts` — web push client (permission, register, foreground handler)

### Partnersite
- `partnersite/public/firebase-messaging-sw.js` — web push service worker
- `partnersite/src/lib/browser-push/firebase-web.ts` — web push client

### Mobile SDK (shared across 3 apps)
- `packages/expo-push-kit/src/inbox.ts` — REST client for `/v1/notifications/inbox`, `/click`, `/read`, `/read-all`, `/preferences`
- `packages/expo-push-kit/src/InboxScreen.tsx` — reusable RN screen (list, mark read, mark all read, deep-link tap)
- `packages/expo-push-kit/src/index.ts` — exports the above

### Mobile app wrappers
- `apps/customer_app/app/profile/notifications.tsx` — customer inbox screen
- `apps/merchant_app/app/(tabs)/profile/notifications.tsx` — merchant inbox screen
- Rider app: existing `apps/gatimitra-riderApp/app/notifications.tsx` left in place (has its own custom screen — migrate in a future sprint)

## 10. Rollback strategy

- **Schema is additive only.** All ALTERs use `IF NOT EXISTS`, tables use `CREATE TABLE IF NOT EXISTS`, seed rows use `ON CONFLICT DO NOTHING`. Reverting the code leaves the tables — they're just unread.
- **Migrations 0385 / 0386 / 0387** can be dropped with a manual `DROP TABLE notification_templates, notification_campaigns, notification_dispatch_logs, notification_user_prefs, notification_settings CASCADE;` if truly needed — but there's no code left that depends on them once the module is removed.
- **Feature flag** `NOTIFICATIONS_V2_ENABLED` (default `false`) — flip to `true` in prod when confident. When `false`, callers that migrated to `sendNotification()` still write logs but the delivery carrier remains Expo Push exactly as before (no functional regression).
- **notification-worker** is a separate container — deployable/revertable independent of backend.

## 11. Observability plan (Phase 7)

Grafana panels to add when we wire prod monitoring:
1. `notification_dispatch_logs.status` distribution (last 15 min) — alert if `failed / total > 10%`
2. `notification_dispatch_logs.queued_at → sent_at` p50 / p95 — alert if p95 > 5s
3. `notification_campaigns.status = 'running'` count — alert if > 5 stuck > 10 min
4. `scheduledPoller` heartbeat via existing `tick_runs_total` prom counter
5. Per-template CTR (clicked_at IS NOT NULL / total)

## 12. What Phase 0 changed (delta)

| File | Change |
|---|---|
| `.gitignore` | Added `**/google-services.json`, `**/GoogleService-Info.plist`, `**/serviceAccountKey.json` |
| `apps/merchant_app/google-services.json` | Untracked from git (file stays on disk for builds) |
| `backend/.env` | Replaced wrong `FCM_SERVICE_ACCOUNT_JSON=-----BEGIN PRIVATE KEY----- …` value with `GOOGLE_APPLICATION_CREDENTIALS=./credentials/serviceAccountKey.json` and documented alternatives |
| `backend/env.example` | Documented all three credential sources clearly |
| `backend/src/config/env.ts` | Added `GOOGLE_APPLICATION_CREDENTIALS` and `FCM_SERVICE_ACCOUNT_JSON` to the zod env schema |
| `backend/src/config/firebase.ts` | New singleton: `getFirebaseApp` / `getFirebaseAuth` / `getFirebaseMessaging`. Lazy, idempotent, resolves credentials in priority order |
| `backend/src/modules/auth/firebaseAdmin.ts` | Refactored to use the singleton (was duplicating init) |
| `docs/NOTIFICATION_ARCHITECTURE.md` | This document |

No runtime behavior changed in Phase 0. Existing pushes still flow exactly as before. Backend typecheck passes.
