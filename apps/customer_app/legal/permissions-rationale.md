# App Permissions — What We Use & Why

**Effective Date:** 21 June 2026
**Last Updated:** 21 June 2026
**Version:** 1.0

> What each permission unlocks, what we do with the data, and whether you can refuse it. Required for Google Play Data Safety Form and Apple PrivacyInfo.xcprivacy.

The app requests each permission only when you use the feature that needs it. You can deny any permission and continue using the app — affected features show a polite prompt explaining what's blocked.

## 1. Location

### 1.1 Why we ask

- Show restaurants, drivers, and pickup points near you.
- Live ride / delivery tracking.
- Calculate fare based on actual route.
- Set a default address.
- Safety: share live trip location with trusted contacts and emergency services.

### 1.2 What we collect

| Mode | Precision | When |
|---|---|---|
| Foreground (app open) | Precise (GPS) | During an active order, ride, or location search |
| Background (Android only) | Coarse / precise | Only during an **active ride or delivery** — stops when the trip ends |
| When permission denied | City-level (from IP) | Always — shown reduced restaurant list |

### 1.3 We do NOT

- Track your location when no order is active.
- Sell location data.
- Share location with advertisers.

### 1.4 How to revoke

Android: `Settings → Apps → GatiMitra → Permissions → Location`.
iOS: `Settings → GatiMitra → Location → While Using the App` or `Never`.

## 2. Camera

### 2.1 Why we ask

- Take a profile photo.
- Capture proof of delivery (you, not the partner).
- Scan QR for payment (UPI).
- Upload an issue photo for a refund claim.

### 2.2 What we collect

Only the photo you actively capture. We don't access the camera passively.

### 2.3 How to revoke

Android: `Settings → Apps → GatiMitra → Permissions → Camera`.
iOS: `Settings → GatiMitra → Camera`.

## 3. Photos / Media (storage)

### 3.1 Why we ask

- Pick a photo from your gallery for your profile.
- Pick a photo to attach to a complaint / refund request.

### 3.2 What we collect

Only the photo you pick. We never scan your gallery, never upload metadata, never access other folders.

### 3.3 Scoped access (Android 14+ / iOS 14+)

We use the system Photo Picker — you choose exactly which photos the app sees. We never request full library access.

## 4. Notifications (push)

### 4.1 Why we ask

- Order accepted / out for delivery / delivered alerts.
- Ride accepted / driver arriving / trip started.
- Payment confirmations.
- Promotions (only with your explicit consent — separate toggle).

### 4.2 What we collect

- Device token (FCM on Android, APNS on iOS). Used only to deliver notifications.
- No notification content read.

### 4.3 How to revoke

In-app: `Profile → Settings → Notifications` → toggle per category.
OS: `Settings → Notifications → GatiMitra`.

## 5. Contacts

### 5.1 Why we ask

- Find friends who already use GatiMitra (for referrals).
- Auto-fill name when you add a "Send to" contact for parcel delivery.

### 5.2 What we collect

- Contact name + phone number — uploaded encrypted, hashed on our servers, matched against existing users, and the result returned. The plain phone number is **not retained**.

### 5.3 You can use the app fully without this permission

Manually type the recipient mobile number when sending a parcel.

## 6. Phone state (Android) / SMS auto-fill (Android & iOS)

### 6.1 Why we ask

- Detect the OTP we just sent and auto-fill it.
- Read the SIM mobile number (optional) so you don't have to type it.

### 6.2 What we collect

- The specific OTP message from our sender ID, parsed in-app. We don't read other SMS.
- iOS uses the SMS auto-fill API — we never see the SMS body.

## 7. Bluetooth (where applicable)

Reserved for future driver-customer matching in BLE-only zones (parking garages). Currently unused.

## 8. Microphone

Used **only** when audio safety recording is enabled by you (see [Safety Policy §3.4](./safety-policy.md)). Default: off.

## 9. Calendar / Health / Sensors

**Not requested. Not collected. Ever.**

## 10. Identifiers

| Identifier | Source | Purpose |
|---|---|---|
| Device ID (Android) | OS | Fraud detection, push targeting |
| Advertising ID (Android) | OS — resettable by you | Off by default; only used if you opt in to personalised promos |
| IDFA (iOS) | OS — gated by ATT | Off by default; ATT prompt before any use |
| User ID (our internal) | Our backend | Account |

We honour Apple's App Tracking Transparency: if you tap "Ask App Not to Track," we do not enable any tracking SDK and do not pass identifiers to any advertiser.

## 11. Network access

Standard for every internet-using app. We use it only to talk to:

- api.gatimitra.com (our backend)
- supabase.co (auth + database)
- Razorpay (payments)
- FCM / APNS (push)
- maps.gatimitra.com (tiles)
- Image CDN (cloudflare R2)

No third-party advertiser, no analytics SDK, by default.

## 12. SDKs that handle data

Per Play Data Safety Form / iOS PrivacyInfo:

| SDK | Purpose | Data accessed |
|---|---|---|
| Supabase | Auth, DB | Account data |
| Razorpay | Payments | Payment tokens |
| Sentry (off by default) | Crash reporting | Stack traces, app version, device model — no PII |
| Firebase Cloud Messaging | Push | FCM token only |
| Mapbox | Maps | Location during active session |
| MSG91 (server-side only) | OTP SMS | Phone number for OTP |

Each is contractually bound under DPDPA processor terms.

## 13. Background data uploads

We do not upload data in the background except when you have an active order or ride (live tracking).

## 14. Children

If you tell us you are under 18:

- No advertising identifiers used.
- No analytics SDK enabled.
- Permissions limited to those required for the service you can access.

## 15. Transparency

Annual Data Safety reaffirmation published at https://gatimitra.com/data-safety.

## 16. Questions

privacy@gatimitra.com / dpo@gatimitra.com

---
**Owner:** Privacy & Engineering
