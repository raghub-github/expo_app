# GatiMitra Referral & Rewards Engine

## Overview

Unified, database-driven referral engine for **Customer** (GatiCash) and **Rider** (wallet credit).
Super Admin controls all amounts, milestones, campaigns, fraud, and expiry — no app update required.

## Architecture modules

| Module | Responsibility |
|--------|----------------|
| `referral.config.service` | Versioned settings cache + Redis `config:referral` broadcast (`config_version` only) |
| `referral.lifecycle` | State machine transitions |
| `referral.rule-engine` | Event-based rule matching (no hardcoded first-order/milestone branches) |
| `referral.queue` | Durable Postgres jobs + BullMQ `q.referral.reward` + reconciliation |
| `referral.reward.service` | GatiCash / rider ledger credit strategies |
| `referral.fraud` + `.advanced` | Base + emulator/root/loop/velocity/IP checks |
| `referral.codes` | Crypto-safe human-readable codes |
| `referral.tracking` | Apply / share / install clicks |
| `playInstallReferrer` (apps) | Native Play Install Referrer (Android) |

## Database (0470 + 0471)

### ER (logical)

```
referral_settings (1)
    └── referral_reward_rules (N) ──┐
referral_campaigns (N) ─────────────┤
                                    ▼
referral_codes ← users (customer/rider)
referral_install_clicks
referral_relationships ──┬── referral_lifecycle_events
                         ├── referral_reward_jobs
                         └── referral_reward_transactions → wallet / ledger
referral_monthly_usage
referral_configuration_audit
referral_funnel_daily
referral_device_attributions
referral_code_blacklist / reserved_prefixes
```

### Migrations

1. `0470_unified_referral_rewards_engine.sql` — core tables + legacy data migration  
2. `0471_referral_engine_hardening.sql` — lifecycle, campaigns, queue, fraud, funnel  
3. Rollbacks: `*_rollback.sql` (0471 first, then 0470)

## Lifecycle state machine

```
LINK_SHARED → LINK_CLICKED → PLAY_STORE_OPENED → APP_INSTALLED
  → FIRST_APP_OPEN → REFERRAL_APPLIED → FIRST_ORDER_PLACED → ORDER_DELIVERED
  → REWARD_ELIGIBLE → REWARD_GRANTED → REWARD_NOTIFIED
```

Terminal / exception states: `FRAUD_BLOCKED`, `EXPIRED`, `SUSPENDED`, `SKIPPED`, `REWARD_FAILED`.

## Reward processing (async)

```
Order Delivered → Rule Engine → enqueue referral_reward_jobs
  → worker / backend tick → wallet credit → notify → audit → REWARD_NOTIFIED
```

Retries use exponential backoff. Admin actions: retry / force / mark_failed / skip / manual-credit.

## Deep link + Play Install Referrer

1. Share `https://gatimitra.com/ref/{CODE}` (configurable base).  
2. Landing records `LINK_CLICKED` / `PLAY_STORE_OPENED`, Play URL uses `referrer=ref_{CODE}`.  
3. If app installed → App Link / scheme opens with code + click token.  
4. If not → Play Store. On first open, native **Play Install Referrer** reads `ref_{CODE}` once, stores pending, applies after auth, marks consumed locally + server-side.  
5. Reinstall with same referrer does not re-apply.

**Rebuild required:** `react-native-play-install-referrer` needs a dev-client / production Android build (not Expo Go).

## Real-time config

WebSocket channel `config:referral` payload:

```json
{ "type": "referral_config_updated", "configVersion": 42 }
```

Apps compare version → if newer, `GET /v1/referral/config` (or `/settings`) and replace cache.

## Key APIs

| Method | Path | Notes |
|--------|------|-------|
| GET | `/v1/referral/config` | Public live config |
| GET | `/v1/referral/settings` | Version-aware settings |
| GET | `/v1/referral/me` | Code, share URL, history |
| GET | `/v1/referral/history` | Referrer history |
| GET | `/v1/referral/milestones` | Active rules |
| GET | `/v1/referral/campaigns` | Campaigns |
| GET | `/v1/referral/rules` | Rules |
| GET | `/v1/referral/analytics` | Funnel + tops |
| POST | `/v1/referral/apply` | Attribute referral |
| POST | `/v1/referral/share` | Share payload |
| POST | `/v1/referral/admin/retry` | Queue retry |
| POST | `/v1/referral/admin/manual-credit` | Force queue credit |
| POST | `/v1/referral/admin/regenerate-code` | New code |
| POST | `/v1/referral/admin/suspend` | Suspend code |
| POST | `/v1/referral/admin/reconcile` | Run reconciliation |

## Super Admin

Dashboard → **Referral & Rewards** (`/dashboard/super-admin/referral-rewards`):

- Global / customer / rider toggles, min order, monthly cap  
- Customer GatiCash rules + unlimited rider milestones  
- Analytics overview (extend with funnel via `/api` + `/v1/referral/analytics`)  
- Config version bumps + Redis publish on every change  

## Fraud

Self-referral, same phone, same device, no install attribution, cancelled/refunded orders,  
emulator, rooted, A→B→A loops, multi-install device, disposable phone prefixes, velocity, suspicious IP.

## Production checklist

- [ ] Run 0470 then 0471 on Supabase; verify row counts vs legacy  
- [ ] Test 0471 rollback on staging  
- [ ] Rebuild Android apps with Play Install Referrer native module  
- [x] Nginx proxy `/ref/*`, `/invite/*`, `/rider-ref/*`  
- [ ] Confirm Redis + `config:referral` reaches apps  
- [ ] Confirm reward queue tick + reconciliation logs  
- [ ] Idempotency: double-deliver order does not double-credit  
- [ ] Admin retry recovers a forced failed job  
- [ ] Load-test apply + config endpoints  

## Customer / Rider flows

**Customer:** share link → friend installs via referrer → auto-apply → first delivered order ≥ min → both get GatiCash (if rewards enabled).  

**Rider:** share `/rider-ref/{CODE}` → referred rider KYC + order milestones → referrer wallet `referral_bonus` (withdrawable).
