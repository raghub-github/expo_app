## StoreStatusEngine (v1) — Single Logic Spec

This document is the **single source of truth** for Store Online/Offline behavior.
Every platform (Merchant App, Partner Site, Merchant Dashboard) must implement the **same state machine** and **same strings**.

### 1) Priority (highest wins)

1. **System rules**
   - Vacation mode window
   - Temporary close until time (manual_close_until)
   - Schedule-end prompt timeout auto-off
2. **Manual override**
3. **Schedule**

### 2) Canonical states

- **ONLINE**
- **OFFLINE**
- **MANUAL_OVERRIDE** (online outside schedule; `is_manual_override = true`)
- **SCHEDULED** (engine-driven due to schedule windows)
- **VACATION** (forced offline; ignores manual ON)

### 3) Stored fields (per store)

Required:
- `store_status`: `"ONLINE" | "OFFLINE"`
- `is_manual_override`: boolean
- `manual_override_at`: ISO timestamp | null
- `manual_close_until`: ISO timestamp | null
- `manual_close_reason`: string | null
- `is_schedule_enabled`: boolean
- `schedule_start_time`: `"HH:mm"` | null
- `schedule_end_time`: `"HH:mm"` | null
- `is_vacation_mode`: boolean
- `vacation_start`: ISO timestamp | null
- `vacation_end`: ISO timestamp | null
- `schedule_end_prompt_expires_at`: ISO timestamp | null
- `last_action_source`: `"manual" | "schedule" | "system"`
- `rush_ends_at`: ISO timestamp | null (optional, but logic must match when present)

### 4) Time rules

- **Store timezone** is **Asia/Kolkata** for schedule comparisons.
- `schedule_start_time` / `schedule_end_time` are interpreted in store timezone on **today’s date**.
- Schedule window is **[start, end)** (inclusive start, exclusive end).
- Prompt timeout \(X\) is **5 minutes** everywhere.

### 5) UI strings (must match exactly)

- **Manual ON before schedule toast**: `You are going live before your scheduled time`
- **Schedule end modal title**: `Scheduled time ended`
- **Schedule end modal body**: `Your scheduled time has ended. Do you want to stay online?`
- **Modal buttons**:
  - `Stay Online`
  - `Go Offline`

### 6) Events and transitions (identical across platforms)

#### A) MANUAL ON (anytime)
If `is_vacation_mode` is active (see Vacation rule) → **block** and show an error toast:
- `Vacation mode is active. Disable vacation to go online.`

Else:
- Set `store_status = ONLINE`
- Clear temp close (if any):
  - `manual_close_until = null`
  - `manual_close_reason = null`
- If now is **outside** schedule window (or schedule disabled / missing) → set:
  - `is_manual_override = true`
  - `manual_override_at = now`
  - Emit toast: **Manual ON before schedule toast**
- Clear any pending schedule-end prompt:
  - `schedule_end_prompt_expires_at = null`
- `last_action_source = "manual"`

#### B) MANUAL OFF (immediate)
- Set `store_status = OFFLINE`
- `is_manual_override = false`
- `manual_override_at = null`
- `manual_close_until = null`
- `manual_close_reason = null`
- Clear schedule-end prompt:
  - `schedule_end_prompt_expires_at = null`
- `last_action_source = "manual"`

#### B2) TEMPORARY CLOSE (manual close until)
Merchant chooses an "until" time in the future.

- Set `store_status = OFFLINE`
- `is_manual_override = false`
- `manual_override_at = null`
- Set:
  - `manual_close_until = <ISO timestamp>`
  - `manual_close_reason = <string|null>`
- Clear schedule-end prompt:
  - `schedule_end_prompt_expires_at = null`
- `last_action_source = "manual"`

While `now < manual_close_until`:
- Store must stay **OFFLINE**
- Schedule start must **NOT** auto-open
- Merchant can still do MANUAL ON anytime (which clears temp close)

When `now >= manual_close_until`:
- Clear `manual_close_until` and `manual_close_reason` automatically on tick
- Then normal schedule rules apply (schedule start may open if within hours)

#### C) SCHEDULE START (tick)
Condition: schedule enabled + schedule window is active **now**.

- If `manual_close_until` is active (`now < manual_close_until`) → no-op (must remain OFFLINE).
- Else if `store_status = OFFLINE` **and** `is_manual_override = false` → set `store_status = ONLINE`, `last_action_source="schedule"`.
- If already online → no-op.

#### D) SCHEDULE END (tick)
Condition: schedule enabled and **now outside schedule window**.

If store is ONLINE:
- If `is_manual_override = true` → no-op.
- Else if rush is active (`rush_ends_at` in future) → no-op.
- Else:
  - Start schedule-end prompt if not already started:
    - `schedule_end_prompt_expires_at = now + 5m`
    - Effect: show Schedule End modal (see UI strings)
  - If prompt exists and `now >= schedule_end_prompt_expires_at`:
    - Auto OFF:
      - `store_status = OFFLINE`
      - `is_manual_override = false`
      - `manual_override_at = null`
      - `schedule_end_prompt_expires_at = null`
      - `last_action_source = "system"`

If store is OFFLINE:
- Ensure prompt cleared: `schedule_end_prompt_expires_at = null`.

#### E) Schedule End modal response (user action)
If merchant clicks **Stay Online**:
- Ensure online + set manual override:
  - `store_status = ONLINE`
  - `is_manual_override = true`
  - `manual_override_at = now`
  - clear prompt
  - `last_action_source="manual"`

If merchant clicks **Go Offline**:
- Same as Manual OFF (B).

#### F) VACATION MODE (system rule)
Vacation is active if:
- `is_vacation_mode = true` AND
- `vacation_start != null` AND `vacation_end != null` AND
- `now ∈ [vacation_start, vacation_end)`

When active:
- Force:
  - `store_status = OFFLINE`
  - `is_manual_override = false`
  - `manual_override_at = null`
  - clear prompt
  - `last_action_source = "system"`
- Manual ON is blocked (A).

When vacation ends (tick):
- `is_vacation_mode` remains as configured, but vacation is not “active” anymore once `now >= vacation_end`.
- Normal flow resumes.

### 7) Idempotency / edge-case rules

- Duplicate events must be no-ops (e.g., MANUAL OFF while already OFFLINE).
- No flicker: state updates must be **atomic** (single commit per event/tick).
- All comparisons must use the same timezone rule (Asia/Kolkata for schedule).

